import Retro from '../../modules/retro';

// Systèmes rétro de la v1 (CLAUDE.md) : nom, étiquette des tuiles, extensions, dossier libretro-thumbnails.
// « playable » : un core est intégré à l'app : Snes9x (SNES), mGBA (Game Boy, Game Boy Color, GBA), FCEUmm (NES),
// Genesis Plus GX (Mega Drive). Tous les systèmes de la v1 sont jouables.
// Point 20 (« plus tard ») : N64 avec Mupen64Plus-Next, PSP avec PPSSPP (3D), Nintendo DS avec melonDS DS.
// Nintendo 3DS avec Azahar (prototype de l'étape 22b), ajoutée à la demande d'Elhadji.
// GameCube avec le cœur Dolphin d'iCube (prototype GC-c), sans JIT. Wii avec le même cœur (lot 1 du 05/10/2026).
// Un .iso peut être un disque GameCube, Wii ou une image de la PSP, un .rvz un disque GameCube ou Wii :
// le module natif lit le contenu du fichier (fileSystem ci-dessous).
// « filter » sert aussi de nom court dans les listes de systèmes (maquettes RetroLibrary, RomImport).

export type SystemId = 'nes' | 'snes' | 'gb' | 'gbc' | 'gba' | 'md' | 'n64' | 'psp' | 'nds' | '3ds' | 'gc' | 'wii';

export type RetroSystem = {
  id: SystemId;
  name: string; // « Super Nintendo » (Import, Details)
  chip: string; // étiquette des tuiles : 10 pt, texte en entier
  filter: string; // filtre de la bibliothèque (RetroLibrary.dc.html)
  extensions: string[];
  thumbnails: string; // dossier de https://thumbnails.libretro.com
  playable: boolean;
};

export const SYSTEMS: RetroSystem[] = [
  { id: 'nes', name: 'NES', chip: 'NES', filter: 'NES', extensions: ['nes'], thumbnails: 'Nintendo - Nintendo Entertainment System', playable: true },
  {
    id: 'snes',
    name: 'Super Nintendo',
    chip: 'SNES',
    filter: 'SNES',
    extensions: ['sfc', 'smc', 'swc', 'fig'],
    thumbnails: 'Nintendo - Super Nintendo Entertainment System',
    playable: true,
  },
  { id: 'gb', name: 'Game Boy', chip: 'GAME BOY', filter: 'Game Boy', extensions: ['gb'], thumbnails: 'Nintendo - Game Boy', playable: true },
  { id: 'gbc', name: 'Game Boy Color', chip: 'GAME BOY COLOR', filter: 'Game Boy Color', extensions: ['gbc'], thumbnails: 'Nintendo - Game Boy Color', playable: true },
  { id: 'gba', name: 'Game Boy Advance', chip: 'GBA', filter: 'GBA', extensions: ['gba'], thumbnails: 'Nintendo - Game Boy Advance', playable: true },
  {
    id: 'md',
    name: 'Mega Drive',
    chip: 'MEGA DRIVE',
    filter: 'Mega Drive',
    extensions: ['md', 'bin', 'gen', 'smd'], // les deux premières sont citées sur l'écran « not supported »
    thumbnails: 'Sega - Mega Drive - Genesis',
    playable: true,
  },
  {
    id: 'n64',
    name: 'Nintendo 64',
    chip: 'N64',
    filter: 'N64',
    extensions: ['z64', 'n64', 'v64'], // trois ordres d'octets du même jeu, Mupen64Plus-Next lit les trois
    thumbnails: 'Nintendo - Nintendo 64',
    playable: true,
  },
  {
    id: 'psp',
    name: 'PSP',
    chip: 'PSP',
    filter: 'PSP',
    extensions: ['iso', 'cso'], // image du disque UMD, telle quelle ou compressée (plus légère)
    thumbnails: 'Sony - PlayStation Portable',
    playable: true,
  },
  {
    id: 'nds',
    name: 'Nintendo DS',
    chip: 'DS', // DSMenu.dc.html : « DS · 24 min · Battery 68% »
    filter: 'DS',
    extensions: ['nds'],
    thumbnails: 'Nintendo - Nintendo DS',
    playable: true,
  },
  {
    id: '3ds',
    name: 'Nintendo 3DS',
    chip: '3DS', // maquette 3DS : « 3DS · 24 min · Battery 68% »
    filter: '3DS',
    // Jeux déchiffrés : cartouche (.3ds, .cci), programme (.cxi), jeu maison (.3dsx), et leurs versions
    // compressées par Azahar (.zcci, .zcxi, .z3dsx). Pas de .cia (Azahar ne les ouvre pas comme jeux).
    extensions: ['3ds', 'cci', 'cxi', '3dsx', 'zcci', 'zcxi', 'z3dsx'],
    thumbnails: 'Nintendo - Nintendo 3DS',
    playable: true,
  },
  {
    id: 'gc',
    name: 'GameCube',
    chip: 'GAMECUBE',
    filter: 'GameCube',
    // Disque tel quel (.gcm ; .iso reconnu par son en-tête), ou compressé par Dolphin (.rvz, le plus léger), .gcz, .ciso.
    extensions: ['gcm', 'rvz', 'gcz', 'ciso'],
    thumbnails: 'Nintendo - GameCube',
    playable: true,
  },
  {
    id: 'wii',
    name: 'Wii',
    chip: 'WII',
    filter: 'Wii',
    // .wbfs : toujours Wii. .iso et .rvz : reconnus par leur contenu (fileSystem).
    extensions: ['wbfs'],
    thumbnails: 'Nintendo - Wii',
    playable: true,
  },
];

