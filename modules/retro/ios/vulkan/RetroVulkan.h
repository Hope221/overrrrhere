#ifndef RETRO_VULKAN_H
#define RETRO_VULKAN_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "../frontend/libretro-api/libretro.h"

// Vulkan pour les cores libretro qui ne dessinent qu'avec lui (Nintendo 3DS : Azahar, rien en OpenGL sur iOS).
// Vulkan passe par MoltenVK (prebuilt/MoltenVK.framework), qui le traduit en Metal. Pas de fenêtre Vulkan :
// le core dessine dans son image, on la recopie dans la mémoire (rv_read_frame), et RetroView l'affiche
// comme une image 2D (les deux écrans découpés, comme pour la DS).
// Tout s'appelle depuis le fil du core (fil d'émulation de RetroView), sauf ce que le core fait de son côté.

// RETRO_ENVIRONMENT_SET_HW_RENDER avec RETRO_HW_CONTEXT_VULKAN.
bool rv_accept(struct retro_hw_render_callback *request);
// RETRO_ENVIRONMENT_SET_HW_RENDER_CONTEXT_NEGOTIATION_INTERFACE : le core crée lui-même le « device » Vulkan.
bool rv_set_negotiation(const struct retro_hw_render_context_negotiation_interface *negotiation);
// RETRO_ENVIRONMENT_GET_HW_RENDER_INTERFACE.
bool rv_get_interface(const struct retro_hw_render_interface **out);

// Après retro_load_game : charge MoltenVK, crée l'instance Vulkan et fait créer le device par le core.
// false (avec le message en anglais dans error) si l'iPhone n'y arrive pas.
bool rv_create(char *error, size_t error_size);
// Rappel vidéo du core : RETRO_HW_FRAME_BUFFER_VALID, image de width × height posée par set_image.
void rv_frame_ready(unsigned width, unsigned height);
// Dernière image annoncée, recopiée en BGRA 32 bits dans pixels (width × height, voir rv_frame_size) ;
// false si aucune image neuve. Attend la fin de la copie par le processeur graphique.
bool rv_frame_size(uint32_t *width, uint32_t *height);
bool rv_read_frame(uint32_t *pixels);
// Oublie l'image annoncée : après la relecture d'une sauvegarde d'état, Azahar a reconstruit son affichage
// et cette image n'existe plus (la copier ferait planter MoltenVK). On attend la prochaine.
void rv_forget_frame(void);
// Attend que le processeur graphique ait fini tout ce qui lui a été envoyé (avant l'arrière-plan).
void rv_wait_idle(void);
// Après retro_unload_game / retro_deinit : libère tout (device, instance). MoltenVK reste chargé.
void rv_destroy(void);

#endif
