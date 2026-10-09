#include "RetroVulkan.h"

#include <dlfcn.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#if defined(__ARM_NEON)
#include <arm_neon.h>
#endif

// En-tête libretro pour Vulkan (include/libretro_vulkan.h), qui inclut celui de Vulkan (include/vulkan).
// Sans prototypes (VK_NO_PROTOTYPES, Retro.podspec) : toutes les fonctions Vulkan sont demandées à MoltenVK.
#include <libretro_vulkan.h>

// Ce que le core fournit ou demande (Azahar, src/citra_libretro/libretro_vk.cpp) :
// - il crée lui-même le « device » Vulkan (interface de négociation, create_device) sur l'instance qu'on lui donne ;
// - il envoie lui-même son travail au processeur graphique (lock_queue / unlock_queue autour de chaque envoi),
//   depuis son propre fil (« VulkanWorker ») ;
// - à la fin de chaque image, il annonce son image finale (set_image, sans sémaphore), puis appelle le rappel
//   vidéo avec RETRO_HW_FRAME_BUFFER_VALID. Toutes ses images passent par la même image Vulkan.
// Son fil « VulkanWorker » peut envoyer le dessin de l'image un instant APRÈS l'annonce : on ne recopie donc
// l'image annoncée qu'au début de l'image suivante du jeu (rv_read_frame, appelé avant retro_run),
// quand son dessin est parti depuis longtemps. L'image affichée a ainsi une image de retard (1/60 s).

#define MAX_EXTRA 16

#define INSTANCE_FUNCTIONS(X)                                                                   \
  X(vkDestroyInstance) X(vkEnumeratePhysicalDevices) X(vkGetPhysicalDeviceMemoryProperties)     \
  X(vkGetPhysicalDeviceProperties) X(vkGetDeviceProcAddr)

#define DEVICE_FUNCTIONS(X)                                                                     \
  X(vkDestroyDevice) X(vkDeviceWaitIdle) X(vkQueueWaitIdle) X(vkQueueSubmit)                   \
  X(vkCreateCommandPool) X(vkDestroyCommandPool) X(vkAllocateCommandBuffers)                   \
  X(vkResetCommandBuffer) X(vkBeginCommandBuffer) X(vkEndCommandBuffer)                         \
  X(vkCmdPipelineBarrier) X(vkCmdCopyImageToBuffer) X(vkCreateFence) X(vkDestroyFence)         \
  X(vkWaitForFences) X(vkResetFences) X(vkCreateBuffer) X(vkDestroyBuffer)                     \
  X(vkGetBufferMemoryRequirements) X(vkAllocateMemory) X(vkFreeMemory) X(vkBindBufferMemory)   \
  X(vkMapMemory) X(vkUnmapMemory) X(vkInvalidateMappedMemoryRanges)

#define DECLARE(name) static PFN_##name name##_;
INSTANCE_FUNCTIONS(DECLARE)
DEVICE_FUNCTIONS(DECLARE)
#undef DECLARE

static void *moltenvk; // bibliothèque MoltenVK, chargée une fois pour toutes
static PFN_vkGetInstanceProcAddr get_instance_proc_addr;

static const struct retro_hw_render_context_negotiation_interface_vulkan *negotiation;
static bool created;
static VkInstance instance;
static VkPhysicalDevice gpu;
static VkDevice device;
static VkQueue queue;
static uint32_t queue_family;
static struct retro_hw_render_interface_vulkan iface;
static pthread_mutex_t queue_mutex = PTHREAD_MUTEX_INITIALIZER;

// Dernière image annoncée par le core (set_image), et ce qu'il demande de faire avec.
static struct retro_vulkan_image image;
static bool has_image;
static VkSemaphore wait_semaphores[MAX_EXTRA];
static uint32_t wait_count;
static VkCommandBuffer extra_commands[MAX_EXTRA];
static uint32_t extra_count;
static VkSemaphore signal_semaphore;
static bool pending; // une image annoncée n'a pas encore été recopiée
static uint32_t pending_width, pending_height;

// Copie de l'image vers la mémoire : une liste de commandes, un signal de fin, une zone lisible par le processeur.
static VkCommandPool pool;
static VkCommandBuffer commands;
static VkFence fence;
static VkBuffer staging;
static VkDeviceMemory staging_memory;
static void *staging_data;
static VkDeviceSize staging_size;
static bool staging_coherent;
static bool logged;

// ---- Interface donnée au core (retro_hw_render_interface_vulkan) ----

