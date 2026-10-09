# Émulation rétro : cores libretro compilés dans l'app (pas de bibliothèque à charger à part,
# donc rien à signer en plus pour l'iPhone). Un core par sous-partie, chacun avec ses options.
#
# Snes9x (SNES) : https://github.com/libretro/snes9x, commit fae2fea08f74180759ef540ee94259213f503480 (19/09/2026).
#   Licence (snes9x/LICENSE) : gratuite pour un usage non commercial uniquement.
# mGBA (Game Boy, Game Boy Color, GBA) : https://github.com/libretro/mgba,
#   commit 7a12d6d4b9acb14c0ae62c9166b6a2f3d08007f6 (16/09/2026). Licence MPL 2.0 (mgba/LICENSE).
#   Liste des fichiers : celle du CMakeLists.txt de mGBA pour BUILD_LIBRETRO (Apple, sans tests ni débogueur).
# FCEUmm (NES) : https://github.com/libretro/libretro-fceumm, commit 7a542dab1e87679921962a9f056186eca425c0c2
#   (26/09/2026). Licence GPL v2 (fceumm/Copying). Liste des fichiers : Makefile.common, sans filtre NTSC
#   ni packs HD ; les fonctions libretro-common (fichiers, chaînes) sont celles déjà compilées pour Snes9x
#   (STATIC_LINKING, mêmes signatures), sauf memory_stream.
# Genesis Plus GX (Mega Drive) : https://github.com/libretro/Genesis-Plus-GX, commit
#   c2838c7dc4236fc2fe94e5dbd08b41486067918e (12/09/2026). Licence (genesis_plus_gx/LICENSE.txt) : non commerciale,
#   comme Snes9x. Fichiers : core/ de libretro/Makefile.common, sans débogueur ni images CD compressées (libchdr)
#   ni musique CD en Ogg (tremor), inutiles aux cartouches. libretro-common : celui de Snes9x, comme FCEUmm.
#
# Mupen64Plus-Next (N64), PPSSPP (PSP) et melonDS DS (Nintendo DS) : précompilés par libretro, pas compilés ici
#   (prebuilt/LISEZMOI.md : origine, empreintes, licences GPL v2, GPL v2+ et GPL v3). Bibliothèques à part,
#   embarquées et signées avec l'app (vendored_frameworks) ; le frontend retrouve leurs fonctions retro_* par leur
#   nom (dlopen / dlsym). Les deux premiers dessinent en OpenGL ES 3, melonDS DS avec le processeur. Les fichiers système de PPSSPP (prebuilt/RetroSystem/PPSSPP) sont copiés
#   dans l'app (resources) : dossier RetroSystem à la racine de l'app.
# Azahar (Nintendo 3DS) : précompilé par le projet Azahar (prebuilt/LISEZMOI.md, licence GPL v2), dessine avec Vulkan,
#   fourni par MoltenVK (prebuilt/MoltenVK.framework, Khronos Group, licence Apache 2.0), chargé par vulkan/RetroVulkan.c.
#   Ce fichier a sa propre sous-partie (Vulkan) : lui seul voit les en-têtes de Vulkan (vulkan/include).
# GameCube : cœur Dolphin d'iCube + notre pont gc_* (prebuilt/GameCube.framework, compilé sur un Mac de GitHub par le dépôt
#   Hope221/overrrrhere-gamecube ; prebuilt/LISEZMOI.md), licence GPL v2+. Pas libretro : le Swift l'appelle directement
#   (import GameCube). Ses fichiers de données (prebuilt/Sys) vont à la racine de l'app, où Dolphin les cherche.
#
# Les cores portent tous les mêmes noms de fonctions (retro_run…) : chaque core est compilé avec ses
# noms préfixés (snes9x_retro_run, mgba_retro_run…), et le frontend choisit le core au chargement.
# Leurs en-têtes ont souvent le même nom (libretro.h, ppu.h…) avec un contenu différent : chaque core
# ne voit que ses propres dossiers d'en-têtes (options du compilateur de sa sous-partie).

libretro_api = %w[
  set_environment set_video_refresh set_audio_sample set_audio_sample_batch set_input_poll set_input_state
  init deinit api_version get_system_info get_system_av_info set_controller_port_device reset run
  serialize_size serialize unserialize cheat_reset cheat_set load_game load_game_special unload_game
  get_region get_memory_data get_memory_size
]
renamed = ->(prefix) { libretro_api.map { |f| "-Dretro_#{f}=#{prefix}_retro_#{f}" }.join(' ') }

snes9x_c = %w[
  c4emu msu1 zipfile srtc obc1 bsflash tile bsx spc7110 fxemu sdd1 seta sa1hw dsp filter/snes_ntsc
].map { |f| "snes9x/#{f}.c" }
snes9x_cpp = %w[
  apu/apu apu/bapu/dsp/sdsp apu/bapu/smp/smp apu/bapu/smp/smp_state cheats2 clip controls cpu cpuexec
  cpuops crosshairs dma gfx globals loadzip memmap ppu sa1 sa1cpu snapshot sha256 bml fscompat libretro/libretro
].map { |f| "snes9x/#{f}.cpp" }
libretro_common = %w[
  compat/compat_posix_string compat/compat_strcasestr compat/compat_snprintf compat/compat_strl compat/fopen_utf8
  encodings/encoding_utf encodings/encoding_deflate file/file_path file/file_path_io streams/file_stream
  streams/file_stream_transforms string/stdstring time/rtime vfs/vfs_implementation vfs/vfs_hybrid file/retro_dirent
].map { |f| "snes9x/libretro/libretro-common/#{f}.c" }

