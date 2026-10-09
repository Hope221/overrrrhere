import { StyleProp, ViewStyle } from 'react-native';

// Fichier choisi dans Fichiers, copié dans le dossier d'attente de l'app.
export type StagedFile = {
  path: string;
  name: string; // nom d'origine, avec l'extension
  size: number; // octets
};

// Dossier de ROM choisi : « iCloud Drive › Retro games » et son chemin sur l'iPhone.
export type RomFolderInfo = {
  name: string;
  path: string;
};

// Fichier du dossier de ROM.
export type FolderFile = {
  path: string; // chemin relatif dans le dossier (« SNES/Super Mario World.sfc »)
  name: string;
  size: number;
  local: boolean; // déjà sur l'iPhone (sinon seulement dans iCloud)
};

export type RetroViewProps = {
  romPath: string | null; // null = aucun jeu
  sramPath?: string; // sauvegarde de la cartouche (.srm)
  startStatePath?: string | null; // sauvegarde d'état chargée au démarrage (« Continue », « Load Slot N »)
  autoSave?: [string, string] | null; // [état, image] écrits en quittant ou en passant en arrière-plan
  paused?: boolean;
  fastForward?: boolean;
  screenMode?: 'Sharp' | 'Smooth' | 'CRT';
  fillScreen?: boolean;
  touchControls?: boolean; // contrôles tactiles affichés : l'image rétrécit (TouchRetro.dc.html)
  touchOverImage?: boolean; // PSP (TouchPSP.dc.html) : l'image garde toute la hauteur, boutons posés dessus
  // DS, 3DS : [x, y, largeur, hauteur] de l'écran du haut, puis de l'écran du bas, en points dans la vue,
  // puis l'arrondi des coins (src/retro/dsLayout.ts). null = une seule image, comme les autres systèmes.
  dualScreen?: number[] | null;
  gameCube?: boolean; // jeu GameCube : le cœur Dolphin (pas libretro), à poser avec romPath
  // Résolution interne (1, 2 ou 3) : 3DS au lancement (citra_resolution_factor) ; GameCube et Wii : efb_scale,
  // aussi pendant la partie.
  // Dès 2, l'image 3DS est lissée même en Sharp.
  resolution?: number;
  gameCubeOptions?: Record<string, number>; // réglages de Dolphin (GameCube.h, gc_set_option) et de l'horloge automatique
  onError?: (event: { nativeEvent: { message: string } }) => void;
  onMenu?: () => void; // View + Menu ensemble sur la manette
  onStart?: () => void; // le jeu tourne
  // Wii : pointeur recentré, ou collé à un bord (« left », « right », « top », « bottom » ; « » quand il revient).
  onWiiPointer?: (event: { nativeEvent: { recentered?: boolean; edge?: string } }) => void;
  onSwapScreens?: () => void; // clic du stick droit (DS, 3DS : échanger les écrans)
  style?: StyleProp<ViewStyle>;
};
