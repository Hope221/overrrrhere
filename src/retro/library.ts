import { Directory, File, Paths } from 'expo-file-system';
import { getNetworkStateAsync } from 'expo-network';
import { useSyncExternalStore } from 'react';

import Retro, { FolderFile, RomFolderInfo, StagedFile } from '../../modules/retro';
import { forgetPlaytime } from '../playtime';
import { forgetTile, pinnedIds } from '../tiles';
import { RetroSystem, SystemId, cleanTitle, detectSystem, fileBaseName, fileSystem, systemById, titleFromFile } from './systems';
import type { RetroResolution } from '../settings';
import type { WiiChoice } from './wii';

// Bibliothèque rétro : les ROM importées par Elhadji, rangées sur l'iPhone.
// Documents/retro/library.json : la liste des jeux.
// Documents/retro/games/<id>/ : rom.<ext>, game.srm (sauvegarde de la cartouche), cover.png,
// auto.state / auto.png (sauvegarde auto) et slot1…slot3.state / .png (sauvegardes d'état).
// Jeux du dossier de ROM (iCloud Drive, Settings > Retro > ROM folder) : la ROM reste dans ce dossier (cloud =
// chemin relatif) ; seuls les sauvegardes et la jaquette sont dans games/<id>/, copiées aussi dans le dossier.

export type RetroGame = {
  id: string;
  name: string;
  system: SystemId;
  rom: string; // nom du fichier dans le dossier du jeu
  original: string; // nom du fichier choisi dans Fichiers
  size: number;
  addedAt: number;
  lastPlayed: number | null;
  cover: string | null; // image trouvée dans libretro-thumbnails (uri locale, retrouvée à chaque lancement)
  noCover?: boolean; // libretro-thumbnails n'a vraiment aucune image pour ce jeu : plus recherchée
  cloud?: string; // jeu du dossier de ROM : chemin relatif dans ce dossier
  onDevice?: boolean; // jeu du dossier : déjà téléchargé sur l'iPhone
  wii?: WiiChoice; // Wii : réglages choisis dans « Wii options » (WiiMenu.dc.html), pour ce jeu
  resolution?: RetroResolution; // Wii, GameCube, 3DS : choisie dans le menu du jeu ; sinon celle de Settings
  discId?: string | null; // Wii (et disque GameCube du dossier déjà vérifié, checkDisc) : identifiant du disque (« RMGE01 ») ; null = illisible
};

// Téléchargement en cours (jeu du dossier lancé), ou son échec affiché quelques secondes.
export type Download = { id: string; error: string | null };

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const MANUAL_SLOTS: SlotId[] = ['slot1', 'slot2', 'slot3'];

export type SaveSlot = {
  id: SlotId;
  name: string; // « Auto-save », « Slot 1 »
  time: number; // date de la sauvegarde (ms)
  image: string | null;
};

const root = () => new Directory(Paths.document, 'retro');
const listFile = () => new File(root(), 'library.json');
export const gameFolder = (id: string) => new Directory(root(), 'games', id);

let games: RetroGame[] = [];
let revision = 0; // change à chaque sauvegarde d'état : les vignettes se rafraîchissent
let folder: RomFolderInfo | null = null;
let download: Download | null = null;
const listeners = new Set<() => void>();
let snapshot: { games: RetroGame[]; revision: number; folder: RomFolderInfo | null; download: Download | null } = {
  games,
  revision,
  folder,
  download,
};

function emit() {
  snapshot = { games, revision, folder, download };
  listeners.forEach((listener) => listener());
}

function persist() {
  try {
    root().create({ intermediates: true, idempotent: true });
    listFile().write(JSON.stringify(games));
  } catch {
    // Disque plein ou illisible : la liste reste en mémoire pour cette session.
  }
}

