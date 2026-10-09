#include "RetroFrontend.h"

#define GLES_SILENCE_DEPRECATION
#include <OpenGLES/ES3/gl.h>
#include <dlfcn.h>
#include <stdarg.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

#include "libretro-api/libretro.h" // en-tête libretro récent (compatible avec tous les cores)
#include "../vulkan/RetroVulkan.h"

// Frontend libretro minimal : charge la ROM, fournit les réglages demandés par le core,
// convertit l'image en 32 bits, met le son dans un tampon et répond aux questions sur les boutons.
// Cores 3D (N64, PSP) : le core dessine avec OpenGL ES 3 dans une image du processeur graphique
// (« hardware rendering » de libretro), que RetroView affiche ensuite (rf_display_*).
// Nintendo DS : image 2D des deux écrans l'un au-dessus de l'autre, écran tactile (« pointer »), souffle, couvercle.
// Nintendo 3DS : le core dessine avec Vulkan (vulkan/RetroVulkan.c) ; son image est recopiée en mémoire
// et suit ensuite le chemin de la DS (image 2D des deux écrans l'un au-dessus de l'autre).

#define MAX_ROM_SIZE (64 * 1024 * 1024)

// ---- Cores (Retro.podspec) ----
// Cores compilés dans l'app : fonctions préfixées (snes9x_retro_run…), rangées dans une table.
// Cores précompilés (prebuilt/, N64) : bibliothèque à part, fonctions retrouvées par leur nom au chargement.

typedef struct {
  const char *error; // message si le fichier ne s'ouvre pas
  void (*set_environment)(retro_environment_t);
  void (*set_video_refresh)(retro_video_refresh_t);
  void (*set_audio_sample)(retro_audio_sample_t);
  void (*set_audio_sample_batch)(retro_audio_sample_batch_t);
  void (*set_input_poll)(retro_input_poll_t);
  void (*set_input_state)(retro_input_state_t);
  void (*init)(void);
  void (*deinit)(void);
  bool (*load_game)(const struct retro_game_info *);
  void (*unload_game)(void);
  void (*run)(void);
  void (*set_controller_port_device)(unsigned, unsigned);
  void (*get_system_av_info)(struct retro_system_av_info *);
  size_t (*serialize_size)(void);
  bool (*serialize)(void *, size_t);
  bool (*unserialize)(const void *, size_t);
  void *(*get_memory_data)(unsigned);
  size_t (*get_memory_size)(unsigned);
  bool gpu;                        // dessine en 3D (OpenGL ES 3) : RetroView le fait tourner sur son propre fil
  bool vulkan;                     // dessine avec Vulkan (vulkan/RetroVulkan.c) ; son image est lue comme une image 2D
  bool fullpath;                   // ouvre le fichier lui-même (need_fullpath) : jeux trop gros pour la mémoire
  const char *const (*options)[2]; // réglages imposés { clé, valeur } ; NULL = le core n'en reçoit aucun
  size_t max_rom_size;             // taille maximale du jeu chargé en mémoire ; 0 = MAX_ROM_SIZE
} Core;

#define DECLARE_CORE(p)                                              \
  void p##_retro_set_environment(retro_environment_t);               \
  void p##_retro_set_video_refresh(retro_video_refresh_t);           \
  void p##_retro_set_audio_sample(retro_audio_sample_t);             \
  void p##_retro_set_audio_sample_batch(retro_audio_sample_batch_t); \
  void p##_retro_set_input_poll(retro_input_poll_t);                 \
  void p##_retro_set_input_state(retro_input_state_t);               \
  void p##_retro_init(void);                                         \
  void p##_retro_deinit(void);                                       \
  bool p##_retro_load_game(const struct retro_game_info *);          \
  void p##_retro_unload_game(void);                                  \
  void p##_retro_run(void);                                          \
  void p##_retro_set_controller_port_device(unsigned, unsigned);     \
  void p##_retro_get_system_av_info(struct retro_system_av_info *);  \
  size_t p##_retro_serialize_size(void);                             \
  bool p##_retro_serialize(void *, size_t);                          \
  bool p##_retro_unserialize(const void *, size_t);                  \
  void *p##_retro_get_memory_data(unsigned);                         \
  size_t p##_retro_get_memory_size(unsigned);

#define CORE_TABLE(p, message)                                                                  \
  {                                                                                             \
    message, p##_retro_set_environment, p##_retro_set_video_refresh, p##_retro_set_audio_sample, \
      p##_retro_set_audio_sample_batch, p##_retro_set_input_poll, p##_retro_set_input_state,     \
      p##_retro_init, p##_retro_deinit, p##_retro_load_game, p##_retro_unload_game,              \
      p##_retro_run, p##_retro_set_controller_port_device, p##_retro_get_system_av_info,         \
      p##_retro_serialize_size, p##_retro_serialize, p##_retro_unserialize,                      \
      p##_retro_get_memory_data, p##_retro_get_memory_size                                       \
  }

DECLARE_CORE(snes9x)
DECLARE_CORE(mgba)
DECLARE_CORE(fceumm)
DECLARE_CORE(gpgx)

static const Core snes9x = CORE_TABLE(snes9x, "This file isn't a SNES game Snes9x can open.");
static const Core mgba = CORE_TABLE(mgba, "This file isn't a Game Boy game mGBA can open.");
static const Core fceumm = CORE_TABLE(fceumm, "This file isn't a NES game FCEUmm can open.");
static const Core gpgx = CORE_TABLE(gpgx, "This file isn't a Mega Drive game Genesis Plus GX can open.");

// N64 : Mupen64Plus-Next (prebuilt/Mupen64.framework, embarqué et signé avec l'app).
// Réglages (libretro_core_options.h du core) : ce sont ses valeurs par défaut sans JIT, écrites ici
// pour ne pas en dépendre. Processeur N64 en « cached interpreter » (iOS interdit le JIT),
// image 3D par GLideN64 (OpenGL ES 3), son et processeur vidéo en HLE (le plus rapide),
// rendu sur le fil du jeu (un fil de rendu à part voudrait un second contexte OpenGL).
static const char *const mupen64_options[][2] = {
  { "mupen64plus-cpucore", "cached_interpreter" },
  { "mupen64plus-rdp-plugin", "gliden64" },
  { "mupen64plus-rsp-plugin", "hle" },
  { "mupen64plus-ThreadedRenderer", "False" },
  { NULL, NULL },
};
static Core mupen64 = { .error = "This file isn't a N64 game Mupen64Plus-Next can open.", .gpu = true, .options = mupen64_options };

