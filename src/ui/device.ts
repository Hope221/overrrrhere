import { BatteryState, useBatteryLevel, useBatteryState } from 'expo-battery';
import { NetworkStateType, useNetworkState } from 'expo-network';
import { useEffect, useState, useSyncExternalStore } from 'react';

import Manette, { ConnectionEvent } from '../../modules/manette';
import { useSettings } from '../settings';

// État de l'iPhone affiché par l'interface : batterie, Wi-Fi, manette, heure.

export function useBattery() {
  const level = useBatteryLevel(); // 0 à 1, ou -1 si inconnu
  const state = useBatteryState();
  const charging = state === BatteryState.CHARGING || state === BatteryState.FULL;
  return {
    level: level < 0 ? 1 : level,
    percent: level < 0 ? null : Math.round(level * 100),
    charging,
    // Alerte du design : « Battery at 20% · Plug in to keep playing ».
    low: level >= 0 && level <= 0.2 && !charging,
  };
}

export function useWifi(): boolean {
  const network = useNetworkState();
  return network.type === NetworkStateType.WIFI && network.isConnected !== false;
}

// Internet disponible ? (mise à jour du 29/09 : seules les fonctions Xbox en ont besoin.)
// Tant que l'iPhone ne sait pas encore (valeur inconnue), on considère qu'on est en ligne.
export function useOnline(): boolean {
  const network = useNetworkState();
  return network.isConnected !== false && network.isInternetReachable !== false;
}

// État de la manette, suivi une seule fois pour toute l'app.
// getController() peut répondre « non connectée » à tort (appel hors du fil principal d'iOS) :
// tout bouton ou stick reçu prouve qu'une manette est connectée.
let controller: ConnectionEvent = Manette.getController();
const controllerListeners = new Set<() => void>();

function setController(next: ConnectionEvent) {
  if (next.connected === controller.connected && next.name === controller.name) return;
  controller = next;
  controllerListeners.forEach((listener) => listener());
}

Manette.addListener('onConnectionChange', setController);
Manette.addListener('onButton', () => !controller.connected && setController({ connected: true, name: controller.name }));
Manette.addListener('onStick', () => !controller.connected && setController({ connected: true, name: controller.name }));

export function useController(): ConnectionEvent {
  return useSyncExternalStore(
    (listener) => {
      controllerListeners.add(listener);
      return () => controllerListeners.delete(listener);
    },
    () => controller,
  );
}

// Heure au format du design (« 21:04 », ou « 9:04 PM » si « 24-hour clock » est désactivé).
export function useClock(): string {
  const { clock24 } = useSettings();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const minutes = String(now.getMinutes()).padStart(2, '0');
  if (clock24) return `${now.getHours()}:${minutes}`;
  return `${now.getHours() % 12 || 12}:${minutes} ${now.getHours() < 12 ? 'AM' : 'PM'}`;
}
