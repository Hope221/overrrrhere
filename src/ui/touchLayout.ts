// Calculs communs aux contrôles tactiles (TouchStream, TouchRetro) : positions de la maquette (852 × 393)
// ancrées au bord le plus proche pour s'adapter aux autres iPhone, zone d'appui, croix à 8 directions.

export type DpadDirection = 'Up' | 'Down' | 'Left' | 'Right';
export type Anchor = 'start' | 'center' | 'end';
export type Box = { x: number; y: number; w: number; h: number };
export type Placed = { box: Box; h: Anchor; v: Anchor };

const REF = { width: 852, height: 393 };

export const HIT_MARGIN = 12; // pt autour d'un bouton qui comptent encore comme un appui
const DPAD_DEAD_ZONE = 8; // pt au centre de la croix sans direction

export function place({ box, h, v }: Placed, width: number, height: number): Box {
  const x = h === 'start' ? box.x : h === 'end' ? width - (REF.width - box.x) : width / 2 + (box.x - REF.width / 2);
  const y = v === 'start' ? box.y : v === 'end' ? height - (REF.height - box.y) : height / 2 + (box.y - REF.height / 2);
  return { x, y, w: box.w, h: box.h };
}

export function distanceToBox(px: number, py: number, b: Box) {
  const dx = Math.max(b.x - px, 0, px - (b.x + b.w));
  const dy = Math.max(b.y - py, 0, py - (b.y + b.h));
  return Math.hypot(dx, dy);
}

export function center(b: Box) {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export function rectStyle(b: Box) {
  return { left: b.x, top: b.y, width: b.w, height: b.h };
}

// Sticks : un doigt posé jusqu'à 1,35 × le rayon du stick le saisit, puis le stick suit le doigt
// jusqu'au bord du cercle. Valeurs de -1 à 1, bas = +1.
export type Vector = { x: number; y: number };
const STICK_REACH = 1.35;

export function inStickReach(px: number, py: number, b: Box) {
  const c = center(b);
  return Math.hypot(px - c.x, py - c.y) <= (b.w / 2) * STICK_REACH;
}

export function stickVector(px: number, py: number, b: Box): Vector {
  const c = center(b);
  const radius = b.w / 2;
  let x = (px - c.x) / radius;
  let y = (py - c.y) / radius;
  const length = Math.hypot(x, y);
  if (length > 1) {
    x /= length;
    y /= length;
  }
  return { x, y };
}

// Croix : 8 directions (les diagonales appuient deux flèches).
const SECTORS: DpadDirection[][] = [['Right'], ['Right', 'Down'], ['Down'], ['Left', 'Down'], ['Left'], ['Left', 'Up'], ['Up'], ['Right', 'Up']];
export function dpadDirections(dx: number, dy: number): DpadDirection[] {
  if (Math.hypot(dx, dy) < DPAD_DEAD_ZONE) return [];
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return SECTORS[(sector + 8) % 8];
}