// PSP : PPSSPP (prebuilt/PPSSPP.framework). Réglages (libretro/libretro_core_options.h et libretro.cpp du core) :
// processeur PSP en interpréteur IR (« IR JIT » dans ses réglages, sans JIT malgré son nom : iOS l'interdit,
// et son réglage par défaut est le JIT), sans « fast memory » (réservée au JIT, marquée instable),
// image OpenGL (pas Vulkan), rendu en 2x (960 × 544, net sur l'écran de l'iPhone), et jamais le jeu entier
// en mémoire (un jeu PSP pèse jusqu'à 1,8 Go). Il ouvre le fichier lui-même, et lit ses fichiers système
// (polices de la PSP…) dans <dossier système>/PPSSPP.
static const char *const ppsspp_options[][2] = {
  { "ppsspp_cpu_core", "IR JIT" },
  { "ppsspp_fast_memory", "disabled" },
  { "ppsspp_backend", "opengl" },
  { "ppsspp_internal_resolution", "960x544" },
  { "ppsspp_cache_iso", "disabled" },
  { NULL, NULL },
};
static Core ppsspp = {
  .error = "This file isn't a PSP game PPSSPP can open.", .gpu = true, .fullpath = true, .options = ppsspp_options
};

// Nintendo DS : melonDS DS (prebuilt/NDS.framework). Réglages (src/libretro/config/definitions du core, v1.3.1) :
// console DS (pas DSi), BIOS et firmware libres intégrés (aucun fichier Nintendo), démarrage direct du jeu,
// 3D dessinée par le processeur sur un fil à part (comme Delta ; pas d'OpenGL dans le core iOS).
// Une seule disposition : écran du haut au-dessus de l'écran du bas, sans espace (256 × 384) ; RetroView découpe
// l'image en deux et place chaque écran où le veut la maquette (côte à côte, empilés, focus).
// Doigt sur l'écran du bas en coordonnées « pointer » de libretro (rf_set_touch_screen), sans curseur affiché.
// Micro : son de souffle intégré au core, tant que le bouton micro (L3) est tenu (rf_set_blow). Pas de réseau.
static const char *const melonds_options[][2] = {
  { "melonds_console_mode", "ds" },
  { "melonds_sysfile_mode", "builtin" },
  { "melonds_boot_mode", "direct" },
  { "melonds_render_mode", "software" },
  { "melonds_threaded_renderer", "enabled" },
  { "melonds_number_of_screen_layouts", "1" },
  { "melonds_screen_layout1", "top-bottom" },
  { "melonds_screen_gap", "0" },
  { "melonds_secondary_screen_scale", "100" }, // les deux écrans à la même taille
  { "melonds_touch_mode", "touch" },
  { "melonds_show_cursor", "disabled" },
  { "melonds_mic_input", "blow" },
  { "melonds_mic_input_active", "hold" },
  { "melonds_network_mode", "disabled" },
  { NULL, NULL },
};
static Core melonds = {
  .error = "This file isn't a DS game melonDS DS can open.", .options = melonds_options,
  .max_rom_size = 512 * 1024 * 1024 // les plus gros jeux DS font 512 Mo ; le core les veut en mémoire
};

// Nintendo 3DS : Azahar (prebuilt/Azahar.framework, version 2126.1.2). Réglages (src/citra_libretro/core_settings.cpp) :
// sur iOS, il ne dessine qu'avec Vulkan (pas d'OpenGL sur Apple), fourni par MoltenVK. Sans JIT (iOS l'interdit ;
// il le vérifie aussi avec RETRO_ENVIRONMENT_GET_JIT_CAPABLE, refusé ici) : processeur en interpréteur.
// Comme Manic EMU (System.core/Azahar.opt) : processeur de la 3DS ralenti à 50 % (la plupart des jeux le supportent,
// et c'est ce qui les rend jouables sans JIT), 3DS d'origine (pas New 3DS), effets graphiques calculés par le
// processeur graphique, taille réelle (400 × 240). Écran du haut au-dessus de celui du bas, centré (400 × 480) :
// RetroView découpe l'image, comme pour la DS. Stick droit = stick C seulement (pas de curseur à l'écran),
// doigt sur l'écran du bas en « pointer » (rf_set_touch_screen). Sauvegardes du jeu dans <dossier du jeu>/Azahar.
static const char *const azahar_options[][2] = {
  { "citra_graphics_api", "Vulkan" },
  { "citra_use_cpu_jit", "disabled" },
  { "citra_use_shader_jit", "disabled" },
  { "citra_use_hw_shader", "enabled" },
  { "citra_cpu_clock_percentage", "50" },
  { "citra_is_new_3ds", "Old 3DS" },
  { "citra_resolution_factor", "1" },
  { "citra_layout_option", "default" },
  { "citra_swap_screen", "Top" },
  { "citra_render_3d", "off" },
  { "citra_analog_function", "c_stick" },
  { "citra_enable_mouse_touchscreen", "disabled" },
  { "citra_enable_touch_touchscreen", "enabled" },
  { "citra_use_libretro_save_path", "LibRetro Default" },
  { "citra_use_virtual_sd", "enabled" },
  { NULL, NULL },
};
static Core azahar = {
  .error = "This file isn't a 3DS game Azahar can open.", .vulkan = true, .fullpath = true, .options = azahar_options
};