mgba_files = {
  'arm' => %w[arm decoder-arm decoder decoder-thumb isa-arm isa-thumb],
  'core' => %w[bitmap-cache cache-set cheats config core directories interface lockstep log map-cache serialize sync thread tile-cache timing],
  'gb' => %w[
    audio cheats core gb input io mbc mbc/huc-3 mbc/licensed mbc/mbc mbc/pocket-cam mbc/tama5 mbc/unlicensed
    memory overrides serialize renderers/cache-set renderers/software sio timer video
  ],
  'gba' => %w[
    audio bios cart/ereader cart/gpio cart/matrix cart/unlicensed cart/vfame cheats cheats/codebreaker cheats/gameshark
    cheats/parv3 core dma gba hle-bios input io memory overrides renderers/cache-set renderers/common renderers/gl
    renderers/software-bg renderers/software-mode0 renderers/software-obj renderers/video-software savedata serialize
    sharkport sio sio/gbp timer video
  ],
  'sm83' => %w[decoder isa-sm83 sm83],
  'util' => %w[
    circle-buffer configuration crc32 formatting gbk-table hash md5 sha1 string table vector vfs audio-buffer convolve
    elf-read geometry image image/export image/font image/png-io patch patch-fast patch-ips patch-ups ring-fifo sfo
    text-codec vfs/vfs-mem vfs/vfs-fifo vfs/vfs-fd vfs/vfs-dirent
  ],
  'platform/posix' => %w[memory],
  'platform/libretro' => %w[libretro libretro-audio libretro-vfs],
  'third-party/inih' => %w[ini],
}.flat_map { |dir, files| files.map { |f| "mgba/src/#{dir}/#{f}.c" } } + ['cores/mgba-version.c']

fceumm_c = %w[
  cart cheat crc32 fceu-endian fceu-memory fceu fds fds_apu file filter general input md5 nsf palette ppu sound
  state video vsuni ines unif x6502 drivers/libretro/libretro drivers/libretro/libretro_dipswitch
  drivers/libretro/libretro-common/streams/memory_stream
].map { |f| "fceumm/src/#{f}.c" } + ['fceumm/src/boards/*.c', 'fceumm/src/input/*.c']
# Options de Makefile.common / Makefile.libretro (plateforme ios-arm64 : image 32 bits).
# PPU renommé : Snes9x a aussi une variable globale PPU.
fceumm_defines = %w[PATH_MAX=1024 FCEU_VERSION_NUMERIC=9900 FRONTEND_SUPPORTS_RGB888 IOS STATIC_LINKING PPU=fceumm_PPU]
  .map { |d| "-D#{d}" }.join(' ')

gpgx_dirs = %w[
  core core/z80 core/m68k core/ntsc core/sound core/sound/minimp3 core/input_hw core/cd_hw core/cart_hw core/cart_hw/svp
]
gpgx_c = gpgx_dirs.map { |d| "genesis_plus_gx/#{d}/*.c" } + ['genesis_plus_gx/libretro/libretro.c']
# Options de Makefile.libretro (plateforme ios-arm64 : ROM jusqu'à 32 Mo, image 16 bits).
# log_cb renommé : Snes9x a aussi une variable globale log_cb.
gpgx_defines = %w[
  LSB_FIRST USE_16BPP_RENDERING FRONTEND_SUPPORTS_RGB565 USE_PER_SOUND_CHANNELS_CONFIG USE_LIBRETRO_VFS
  M68K_OVERCLOCK_SHIFT=20 Z80_OVERCLOCK_SHIFT=20 HAVE_YM3438_CORE HAVE_OPLL_CORE MAXROMSIZE=33554432 log_cb=gpgx_log_cb
].map { |d| "-D#{d}" }.join(' ')

# Options du CMakeLists.txt de mGBA pour le core libretro (plateforme Apple). HAVE_CRC32 : crc32 de zlib (iOS).
mgba_defines = %w[
  _GNU_SOURCE _DARWIN_C_SOURCE COLOR_16_BIT COLOR_5_6_5 DISABLE_THREADING MGBA_STANDALONE
  ENABLE_VFS ENABLE_VFS_FD ENABLE_DIRECTORIES MINIMAL_CORE=2 M_CORE_GB M_CORE_GBA
  HAVE_STRDUP HAVE_STRNDUP HAVE_STRLCPY HAVE_VASPRINTF HAVE_LOCALE HAVE_SETLOCALE HAVE_USELOCALE HAVE_SNPRINTF_L
  HAVE_STRTOF_L HAVE_XLOCALE HAVE_LOCALTIME_R HAVE_REALPATH HAVE_FUTIMENS HAVE_FUTIMES HAVE_CRC32
].map { |d| "-D#{d}" }.join(' ')

