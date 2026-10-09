// Chargé avant chaque fichier de Genesis Plus GX (option -include du Retro.podspec).
// Makefile.libretro de Genesis Plus GX passe -DINLINE="static inline". Sans cela, retro_inline.h
// (libretro-common, inclus avant core/macros.h) définit INLINE = inline : les fonctions INLINE ne sont
// alors rangées dans aucun fichier compilé (1038 fonctions introuvables au build n°12).
#define INLINE static inline