// Retrouve les fonctions retro_* d'un core précompilé (une seule fois).
static bool bind_library_core(Core *c, const char *library) {
  if (c->run) return true;
  void *handle = dlopen(library, RTLD_NOW | RTLD_LOCAL);
  if (!handle) {
    fprintf(stderr, "[Retro] %s\n", dlerror());
    return false;
  }
  Core found = *c;
#define BIND(name)                                                  \
  if (!(*(void **)&found.name = dlsym(handle, "retro_" #name))) {  \
    fprintf(stderr, "[Retro] retro_" #name " is missing\n");       \
    return false;                                                   \
  }
  BIND(set_environment) BIND(set_video_refresh) BIND(set_audio_sample) BIND(set_audio_sample_batch)
  BIND(set_input_poll) BIND(set_input_state) BIND(init) BIND(deinit) BIND(load_game) BIND(unload_game)
  BIND(run) BIND(set_controller_port_device) BIND(get_system_av_info) BIND(serialize_size) BIND(serialize)
  BIND(unserialize) BIND(get_memory_data) BIND(get_memory_size)
#undef BIND
  *c = found;
  return true;
}

static const char *extension_of(const char *rom_path) {
  const char *dot = strrchr(rom_path, '.');
  return dot ? dot + 1 : "";
}

static bool is_n64(const char *rom_path) {
  const char *ext = extension_of(rom_path);
  return !strcasecmp(ext, "z64") || !strcasecmp(ext, "n64") || !strcasecmp(ext, "v64");
}

bool rf_is_psp_game(const char *rom_path) {
  const char *ext = extension_of(rom_path);
  return !strcasecmp(ext, "iso") || !strcasecmp(ext, "cso");
}

static bool is_nds(const char *rom_path) {
  return !strcasecmp(extension_of(rom_path), "nds");
}

// 3DS : cartouche (.3ds / .cci), programme (.cxi), jeu maison (.3dsx), et leurs versions compressées par Azahar.
bool rf_is_3ds_game(const char *rom_path) {
  static const char *const extensions[] = { "3ds", "cci", "cxi", "3dsx", "zcci", "zcxi", "z3dsx" };
  const char *ext = extension_of(rom_path);
  for (size_t i = 0; i < sizeof extensions / sizeof extensions[0]; i++) {
    if (!strcasecmp(ext, extensions[i])) return true;
  }
  return false;
}

// Core d'après l'extension du fichier (rom.gba, rom.sfc…) ; NULL si le core précompilé ne se charge pas.
static const Core *core_for(const char *rom_path) {
  const char *ext = extension_of(rom_path);
  if (is_n64(rom_path)) return bind_library_core(&mupen64, "@rpath/Mupen64.framework/Mupen64") ? &mupen64 : NULL;
  if (rf_is_psp_game(rom_path)) return bind_library_core(&ppsspp, "@rpath/PPSSPP.framework/PPSSPP") ? &ppsspp : NULL;
  if (is_nds(rom_path)) return bind_library_core(&melonds, "@rpath/NDS.framework/NDS") ? &melonds : NULL;
  if (rf_is_3ds_game(rom_path)) return bind_library_core(&azahar, "@rpath/Azahar.framework/Azahar") ? &azahar : NULL;
  if (!strcasecmp(ext, "gb") || !strcasecmp(ext, "gbc") || !strcasecmp(ext, "gba") || !strcasecmp(ext, "sgb")) return &mgba;
  if (!strcasecmp(ext, "nes")) return &fceumm;
  if (!strcasecmp(ext, "md") || !strcasecmp(ext, "gen") || !strcasecmp(ext, "bin") || !strcasecmp(ext, "smd")) return &gpgx;
  return &snes9x;
}

bool rf_is_gpu_game(const char *rom_path) {
  return is_n64(rom_path) || rf_is_psp_game(rom_path);
}

bool rf_is_threaded_game(const char *rom_path) {
  return rf_is_gpu_game(rom_path) || is_nds(rom_path) || rf_is_3ds_game(rom_path);
}

static const Core *core = &snes9x;
static bool loaded;
static void *rom_data;
static char save_file[1024];
static char rtc_file[1024]; // horloge de la cartouche (Pokémon Or / Argent…), à côté de la sauvegarde
static char save_dir[1024];
static char system_dir[1024]; // fichiers du core (PPSSPP/…) ; sinon le dossier de la sauvegarde
static char error_text[160];
static char core_message[160]; // dernier message du core (RETRO_ENVIRONMENT_SET_MESSAGE) : Azahar y explique ses échecs
static bool memory_maps_received; // Azahar annonce sa mémoire quand le jeu a bien démarré (RETRO_ENVIRONMENT_SET_MEMORY_MAPS)
static bool game_failed; // le core a arrêté le jeu (RETRO_ENVIRONMENT_SHUTDOWN : PPSSPP n'a pas pu le démarrer)
static bool ran_once;    // au moins une image jouée depuis le chargement
static struct retro_system_av_info av;
static enum retro_pixel_format pixel_format = RETRO_PIXEL_FORMAT_0RGB1555;
static uint16_t pad;
static _Atomic uint16_t touch_pad;
static int16_t analog[4]; // stick gauche X, Y puis stick droit X, Y (N64)
static _Atomic int16_t touch_analog[4]; // mêmes axes, sur l'écran tactile (stick et boutons C)
static bool audio_enabled = true;

// Nintendo DS (melonDS DS).
static _Atomic bool pointer_down;             // un doigt sur l'écran du bas
static _Atomic int16_t pointer_x, pointer_y;  // sa place en coordonnées « pointer » de libretro (-32767 à 32767)
static _Atomic bool blowing;                  // « Blow into the microphone » : A tenu sur la ligne du menu
static _Atomic bool lid_wanted;               // « Close the lid »
static bool lid_closed;                       // état du couvercle déjà transmis au core
static bool lid_combo_sent;                   // la combinaison du couvercle est partie à l'image précédente

static uint32_t *frame;
static size_t frame_capacity;
static uint32_t frame_width, frame_height;
static bool frame_new;

// Image 3D : le core dessine dans hw_fbo (image hw_texture + profondeur hw_depth), dans le contexte
// OpenGL du jeu ; frame_width × frame_height = partie dessinée de la dernière image (coin en bas à gauche).
static struct retro_hw_render_callback hw;
static bool hw_requested; // OpenGL (N64, PSP)
static bool vk_requested; // Vulkan (3DS)
static GLuint hw_fbo, hw_texture, hw_depth;

// Réglages du core (cores qui en ont dans leur table seulement) : valeurs par défaut qu'il annonce.
#define MAX_OPTIONS 256
static struct {
  char *key;
  char *value;
} options[MAX_OPTIONS];
static int option_count;

// Son : tampon circulaire stéréo, écrit par le jeu (fil principal), lu par iOS (fil audio).
#define RING_FRAMES 16384u
#define RING_MASK (RING_FRAMES - 1)
static int16_t ring[RING_FRAMES * 2];
static _Atomic uint32_t ring_write;
static _Atomic uint32_t ring_read;
static uint32_t ring_target = 2048; // remplissage visé (≈ 60 ms), fixé au chargement
static double read_fraction;        // fil audio seulement
static bool playing;                // fil audio seulement

static void set_error(const char *text) {
  snprintf(error_text, sizeof error_text, "%s", text);
}

// ---- Rappels du core ----

static void RETRO_CALLCONV core_log(enum retro_log_level level, const char *fmt, ...) {
  if (level < RETRO_LOG_WARN) return;
  va_list args;
  va_start(args, fmt);
  vfprintf(stderr, fmt, args);
  va_end(args);
}

static void clear_options(void) {
  for (int i = 0; i < option_count; i++) {
    free(options[i].key);
    free(options[i].value);
  }
  option_count = 0;
}

// « Description; défaut|autre|… » (RETRO_ENVIRONMENT_SET_VARIABLES) : on garde la clé et la valeur par défaut.
static void record_options(const struct retro_variable *variables) {
  clear_options();
  for (; variables && variables->key && option_count < MAX_OPTIONS; variables++) {
    const char *choices = variables->value ? strstr(variables->value, "; ") : NULL;
    if (!choices) continue;
    choices += 2;
    size_t length = strcspn(choices, "|");
    options[option_count].key = strdup(variables->key);
    options[option_count].value = strndup(choices, length);
    option_count++;
  }
}

// Réglages choisis par l'app (rf_set_core_option), lus avant ceux imposés par le frontend.
#define MAX_APP_OPTIONS 8
static struct { char *key; char *value; } app_options[MAX_APP_OPTIONS];
static int app_option_count = 0;

void rf_set_core_option(const char *key, const char *value) {
  if (!key || !value) return;
  for (int i = 0; i < app_option_count; i++) {
    if (!strcmp(app_options[i].key, key)) {
      free(app_options[i].value);
      app_options[i].value = strdup(value);
      return;
    }
  }
  if (app_option_count == MAX_APP_OPTIONS) return;
  app_options[app_option_count].key = strdup(key);
  app_options[app_option_count].value = strdup(value);
  app_option_count++;
}

static const char *option_value(const char *key) {
  for (int i = 0; i < app_option_count; i++) {
    if (!strcmp(app_options[i].key, key)) return app_options[i].value;
  }
  for (const char *const (*forced)[2] = core->options; (*forced)[0]; forced++) {
    if (!strcmp((*forced)[0], key)) return (*forced)[1];
  }
  for (int i = 0; i < option_count; i++) {
    if (!strcmp(options[i].key, key)) return options[i].value;
  }
  return NULL;
}

static uintptr_t RETRO_CALLCONV hw_current_framebuffer(void) {
  return hw_fbo;
}

static retro_proc_address_t RETRO_CALLCONV hw_proc_address(const char *symbol) {
  return (retro_proc_address_t)dlsym(RTLD_DEFAULT, symbol);
}

// OpenGL ES 3.0 (ou 2.0, qu'un contexte 3.0 sait faire tourner) pour le N64 et la PSP ; Vulkan pour la 3DS.
// Pas d'OpenGL de bureau.
static bool accept_hw_render(struct retro_hw_render_callback *request) {
  if (core->vulkan) {
    if (!rv_accept(request)) return false;
    hw = *request;
    vk_requested = true;
    return true;
  }
  if (!core->gpu) return false;
  bool gles = request->context_type == RETRO_HW_CONTEXT_OPENGLES3 || request->context_type == RETRO_HW_CONTEXT_OPENGLES2 ||
              (request->context_type == RETRO_HW_CONTEXT_OPENGLES_VERSION && request->version_major == 3 && request->version_minor == 0);
  if (!gles) return false;
  request->get_current_framebuffer = hw_current_framebuffer;
  request->get_proc_address = hw_proc_address;
  hw = *request;
  hw_requested = true;
  return true;
}

static bool RETRO_CALLCONV core_environment(unsigned cmd, void *data) {
  if (core->options) {
    switch (cmd) {
      case RETRO_ENVIRONMENT_SET_VARIABLES:
        record_options(data);
        return true;
      case RETRO_ENVIRONMENT_GET_VARIABLE: {
        struct retro_variable *variable = data;
        variable->value = option_value(variable->key);
        return variable->value != NULL;
      }
      default:
        break;
    }
  }
  switch (cmd) {
    case RETRO_ENVIRONMENT_SET_HW_RENDER:
      return accept_hw_render(data);
    case RETRO_ENVIRONMENT_GET_PREFERRED_HW_RENDER:
      if (!core->gpu && !core->vulkan) return false;
      *(unsigned *)data = core->vulkan ? RETRO_HW_CONTEXT_VULKAN : RETRO_HW_CONTEXT_OPENGLES3;
      return true;
    case RETRO_ENVIRONMENT_SET_HW_SHARED_CONTEXT:
      return core->gpu; // le core a son contexte à lui : RetroView affiche l'image depuis un second contexte
    case RETRO_ENVIRONMENT_SET_HW_RENDER_CONTEXT_NEGOTIATION_INTERFACE: // 3DS : le core crée son device Vulkan
      return core->vulkan && rv_set_negotiation(data);
    case RETRO_ENVIRONMENT_GET_HW_RENDER_INTERFACE:
      return core->vulkan && rv_get_interface(data);
    case RETRO_ENVIRONMENT_SET_MESSAGE: { // 3DS seulement (les autres cores n'en recevaient pas : inchangés)
      if (!core->vulkan) return false;
      const struct retro_message *message = data;
      if (message && message->msg) {
        snprintf(core_message, sizeof core_message, "%s", message->msg);
        fprintf(stderr, "[Retro] %s\n", message->msg);
      }
      return true;
    }
    case RETRO_ENVIRONMENT_SET_MEMORY_MAPS:
      memory_maps_received = true;
      return false; // on ne s'en sert pas

    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: {
      enum retro_pixel_format format = *(const enum retro_pixel_format *)data;
      if (format != RETRO_PIXEL_FORMAT_RGB565 && format != RETRO_PIXEL_FORMAT_XRGB8888 && format != RETRO_PIXEL_FORMAT_0RGB1555)
        return false;
      pixel_format = format;
      return true;
    }
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE:
      ((struct retro_log_callback *)data)->log = core_log;
      return true;
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
      *(const char **)data = system_dir;
      return true;
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY:
      *(const char **)data = save_dir;
      return true;
    case RETRO_ENVIRONMENT_SHUTDOWN: // le jeu ne démarre pas (image de disque abîmée…) : RetroView l'annonce
      game_failed = true;
      set_error(core->vulkan && core_message[0] ? core_message : core->error);
      return true;
    case RETRO_ENVIRONMENT_GET_CAN_DUPE:
      *(bool *)data = true;
      return true;
    case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS:
      return true;
    case RETRO_ENVIRONMENT_SET_GEOMETRY:
      av.geometry = *(const struct retro_game_geometry *)data;
      return true;
    case RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO:
      av = *(const struct retro_system_av_info *)data;
      return true;
    default:
      return false; // réglages du core : valeurs par défaut
  }
}

static inline uint32_t expand5(uint32_t v) { return (v << 3) | (v >> 2); }
static inline uint32_t expand6(uint32_t v) { return (v << 2) | (v >> 4); }

static void RETRO_CALLCONV core_video(const void *data, unsigned width, unsigned height, size_t pitch) {
  if (!data) return; // image identique à la précédente
  if (data == RETRO_HW_FRAME_BUFFER_VALID && vk_requested) { // 3DS : image Vulkan, recopiée au début de l'image suivante
    rv_frame_ready(width, height);
    return;
  }
  if (data == RETRO_HW_FRAME_BUFFER_VALID) { // image 3D : elle est déjà dans hw_texture
    frame_width = width;
    frame_height = height;
    return;
  }
  size_t needed = (size_t)width * height;
  if (needed > frame_capacity) {
    uint32_t *bigger = realloc(frame, needed * sizeof(uint32_t));
    if (!bigger) return;
    frame = bigger;
    frame_capacity = needed;
  }
  for (unsigned y = 0; y < height; y++) {
    const uint8_t *row = (const uint8_t *)data + y * pitch;
    uint32_t *out = frame + (size_t)y * width;
    if (pixel_format == RETRO_PIXEL_FORMAT_XRGB8888) {
      const uint32_t *in = (const uint32_t *)row;
      for (unsigned x = 0; x < width; x++) out[x] = in[x] | 0xFF000000u;
    } else if (pixel_format == RETRO_PIXEL_FORMAT_RGB565) {
      const uint16_t *in = (const uint16_t *)row;
      for (unsigned x = 0; x < width; x++) {
        uint32_t p = in[x];
        out[x] = 0xFF000000u | expand5(p >> 11) << 16 | expand6((p >> 5) & 0x3F) << 8 | expand5(p & 0x1F);
      }
    } else {
      const uint16_t *in = (const uint16_t *)row;
      for (unsigned x = 0; x < width; x++) {
        uint32_t p = in[x];
        out[x] = 0xFF000000u | expand5((p >> 10) & 0x1F) << 16 | expand5((p >> 5) & 0x1F) << 8 | expand5(p & 0x1F);
      }
    }
  }
  frame_width = width;
  frame_height = height;
  frame_new = true;
}

static size_t RETRO_CALLCONV core_audio_batch(const int16_t *data, size_t frames) {
  if (!audio_enabled) return frames;
  uint32_t w = atomic_load_explicit(&ring_write, memory_order_relaxed);
  uint32_t r = atomic_load_explicit(&ring_read, memory_order_acquire);
  for (size_t i = 0; i < frames; i++) {
    if (w - r >= RING_FRAMES - 1) break; // tampon plein : le surplus est jeté
    ring[(w & RING_MASK) * 2] = data[i * 2];
    ring[(w & RING_MASK) * 2 + 1] = data[i * 2 + 1];
    w++;
  }
  atomic_store_explicit(&ring_write, w, memory_order_release);
  return frames;
}

static void RETRO_CALLCONV core_audio_sample(int16_t left, int16_t right) {
  int16_t sample[2] = { left, right };
  core_audio_batch(sample, 1);
}

static void RETRO_CALLCONV core_input_poll(void) {}

static int16_t RETRO_CALLCONV core_input_state(unsigned port, unsigned device, unsigned index, unsigned id) {
  if (port != 0) return 0;
  if ((device & RETRO_DEVICE_MASK) == RETRO_DEVICE_POINTER) { // écran tactile de la DS, un seul doigt
    if (index != 0) return 0;
    if (id == RETRO_DEVICE_ID_POINTER_PRESSED) return atomic_load(&pointer_down) ? 1 : 0;
    if (id == RETRO_DEVICE_ID_POINTER_X) return atomic_load(&pointer_x);
    if (id == RETRO_DEVICE_ID_POINTER_Y) return atomic_load(&pointer_y);
    return 0;
  }
  if ((device & RETRO_DEVICE_MASK) == RETRO_DEVICE_ANALOG) {
    if (index > RETRO_DEVICE_INDEX_ANALOG_RIGHT || id > RETRO_DEVICE_ID_ANALOG_Y) return 0;
    // Manette et écran tactile ensemble : le plus grand mouvement l'emporte.
    int16_t pad_value = analog[index * 2 + id];
    int16_t touch_value = atomic_load(&touch_analog[index * 2 + id]);
    return abs(touch_value) > abs(pad_value) ? touch_value : pad_value;
  }
  if ((device & RETRO_DEVICE_MASK) != RETRO_DEVICE_JOYPAD) return 0;
  if (id == RETRO_DEVICE_ID_JOYPAD_MASK) return (int16_t)pad;
  return id < 16 ? (pad >> id) & 1 : 0;
}

// ---- Fichiers ----

// Écrit à côté puis remplace : une coupure en plein milieu n'abîme jamais l'ancien fichier.
static bool write_file(const char *path, const void *data, size_t size) {
  char temp[1040];
  snprintf(temp, sizeof temp, "%s.tmp", path);
  FILE *file = fopen(temp, "wb");
  if (!file) return false;
  bool ok = fwrite(data, 1, size, file) == size;
  ok = fclose(file) == 0 && ok;
  return ok && rename(temp, path) == 0;
}

// Lit un fichier entier (à libérer avec free) ; NULL s'il n'existe pas ou dépasse max_size.
static void *read_file(const char *path, size_t max_size, size_t *size) {
  FILE *file = fopen(path, "rb");
  if (!file) return NULL;
  fseek(file, 0, SEEK_END);
  long length = ftell(file);
  fseek(file, 0, SEEK_SET);
  void *data = length > 0 && (size_t)length <= max_size ? malloc((size_t)length) : NULL;
  if (data && fread(data, 1, (size_t)length, file) != (size_t)length) {
    free(data);
    data = NULL;
  }
  fclose(file);
  *size = data ? (size_t)length : 0;
  return data;
}

// ---- Sauvegarde du jeu (SRAM de la cartouche) ----

static void load_memory(unsigned id, const char *path) {
  size_t size = core->get_memory_size(id);
  void *memory = core->get_memory_data(id);
  if (!size || !memory) return;
  size_t length = 0;
  void *data = read_file(path, 16 * 1024 * 1024, &length);
  if (!data) return;
  memcpy(memory, data, length < size ? length : size);
  free(data);
}

static bool save_memory(unsigned id, const char *path) {
  size_t size = core->get_memory_size(id);
  void *memory = core->get_memory_data(id);
  if (!size || !memory) return true; // ce jeu n'en a pas
  return write_file(path, memory, size);
}

static void load_sram(void) {
  load_memory(RETRO_MEMORY_SAVE_RAM, save_file);
  load_memory(RETRO_MEMORY_RTC, rtc_file);
}

bool rf_save_sram(void) {
  if (!loaded) return false;
  bool ok = save_memory(RETRO_MEMORY_SAVE_RAM, save_file);
  return save_memory(RETRO_MEMORY_RTC, rtc_file) && ok;
}

// ---- Sauvegardes d'état ----

bool rf_save_state(const char *path) {
  if (!loaded) return false;
  size_t size = core->serialize_size();
  void *data = size ? malloc(size) : NULL;
  bool ok = data && core->serialize(data, size) && write_file(path, data, size);
  free(data);
  return ok;
}

bool rf_load_state(const char *path) {
  if (!loaded) return false;
  // Azahar ne relit une sauvegarde d'état qu'après une première image (RETRO_SERIALIZATION_QUIRK_MUST_INITIALIZE) :
  // « Continue » la charge juste après le chargement du jeu. Une image jouée sans son, sans boutons.
  if (core->vulkan && !ran_once) {
    bool audio = audio_enabled;
    audio_enabled = false;
    rf_run_frame(0);
    audio_enabled = audio;
  }
  size_t size = 0;
  // PSP : plusieurs dizaines de Mo (sa mémoire entière) ; 3DS : davantage (128 Mo de mémoire, plus la vidéo et le son).
  void *data = read_file(path, 512 * 1024 * 1024, &size);
  bool ok = data && core->unserialize(data, size);
  free(data);
  // 3DS : en relisant une sauvegarde, Azahar redémarre la console émulée (System::serialize → Shutdown puis Init),
  // affichage compris : l'image annoncée avant n'existe plus. La copier au début de l'image suivante plantait
  // (build 21 : « Continue » et « Load state »).
  if (vk_requested) rv_forget_frame();
  return ok;
}

void rf_set_audio_enabled(bool enabled) {
  audio_enabled = enabled;
}

void rf_set_touch_buttons(uint16_t buttons) {
  atomic_store(&touch_pad, buttons);
}

void rf_set_analog(int16_t left_x, int16_t left_y, int16_t right_x, int16_t right_y) {
  analog[0] = left_x;
  analog[1] = left_y;
  analog[2] = right_x;
  analog[3] = right_y;
}

void rf_set_touch_analog(int16_t left_x, int16_t left_y, int16_t right_x, int16_t right_y) {
  atomic_store(&touch_analog[0], left_x);
  atomic_store(&touch_analog[1], left_y);
  atomic_store(&touch_analog[2], right_x);
  atomic_store(&touch_analog[3], right_y);
}

uint16_t rf_touch_buttons(void) {
  return atomic_load(&touch_pad);
}

void rf_touch_analog(int16_t sticks[4]) {
  for (int i = 0; i < 4; i++) sticks[i] = atomic_load(&touch_analog[i]);
}

// x, y de 0 à 1 sur l'écran du bas. melonDS DS reçoit une place sur toute son image (écran du haut au-dessus
// de celui du bas, sans espace) : -32767 = bord gauche / haut de l'image, 32767 = bord droit / bas.
// L'écran du bas en occupe la moitié basse : y de l'image = 0,5 + y / 2, soit (2 × 0,5 + y − 1) × 32767 = y × 32767.
// 3DS (Azahar, 400 × 480) : même hauteur, mais l'écran du bas (320 de large) est centré, de 40 à 360 :
// x de l'image = (40 + 320 x) / 400 = 0,1 + 0,8 x, soit (2 × (0,1 + 0,8 x) − 1) × 32767 = (1,6 x − 0,8) × 32767.
void rf_set_touch_screen(bool pressed, double x, double y) {
  if (x < 0) x = 0;
  if (x > 0.999) x = 0.999;
  if (y < 0) y = 0;
  if (y > 0.999) y = 0.999;
  double image_x = core->vulkan ? 1.6 * x - 0.8 : x * 2 - 1;
  atomic_store(&pointer_x, (int16_t)(image_x * 32767));
  atomic_store(&pointer_y, (int16_t)(y * 32767));
  atomic_store(&pointer_down, pressed);
}

void rf_set_blow(bool on) {
  atomic_store(&blowing, on);
}

void rf_set_lid_closed(bool closed) {
  atomic_store(&lid_wanted, closed);
}

// ---- Image 3D, côté jeu (contexte OpenGL du core) ----

static void release_hw_framebuffer(void) {
  if (hw_fbo) glDeleteFramebuffers(1, &hw_fbo);
  if (hw_texture) glDeleteTextures(1, &hw_texture);
  if (hw_depth) glDeleteRenderbuffers(1, &hw_depth);
  hw_fbo = hw_texture = hw_depth = 0;
}

// Image où le core dessine, à la taille maximale qu'il annonce (640 × 480 pour le N64 par défaut).
static bool create_hw_framebuffer(void) {
  GLsizei width = av.geometry.max_width > 0 ? (GLsizei)av.geometry.max_width : 640;
  GLsizei height = av.geometry.max_height > 0 ? (GLsizei)av.geometry.max_height : 480;
  glGenTextures(1, &hw_texture);
  glBindTexture(GL_TEXTURE_2D, hw_texture);
  glTexStorage2D(GL_TEXTURE_2D, 1, GL_RGBA8, width, height);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
  glBindTexture(GL_TEXTURE_2D, 0);

  glGenFramebuffers(1, &hw_fbo);
  glBindFramebuffer(GL_FRAMEBUFFER, hw_fbo);
  glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, hw_texture, 0);
  if (hw.depth || hw.stencil) {
    glGenRenderbuffers(1, &hw_depth);
    glBindRenderbuffer(GL_RENDERBUFFER, hw_depth);
    glRenderbufferStorage(GL_RENDERBUFFER, hw.stencil ? GL_DEPTH24_STENCIL8 : GL_DEPTH_COMPONENT24, width, height);
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, hw.stencil ? GL_DEPTH_STENCIL_ATTACHMENT : GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, hw_depth);
    glBindRenderbuffer(GL_RENDERBUFFER, 0);
  }
  bool complete = glCheckFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE;
  glClearColor(0, 0, 0, 1);
  glClear(GL_COLOR_BUFFER_BIT);
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  fprintf(stderr, "[Retro] 3D image %dx%d, depth %d, stencil %d, bottom-left %d : %s\n", width, height, hw.depth, hw.stencil,
          hw.bottom_left_origin, complete ? "ok" : "incomplete");
  return complete;
}

bool rf_hw_active(void) {
  return loaded && hw_requested;
}

void rf_gpu_finish(void) {
  if (rf_hw_active()) glFinish();
  if (loaded && vk_requested) rv_wait_idle();
}

// 3DS : recopie en mémoire l'image annoncée à l'image précédente (voir vulkan/RetroVulkan.c).
static void read_vulkan_frame(void) {
  uint32_t width = 0, height = 0;
  if (!rv_frame_size(&width, &height)) return;
  size_t needed = (size_t)width * height;
  if (needed > frame_capacity) {
    uint32_t *bigger = realloc(frame, needed * sizeof(uint32_t));
    if (!bigger) return;
    frame = bigger;
    frame_capacity = needed;
  }
  if (!rv_read_frame(frame)) return;
  frame_width = width;
  frame_height = height;
  frame_new = true;
}

void rf_gpu_flush(void) {
  if (rf_hw_active()) glFlush();
}

// ---- Chargement ----

bool rf_load_game(const char *rom_path, const char *save_path, const char *system_path) {
  if (loaded) rf_unload_game();
  error_text[0] = 0;

  const Core *chosen = core_for(rom_path);
  if (!chosen) {
    set_error("The emulator for this system could not be loaded.");
    return false;
  }

  FILE *file = fopen(rom_path, "rb");
  if (!file) {
    set_error("This file could not be opened.");
    return false;
  }
  fseek(file, 0, SEEK_END);
  long size = ftell(file);
  fseek(file, 0, SEEK_SET);
  size_t max_size = chosen->max_rom_size ? chosen->max_rom_size : MAX_ROM_SIZE;
  if (size <= 0 || (!chosen->fullpath && (size_t)size > max_size)) {
    fclose(file);
    set_error("This file isn't a game.");
    return false;
  }
  // Les cores « fullpath » (PSP) lisent le fichier eux-mêmes, au fur et à mesure : on ne le charge pas.
  if (!chosen->fullpath) {
    rom_data = malloc((size_t)size);
    if (!rom_data || fread(rom_data, 1, (size_t)size, file) != (size_t)size) {
      fclose(file);
      free(rom_data);
      rom_data = NULL;
      set_error("This file could not be read.");
      return false;
    }
  }
  fclose(file);

  snprintf(save_file, sizeof save_file, "%s", save_path);
  // game.srm → game.rtc
  snprintf(rtc_file, sizeof rtc_file, "%s", save_path);
  char *extension = strrchr(rtc_file, '.');
  if (extension && !strchr(extension, '/')) *extension = 0;
  strncat(rtc_file, ".rtc", sizeof rtc_file - strlen(rtc_file) - 1);
  snprintf(save_dir, sizeof save_dir, "%s", save_path);
  char *slash = strrchr(save_dir, '/');
  if (slash) *slash = 0;
  snprintf(system_dir, sizeof system_dir, "%s", system_path ? system_path : save_dir);

  game_failed = false;
  ran_once = false;
  core_message[0] = 0;
  memory_maps_received = false;
  vk_requested = false;
  pad = 0;
  memset(analog, 0, sizeof analog);
  atomic_store(&pointer_down, false);
  atomic_store(&blowing, false);
  atomic_store(&lid_wanted, false);
  lid_closed = lid_combo_sent = false;
  audio_enabled = true;
  frame_new = false;
  frame_width = frame_height = 0;
  memset(&hw, 0, sizeof hw);
  hw_requested = false;
  clear_options();
  core = chosen;
  pixel_format = RETRO_PIXEL_FORMAT_0RGB1555; // format par défaut de libretro, tant que le core n'en choisit pas un autre
  core->set_environment(core_environment);
  core->set_video_refresh(core_video);
  core->set_audio_sample(core_audio_sample);
  core->set_audio_sample_batch(core_audio_batch);
  core->set_input_poll(core_input_poll);
  core->set_input_state(core_input_state);
  core->init();

  struct retro_game_info game = { rom_path, rom_data, rom_data ? (size_t)size : 0, NULL };
  if (!core->load_game(&game)) {
    core->deinit();
    free(rom_data);
    rom_data = NULL;
    set_error(core->vulkan && core_message[0] ? core_message : core->error); // 3DS : « … must be decrypted … »
    return false;
  }
  core->set_controller_port_device(0, RETRO_DEVICE_JOYPAD);
  core->get_system_av_info(&av);

  // 3DS : Vulkan, puis « le contexte est prêt » : c'est seulement là qu'Azahar démarre vraiment le jeu.
  // S'il n'y arrive pas, il l'écrit (SET_MESSAGE) sans annoncer sa mémoire (SET_MEMORY_MAPS).
  if (vk_requested) {
    char message[160];
    bool ready = rv_create(message, sizeof message);
    if (ready) {
      core_message[0] = 0;
      if (hw.context_reset) hw.context_reset();
      if (core_message[0] && !memory_maps_received) {
        snprintf(message, sizeof message, "%s", core_message);
        ready = false;
      }
    }
    if (!ready) {
      if (hw.context_destroy) hw.context_destroy();
      core->unload_game();
      core->deinit();
      rv_destroy();
      vk_requested = false;
      set_error(message);
      return false;
    }
  }

  // Jeu 3D : l'image où il dessine, puis « le contexte est prêt » (le core y crée ses shaders, textures…).
  // RetroView a rendu courant le contexte OpenGL du jeu avant rf_load_game.
  if (hw_requested) {
    if (!create_hw_framebuffer()) {
      release_hw_framebuffer();
      core->unload_game();
      core->deinit();
      free(rom_data);
      rom_data = NULL;
      set_error("This iPhone couldn't prepare the 3D image.");
      return false;
    }
    if (hw.context_reset) hw.context_reset();
  }

  // Le son est arrêté pendant le chargement (RetroView) : on peut remettre le tampon à zéro.
  atomic_store(&ring_write, 0);
  atomic_store(&ring_read, 0);
  read_fraction = 0;
  playing = false;
  ring_target = (uint32_t)(rf_sample_rate() * 0.06);
  loaded = true;
  load_sram();
  return true;
}

void rf_unload_game(void) {
  if (!loaded) return;
  rf_save_sram();
  // Le core libère ses objets OpenGL avant de décharger le jeu, dans cet ordre comme RetroArch :
  // PPSSPP efface son contexte graphique en déchargeant le jeu, et planterait ensuite dans context_destroy.
  if ((hw_requested || vk_requested) && hw.context_destroy) hw.context_destroy();
  core->unload_game();
  core->deinit();
  if (hw_requested) release_hw_framebuffer();
  if (vk_requested) rv_destroy(); // après le core : il a libéré ses objets Vulkan en déchargeant le jeu
  hw_requested = false;
  vk_requested = false;
  clear_options();
  free(rom_data);
  rom_data = NULL;
  loaded = false;
}

void rf_run_frame(uint16_t buttons) {
  if (!loaded || game_failed) return; // après un arrêt demandé par le core, il ne faut plus le faire tourner
  pad = buttons | atomic_load(&touch_pad);
  if (core == &melonds) {
    // Souffle : A est tenu sur la ligne du menu (le jeu tourne le temps de l'appui). Seul le bouton micro
    // de melonDS DS (L3) passe : sinon ce A arriverait aussi au jeu.
    if (atomic_load(&blowing)) pad = 1 << RETRO_DEVICE_ID_JOYPAD_L3;
    // Couvercle : melonDS DS l'ouvre ou le ferme quand Y est appuyé pendant que L2 est tenu (une seule image,
    // puis au moins une image sans, pour qu'il voie un nouvel appui). La DS reçoit Y pendant cette image.
    bool wanted = atomic_load(&lid_wanted);
    if (wanted != lid_closed && !lid_combo_sent) {
      pad |= 1 << RETRO_DEVICE_ID_JOYPAD_L2 | 1 << RETRO_DEVICE_ID_JOYPAD_Y;
      lid_closed = wanted;
      lid_combo_sent = true;
    } else {
      lid_combo_sent = false;
    }
  }
  if (vk_requested) read_vulkan_frame(); // image annoncée à l'image précédente : son dessin est fini
  core->run();
  ran_once = true;
}

bool rf_game_failed(void) {
  return game_failed;
}

double rf_fps(void) {
  return av.timing.fps > 0 ? av.timing.fps : 60.0988;
}

double rf_sample_rate(void) {
  return av.timing.sample_rate > 0 ? av.timing.sample_rate : 32040.0;
}

double rf_aspect_ratio(void) {
  if (av.geometry.aspect_ratio > 0) return av.geometry.aspect_ratio;
  if (av.geometry.base_height > 0) return (double)av.geometry.base_width / av.geometry.base_height;
  return 4.0 / 3.0;
}

const uint32_t *rf_frame(uint32_t *width, uint32_t *height) {
  if (!frame_new) return NULL;
  frame_new = false;
  *width = frame_width;
  *height = frame_height;
  return frame;
}

void rf_audio_read(float *left, float *right, uint32_t frames) {
  uint32_t r = atomic_load_explicit(&ring_read, memory_order_relaxed);
  uint32_t w = atomic_load_explicit(&ring_write, memory_order_acquire);
  uint32_t fill = w - r;
  if (!playing && fill >= ring_target) playing = true;

  // L'écran tourne à 60 Hz et la SNES à 60,1 Hz : on lit un poil plus vite ou plus lentement
  // (au plus 0,5 %, inaudible) pour garder le tampon autour de sa cible, sans coupure.
  double ratio = 1.0 + 0.005 * ((double)fill - ring_target) / ring_target;
  if (ratio < 0.995) ratio = 0.995;
  if (ratio > 1.005) ratio = 1.005;

  for (uint32_t i = 0; i < frames; i++) {
    if (!playing || w - r < 2) {
      playing = false; // à court de son : silence le temps de remplir à nouveau
      left[i] = 0;
      right[i] = 0;
      continue;
    }
    const int16_t *a = &ring[(r & RING_MASK) * 2];
    const int16_t *b = &ring[((r + 1) & RING_MASK) * 2];
    float t = (float)read_fraction;
    left[i] = (a[0] + (b[0] - a[0]) * t) / 32768.0f;
    right[i] = (a[1] + (b[1] - a[1]) * t) / 32768.0f;
    read_fraction += ratio;
    while (read_fraction >= 1.0) {
      read_fraction -= 1.0;
      r++;
    }
  }
  atomic_store_explicit(&ring_read, r, memory_order_release);
}

const char *rf_error(void) {
  return error_text;
}

// ---- Image 3D, côté écran (contexte d'affichage de RetroView, qui partage les images du contexte du jeu) ----
// Deux contextes : le core garde en mémoire l'état d'OpenGL (image liée, couleurs…) ; afficher depuis
// son contexte à lui le dérangerait. Ici, display_fbo = image de l'écran (CAEAGLLayer), read_fbo = hw_texture.

static GLuint display_fbo, display_renderbuffer, read_fbo;
static GLint display_width, display_height;

void rf_display_bind_renderbuffer(void) {
  if (!display_renderbuffer) {
    glGenRenderbuffers(1, &display_renderbuffer);
    glGenFramebuffers(1, &display_fbo);
  }
  glBindRenderbuffer(GL_RENDERBUFFER, display_renderbuffer);
}

bool rf_display_attach(void) {
  glBindFramebuffer(GL_FRAMEBUFFER, display_fbo);
  glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_RENDERBUFFER, display_renderbuffer);
  glGetRenderbufferParameteriv(GL_RENDERBUFFER, GL_RENDERBUFFER_WIDTH, &display_width);
  glGetRenderbufferParameteriv(GL_RENDERBUFFER, GL_RENDERBUFFER_HEIGHT, &display_height);
  return glCheckFramebufferStatus(GL_FRAMEBUFFER) == GL_FRAMEBUFFER_COMPLETE && display_width > 0 && display_height > 0;
}

