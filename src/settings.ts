import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import type { DsLayout } from './retro/dsLayout';
import { focusColors } from './ui/theme';

// Réglages de l'app (design/ecrans/Settings.dc.html), mémorisés sur l'iPhone.
// Valeurs par défaut = état initial de la maquette.

export type FocusColorName = 'White' | 'Green' | 'Orange';
export type Volume = 'Low' | 'Medium' | 'High';
// Settings > Controller (mise à jour du 25/09) : contrôles tactiles pendant le stream.
export type TouchControls = 'Auto' | 'Always' | 'Off'; // Auto = seulement sans manette
export type TouchOpacity = 'Low' | 'Medium' | 'High'; // 50 / 80 / 100 %
// Settings > Retro (mise à jour du 25/09).
export type RetroScreen = 'Sharp' | 'Smooth' | 'CRT';
export type RetroSize = 'Original' | 'Fill screen';
// Settings > Retro > Internal resolution (maquette du 06/10/2026) : Wii, GameCube et 3DS.
export type RetroResolution = '1×' | '2×' | '3×';
export const RETRO_RESOLUTIONS: RetroResolution[] = ['1×', '2×', '3×'];

export type Settings = {
  vibration: boolean;
  wifiCheck: boolean;
  autoSleep: boolean;
  artBg: boolean;
  reduceMotion: boolean;
  clock24: boolean;
  autoPin: boolean;
  showPlayTime: boolean;
  consoleTile: boolean;
  sounds: boolean;
  readyChime: boolean;
  volume: Volume;
  focusColor: FocusColorName;
  touchControls: TouchControls;
  touchOpacity: TouchOpacity;
  retroAutosave: boolean;
  retroScreen: RetroScreen;
  retroSize: RetroSize;
  retroResolution: RetroResolution;
  // Settings > Retro > DS screen layout (maquette du 29/09) : disposition des deux écrans avec la manette (DS et 3DS).
  dsLayout: DsLayout;
  // Premier lancement (Welcome → Sign in → Choose console) terminé, et console choisie.
  onboarded: boolean;
  consoleId: string | null;
  // « Continue without Xbox » choisi sur Sign in (mise à jour du 29/09) : l'accueil s'ouvre sans compte Microsoft.
  xboxSkipped: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  vibration: true,
  wifiCheck: true,
  autoSleep: true,
  artBg: true,
  reduceMotion: false,
  clock24: true,
  autoPin: true,
  showPlayTime: true,
  consoleTile: true,
  sounds: true,
  readyChime: true,
  volume: 'Medium',
  focusColor: 'White',
  touchControls: 'Auto',
  touchOpacity: 'Medium',
  retroAutosave: true,
  retroScreen: 'Sharp',
  retroSize: 'Original',
  retroResolution: '1×',
  dsLayout: 'Side by side',
  onboarded: false,
  consoleId: null,
  xboxSkipped: false,
};

const STORE_KEY = 'settings';
let current: Settings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export async function loadSettings() {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (raw) current = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // Réglages illisibles : on garde les valeurs par défaut.
  }
  emit();
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  emit();
  SecureStore.setItemAsync(STORE_KEY, JSON.stringify(current)).catch(() => {});
}

export async function resetSettings() {
  current = DEFAULT_SETTINGS;
  emit();
  await SecureStore.deleteItemAsync(STORE_KEY).catch(() => {});
}

export function getSettings(): Settings {
  return current;
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

export function useFocusColor(): string {
  const { focusColor } = useSettings();
  return { White: focusColors.white, Green: focusColors.green, Orange: focusColors.orange }[focusColor];
}