export async function loadRetroLibrary() {
  try {
    const file = listFile();
    if (file.exists) games = JSON.parse(await file.text());
  } catch {
    games = [];
  }
  // Titres nettoyés (mise à jour du 29/09) et jaquettes retrouvées : iOS peut déplacer le dossier de l'app
  // lors d'une mise à jour, l'adresse complète enregistrée ne mène alors plus à l'image (constaté le 29/09).
  // Disques NKit (06/10) : « .nkit » retiré du titre, et la jaquette, introuvable à cause de lui, recherchée à nouveau.
  const repaired = games.map((g) => {
    const nkit = /\.nkit$/i.test(g.name);
    return {
      ...g,
      name: cleanTitle(nkit ? g.name.replace(/\.nkit$/i, '') : g.name),
      cover: localCover(g.id),
      noCover: nkit ? undefined : g.noCover,
    };
  });
  if (repaired.some((g, i) => g.name !== games[i].name || g.cover !== games[i].cover)) {
    games = repaired;
    persist();
  }
  emit();
}

// Jaquette déjà téléchargée dans le dossier du jeu (adresse recalculée, jamais celle d'un ancien lancement).
function localCover(id: string): string | null {
  try {
    const file = new File(gameFolder(id), 'cover.png');
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

export function useRetroLibrary() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}

export function getRetroGame(id: string): RetroGame | undefined {
  return games.find((g) => g.id === id);
}

// Chemin natif (sans « file:// ») pour le module Retro, et l'inverse.
export function nativePath(file: File): string {
  return decodeURIComponent(file.uri.replace(/^file:\/\//, ''));
}

function fileAt(path: string) {
  return new File(`file://${encodeURI(path)}`);
}

export function romFile(game: RetroGame) {
  return new File(gameFolder(game.id), game.rom);
}

// Chemin natif de la ROM : dans le dossier du jeu, ou dans le dossier de ROM pour un jeu de ce dossier.
export function romPath(game: RetroGame): string {
  if (game.cloud && folder) return `${folder.path}/${game.cloud}`;
  return nativePath(romFile(game));
}

function folderPath(directory: Directory): string {
  return decodeURIComponent(directory.uri.replace(/^file:\/\//, '')).replace(/\/$/, '');
}

export function sramFile(game: RetroGame) {
  return new File(gameFolder(game.id), 'game.srm');
}

export function stateFile(game: RetroGame, slot: SlotId) {
  return new File(gameFolder(game.id), `${slot}.state`);
}

export function stateImage(game: RetroGame, slot: SlotId) {
  return new File(gameFolder(game.id), `${slot}.png`);
}

// ---------- Import ----------

export type ImportCandidate = {
  staged: StagedFile;
  system: RetroSystem | null; // null = pas pris en charge
  name: string;
  cover: string | null; // image téléchargée dans le cache, en attendant « Add »
};

// Cherche l'image du jeu dans libretro-thumbnails : écran-titre (pixel, comme la maquette), sinon la boîte.
// D'abord le nom exact de la base No-Intro (« Super Mario World (USA).sfc ») ; sinon le nom le plus proche
// dans la liste des images du dossier (« pokemon crystal.gbc » → « Pokemon - Crystal Version (USA, Europe) »).
const THUMBNAILS = 'https://thumbnails.libretro.com';
const KINDS = ['Named_Titles', 'Named_Boxarts'];

// null : aucune image pour ce jeu ; undefined : serveur injoignable (pas de réseau), on réessaiera.
export async function findCover(system: RetroSystem, fileName: string): Promise<string | null | undefined> {
  const base = fileBaseName(fileName).replace(/[&*/:`<>?\\|"]/g, '_');
  const folderUrl = (kind: string) => `${THUMBNAILS}/${encodeURIComponent(system.thumbnails)}/${kind}/`;
  for (const kind of KINDS) {
    const cover = await downloadCover(folderUrl(kind) + encodeURIComponent(base) + '.png');
    if (cover) return cover;
  }
  let reached = false;
  for (const kind of KINDS) {
    const names = await thumbnailNames(folderUrl(kind));
    if (names.length > 0) reached = true;
    const match = closestName(base, names);
    if (!match) continue;
    const cover = await downloadCover(folderUrl(kind) + encodeURIComponent(match) + '.png');
    if (cover) return cover;
  }
  return reached ? null : undefined;
}

async function downloadCover(url: string): Promise<string | null> {
  const folder = new Directory(Paths.cache, 'retro-covers');
  folder.create({ intermediates: true, idempotent: true });
  try {
    const file = await File.downloadFileAsync(url, new File(folder, `${Date.now()}-${Math.random().toString(36).slice(2)}.png`));
    return file.uri;
  } catch {
    return null; // pas d'image à ce nom (ou pas de réseau)
  }
}

// Noms des images d'un dossier (page « Index of » du serveur), gardés le temps de la session.
const nameLists = new Map<string, Promise<string[]>>();

function thumbnailNames(folderUrl: string): Promise<string[]> {
  let list = nameLists.get(folderUrl);
  if (!list) {
    list = fetch(folderUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`thumbnails ${response.status}`); // serveur surchargé : pas une liste vide
        return response.text();
      })
      .then((html) =>
        [...html.matchAll(/href="([^"?/]+)\.png"/g)].map((m) => {
          try {
            return decodeURIComponent(m[1]);
          } catch {
            return m[1];
          }
        }),
      )
      .catch(() => {
        nameLists.delete(folderUrl); // pas de réseau ou erreur du serveur : redemandée au jeu suivant
        return [];
      });
    nameLists.set(folderUrl, list);
  }
  return list;
}

// Mots du titre, sans majuscules, accents, ponctuation, étiquettes « (USA) » / « [!] » ni « The » / « and »
// (« & » devient « _ » sur le serveur).
function titleWords(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\d{3,5}\s*-\s*/, '') // numéro de sortie (« 1636 - Pokemon… »)
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/'/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && w !== 'the' && w !== 'and');
}

// Codes de pays des anciens noms de fichiers (« (U) », « (E) »…).
const SHORT_REGIONS: Record<string, string> = { u: 'usa', e: 'europe', j: 'japan', f: 'france', g: 'germany', s: 'spain', i: 'italy', w: 'world' };

function tags(name: string): string[] {
  return (name.match(/\(([^)]*)\)/g) ?? [])
    .flatMap((t) => t.slice(1, -1).split(/,\s*/))
    .map((t) => t.toLowerCase())
    .map((t) => SHORT_REGIONS[t] ?? t);
}

const REGIONS = ['world', 'usa', 'europe']; // à défaut d'indice dans le nom du fichier
const UNWANTED = /virtual console|beta|proto|demo|sample|kiosk|switch online|collection/; // éditions à éviter

// Image dont le titre contient tous les mots du fichier, avec le moins de mots en plus (« Version »…) ;
// à égalité, celle qui partage le plus d'étiquettes avec le fichier (pays, révision), puis World / USA / Europe.
function closestName(fileName: string, names: string[]): string | null {
  const wanted = titleWords(fileName);
  if (!wanted.length) return null;
  const fileTags = tags(fileName);
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const name of names) {
    const words = titleWords(name);
    const joined = words.join('');
    // « Fire Red » trouve aussi « FireRed ».
    if (!wanted.every((w) => words.includes(w)) && !joined.includes(wanted.join(''))) continue;
    const extra = Math.max(0, words.length - wanted.length);
    // Plus de 2 mots en plus : seulement un sous-titre (« Super Mario Land 2 » → « … - 6 Golden Coins »).
    if (extra > 2 && !joined.startsWith(wanted.join(''))) continue;
    const nameTags = tags(name);
    const shared = nameTags.filter((t) => fileTags.includes(t)).length;
    const region = REGIONS.findIndex((r) => nameTags.includes(r));
    const unwanted = nameTags.some((t) => UNWANTED.test(t)) ? 1 : 0;
    const score = -extra * 100 + shared * 10 - unwanted * 5 + (region < 0 ? 0 : 3 - region);
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  return best;
}

export function candidateName(staged: StagedFile) {
  return titleFromFile(staged.name);
}

// « Add to library » / « Add N games » : range chaque ROM dans son dossier.
export async function addGames(candidates: ImportCandidate[]): Promise<RetroGame[]> {
  const added: RetroGame[] = [];
  for (const c of candidates) {
    if (!c.system) continue;
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const folder = gameFolder(id);
    folder.create({ intermediates: true, idempotent: true });
    const extension = c.staged.name.split('.').pop()?.toLowerCase() ?? 'rom';
    const rom = `rom.${extension}`;
    await fileAt(c.staged.path).move(new File(folder, rom));

    let cover: string | null = null;
    if (c.cover) {
      const destination = new File(folder, 'cover.png');
      await new File(c.cover).move(destination);
      cover = destination.uri;
    }

    // Partie jouée avec le prototype SNES (lot 4a) : on reprend sa sauvegarde.
    const oldSave = new File(Paths.document, 'saves', c.staged.name.replace(/\.[^.]+$/, '') + '.srm');
    if (oldSave.exists) await oldSave.copy(new File(folder, 'game.srm'));

    added.push({ id, name: cleanTitle(c.name), system: c.system.id, rom, original: c.staged.name, size: c.staged.size, addedAt: Date.now(), lastPlayed: null, cover });
  }
  games = [...games, ...added];
  persist();
  emit();
  return added;
}

// Cancel : les fichiers en attente et les images téléchargées sont effacés.
export function discardCandidates(candidates: ImportCandidate[]) {
  for (const c of candidates) {
    deleteQuietly(fileAt(c.staged.path));
    if (c.cover) deleteQuietly(new File(c.cover));
  }
}

// ---------- Jeu ----------

export function markPlayed(id: string) {
  games = games.map((g) => (g.id === id ? { ...g, lastPlayed: Date.now() } : g));
  persist();
  emit();
}

// Wii : identifiant du disque des jeux présents sur l'iPhone, lu une fois puis gardé (indicateur « Motion controls »).
// Un jeu du dossier iCloud pas encore téléchargé reste sans identifiant (pas d'icône) jusqu'à son téléchargement.
export function fillDiscIds() {
  let changed = false;
  games = games.map((g) => {
    if (g.system !== 'wii' || g.discId !== undefined || (g.cloud && !g.onDevice)) return g;
    changed = true;
    return { ...g, discId: Retro.discGameId(romPath(g)) };
  });
  if (!changed) return;
  persist();
  emit();
}

// Résolution choisie dans le menu du jeu (Wii, GameCube, 3DS), gardée pour ce jeu.
export function setGameResolution(id: string, resolution: RetroResolution) {
  games = games.map((g) => (g.id === id ? { ...g, resolution } : g));
  persist();
  emit();
}

// Wii : réglage choisi dans « Wii options », gardé pour ce jeu.
export function setWiiChoice(id: string, choice: WiiChoice) {
  games = games.map((g) => (g.id === id ? { ...g, wii: { ...g.wii, ...choice } } : g));
  persist();
  emit();
}

// Sauvegardes présentes : Auto-save puis Slot 1 à 3.
export function saveSlots(game: RetroGame): SaveSlot[] {
  const slots: SaveSlot[] = [];
  for (const id of ['auto', ...MANUAL_SLOTS] as SlotId[]) {
    const state = stateFile(game, id);
    if (!state.exists) continue;
    const image = stateImage(game, id);
    const time = state.modificationTime ?? 0;
    slots.push({
      id,
      name: id === 'auto' ? 'Auto-save' : `Slot ${id.slice(4)}`,
      time,
      image: image.exists ? `${image.uri}?t=${time}` : null,
    });
  }
  return slots;
}

// « Delete » (Retro game details) : la ROM, ses sauvegardes, son temps joué et sa tuile disparaissent.
export function deleteGame(id: string) {
  try {
    gameFolder(id).delete();
  } catch {
    // Dossier déjà absent.
  }
  games = games.filter((g) => g.id !== id);
  persist();
  emit();
  forgetTile(id);
  forgetPlaytime(`retro:${id}`);
}

// Place occupée sur l'iPhone par un jeu (ROM, sauvegardes, jaquette), pour Settings > Retro.
// Jeu du dossier de ROM : sa ROM ne compte que si elle est téléchargée.
export function gameBytes(game: RetroGame): number {
  const rom = game.cloud && game.onDevice ? game.size : 0;
  try {
    return (
      rom +
      gameFolder(game.id)
        .list()
        .reduce((total, item) => total + (item instanceof File ? item.size ?? 0 : 0), 0)
    );
  } catch {
    return game.cloud ? rom : game.size;
  }
}

export function hasAutoSave(game: RetroGame) {
  return stateFile(game, 'auto').exists;
}

// Après une sauvegarde d'état : les écrans relisent les emplacements.
export function touchSaves() {
  revision += 1;
  emit();
}

function deleteQuietly(file: File) {
  try {
    file.delete();
  } catch {
    // Déjà supprimé.
  }
}

// ---------- Dossier de ROM (iCloud Drive) ----------

// Tailles exactes des disques GameCube et Wii (une ou deux couches) complets : un .iso pas encore téléchargé
// (son en-tête est illisible) de cette taille est un jeu GameCube ou Wii, sinon une image PSP.
const GAMECUBE_DISC_SIZE = 1459978240;
const WII_DISC_SIZES = [4699979776, 8511160320];

// Un .rvz (.gcz, .ciso) pas encore téléchargé : GameCube d'après son extension, reconnu après téléchargement.
function folderSystem(file: FolderFile): RetroSystem | null {
  const disc = /\.(iso|rvz|gcz|ciso)$/i.test(file.name);
  if (!disc) return detectSystem(file.name);
  if (file.local && folder) return fileSystem(file.name, `${folder.path}/${file.path}`);
  if (!/\.iso$/i.test(file.name)) return detectSystem(file.name);
  if (WII_DISC_SIZES.includes(file.size)) return systemById('wii');
  return systemById(file.size === GAMECUBE_DISC_SIZE ? 'gc' : 'psp');
}

// Disque d'un jeu du dossier, une fois sur l'iPhone : lu une seule fois (identifiant gardé dans discId).
// Un .rvz (.gcz, .ciso) ajouté avant son téléchargement était classé GameCube d'après son extension et le restait
// (constaté le 06/10/2026) : son contenu dit maintenant si c'est un jeu Wii. Jeux Wii : identifiant du disque, qui
// sert aussi à retrouver leur sauvegarde (syncWiiSave).
const AMBIGUOUS_DISC = /\.(rvz|gcz|ciso)$/i;

function checkDisc(game: RetroGame): RetroGame {
  if (!game.cloud || !game.onDevice || !folder || game.discId !== undefined) return game;
  const wii = game.system === 'wii';
  if (!wii && !(game.system === 'gc' && AMBIGUOUS_DISC.test(game.cloud))) return game;
  const path = `${folder.path}/${game.cloud}`;
  const system = wii ? 'wii' : Retro.discSystem(path);
  if (system !== 'wii' && system !== 'gc') return game; // illisible pour l'instant : relu à la prochaine lecture
  const discId = Retro.discGameId(path);
  // Devenu Wii : jaquette cherchée à nouveau, dans les images de la Wii.
  if (system === 'wii' && !wii) return { ...game, system: 'wii', discId, noCover: undefined };
  return { ...game, discId };
}

// Id d'un jeu du dossier, tiré de son chemin (FNV-1a) : le même fichier garde ses sauvegardes et sa tuile.
function cloudId(relative: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < relative.length; i++) {
    hash ^= relative.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `c${hash.toString(36)}`;
}

let scanning = false;
let rescan = false; // dossier redemandé pendant une lecture : relu juste après (au lieu d'être ignoré)

// À l'ouverture de l'app, de Retro, et après le choix du dossier : les jeux du dossier sont ajoutés
// (à la fin de la liste), mis à jour (téléchargés ou pas), ou retirés s'ils n'y sont plus (leurs sauvegardes
// restent). La lecture ne fait que la liste (rapide) ; jaquettes manquantes et sauvegardes suivent en arrière-plan.
export async function syncRomFolder() {
  if (scanning) {
    rescan = true;
    return;
  }
  scanning = true;
  try {
    do {
      rescan = false;
      await scanRomFolder();
    } while (rescan);
  } finally {
    scanning = false;
  }
  fetchMissingCovers();
  syncFolderSaves();
}

async function scanRomFolder() {
  try {
    folder = Retro.romFolder();
    if (!folder) {
      if (games.some((g) => g.cloud)) {
        games = games.filter((g) => !g.cloud);
        persist();
      }
      emit();
      return;
    }
    const files = await Retro.scanRomFolder();
    const found = new Map<string, RetroGame>();
    for (const file of files) {
      const system = folderSystem(file);
      if (!system) continue;
      const id = cloudId(file.path);
      const known = games.find((g) => g.id === id);
      found.set(
        id,
        known
          ? checkDisc({ ...known, size: file.size || known.size, onDevice: file.local, original: file.name })
          : {
              id,
              name: titleFromFile(file.name),
              system: system.id,
              rom: '',
              original: file.name,
              size: file.size,
              addedAt: Date.now(),
              lastPlayed: null,
              cover: localCover(id), // déjà trouvée s'il revient (dossier rechoisi)
              cloud: file.path,
              onDevice: file.local,
            },
      );
    }
    const kept = games.filter((g) => !g.cloud || found.has(g.id)).map((g) => found.get(g.id) ?? g);
    const added = [...found.values()].filter((g) => !games.some((old) => old.id === g.id));
    games = [...kept, ...added];
    persist();
    emit();
  } catch {
    // Dossier illisible (hors ligne, supprimé) : la liste garde les jeux déjà connus.
    emit();
  }
}

// Sauvegardes les plus récentes, dans les deux sens, pour les jeux du dossier (une passe à la fois).
let savesWork: Promise<void> | null = null;

function syncFolderSaves() {
  savesWork ??= (async () => {
    try {
      for (const game of games.filter((g) => g.cloud)) {
        await syncGameSaves(game).catch(() => {});
        await syncWiiSave(game).catch(() => {});
      }
      if (games.some((g) => g.cloud && g.system === 'gc')) await Retro.syncMemoryCards().catch(() => {});
      touchSaves();
    } finally {
      savesWork = null;
    }
  })();
}

// Jaquettes manquantes (jeux importés ou du dossier), en arrière-plan : à l'ouverture de l'app, après une
// lecture du dossier et au retour d'internet. 4 jeux à la fois ; épinglés d'abord (ordre de Home), puis les
// derniers joués, puis les autres. Un jeu raté n'arrête pas les suivants : seulement l'absence d'internet, ou
// 10 échecs d'affilée (serveur libretro en panne). Les jeux ratés sont réessayés la fois suivante.
const COVER_WORKERS = 4;
const MAX_COVER_FAILURES = 10;
let coverWork: Promise<void> | null = null;
let coverAgain = false; // demandée pendant une recherche (dossier relu, internet revenu) : nouvelle passe ensuite

export function fetchMissingCovers() {
  if (coverWork) {
    coverAgain = true;
    return;
  }
  coverWork = (async () => {
    try {
      let stopped = false;
      do {
        coverAgain = false;
        stopped = await coverPass();
      } while (coverAgain && !stopped);
    } finally {
      coverWork = null;
    }
  })();
}

// Une passe sur les jeux sans jaquette (ceux ajoutés pendant la passe compris). true : arrêtée en cours.
async function coverPass(): Promise<boolean> {
  const tried = new Set<string>();
  let failures = 0;
  let stopped = false;
  const worker = async () => {
    while (!stopped) {
      const game = nextMissingCover(tried);
      if (!game) return;
      tried.add(game.id);
      const result = await attachCover(game).catch(() => 'failed' as const);
      if (result !== 'failed') {
        failures = 0;
        continue;
      }
      failures += 1;
      if (failures >= MAX_COVER_FAILURES || !(await hasInternet())) stopped = true;
    }
  };
  await Promise.all(Array.from({ length: COVER_WORKERS }, worker));
  return stopped;
}

function nextMissingCover(tried: Set<string>): RetroGame | undefined {
  const pinned = pinnedIds();
  const rank = (g: RetroGame) => {
    const position = pinned.indexOf(g.id);
    return position < 0 ? pinned.length : position;
  };
  let best: RetroGame | undefined;
  for (const game of games) {
    if (game.cover || game.noCover || tried.has(game.id)) continue;
    if (
      !best ||
      rank(game) < rank(best) ||
      (rank(game) === rank(best) && (game.lastPlayed ?? 0) > (best.lastPlayed ?? 0))
    ) {
      best = game;
    }
  }
  return best;
}

// Même règle que useOnline (src/ui/device.ts). État illisible : on continue.
async function hasInternet(): Promise<boolean> {
  try {
    const network = await getNetworkStateAsync();
    return network.isConnected !== false && network.isInternetReachable !== false;
  } catch {
    return true;
  }
}

async function attachCover(game: RetroGame): Promise<'found' | 'none' | 'failed'> {
  const cover = await findCover(systemById(game.system), game.original);
  if (cover === undefined) return 'failed';
  if (!games.some((g) => g.id === game.id)) {
    if (cover) deleteQuietly(new File(cover)); // retiré entre-temps (dossier changé)
    return 'none';
  }
  if (cover === null) {
    games = games.map((g) => (g.id === game.id ? { ...g, noCover: true } : g));
    persist();
    return 'none';
  }
  const directory = gameFolder(game.id);
  directory.create({ intermediates: true, idempotent: true });
  const destination = new File(directory, 'cover.png');
  try {
    if (destination.exists) destination.delete();
    await new File(cover).move(destination);
  } catch {
    return 'none';
  }
  games = games.map((g) => (g.id === game.id ? { ...g, cover: destination.uri } : g));
  persist();
  emit();
  return 'found';
}

async function syncGameSaves(game: RetroGame) {
  if (!game.cloud) return;
  const directory = gameFolder(game.id);
  directory.create({ intermediates: true, idempotent: true });
  await Retro.syncSaves(folderPath(directory), game.cloud);
}

// Wii : sa sauvegarde est dans la mémoire de la Wii simulée par Dolphin, pas dans le dossier du jeu.
async function syncWiiSave(game: RetroGame) {
  if (!game.cloud || game.system !== 'wii' || !game.discId) return;
  await Retro.syncWiiSave(game.discId, game.cloud);
}

// Settings > Retro > ROM folder.
export async function chooseRomFolder(): Promise<RomFolderInfo | null> {
  const info = await Retro.pickRomFolder();
  if (info) await syncRomFolder();
  return info;
}

// Avant de jouer à un jeu du dossier : téléchargement (écran 3 de la maquette), B annule.
export async function prepareGame(game: RetroGame): Promise<boolean> {
  if (!game.cloud) return true;
  if (download && !download.error) return false; // un téléchargement à la fois
  download = { id: game.id, error: null };
  emit();
  try {
    await Retro.downloadRom(game.cloud);
    games = games.map((g) => (g.id === game.id ? checkDisc({ ...g, onDevice: true }) : g));
    persist();
    const downloaded = getRetroGame(game.id) ?? game;
    await syncGameSaves(downloaded);
    await syncWiiSave(downloaded).catch(() => {});
    if (downloaded.system !== game.system) fetchMissingCovers();
    download = null;
    emit();
    return true;
  } catch (error) {
    const message = String((error as Error)?.message ?? '');
    if (/cancel/i.test(message)) {
      download = null;
    } else {
      download = {
        id: game.id,
        error: /offline/i.test(message) ? "You're offline. This game is still in iCloud." : "This game couldn't be downloaded from iCloud.",
      };
      setTimeout(() => {
        if (download?.id === game.id && download.error) {
          download = null;
          emit();
        }
      }, 4000);
    }
    emit();
    return false;
  }
}

export function cancelDownload() {
  Retro.cancelDownload();
}

// « Remove download » (Retro game details) : le jeu reste dans iCloud et dans la liste, avec le nuage.
export async function removeDownload(game: RetroGame) {
  if (!game.cloud) return;
  try {
    await Retro.removeDownload(game.cloud);
  } catch {
    return;
  }
  games = games.map((g) => (g.id === game.id ? { ...g, onDevice: false } : g));
  persist();
  emit();
}

// Après une partie : les sauvegardes du jeu (et les cartes mémoire GameCube, la sauvegarde Wii) partent dans le dossier.
// Un peu plus tard : la sauvegarde auto de la GameCube s'écrit après la fermeture de l'écran de jeu.
export function backupSavesSoon(id: string) {
  const game = getRetroGame(id);
  if (!game?.cloud) return;
  setTimeout(() => {
    syncGameSaves(game).catch(() => {});
    syncWiiSave(game).catch(() => {});
    if (game.system === 'gc') Retro.syncMemoryCards().catch(() => {});
  }, 5000);
}