// Relie l'image du jeu à read_fbo. À refaire à chaque image : un contexte ne voit les changements
// faits par l'autre qu'en reliant l'objet à nouveau (après glFlush de l'autre côté).
static bool bind_game_image(void) {
  if (!rf_hw_active() || !hw_texture || !frame_width || !frame_height) return false;
  if (!read_fbo) glGenFramebuffers(1, &read_fbo);
  glBindFramebuffer(GL_READ_FRAMEBUFFER, read_fbo);
  glFramebufferTexture2D(GL_READ_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, hw_texture, 0);
  return true;
}

// Copie la dernière image du jeu sur toute l'image de l'écran (Smooth = lissée, sinon pixels nets).
bool rf_display_draw(bool smooth) {
  if (!display_fbo || !bind_game_image()) return false;
  glBindFramebuffer(GL_DRAW_FRAMEBUFFER, display_fbo);
  // L'écran compte ses lignes depuis le bas, comme OpenGL : on retourne l'image si le core la dessine depuis le haut.
  GLint top = hw.bottom_left_origin ? display_height : 0;
  GLint bottom = hw.bottom_left_origin ? 0 : display_height;
  glBlitFramebuffer(0, 0, (GLint)frame_width, (GLint)frame_height, 0, bottom, display_width, top, GL_COLOR_BUFFER_BIT,
                    smooth ? GL_LINEAR : GL_NEAREST);
  glBindRenderbuffer(GL_RENDERBUFFER, display_renderbuffer);
  return true;
}

