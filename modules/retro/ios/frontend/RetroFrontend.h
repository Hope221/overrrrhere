#ifndef RETRO_FRONTEND_H
#define RETRO_FRONTEND_H

#include <stdbool.h>
#include <stdint.h>

// Pont entre le Swift et les cores libretro, choisi d'après l'extension de la ROM : Snes9x (SNES),
// mGBA (Game Boy / Color, GBA), FCEUmm (NES), Genesis Plus GX (Mega Drive), compilés dans l'app ;
// Mupen64Plus-Next (N64), PPSSPP (PSP), melonDS DS (Nintendo DS) et Azahar (Nintendo 3DS),
// précompilés (prebuilt/*.framework).
// Un seul jeu à la fois. Tout s'appelle depuis un seul fil : le fil principal pour les jeux 2D légers,
// le fil d'émulation de RetroView pour les autres (rf_is_threaded_game). Sauf rf_audio_read (fil audio d'iOS)
// et les rf_set_touch_* / rf_set_blow / rf_set_lid_closed (n'importe quel fil).

// Jeu 3D (N64, PSP) : il faut rendre courant un contexte OpenGL ES 3 avant rf_load_game, sur le fil d'émulation.
bool rf_is_gpu_game(const char *rom_path);
// Jeu qui tourne sur le fil d'émulation de RetroView : les jeux 3D, et la DS (image 2D, mais une image
// de la DS demande bien plus de calcul qu'une image SNES : l'interface ne doit pas saccader).
bool rf_is_threaded_game(const char *rom_path);
// Jeu PSP : PPSSPP a besoin de ses fichiers système (dossier PPSSPP/ dans system_path de rf_load_game).
bool rf_is_psp_game(const char *rom_path);
// Jeu 3DS : dessiné avec Vulkan, mais son image arrive comme une image 2D (rf_frame) des deux écrans
// l'un au-dessus de l'autre (400 × 480, écran du bas centré). Stick gauche analogique (Circle Pad), ZL / ZR.
bool rf_is_3ds_game(const char *rom_path);

// Charge la ROM ; save_path = fichier de sauvegarde du jeu (.srm), relu s'il existe
// (et l'horloge de la cartouche dans le .rtc voisin, pour les jeux qui en ont une).
// Le dossier de save_path sert aussi de dossier de sauvegardes du core (carte mémoire de la PSP).
// system_path = dossier système du core (fichiers de PPSSPP) ; NULL = le dossier de save_path.
bool rf_load_game(const char *rom_path, const char *save_path, const char *system_path);
// Réglage du core choisi par l'app (ex. « citra_resolution_factor » = « 2 », résolution interne de la 3DS),
// prioritaire sur ceux imposés par le frontend. À poser avant rf_load_game ; gardé jusqu'au prochain appel.
void rf_set_core_option(const char *key, const char *value);
// Enregistre la sauvegarde puis décharge le jeu.
void rf_unload_game(void);
// Joue une image du jeu avec ces boutons enfoncés (bits RETRO_DEVICE_ID_JOYPAD_*).
void rf_run_frame(uint16_t buttons);
// Le core a arrêté le jeu (PPSSPP : le jeu n'a pas pu démarrer) ; rf_error donne la raison.
// rf_run_frame ne fait alors plus rien : il faut décharger le jeu.
bool rf_game_failed(void);
// Écrit la sauvegarde du jeu sur le disque (quand l'app passe en arrière-plan).
bool rf_save_sram(void);

// Sauvegardes d'état (« Save state » / « Load state ») : l'instant exact du jeu, dans un fichier.
bool rf_save_state(const char *path);
bool rf_load_state(const char *path);

// Avance rapide : le son est coupé pendant qu'elle est active.
void rf_set_audio_enabled(bool enabled);
// Boutons enfoncés sur l'écran tactile (mêmes bits), ajoutés à ceux de la manette.
void rf_set_touch_buttons(uint16_t buttons);
// Sticks analogiques (N64, PSP), de -32768 à 32767 ; Y positif = vers le bas. Pris en compte à la prochaine image.
void rf_set_analog(int16_t left_x, int16_t left_y, int16_t right_x, int16_t right_y);
// Sticks de l'écran tactile (mêmes axes), n'importe quel fil ; sur chaque axe, le plus grand mouvement
// entre la manette et l'écran l'emporte.
void rf_set_touch_analog(int16_t left_x, int16_t left_y, int16_t right_x, int16_t right_y);
// GameCube (Dolphin, hors libretro) : relit les boutons et les sticks de l'écran tactile.
uint16_t rf_touch_buttons(void);
void rf_touch_analog(int16_t sticks[4]);

// ---- Nintendo DS ----

// Doigt sur l'écran tactile (celui du bas, DS et 3DS) : x, y de 0 à 1 depuis son coin en haut à gauche.
void rf_set_touch_screen(bool pressed, double x, double y);
// Souffle dans le micro (son intégré au core) tant que on = true ; la manette et l'écran sont alors ignorés.
void rf_set_blow(bool on);
// Ferme ou ouvre le couvercle (le jeu se met en veille) ; pris en compte à la prochaine image.
void rf_set_lid_closed(bool closed);

double rf_fps(void);
double rf_sample_rate(void);
double rf_aspect_ratio(void);

// Dernière image produite, en BGRA 32 bits (largeur × hauteur, sans marge), ou NULL si rien de neuf.
// Jeux 2D seulement : un jeu 3D dessine dans une image OpenGL (rf_display_*).
const uint32_t *rf_frame(uint32_t *width, uint32_t *height);

// ---- Jeux 3D ----

// Le jeu chargé dessine en OpenGL (sinon il donne des images 2D, lues avec rf_frame).
bool rf_hw_active(void);
// Attend que le processeur graphique ait fini (avant le passage en arrière-plan : iOS l'interdit ensuite).
// Contexte du jeu (OpenGL), ou fil du core (Vulkan, 3DS).
void rf_gpu_finish(void);
// Envoie au processeur graphique ce que le jeu a dessiné, pour que le contexte d'affichage le voie. Contexte du jeu.
void rf_gpu_flush(void);

// Côté écran, avec le contexte d'affichage de RetroView (qui partage les images du contexte du jeu) :
// 1. rf_display_bind_renderbuffer, puis -[EAGLContext renderbufferStorage:fromDrawable:] (taille de l'écran) ;
// 2. rf_display_attach : false si l'image de l'écran n'est pas utilisable ;
// 3. à chaque image, rf_display_draw puis -[EAGLContext presentRenderbuffer:] ; false si rien à afficher.
void rf_display_bind_renderbuffer(void);
bool rf_display_attach(void);
bool rf_display_draw(bool smooth);
// Dernière image du jeu en BGRA 32 bits, à l'endroit ; NULL si aucune.
const uint32_t *rf_display_snapshot(uint32_t *width, uint32_t *height);
void rf_display_release(void);

// Remplit left/right (frames échantillons chacun) ; silence si le jeu n'a rien produit.
void rf_audio_read(float *left, float *right, uint32_t frames);

// Raison du dernier échec de rf_load_game, en anglais (affichée telle quelle).
const char *rf_error(void);

#endif
