# Cores précompilés (option B du point 20)

Contrairement à Snes9x, mGBA, FCEUmm et Genesis Plus GX (compilés depuis leurs sources dans Retro.podspec),
ces cores sont les versions iOS déjà compilées par libretro, gardées ici en copie fixe.

## Mupen64.framework (N64)

- Core : Mupen64Plus-Next (https://github.com/libretro/mupen64plus-libretro-nx), licence GPL v2.
  Commit 6752836de8b224febfd5708444755b77712ac939 du 11/09/2026 (version « 2.8-Vulkan 6752836 » lue dans le fichier, vérifiée le 08/10/2026).
  Contient GLideN64 (3D OpenGL ES 3), Angrylion (image logicielle) et ParaLLEl-RDP (Vulkan, inutilisable ici).
- Fichier d'origine : https://buildbot.libretro.com/nightly/apple/ios-arm64/latest/mupen64plus_next_libretro_ios.dylib.zip
  (publié le 22/09/2026, fichier interne daté du 19/09/2026, téléchargé le 26/09/2026).
  - SHA-256 du zip : 8255df82675c0cba932f490525ed5bdc81bfad1e3db50ce07bad269e915e6b74
  - SHA-256 du dylib : 2005301ccab87e6490a817e85b8cc68c2aa34f6d9756af08917681c48152d4d4
- Examen : arm64, iOS 8.0 minimum, non signé (signé avec l'app au build), non chiffré, 25 fonctions retro_*,
  sans JIT (Makefile ios-arm64 : WITH_DYNAREC vide, GLES3=1, FORCE_GLES3=1), processeur N64 en « cached interpreter ».
- Seule modification : le nom interne (LC_ID_DYLIB) « mupen64plus_next_libretro_ios.dylib » est devenu
  « @rpath/Mupen64.framework/Mupen64 », pour que l'iPhone trouve le fichier dans Frameworks/.
  SHA-256 après modification : 1b5e55968e1570562774960e1cbf372788404424344b190330f7c328d62d7b49

## PPSSPP.framework (PSP)

- Core : PPSSPP (https://github.com/hrydgard/ppsspp, dossier libretro/), licence GPL v2 ou plus récente.
- Fichier d'origine : https://buildbot.libretro.com/nightly/apple/ios-arm64/latest/ppsspp_libretro.dylib.zip
  (publié le 26/09/2026, fichier interne daté du 26/09/2026, téléchargé le 26/09/2026).
  - SHA-256 du zip : d0c3ff549aa26503081f7789434a6293e5e93d267940d19a88f278a4e8eabb37
  - SHA-256 du dylib : 827c535d0b8aa84baac3c5c47685805088e687023d55f3f57a269763073528cb
- Examen : arm64, iOS 12.0 minimum, non signé (signé avec l'app au build), non chiffré, 25 fonctions retro_*
  (rien d'autre d'exporté), liée seulement à des bibliothèques d'iOS (OpenGLES, libz, libc++, libobjc, libSystem) :
  pas de Vulkan. Sans JIT sur iOS : il demande RETRO_ENVIRONMENT_GET_JIT_CAPABLE (refusé par notre frontend)
  et passe alors en interpréteur IR ; le frontend l'impose aussi (ppsspp_cpu_core = « IR JIT »).
- Seule modification : le nom interne (LC_ID_DYLIB) « @rpath/ppsspp_libretro.dylib » est devenu
  « @rpath/PPSSPP.framework/PPSSPP » (place 32 octets, 22 octets changés).
  SHA-256 après modification : c939ca9132582b329f3047e9297f62c6d3b1b5734150391d7e72a5dd02b846d5

## NDS.framework (Nintendo DS)

- Core : melonDS DS 1.3.1 (https://github.com/JesseTG/melonds-ds, commit bc4e4b67d2d470d7c682810a1e892cafd6f9082b),
  fondé sur melonDS (https://github.com/melonDS-emu/melonDS). Licence GPL v3.
  Contient le BIOS et le firmware libres de melonDS (FreeBIOS, © 2013 Gilead Kutnick, licence BSD à 2 clauses :
  « Custom NDS ARM7/ARM9 BIOS replacement », écrit sans le BIOS de Nintendo) : aucun fichier Nintendo n'est nécessaire.
- Fichier d'origine : https://buildbot.libretro.com/nightly/apple/ios-arm64/latest/melondsds_libretro.dylib.zip
  (publié le 26/09/2026, fichier interne daté du 26/09/2026, téléchargé le 26/09/2026, version « 1.3.1 (RelWithDebInfo) »).
  - SHA-256 du zip : 763d3444ccf80cfa32bfba59962bfa37369ed598c627240dab371d09b1998e71
  - SHA-256 du dylib : ca965bd97bf6314324661c65a1e1e94f14b6c23de0c3a97d633215158ef89dd4
- Examen : arm64, iOS 13.0 minimum, non signé (signé avec l'app au build), non chiffré, 25 fonctions retro_*
  (rien d'autre d'exporté), liée seulement à des bibliothèques d'iOS (libresolv, libc++, libSystem) : pas d'OpenGL.
  Sur iOS, melonDS DS est compilé sans JIT ni OpenGL (CMakeLists.txt : « JIT is disabled by default in iOS builds »,
  « OpenGL is disabled by default on this platform ») : processeur en interpréteur, 3D dessinée par le processeur
  sur un fil à part (réglage melonds_threaded_renderer), comme Delta (MelonDSDeltaCore : Soft_Threaded = YES).
- Seule modification : le nom interne (LC_ID_DYLIB) « @rpath/melondsds_libretro.dylib » est devenu
  « @rpath/NDS.framework/NDS » (place 32 octets, 24 octets changés ; « MelonDSDS » ne tenait pas dans la place).
  SHA-256 après modification : 7788c26e99a62b1dcf6742dbb98713cb242ea42b97308bbea412281e160b54b3

## Azahar.framework (Nintendo 3DS)

- Core : Azahar 2126.1.2 (https://github.com/azahar-emu/azahar, dossier src/citra_libretro, commit 9e6f523),
  successeur de Citra. Licence GPL v2 (license.txt du dépôt).
- Fichier d'origine : version officielle publiée par le projet Azahar lui-même (pas le buildbot libretro),
  https://github.com/azahar-emu/azahar/releases/download/2126.1.2/azahar-libretro-ios-arm64-2126.1.2.zip
  (publiée le 20/09/2026, téléchargée le 26/09/2026).
  - SHA-256 du zip : a45a56662109df241848b72a58d6981a8d2633dad6cf69662a462614f977d918
  - SHA-256 du dylib : 1a88d644440e6589df7d9f7a4ad2140ba3363bcfd2cc689ceeae7a8506ea7eaf
- Examen : arm64, iOS 14.0 minimum, non signé (signé avec l'app au build), non chiffré, 25 fonctions retro_*
  (rien d'autre d'exporté), liée seulement à des bibliothèques d'iOS (AVFoundation, IOSurface, CoreFoundation,
  Foundation, libc++, libSystem). Aucune fonction Vulkan importée : il les demande à l'app (interface libretro
  pour Vulkan), qui les prend dans MoltenVK. Sur Apple, Azahar est compilé sans OpenGL (CMakeLists.txt :
  ENABLE_OPENGL « NOT APPLE ») : Vulkan ou rendu logiciel seulement. Sans JIT : il demande
  RETRO_ENVIRONMENT_GET_JIT_CAPABLE (refusé par notre frontend) et passe en interpréteur (DynCom).
  Extensions lues : 3ds, 3dsx, z3dsx, elf, axf, cci, zcci, cxi, zcxi, app (pas de .cia).
- Seule modification : le nom interne (LC_ID_DYLIB) « @rpath/azahar_libretro.dylib » est devenu
  « @rpath/Azahar.framework/Azahar » (place 32 octets, 17 octets changés).
  SHA-256 après modification : 9a2b081e8047c82c67c64cd42a6418a9a5b1bcb110dee1c256bebbad9daef4bc

## MoltenVK.framework (Vulkan sur iPhone, pour Azahar)

- MoltenVK 1.4.2 (https://github.com/KhronosGroup/MoltenVK, Khronos Group) : Vulkan traduit en Metal.
  Licence Apache 2.0 (LICENSE de l'archive).
- Fichier d'origine : https://github.com/KhronosGroup/MoltenVK/releases/download/v1.4.2/MoltenVK-ios.tar
  (publié le 24/07/2026, téléchargé le 26/09/2026), dossier MoltenVK/dynamic/MoltenVK.xcframework/ios-arm64/MoltenVK.framework
  copié tel quel, sans aucune modification (son nom interne est déjà @rpath/MoltenVK.framework/MoltenVK).
  - SHA-256 du tar : b5d947b1660e6e9fed40b9cd2387e160aaab9e80b775c0cef7e14059405178c1
  - SHA-256 de MoltenVK : 6cd5888490d08b36356d04c50c05e2eda5b9bcb3d0338ece693a28987de96aff
- Examen : arm64, iOS 15.0 minimum, liée seulement à des bibliothèques d'iOS (Metal, IOSurface, UIKit, QuartzCore,
  CoreGraphics, IOKit, Foundation, CoreFoundation, libc++, libobjc, libSystem) ; exporte vkGetInstanceProcAddr.
- Les en-têtes de Vulkan livrés dans la même archive (include/vulkan : vk_platform.h, vulkan.h, vulkan_core.h ;
  include/vk_video) sont copiés dans ../vulkan/include, avec libretro_vulkan.h de RetroArch
  (libretro-common/include, commit 40e2fa3c88474d8474ff8345bb7c8c5d144146fd du 22/09/2026, licence MIT).

## RetroSystem/PPSSPP (fichiers système de la PSP)

- Polices de la PSP (flash0), images et textes des fenêtres du système (sauvegarde…), réglages par jeu
  (compat.ini), lus par PPSSPP dans <dossier système>/PPSSPP. Sans eux : « Core system files missing ».
- Fichier d'origine : https://buildbot.libretro.com/assets/system/PPSSPP.zip (téléchargé le 26/09/2026),
  décompressé tel quel (167 fichiers, 15 Mo).
  - SHA-256 du zip : 13d226fb9ab72a9fe8de078dcc8b4784bdb8895807729cec3325178b5f0b7f5e
- Copiés à la racine de l'app (Retro.podspec, resources), puis dans Caches/retro-system par RetroFiles.systemDirectory.

## GameCube.framework (cœur GameCube et Wii : Dolphin d'iCube + notre pont)

- Compilé sur un Mac de GitHub (macos-26, Xcode 26.3) par le workflow « Cœur GameCube » du dépôt public
  https://github.com/Hope221/overrrrhere-gamecube, run 37545930434 du 06/10/2026 (artefact coeur-gamecube ; pont fe228fe : plein écran par le widescreen hack, image du jeu pour les sauvegardes).
- Sources : iCube (https://github.com/Provenance-Emu/iCube, dérivé de Dolphin), commit
  f24ca8741b80fa8737b3b4e47940997016cd8052 (branche develop, « alpha build 170 » du 26/09/2026), script BuildiOSXCFramework.py
  (tranche OS64 seule), + notre pont pont/GameCube.mm (API C de pont/GameCube.h) ajouté à la bibliothèque Source/iOS/Library.
  Licence GPL v2 ou plus récente (Dolphin, iCube et le pont).
- Binaire libdolphin renommé GameCube (nom interne @rpath/GameCube.framework/GameCube), en-tête et module Swift ajoutés
  (Headers/GameCube.h, Modules/module.modulemap).
  - SHA-256 de GameCube : 14929597ef34914c0784aa784ac91b6b97a870cd4b6d98a52c00864efdc4debd
- Examen : arm64, iOS 17.0 minimum, liée seulement à des bibliothèques d'iOS (Metal, QuartzCore, GameController, CoreMotion,
  CoreHaptics, AVFoundation, AVFAudio, AudioToolbox…) ; exporte les 21 fonctions gc_* du pont.
- Sans JIT (Cached Interpreter), sans BIOS ni menu Wii (démarrage direct du disque). Wii : Wiimote émulée seulement.

## Sys (fichiers de données de Dolphin, pour la GameCube)

- Dossier Data/Sys du même commit d'iCube (réglages par jeu, polices libres de la GameCube, profils de manette…),
  2 653 fichiers, 9 Mo. Dolphin le cherche à la racine de l'app : copié par Retro.podspec (resources).
  - SHA-256 de Sys.zip (artefact du run 36329207951, contenu inchangé depuis) : 6b727d40c7d64cf915bcb8d12c0fe9cee22fe04805689c7b8124d135097f318f

Git garde tous ces fichiers octet pour octet (.gitattributes : -text).