// Dernière image du jeu en BGRA 32 bits, à l'endroit (vignettes des sauvegardes, fond flou) ; NULL si aucune.
const uint32_t *rf_display_snapshot(uint32_t *width, uint32_t *height) {
  if (!bind_game_image()) return NULL;
  size_t needed = (size_t)frame_width * frame_height;
  if (needed > frame_capacity) {
    uint32_t *bigger = realloc(frame, needed * sizeof(uint32_t));
    if (!bigger) return NULL;
    frame = bigger;
    frame_capacity = needed;
  }
  glReadPixels(0, 0, (GLsizei)frame_width, (GLsizei)frame_height, GL_RGBA, GL_UNSIGNED_BYTE, frame);
  // RGBA → BGRA ; OpenGL lit depuis le bas : on remet la première ligne en haut.
  for (uint32_t y = 0; y < frame_height; y++) {
    uint32_t mirror = hw.bottom_left_origin ? frame_height - 1 - y : y;
    if (mirror < y) break; // retournée : les deux moitiés ont déjà été échangées
    uint32_t *a = frame + (size_t)y * frame_width;
    uint32_t *b = frame + (size_t)mirror * frame_width;
    for (uint32_t x = 0; x < frame_width; x++) {
      uint32_t p = a[x], q = b[x];
      a[x] = 0xFF000000u | (q & 0xFFu) << 16 | (q & 0xFF00u) | (q >> 16 & 0xFFu);
      if (b != a) b[x] = 0xFF000000u | (p & 0xFFu) << 16 | (p & 0xFF00u) | (p >> 16 & 0xFFu);
    }
  }
  *width = frame_width;
  *height = frame_height;
  return frame;
}

void rf_display_release(void) {
  if (read_fbo) glDeleteFramebuffers(1, &read_fbo);
  if (display_fbo) glDeleteFramebuffers(1, &display_fbo);
  if (display_renderbuffer) glDeleteRenderbuffers(1, &display_renderbuffer);
  read_fbo = display_fbo = display_renderbuffer = 0;
  display_width = display_height = 0;
}
