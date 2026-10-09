// Wii (mise à jour du 05/10/2026, lot 2) : profils de commandes, pointeur, choix automatique du profil.
// Noms et cartes : maquettes WiiControls.dc.html et WiiMenu.dc.html. Les valeurs numériques sont celles de
// GameCubeSession.swift (options wii_profile, wii_pointer, wii_pointer_speed).

export type WiiProfile = 'Remote + Nunchuk' | 'Sideways Remote' | 'Classic Controller' | 'GameCube Controller';
export type WiiPointer = 'Right stick' | 'Gyro + right stick' | 'Touch';
export type WiiPointerSpeed = 'Slow' | 'Medium' | 'Fast';

// Choix de l'utilisateur pour un jeu (menu « Wii options ») ; ce qui manque prend sa valeur par défaut.
export type WiiChoice = { profile?: WiiProfile; pointer?: WiiPointer; speed?: WiiPointerSpeed };

// Ordre de la maquette WiiMenu.dc.html (A passe au suivant).
export const WII_PROFILES: WiiProfile[] = ['Remote + Nunchuk', 'Sideways Remote', 'Classic Controller', 'GameCube Controller'];
export const WII_POINTERS: WiiPointer[] = ['Right stick', 'Gyro + right stick', 'Touch'];
export const WII_SPEEDS: WiiPointerSpeed[] = ['Slow', 'Medium', 'Fast'];

// Onglets de « Wii controls » (WiiControls.dc.html).
export const PROFILE_TABS: Record<WiiProfile, string> = {
  'Remote + Nunchuk': 'Nunchuk',
  'Sideways Remote': 'Sideways',
  'Classic Controller': 'Classic',
  'GameCube Controller': 'GameCube',
};

export const PROFILE_HINTS: Record<WiiProfile, string> = {
  'Remote + Nunchuk': 'Remote + Nunchuk · Used by most Wii games.',
  'Sideways Remote': 'Sideways Remote · For games held sideways.',
  'Classic Controller': 'Classic Controller · Supported games only. No pointer.',
  'GameCube Controller': 'GameCube Controller · Smash Bros. Brawl, Mario Kart Wii and more.',
};

// Correspondances exactes de WiiControls.dc.html : [manette, Wii, en orange (menu de l'app)].
export const PROFILE_MAPS: Record<WiiProfile, [string, string, boolean?][]> = {
  'Remote + Nunchuk': [
    ['Left stick', 'Nunchuk stick'], ['A', 'A'],
    ['Right stick', 'Pointer'], ['RT', 'B (trigger)'],
    ['Right stick click', 'Recenter pointer'], ['X', '1'],
    ['LB', 'C'], ['Y', '2'],
    ['LT', 'Z'], ['D-pad', 'D-pad'],
    ['RB', 'Shake'], ['View', '−'],
    ['View + Menu', 'overrrrhere menu', true], ['Menu', '+'],
  ],
  'Sideways Remote': [
    ['D-pad or left stick', 'D-pad'], ['RB', 'Shake'],
    ['A', '2'], ['View', '−'],
    ['X', '1'], ['Menu', '+'],
    ['Right stick', 'Pointer'], ['View + Menu', 'overrrrhere menu', true],
  ],
  'Classic Controller': [
    ['Left stick', 'Left stick'], ['A', 'b'],
    ['Right stick', 'Right stick'], ['B', 'a'],
    ['LT', 'L'], ['X', 'y'],
    ['RT', 'R'], ['Y', 'x'],
    ['LB', 'ZL'], ['D-pad', 'D-pad'],
    ['RB', 'ZR'], ['View', '−'],
    ['View + Menu', 'overrrrhere menu', true], ['Menu', '+'],
  ],
  'GameCube Controller': [
    ['Left stick', 'Control stick'], ['A', 'A'],
    ['Right stick', 'C-stick'], ['X', 'B'],
    ['LT', 'L'], ['B', 'X'],
    ['RT', 'R'], ['Y', 'Y'],
    ['RB', 'Z'], ['D-pad', 'D-pad'],
    ['Menu', 'Start'], ['View + Menu', 'overrrrhere menu', true],
  ],
};

// Phrase en bas de « Wii options » (WiiMenu.dc.html).
export function pointerHint(profile: WiiProfile, pointer: WiiPointer): string {
  if (profile === 'GameCube Controller') return 'Plays like a GameCube controller: no pointer, no motion. Best for games that support it.';
  if (profile === 'Classic Controller') return 'The Classic Controller has no pointer. Use it for games that support it.';
  return {
    'Right stick': 'Push the right stick to move the pointer. Push further to go faster.',
    'Gyro + right stick': 'Tilt your iPhone to aim, like a real Wii Remote. The right stick fine-tunes.',
    Touch: 'Touch the screen where you want to point. Press A to select.',
  }[pointer];
}

