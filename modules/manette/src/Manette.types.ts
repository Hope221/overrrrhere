// Mêmes noms que l'écran « Test buttons » du design.
export type ManetteButton =
  | 'A' | 'B' | 'X' | 'Y'
  | 'LB' | 'RB' | 'LT' | 'RT'
  | 'Up' | 'Down' | 'Left' | 'Right'
  | 'LS' | 'RS'
  | 'Menu' | 'View';

export type ConnectionEvent = {
  connected: boolean;
  name: string;
};

export type ButtonEvent = {
  button: ManetteButton;
  pressed: boolean;
  value: number; // 0 à 1 (utile pour les gâchettes)
};

export type StickEvent = {
  stick: 'LS' | 'RS';
  x: number; // -1 (gauche) à 1 (droite)
  y: number; // -1 (bas) à 1 (haut)
};

export type TriggerEvent = {
  trigger: 'LT' | 'RT';
  value: number; // 0 (relâchée) à 1 (enfoncée à fond)
};

export type ManetteModuleEvents = {
  onConnectionChange: (event: ConnectionEvent) => void;
  onButton: (event: ButtonEvent) => void;
  onStick: (event: StickEvent) => void;
  onTrigger: (event: TriggerEvent) => void;
};
