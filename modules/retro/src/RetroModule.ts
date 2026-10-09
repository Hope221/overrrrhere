import { NativeModule, requireNativeModule } from 'expo';

import { FolderFile, RomFolderInfo, StagedFile } from './Retro.types';

declare class RetroModule extends NativeModule {
  // Ouvre l'app Fichiers (plusieurs fichiers possibles) ; [] si annulé.
  pickRoms(): Promise<StagedFile[]>;
  // Dossier de ROM (iCloud Drive) : choisi une fois dans Fichiers ; null si annulé / aucun.
  pickRomFolder(): Promise<RomFolderInfo | null>;
  romFolder(): RomFolderInfo | null;
  forgetRomFolder(): void;
  // Fichiers du dossier (sous-dossiers compris, sauf « overrrrhere saves »).
  scanRomFolder(): Promise<FolderFile[]>;
  // Télécharge un jeu du dossier (chemin relatif) et renvoie son chemin sur l'iPhone ; cancelDownload l'arrête.
  downloadRom(relative: string): Promise<string>;
  cancelDownload(): void;
  // « Remove download » : retire la copie de l'iPhone, le fichier reste dans iCloud.
  removeDownload(relative: string): Promise<void>;
  // Sauvegardes d'un jeu du dossier ↔ « overrrrhere saves » (le plus récent l'emporte, dans chaque sens).
  syncSaves(localFolder: string, relative: string): Promise<void>;
  // GameCube : cartes mémoire de Dolphin ↔ « overrrrhere saves/GameCube memory cards ».
  syncMemoryCards(): Promise<void>;
  // Wii : sauvegarde d'un jeu du dossier (identifiant du disque) ↔ « overrrrhere saves/<jeu>/Wii save ».
  syncWiiSave(gameId: string, relative: string): Promise<void>;
  // Disque (.iso, .rvz, .wbfs…) : « gc » (GameCube), « wii », « psp » (image PSP) ou null (autre).
  discSystem(path: string): 'gc' | 'wii' | 'psp' | null;
  // Disque GameCube ou Wii : identifiant du jeu (ex. « RMGE01 »), ou null.
  discGameId(path: string): string | null;
  // Wii, pointeur en mode Touch : doigt posé sur l'image du jeu (x, y de 0 à 1).
  setWiiPointer(x: number, y: number): void;
  // Wii : réglages changés dans « Wii options » pendant la partie (wiiOptions de src/retro/wii.ts).
  setWiiControls(options: Record<string, number>): void;
  // Wii : ramène le pointeur au centre (ligne « Recenter pointer » du menu).
  recenterWiiPointer(): void;
  // Jeu en cours : sauvegarde / charge une sauvegarde d'état. imagePath = image PNG de l'instant.
  saveState(statePath: string, imagePath: string | null): Promise<boolean>;
  loadState(statePath: string): Promise<boolean>;
  // Boutons tactiles enfoncés (bits RETRO_DEVICE_ID_JOYPAD_*).
  setTouchButtons(bits: number): void;
  // Sticks tactiles : stick gauche puis droit (boutons C du N64), de -1 à 1, bas = +1.
  setTouchSticks(leftX: number, leftY: number, rightX: number, rightY: number): void;
  // DS : doigt sur l'écran tactile (celui du bas), x et y de 0 à 1 depuis son coin en haut à gauche.
  setTouchScreen(pressed: boolean, x: number, y: number): void;
  // DS : souffle dans le micro (son intégré au core) tant que on = true.
  setBlow(on: boolean): void;
  // DS : ferme ou ouvre le couvercle.
  setLidClosed(closed: boolean): void;
}

export default requireNativeModule<RetroModule>('Retro');