export function systemById(id: SystemId): RetroSystem {
  return SYSTEMS.find((s) => s.id === id) ?? SYSTEMS[1];
}

// Système d'après l'extension du fichier ; null si le fichier n'est pas pris en charge (ou pas encore jouable).
export function detectSystem(fileName: string): RetroSystem | null {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  const system = SYSTEMS.find((s) => s.extensions.includes(extension));
  return system?.playable ? system : null;
}

// Comme detectSystem, mais un disque (.iso, .rvz, .gcz, .ciso) est reconnu par son contenu : GameCube, Wii ou
// image PSP. Un .iso illisible : null ; les autres gardent le système de leur extension (GameCube).
export function fileSystem(fileName: string, path: string): RetroSystem | null {
  const iso = /\.iso$/i.test(fileName);
  if (!iso && !/\.(rvz|gcz|ciso)$/i.test(fileName)) return detectSystem(fileName);
  const id = Retro.discSystem(path);
  if (id) return systemById(id);
  return iso ? null : detectSystem(fileName);
}

// Nom du fichier sans extension : « Rayman Origins.nkit.iso » → « Rayman Origins » (disques Wii et GameCube
// au format NKit, constaté le 06/10 : « .nkit » restait dans le titre et empêchait de trouver la jaquette).
export function fileBaseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/\.nkit$/i, '');
}

// Nom du jeu d'après le fichier : « Super Mario World (USA).sfc » → « Super Mario World ».
export function titleFromFile(fileName: string): string {
  const base = fileBaseName(fileName);
  const clean = base.replace(/\s*[([][^)\]]*[)\]]/g, '').replace(/_/g, ' ').trim();
  return cleanTitle(clean || base);
}

// Titre propre, partout où il s'affiche (mise à jour du 29/09) :
// « 0565 - Legend of Zelda, The - Ocarina of Time » → « The Legend of Zelda: Ocarina of Time ».
// Numérotation retirée seulement si elle a 4 caractères ou plus (« 007 - Nightfire » reste intact).
export function cleanTitle(title: string): string {
  const numbering = title.match(/^\s*([A-Za-z0-9]*\d{3,})\s*-\s+/);
  const unnumbered = numbering && numbering[1].length >= 4 ? title.slice(numbering[0].length) : title;
  const clean = unnumbered
    .split(/\s+-\s+/)
    .map((part) => part.trim().replace(/^(.+),\s*(The|A|An)$/i, '$2 $1')) // « Legend of Zelda, The » → « The Legend of Zelda »
    .filter(Boolean)
    .join(': ');
  return clean || title.trim();
}

// « 1.8 GB » (jeux PSP), « 4 MB », « 256 KB ».
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