# Dossiers d'en-têtes d'un core. -iquote : ils passent avant tout autre dossier pour les #include "…"
# (aucun risque de tomber sur un « state.h » ou « display.h » d'une autre bibliothèque) ; -I pour les #include <…>.
headers = ->(dirs, quote: false) do
  dirs.map { |d| "#{quote ? "-iquote $(PODS_TARGET_SRCROOT)/#{d} " : ''}-I$(PODS_TARGET_SRCROOT)/#{d}" }.join(' ')
end

Pod::Spec.new do |s|
  s.name           = 'Retro'
  s.version        = '1.0.0'
  s.summary        = 'Émulation rétro (libretro)'
  s.description    = 'Module local overrrrhere : fait tourner les ROM importées par l\'utilisateur avec un core libretro'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'GameController', 'AVFoundation', 'UniformTypeIdentifiers', 'OpenGLES', 'QuartzCore'
  s.libraries = 'c++', 'z'
  s.vendored_frameworks = [
    'prebuilt/Mupen64.framework', 'prebuilt/PPSSPP.framework', 'prebuilt/NDS.framework',
    'prebuilt/Azahar.framework', 'prebuilt/MoltenVK.framework', 'prebuilt/GameCube.framework',
  ]
  s.resources = ['prebuilt/RetroSystem', 'prebuilt/Sys']

  s.source_files = ['*.swift', 'frontend/*.{h,c}']
  s.public_header_files = 'frontend/RetroFrontend.h' # seul en-tête visible du Swift
  s.preserve_paths = [
    'snes9x/**/*', 'mgba/**/*', 'fceumm/**/*', 'genesis_plus_gx/**/*', 'cores/*.h', 'frontend/libretro-api/*',
    'vulkan/RetroVulkan.h', 'vulkan/include/**/*',
  ]

  # Vulkan (3DS) : en-têtes de Vulkan 1.4 (ceux livrés avec MoltenVK 1.4.2) et libretro_vulkan.h (RetroArch).
  # Sans prototypes : les fonctions Vulkan sont demandées à MoltenVK au chargement (vkGetInstanceProcAddr).
  s.subspec 'Vulkan' do |vk|
    vk.source_files = 'vulkan/RetroVulkan.c'
    vk.compiler_flags = "-DVK_NO_PROTOTYPES #{headers.call(%w[vulkan/include frontend/libretro-api])}"
  end

  # Options du Makefile libretro de Snes9x (plateforme ios-arm64).
  s.subspec 'Snes9x' do |core|
    core.source_files = snes9x_c + snes9x_cpp + libretro_common
    snes9x_headers = headers.call(%w[snes9x snes9x/apu snes9x/apu/bapu snes9x/libretro snes9x/libretro/libretro-common/include], quote: true)
    core.compiler_flags = "-DALLOW_CPU_OVERCLOCK -DIOS -DARM #{snes9x_headers} #{renamed.call('snes9x')}"
  end

  s.subspec 'MGBA' do |core|
    core.source_files = mgba_files
    core.compiler_flags = "#{mgba_defines} #{headers.call(%w[mgba/include mgba/src])} #{renamed.call('mgba')}"
  end

  s.subspec 'FCEUmm' do |core|
    core.source_files = fceumm_c
    fceumm_headers = headers.call(%w[
      fceumm/src/drivers/libretro fceumm/src/drivers/libretro/libretro-common/include fceumm/src fceumm/src/input fceumm/src/boards
    ], quote: true)
    core.compiler_flags = "#{fceumm_defines} #{fceumm_headers} #{renamed.call('fceumm')}"
  end

  s.subspec 'GenesisPlusGX' do |core|
    core.source_files = gpgx_c
    gpgx_headers = headers.call(gpgx_dirs.map { |d| "genesis_plus_gx/#{d}" } + %w[
      genesis_plus_gx/libretro genesis_plus_gx/libretro/libretro-common/include
    ], quote: true)
    gpgx_config = '-include $(PODS_TARGET_SRCROOT)/cores/gpgx-config.h' # INLINE = static inline, voir ce fichier
    core.compiler_flags = "#{gpgx_config} #{gpgx_defines} #{gpgx_headers} #{renamed.call('gpgx')}"
  end

  # -O3 même dans le build de développement : sinon le jeu ne tiendrait pas les 60 images par seconde.
  # Pas de « header map » : sinon « display.h » de Snes9x est confondu avec « Display.h » de Yoga
  # (React Native), les noms de fichiers ne tenant pas compte des majuscules.
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'USE_HEADERMAP' => 'NO',
    'OTHER_CFLAGS' => '$(inherited) -O3 -DNDEBUG -D__LIBRETRO__ -fno-strict-aliasing -fomit-frame-pointer',
    'GCC_C_LANGUAGE_STANDARD' => 'gnu11',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'gnu++14',
    'GCC_WARN_INHIBIT_ALL_WARNINGS' => 'YES',
  }
end