static void set_image(void *handle, const struct retro_vulkan_image *new_image, uint32_t num_semaphores,
                      const VkSemaphore *semaphores, uint32_t src_queue_family) {
  (void)handle;
  (void)src_queue_family; // une seule file d'attente, la sienne
  has_image = new_image != NULL;
  if (new_image) image = *new_image;
  wait_count = 0;
  for (uint32_t i = 0; semaphores && i < num_semaphores && i < MAX_EXTRA; i++) wait_semaphores[wait_count++] = semaphores[i];
}

// Un seul jeu de ressources : la copie est finie avant que le core ne dessine l'image suivante.
static uint32_t get_sync_index(void *handle) {
  (void)handle;
  return 0;
}

static uint32_t get_sync_index_mask(void *handle) {
  (void)handle;
  return 1;
}

static void wait_sync_index(void *handle) {
  (void)handle;
}

static void set_command_buffers(void *handle, uint32_t num, const VkCommandBuffer *list) {
  (void)handle;
  extra_count = 0;
  for (uint32_t i = 0; list && i < num && i < MAX_EXTRA; i++) extra_commands[extra_count++] = list[i];
}

static void lock_queue(void *handle) {
  (void)handle;
  pthread_mutex_lock(&queue_mutex);
}

static void unlock_queue(void *handle) {
  (void)handle;
  pthread_mutex_unlock(&queue_mutex);
}

static void set_signal_semaphore(void *handle, VkSemaphore semaphore) {
  (void)handle;
  signal_semaphore = semaphore;
}

// ---- Environnement libretro ----

bool rv_accept(struct retro_hw_render_callback *request) {
  return request->context_type == RETRO_HW_CONTEXT_VULKAN;
}

bool rv_set_negotiation(const struct retro_hw_render_context_negotiation_interface *value) {
  if (!value || value->interface_type != RETRO_HW_RENDER_CONTEXT_NEGOTIATION_INTERFACE_VULKAN) return false;
  negotiation = (const struct retro_hw_render_context_negotiation_interface_vulkan *)value;
  return true;
}

bool rv_get_interface(const struct retro_hw_render_interface **out) {
  if (!created) return false;
  *out = (const struct retro_hw_render_interface *)&iface;
  return true;
}

// ---- Création ----

static bool has_extension(const VkExtensionProperties *list, uint32_t count, const char *name) {
  for (uint32_t i = 0; i < count; i++) {
    if (!strcmp(list[i].extensionName, name)) return true;
  }
  return false;
}

