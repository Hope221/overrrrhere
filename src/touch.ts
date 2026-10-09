import { useSyncExternalStore } from 'react';

import { TouchControls, useSettings } from './settings';
import { useController } from './ui/device';

// Contrôles tactiles pendant le stream (TouchStream.dc.html) : affichés ou non.
// Réglage mémorisé (Settings > Controller) : Auto / Always / Off.
// Menu du stream (Stream.dc.html) : Auto / On / Off, pour la partie en cours seulement.
// Auto = affichés sans manette, masqués dès qu'une manette se connecte.

export type TouchMode = 'Auto' | 'On' | 'Off';

const FROM_SETTING: Record<TouchControls, TouchMode> = { Auto: 'Auto', Always: 'On', Off: 'Off' };

let sessionMode: TouchMode | null = null; // choix du menu du stream, oublié en quittant le stream
const listeners = new Set<() => void>();

export function setSessionTouchMode(mode: TouchMode | null) {
  sessionMode = mode;
  listeners.forEach((listener) => listener());
}

export function useTouchMode(): TouchMode {
  const { touchControls } = useSettings();
  const session = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => sessionMode,
  );
  return session ?? FROM_SETTING[touchControls];
}

export function useTouchControlsVisible(): boolean {
  const mode = useTouchMode();
  const controller = useController();
  return mode === 'On' || (mode === 'Auto' && !controller.connected);
}