const PROFILE_VALUES: Record<WiiProfile, number> = {
  'Remote + Nunchuk': 1,
  'Classic Controller': 2,
  'GameCube Controller': 3,
  'Sideways Remote': 4,
};
const POINTER_VALUES: Record<WiiPointer, number> = { 'Right stick': 0, 'Gyro + right stick': 1, Touch: 2 };
const SPEED_VALUES: Record<WiiPointerSpeed, number> = { Slow: 0, Medium: 1, Fast: 2 };

// Profil choisi automatiquement : petite liste faite à la main, par les 3 premiers caractères de l'identifiant du
// jeu (sans la région), vérifiés dans la base de Dolphin (Sys/wiitdb-en.txt). Sinon : Remote + Nunchuk.
const AUTO_PROFILES: Record<string, WiiProfile> = {
  SMN: 'Sideways Remote', // New Super Mario Bros. Wii
  SUK: 'Sideways Remote', // Kirby's Return to Dream Land
  RK5: 'Sideways Remote', // Kirby's Epic Yarn
  R8P: 'Sideways Remote', // Super Paper Mario
  SF8: 'Sideways Remote', // Donkey Kong Country Returns
  R3O: 'Sideways Remote', // Metroid: Other M
  RWL: 'Sideways Remote', // Wario Land: Shake It!
  SSQ: 'Sideways Remote', // Mario Party 9
  REX: 'Sideways Remote', // Excite Truck
  R7P: 'Sideways Remote', // Punch-Out!!
  RSB: 'GameCube Controller', // Super Smash Bros. Brawl
  RMC: 'GameCube Controller', // Mario Kart Wii
  RDS: 'GameCube Controller', // Dragon Ball Z: Budokai Tenkaichi 3
  STK: 'GameCube Controller', // Tatsunoko vs. Capcom: Ultimate All-Stars
  RMH: 'Classic Controller', // Monster Hunter Tri
  SLS: 'Classic Controller', // The Last Story
};

// Jeux qui demandent beaucoup de gestes (secouer, pencher, viser en bougeant la Wiimote) : icône « Motion controls »
// sur leur tuile et « Uses motion controls » dans la ligne d'infos (RetroLibrary.dc.html). Liste faite à la main
// (l'app ne peut pas le détecter seule), identifiants vérifiés dans Sys/wiitdb-en.txt ; sans information, pas d'icône.
const MOTION_GAMES = new Set([
  'RSP', // Wii Sports
  'RZT', // Wii Sports Resort
  'RHA', // Wii Play
  'SC8', // Wii Play: Motion
  'RFN', // Wii Fit
  'RFP', // Wii Fit Plus
  'ROD', // WarioWare: Smooth Moves
  'SOU', // The Legend of Zelda: Skyward Sword
  'RED', // Red Steel
  'RD2', // Red Steel 2
  'SUP', // Wii Party
  'RM8', // Mario Party 8
  'RBK', // Boom Blox
  'RNH', // No More Heroes
  'RWS', // Mario & Sonic at the Olympic Games
  'SDN', // Just Dance
  'RWL', // Wario Land: Shake It!
  'RCP', // Kororinpa: Marble Mania
  'RTZ', // Zack & Wiki: Quest for Barbaros' Treasure
  'RKD', // Trauma Center: Second Opinion
  'REX', // Excite Truck
]);

export function usesMotion(gameId: string | null | undefined): boolean {
  return !!gameId && MOTION_GAMES.has(gameId.slice(0, 3).toUpperCase());
}

export function autoWiiProfile(gameId: string | null): WiiProfile {
  return (gameId && AUTO_PROFILES[gameId.slice(0, 3).toUpperCase()]) || 'Remote + Nunchuk';
}

export function wiiOptions(profile: WiiProfile, pointer: WiiPointer, speed: WiiPointerSpeed): Record<string, number> {
  return { wii_profile: PROFILE_VALUES[profile], wii_pointer: POINTER_VALUES[pointer], wii_pointer_speed: SPEED_VALUES[speed] };
}

// Profils sans pointeur (maquette WiiMenu : Pointer « Not used »).
export function usesPointer(profile: WiiProfile): boolean {
  return profile === 'Remote + Nunchuk' || profile === 'Sideways Remote';
}

// Place de l'image du jeu (16:9, centrée, bandes noires sur les côtés) dans la zone où Dolphin dessine : toute la
// vue, ou avec les contrôles tactiles la bande à 16 pt du haut et 17 pt du bas, large comme une image 4:3
// (480 × 270 sur 852 × 393, maquette des contrôles tactiles Wii) ; Fill screen avec la manette : tout l'écran
// (RetroView.layoutScreen).
export function wiiGameBox(width: number, height: number, touchControls: boolean, fill: boolean) {
  if (fill && !touchControls) return { x: 0, y: 0, w: width, h: height };
  const top = touchControls ? 16 : 0;
  const areaHeight = touchControls ? Math.max(height - 33, 1) : height;
  const areaWidth = touchControls ? Math.min(width, Math.round((areaHeight * 4) / 3)) : width;
  const w = Math.min(areaWidth, (areaHeight * 16) / 9);
  const h = (w * 9) / 16;
  return { x: (width - w) / 2, y: top + (areaHeight - h) / 2, w, h };
}
