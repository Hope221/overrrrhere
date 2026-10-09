import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

// « Played here » : temps joué via l'app, compté sur l'iPhone (décision d'Elhadji du 26/09, option A).
// Utilisé sur Home (« 14 h played ») et dans Game details. Effacé par « Reset overrrrhere ».
// Clés : « xbox:<titleId> » (et plus tard « retro:<id> » pour l'émulation, lot 4).

const STORE_KEY = 'playtime';
let seconds: Record<string, number> = {};
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export async function loadPlaytime() {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (raw) seconds = JSON.parse(raw);
  } catch {
    // Illisible : on repart de zéro.
  }
  emit();
}

export function xboxKey(titleId: number) {
  return `xbox:${titleId}`;
}

export function addPlaytime(key: string, addedSeconds: number) {
  if (addedSeconds < 1) return;
  seconds = { ...seconds, [key]: (seconds[key] ?? 0) + Math.round(addedSeconds) };
  emit();
  SecureStore.setItemAsync(STORE_KEY, JSON.stringify(seconds)).catch(() => {});
}

// « Delete » d'un jeu rétro : son temps joué disparaît avec lui.
export function forgetPlaytime(key: string) {
  if (!(key in seconds)) return;
  const { [key]: _removed, ...rest } = seconds;
  seconds = rest;
  emit();
  SecureStore.setItemAsync(STORE_KEY, JSON.stringify(seconds)).catch(() => {});
}

export async function resetPlaytime() {
  seconds = {};
  emit();
  await SecureStore.deleteItemAsync(STORE_KEY).catch(() => {});
}

// Minutes jouées ici pour une clé (0 si jamais).
export function usePlaytimeMinutes(key: string | null): number {
  const all = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => seconds,
  );
  return key ? Math.floor((all[key] ?? 0) / 60) : 0;
}

// « 14 h » ou « 25 min » (maquettes Main et GameDetails).
export function formatDuration(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}