bool rv_create(char *error, size_t error_size) {
#define FAIL(...)                                  \
  do {                                             \
    fprintf(stderr, "[Retro] Vulkan: " __VA_ARGS__); \
    fprintf(stderr, "\n");                         \
    snprintf(error, error_size, "%s", "This iPhone couldn't prepare the 3D image."); \
    rv_destroy();                                  \
    return false;                                  \
  } while (0)

  if (!moltenvk) {
    moltenvk = dlopen("@rpath/MoltenVK.framework/MoltenVK", RTLD_NOW | RTLD_LOCAL);
    if (!moltenvk) FAIL("%s", dlerror());
    get_instance_proc_addr = (PFN_vkGetInstanceProcAddr)dlsym(moltenvk, "vkGetInstanceProcAddr");
  }
  if (!get_instance_proc_addr) FAIL("vkGetInstanceProcAddr is missing");

  PFN_vkCreateInstance create_instance = (PFN_vkCreateInstance)get_instance_proc_addr(VK_NULL_HANDLE, "vkCreateInstance");
  PFN_vkEnumerateInstanceExtensionProperties enumerate_extensions =
    (PFN_vkEnumerateInstanceExtensionProperties)get_instance_proc_addr(VK_NULL_HANDLE, "vkEnumerateInstanceExtensionProperties");
  if (!create_instance || !enumerate_extensions) FAIL("instance functions are missing");

  // Vulkan 1.1 au moins : Azahar crée son device avec VkPhysicalDeviceFeatures2.
  VkApplicationInfo app = { .sType = VK_STRUCTURE_TYPE_APPLICATION_INFO, .pApplicationName = "overrrrhere", .apiVersion = VK_API_VERSION_1_1 };
  const VkApplicationInfo *core_app = negotiation && negotiation->get_application_info ? negotiation->get_application_info() : NULL;
  if (core_app) {
    app = *core_app;
    if (app.apiVersion < VK_API_VERSION_1_1) app.apiVersion = VK_API_VERSION_1_1;
  }

  // MoltenVK n'est pas un Vulkan « complet » : il se range parmi les « portability » (extension à citer si présente).
  const char *extensions[1];
  uint32_t extension_count = 0;
  VkInstanceCreateFlags flags = 0;
  uint32_t available = 0;
  enumerate_extensions(NULL, &available, NULL);
  VkExtensionProperties *list = available ? calloc(available, sizeof *list) : NULL;
  if (list && enumerate_extensions(NULL, &available, list) == VK_SUCCESS &&
      has_extension(list, available, VK_KHR_PORTABILITY_ENUMERATION_EXTENSION_NAME)) {
    extensions[extension_count++] = VK_KHR_PORTABILITY_ENUMERATION_EXTENSION_NAME;
    flags |= VK_INSTANCE_CREATE_ENUMERATE_PORTABILITY_BIT_KHR;
  }
  free(list);

  VkInstanceCreateInfo instance_info = {
    .sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO,
    .flags = flags,
    .pApplicationInfo = &app,
    .enabledExtensionCount = extension_count,
    .ppEnabledExtensionNames = extensions,
  };
  VkResult result = create_instance(&instance_info, NULL, &instance);
  if (result != VK_SUCCESS) {
    instance = VK_NULL_HANDLE;
    FAIL("vkCreateInstance %d", (int)result);
  }

#define LOAD_INSTANCE(name)                                                   \
  name##_ = (PFN_##name)get_instance_proc_addr(instance, #name);              \
  if (!name##_) FAIL(#name " is missing");
  INSTANCE_FUNCTIONS(LOAD_INSTANCE)
#undef LOAD_INSTANCE

  // Un seul processeur graphique sur l'iPhone.
  VkPhysicalDevice devices[1];
  uint32_t device_count = 1;
  result = vkEnumeratePhysicalDevices_(instance, &device_count, devices);
  if ((result != VK_SUCCESS && result != VK_INCOMPLETE) || device_count == 0) FAIL("no GPU (%d)", (int)result);
  gpu = devices[0];

  // Le core crée son device (avec les extensions et fonctions qu'il veut) et nous rend sa file d'attente.
  struct retro_vulkan_context context = { 0 };
  bool made = negotiation && negotiation->interface_version >= 1 && negotiation->create_device &&
              negotiation->create_device(&context, instance, gpu, VK_NULL_HANDLE, get_instance_proc_addr, NULL, 0, NULL, 0, NULL);
  if (!made || !context.device || !context.queue) FAIL("the core could not create its device");
  device = context.device;
  queue = context.queue;
  queue_family = context.queue_family_index;
  if (context.gpu) gpu = context.gpu;

#define LOAD_DEVICE(name)                                                     \
  name##_ = (PFN_##name)vkGetDeviceProcAddr_(device, #name);                  \
  if (!name##_) FAIL(#name " is missing");
  DEVICE_FUNCTIONS(LOAD_DEVICE)
#undef LOAD_DEVICE

  VkCommandPoolCreateInfo pool_info = {
    .sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO,
    .flags = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT,
    .queueFamilyIndex = queue_family,
  };
  if (vkCreateCommandPool_(device, &pool_info, NULL, &pool) != VK_SUCCESS) {
    pool = VK_NULL_HANDLE;
    FAIL("vkCreateCommandPool");
  }
  VkCommandBufferAllocateInfo allocate_info = {
    .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO,
    .commandPool = pool,
    .level = VK_COMMAND_BUFFER_LEVEL_PRIMARY,
    .commandBufferCount = 1,
  };
  if (vkAllocateCommandBuffers_(device, &allocate_info, &commands) != VK_SUCCESS) {
    commands = VK_NULL_HANDLE;
    FAIL("vkAllocateCommandBuffers");
  }
  VkFenceCreateInfo fence_info = { .sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO };
  if (vkCreateFence_(device, &fence_info, NULL, &fence) != VK_SUCCESS) {
    fence = VK_NULL_HANDLE;
    FAIL("vkCreateFence");
  }

  iface = (struct retro_hw_render_interface_vulkan){
    .interface_type = RETRO_HW_RENDER_INTERFACE_VULKAN,
    .interface_version = RETRO_HW_RENDER_INTERFACE_VULKAN_VERSION,
    .handle = &iface, // jamais NULL : Azahar n'appelle wait_sync_index / get_sync_index que si handle est posé
    .instance = instance,
    .gpu = gpu,
    .device = device,
    .get_device_proc_addr = vkGetDeviceProcAddr_,
    .get_instance_proc_addr = get_instance_proc_addr,
    .queue = queue,
    .queue_index = queue_family,
    .set_image = set_image,
    .get_sync_index = get_sync_index,
    .get_sync_index_mask = get_sync_index_mask,
    .set_command_buffers = set_command_buffers,
    .wait_sync_index = wait_sync_index,
    .lock_queue = lock_queue,
    .unlock_queue = unlock_queue,
    .set_signal_semaphore = set_signal_semaphore,
  };

  VkPhysicalDeviceProperties properties;
  vkGetPhysicalDeviceProperties_(gpu, &properties);
  fprintf(stderr, "[Retro] Vulkan %u.%u on %s\n", VK_API_VERSION_MAJOR(properties.apiVersion),
          VK_API_VERSION_MINOR(properties.apiVersion), properties.deviceName);

  has_image = pending = logged = false;
  wait_count = extra_count = 0;
  signal_semaphore = VK_NULL_HANDLE;
  created = true;
  return true;
#undef FAIL
}

// ---- Image du jeu ----

void rv_frame_ready(unsigned width, unsigned height) {
  if (!created || !has_image || !width || !height) return;
  pending = true;
  pending_width = width;
  pending_height = height;
}

void rv_forget_frame(void) {
  has_image = pending = false;
  wait_count = extra_count = 0;
  signal_semaphore = VK_NULL_HANDLE;
}

bool rv_frame_size(uint32_t *width, uint32_t *height) {
  if (!created || !pending) return false;
  *width = pending_width;
  *height = pending_height;
  return true;
}

static void release_staging(void) {
  if (staging_data && vkUnmapMemory_) vkUnmapMemory_(device, staging_memory);
  if (staging && vkDestroyBuffer_) vkDestroyBuffer_(device, staging, NULL);
  if (staging_memory && vkFreeMemory_) vkFreeMemory_(device, staging_memory, NULL);
  staging_data = NULL;
  staging = VK_NULL_HANDLE;
  staging_memory = VK_NULL_HANDLE;
  staging_size = 0;
}

// Zone de mémoire lisible par le processeur, où le processeur graphique recopie l'image.
static bool ensure_staging(VkDeviceSize size) {
  if (staging && staging_size >= size) return true;
  release_staging();

  VkBufferCreateInfo buffer_info = {
    .sType = VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO,
    .size = size,
    .usage = VK_BUFFER_USAGE_TRANSFER_DST_BIT,
    .sharingMode = VK_SHARING_MODE_EXCLUSIVE,
  };
  if (vkCreateBuffer_(device, &buffer_info, NULL, &staging) != VK_SUCCESS) {
    staging = VK_NULL_HANDLE;
    return false;
  }
  VkMemoryRequirements requirements;
  vkGetBufferMemoryRequirements_(device, staging, &requirements);
  VkPhysicalDeviceMemoryProperties memory;
  vkGetPhysicalDeviceMemoryProperties_(gpu, &memory);

  // Mémoire « cached » de préférence : la lecture par le processeur y est bien plus rapide.
  const VkMemoryPropertyFlags wanted[] = {
    VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT | VK_MEMORY_PROPERTY_HOST_CACHED_BIT,
    VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_CACHED_BIT,
    VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,
  };
  uint32_t type = UINT32_MAX;
  for (size_t w = 0; w < sizeof wanted / sizeof wanted[0] && type == UINT32_MAX; w++) {
    for (uint32_t i = 0; i < memory.memoryTypeCount; i++) {
      if ((requirements.memoryTypeBits & (1u << i)) && (memory.memoryTypes[i].propertyFlags & wanted[w]) == wanted[w]) {
        type = i;
        break;
      }
    }
  }
  if (type == UINT32_MAX) {
    release_staging();
    return false;
  }
  staging_coherent = (memory.memoryTypes[type].propertyFlags & VK_MEMORY_PROPERTY_HOST_COHERENT_BIT) != 0;

  VkMemoryAllocateInfo allocate_info = {
    .sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
    .allocationSize = requirements.size,
    .memoryTypeIndex = type,
  };
  if (vkAllocateMemory_(device, &allocate_info, NULL, &staging_memory) != VK_SUCCESS) {
    staging_memory = VK_NULL_HANDLE;
    release_staging();
    return false;
  }
  if (vkBindBufferMemory_(device, staging, staging_memory, 0) != VK_SUCCESS ||
      vkMapMemory_(device, staging_memory, 0, VK_WHOLE_SIZE, 0, &staging_data) != VK_SUCCESS) {
    staging_data = NULL;
    release_staging();
    return false;
  }
  staging_size = size;
  return true;
}

bool rv_read_frame(uint32_t *pixels) {
  if (!created || !pending || !has_image) return false;
  pending = false;
  uint32_t width = pending_width, height = pending_height;
  if (!ensure_staging((VkDeviceSize)width * height * 4)) return false;

  VkImage target = image.create_info.image;
  VkImageSubresourceRange range = image.create_info.subresourceRange;
  range.levelCount = 1;
  range.layerCount = 1;
  VkImageLayout layout = image.image_layout; // Azahar : SHADER_READ_ONLY_OPTIMAL

  vkResetCommandBuffer_(commands, 0);
  VkCommandBufferBeginInfo begin = {
    .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO,
    .flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT,
  };
  if (vkBeginCommandBuffer_(commands, &begin) != VK_SUCCESS) return false;

  // 1. Tout ce que le core a dessiné est fini ; l'image passe en « source de copie ».
  VkImageMemoryBarrier to_copy = {
    .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
    .srcAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT | VK_ACCESS_SHADER_WRITE_BIT | VK_ACCESS_TRANSFER_WRITE_BIT,
    .dstAccessMask = VK_ACCESS_TRANSFER_READ_BIT,
    .oldLayout = layout,
    .newLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
    .srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,
    .dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,
    .image = target,
    .subresourceRange = range,
  };
  vkCmdPipelineBarrier_(commands, VK_PIPELINE_STAGE_ALL_COMMANDS_BIT, VK_PIPELINE_STAGE_TRANSFER_BIT, 0, 0, NULL, 0, NULL, 1,
                        &to_copy);

  // 2. Copie dans la zone lisible par le processeur, lignes collées les unes aux autres.
  VkBufferImageCopy region = {
    .bufferOffset = 0,
    .bufferRowLength = 0,
    .bufferImageHeight = 0,
    .imageSubresource = {
      .aspectMask = VK_IMAGE_ASPECT_COLOR_BIT,
      .mipLevel = range.baseMipLevel,
      .baseArrayLayer = range.baseArrayLayer,
      .layerCount = 1,
    },
    .imageOffset = { 0, 0, 0 },
    .imageExtent = { width, height, 1 },
  };
  vkCmdCopyImageToBuffer_(commands, target, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, staging, 1, &region);

  // 3. L'image revient telle que le core l'a laissée ; la copie devient lisible par le processeur.
  VkImageMemoryBarrier back = {
    .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
    .srcAccessMask = VK_ACCESS_TRANSFER_READ_BIT,
    .dstAccessMask = VK_ACCESS_SHADER_READ_BIT | VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT,
    .oldLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
    .newLayout = layout,
    .srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,
    .dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,
    .image = target,
    .subresourceRange = range,
  };
  VkBufferMemoryBarrier to_host = {
    .sType = VK_STRUCTURE_TYPE_BUFFER_MEMORY_BARRIER,
    .srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT,
    .dstAccessMask = VK_ACCESS_HOST_READ_BIT,
    .srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,
    .dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,
    .buffer = staging,
    .offset = 0,
    .size = VK_WHOLE_SIZE,
  };
  vkCmdPipelineBarrier_(commands, VK_PIPELINE_STAGE_TRANSFER_BIT, VK_PIPELINE_STAGE_ALL_COMMANDS_BIT | VK_PIPELINE_STAGE_HOST_BIT, 0, 0,
                        NULL, 1, &to_host, 1, &back);
  if (vkEndCommandBuffer_(commands) != VK_SUCCESS) return false;

  // Envoi (avec les commandes et sémaphores éventuellement confiés par le core), puis attente de la fin.
  VkCommandBuffer list[MAX_EXTRA + 1];
  uint32_t count = 0;
  for (uint32_t i = 0; i < extra_count; i++) list[count++] = extra_commands[i];
  list[count++] = commands;
  VkPipelineStageFlags stages[MAX_EXTRA];
  for (uint32_t i = 0; i < wait_count; i++) stages[i] = VK_PIPELINE_STAGE_ALL_COMMANDS_BIT;
  VkSubmitInfo submit = {
    .sType = VK_STRUCTURE_TYPE_SUBMIT_INFO,
    .waitSemaphoreCount = wait_count,
    .pWaitSemaphores = wait_count ? wait_semaphores : NULL,
    .pWaitDstStageMask = wait_count ? stages : NULL,
    .commandBufferCount = count,
    .pCommandBuffers = list,
    .signalSemaphoreCount = signal_semaphore ? 1 : 0,
    .pSignalSemaphores = signal_semaphore ? &signal_semaphore : NULL,
  };
  pthread_mutex_lock(&queue_mutex);
  VkResult result = vkQueueSubmit_(queue, 1, &submit, fence);
  pthread_mutex_unlock(&queue_mutex);
  wait_count = extra_count = 0;
  signal_semaphore = VK_NULL_HANDLE;
  if (result != VK_SUCCESS) {
    fprintf(stderr, "[Retro] Vulkan: vkQueueSubmit %d\n", (int)result);
    return false;
  }
  vkWaitForFences_(device, 1, &fence, VK_TRUE, UINT64_MAX);
  vkResetFences_(device, 1, &fence);

  if (!staging_coherent) {
    VkMappedMemoryRange mapped = {
      .sType = VK_STRUCTURE_TYPE_MAPPED_MEMORY_RANGE,
      .memory = staging_memory,
      .offset = 0,
      .size = VK_WHOLE_SIZE,
    };
    vkInvalidateMappedMemoryRanges_(device, 1, &mapped);
  }

  // Vers BGRA 32 bits (l'ordre de RetroImage). R8G8B8A8 : rouge et bleu échangés.
  VkFormat format = image.create_info.format;
  bool bgra = format == VK_FORMAT_B8G8R8A8_UNORM || format == VK_FORMAT_B8G8R8A8_SRGB;
  if (!logged) {
    fprintf(stderr, "[Retro] Vulkan image %ux%u, format %d, layout %d\n", width, height, (int)format, (int)layout);
    logged = true;
  }
  // Copie par 16 pixels à la fois (NEON) : la résolution interne 2× ou 3× (maquette du 06/10/2026) multiplie les
  // pixels par 4 ou 9, la copie pixel par pixel aurait pris une bonne part des 16,7 ms d'une image.
  const uint32_t *in = staging_data;
  size_t total = (size_t)width * height;
  size_t i = 0;
  if (bgra) {
    memcpy(pixels, in, total * 4); // l'alpha est ignoré par RetroImage (noneSkipFirst)
    i = total;
  }
#if defined(__ARM_NEON)
  for (; i + 16 <= total; i += 16) {
    uint8x16x4_t v = vld4q_u8((const uint8_t *)(in + i));
    uint8x16_t red = v.val[0];
    v.val[0] = v.val[2];
    v.val[2] = red;
    v.val[3] = vdupq_n_u8(0xFF);
    vst4q_u8((uint8_t *)(pixels + i), v);
  }
#endif
  for (; i < total; i++) {
    uint32_t p = in[i];
    pixels[i] = 0xFF000000u | (p & 0xFFu) << 16 | (p & 0xFF00u) | (p >> 16 & 0xFFu);
  }
  return true;
}

void rv_wait_idle(void) {
  if (!created) return;
  pthread_mutex_lock(&queue_mutex);
  vkQueueWaitIdle_(queue);
  pthread_mutex_unlock(&queue_mutex);
}

void rv_destroy(void) {
  if (device && vkDeviceWaitIdle_) vkDeviceWaitIdle_(device);
  release_staging();
  if (fence && vkDestroyFence_) vkDestroyFence_(device, fence, NULL);
  if (pool && vkDestroyCommandPool_) vkDestroyCommandPool_(device, pool, NULL); // libère aussi `commands`
  if (device) {
    if (negotiation && negotiation->destroy_device) negotiation->destroy_device();
    if (vkDestroyDevice_) vkDestroyDevice_(device, NULL);
  }
  if (instance && vkDestroyInstance_) vkDestroyInstance_(instance, NULL);
  fence = VK_NULL_HANDLE;
  pool = VK_NULL_HANDLE;
  commands = VK_NULL_HANDLE;
  device = VK_NULL_HANDLE;
  queue = VK_NULL_HANDLE;
  instance = VK_NULL_HANDLE;
  gpu = VK_NULL_HANDLE;
  negotiation = NULL;
  created = has_image = pending = false;
  wait_count = extra_count = 0;
  signal_semaphore = VK_NULL_HANDLE;
#define FORGET(name) name##_ = NULL;
  INSTANCE_FUNCTIONS(FORGET)
  DEVICE_FUNCTIONS(FORGET)
#undef FORGET
}
