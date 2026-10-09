import { File, Paths } from 'expo-file-system';

import type { Profile } from './auth';
import type { XboxConsole } from './consoles';
import type { InstalledGame } from './games';

// Dernières données Xbox connues (profil, console, jeux installés), gardées sur l'iPhone
// pour afficher l'accueil sans internet (mise à jour du 29/09, lot 1). Effacées à la déconnexion.

export type XboxCache = {
  profile: Profile | null;
  console: XboxConsole | null;
  games: InstalledGame[];
};

const EMPTY: XboxCache = { profile: null, console: null, games: [] };
const cacheFile = () => new File(Paths.document, 'xbox-cache.json');

let cache: XboxCache | null = null;

export async function loadXboxCache() {
  try {
    const file = cacheFile();
    if (file.exists) cache = { ...EMPTY, ...JSON.parse(await file.text()) };
  } catch {
    cache = null; // illisible : l'accueil hors ligne n'aura que le rétro
  }
}

export function getXboxCache(): XboxCache | null {
  return cache;
}

export function saveXboxCache(patch: Partial<XboxCache>) {
  cache = { ...EMPTY, ...cache, ...patch };
  try {
    cacheFile().write(JSON.stringify(cache));
  } catch {
    // Disque plein : gardé en mémoire pour cette session.
  }
}

export function clearXboxCache() {
  cache = null;
  try {
    const file = cacheFile();
    if (file.exists) file.delete();
  } catch {
    // Rien à effacer.
  }
}
