import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import type { RetroGame } from './retro/library';
import { InstalledGame } from './xbox/games';

// Tuiles de Home : jeux épinglés (dans l'ordre) et images choisies dans Photos
// (design/ecrans/Library.dc.html, TileEditor.dc.html). Tout reste sur l'iPhone.

type CustomArt = { tile?: string; background?: string }; // adresses de fichiers copiés dans l'app

// Jeu épinglé : titleId Xbox (nombre) ou identifiant d'un jeu rétro (texte, src/retro/library.ts).
export type PinId = number | string;

type TilesState = {
  pinned: PinId[] | null; // dans l'ordre de Home ; null = jamais initialisé
  custom: Record<string, CustomArt>;
};

const STORE_KEY = 'tiles';
const AUTO_PIN_COUNT = 4; // premier lancement : les 4 jeux joués le plus récemment (liste déjà triée par dernière partie)

let state: TilesState = { pinned: null, custom: {} };
const listeners = new Set<() => void>();

function set(next: TilesState) {
  state = next;
  listeners.forEach((listener) => listener());
  SecureStore.setItemAsync(STORE_KEY, JSON.stringify(state)).catch(() => {});
}

export async function loadTiles() {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (raw) state = { pinned: null, custom: {}, ...JSON.parse(raw) };
  } catch {
    // Illisible : on repart de zéro.
  }
  // Images choisies (Edit tile) : iOS peut déplacer le dossier de l'app lors d'une mise à jour, l'adresse
  // enregistrée est recalculée d'après le nom du fichier dans Documents/tiles (constaté le 29/09).
  const custom: Record<string, CustomArt> = {};
  for (const [id, art] of Object.entries(state.custom)) {
    const next = { tile: relocate(art.tile), background: relocate(art.background) };
    if (next.tile || next.background) custom[id] = next;
  }
  state = { ...state, custom };
  listeners.forEach((listener) => listener());
}

function relocate(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  try {
    const file = new File(new Directory(Paths.document, 'tiles'), decodeURIComponent(uri.split('/').pop() ?? ''));
    return file.exists ? file.uri : undefined;
  } catch {
    return undefined;
  }
}

export function useTiles(): TilesState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

// Premier chargement des jeux : épingle automatiquement (réglage « Auto-pin recently played games »).
export function initPinned(games: InstalledGame[], autoPin: boolean) {
  if (state.pinned !== null) return;
  set({ ...state, pinned: autoPin ? games.slice(0, AUTO_PIN_COUNT).map((g) => g.titleId) : [] });
}

export function togglePin(id: PinId) {
  const pinned = state.pinned ?? [];
  set({ ...state, pinned: pinned.includes(id) ? pinned.filter((p) => p !== id) : [...pinned, id] });
}

export function unpin(id: PinId) {
  if ((state.pinned ?? []).includes(id)) togglePin(id);
}

// Ids épinglés dans l'ordre de Home (hors écran : recherche des jaquettes rétro, épinglés d'abord).
export function pinnedIds(): PinId[] {
  return state.pinned ?? [];
}

// Déplace un jeu épinglé à la position donnée (0 = 1re).
export function movePinned(id: PinId, position: number) {
  const others = (state.pinned ?? []).filter((p) => p !== id);
  others.splice(Math.max(0, Math.min(others.length, position)), 0, id);
  set({ ...state, pinned: others });
}

// Jeux épinglés présents sur la console, dans l'ordre de Home.
export function pinnedGames(games: InstalledGame[], tiles: TilesState): InstalledGame[] {
  return (tiles.pinned ?? []).map((id) => games.find((g) => g.titleId === id)).filter((g): g is InstalledGame => !!g);
}

// Le jeu avec ses images personnalisées à la place des visuels Xbox.
export function withArt(game: InstalledGame, tiles: TilesState): InstalledGame {
  const custom = tiles.custom[game.titleId];
  return custom ? { ...game, tile: custom.tile ?? game.tile, background: custom.background ?? game.background } : game;
}

// Images d'un jeu rétro : celles choisies dans Edit tile, sinon la jaquette.
export function retroArt(game: RetroGame, tiles: TilesState): { tile: string | null; background: string | null } {
  const custom = tiles.custom[game.id];
  return { tile: custom?.tile ?? game.cover, background: custom?.background ?? game.cover };
}

// Enregistre les images choisies (null = revenir au visuel d'origine : Xbox ou jaquette rétro).
// Les photos sont copiées dans l'app pour rester disponibles même si elles sont supprimées de Photos.
export async function saveArt(id: PinId, art: { tile: string | null; background: string | null }) {
  const previous = state.custom[id] ?? {};
  const next: CustomArt = {
    tile: await keep(art.tile, previous.tile, `${id}-tile`),
    background: await keep(art.background, previous.background, `${id}-background`),
  };
  const custom = { ...state.custom };
  if (next.tile || next.background) custom[id] = next;
  else delete custom[id];
  set({ ...state, custom });
}

// Jeu rétro supprimé : il quitte Home et ses images personnalisées sont effacées.
export function forgetTile(id: PinId) {
  const previous = state.custom[id];
  if (previous?.tile) deleteQuietly(previous.tile);
  if (previous?.background) deleteQuietly(previous.background);
  const custom = { ...state.custom };
  delete custom[id];
  set({ pinned: state.pinned?.filter((p) => p !== id) ?? null, custom });
}

// « Reset overrrrhere » : efface les épinglages et les images personnalisées.
export async function resetTiles() {
  try {
    new Directory(Paths.document, 'tiles').delete();
  } catch {
    // Aucun dossier d'images : rien à effacer.
  }
  set({ pinned: null, custom: {} });
}

async function keep(chosen: string | null, previous: string | undefined, name: string): Promise<string | undefined> {
  if (chosen === previous) return previous ?? undefined;
  if (previous) deleteQuietly(previous);
  if (!chosen) return undefined;

  const folder = new Directory(Paths.document, 'tiles');
  folder.create({ intermediates: true, idempotent: true });
  const destination = new File(folder, `${name}-${Date.now()}.jpg`);
  await new File(chosen).copy(destination);
  return destination.uri;
}

function deleteQuietly(uri: string) {
  try {
    new File(uri).delete();
  } catch {
    // Déjà supprimé.
  }
}
