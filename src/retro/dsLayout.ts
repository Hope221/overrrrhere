import { Box } from '../ui/touchLayout';
import { SystemId } from './systems';

// Places des deux écrans de la DS (design/ecrans/DSSideBySide, DSStacked, DSFocus.dc.html, notes dans LISEZMOI.md)
// et de la 3DS (maquettes 3DS validées par Elhadji le 26/09/2026 : mêmes dispositions, écrans de tailles différentes,
// 400 × 240 en haut et 320 × 240 en bas).
// Côte à côte : par défaut avec la manette. Empilés : par défaut sans manette (contrôles tactiles sur les côtés).
// Focus : un grand écran et un petit, au choix dans le menu du jeu. « Swap screens » (clic du stick droit)
// échange les deux écrans : l'écran tactile (celui du bas) passe à la place de l'autre.
// Mesures de la maquette (852 × 393), agrandies ou réduites d'un même facteur et centrées sur les autres iPhone.

export type DsLayout = 'Side by side' | 'Stacked' | 'Focus';
export const DS_LAYOUTS: DsLayout[] = ['Side by side', 'Stacked', 'Focus'];

export type DualSystem = 'nds' | '3ds';
export function isDualScreen(system: SystemId): system is DualSystem {
  return system === 'nds' || system === '3ds';
}

const REF = { width: 852, height: 393 };

type Point = { x: number; y: number };
// Écran du haut, écran du bas ; focus : bouton « Swap screens » et rappel de boutons sous le petit écran.
type Places = { top: Box; bottom: Box; swap?: Point; hint?: Point };
type Spec = { normal: Places; swapped: Places; radius: number; hintsY: number };

// DS : deux écrans de même taille, qui échangent simplement leurs places.
function exchange(first: Box, second: Box, extra: Omit<Places, 'top' | 'bottom'> = {}): Pick<Spec, 'normal' | 'swapped'> {
  return { normal: { top: first, bottom: second, ...extra }, swapped: { top: second, bottom: first, ...extra } };
}

const DS: Record<DsLayout, Spec> = {
  'Side by side': { ...exchange({ x: 56, y: 60, w: 364, h: 273 }, { x: 432, y: 60, w: 364, h: 273 }), radius: 6, hintsY: 348 },
  Stacked: { ...exchange({ x: 302, y: 8, w: 248, h: 186 }, { x: 302, y: 200, w: 248, h: 186 }), radius: 5, hintsY: 348 },
  Focus: {
    ...exchange({ x: 56, y: 16, w: 480, h: 360 }, { x: 556, y: 16, w: 240, h: 180 }, { swap: { x: 556, y: 208 }, hint: { x: 556, y: 356 } }),
    radius: 6,
    hintsY: 348,
  },
};

// 3DS : chaque écran garde ses proportions (5:3 en haut, 4:3 en bas) ; échangés, ils changent de taille.
const N3DS: Record<DsLayout, Spec> = {
  // Taille réelle (× 1) : 400 + 12 + 320 = 732 sur les 740 entre les marges.
  'Side by side': {
    normal: { top: { x: 60, y: 64, w: 400, h: 240 }, bottom: { x: 472, y: 64, w: 320, h: 240 } },
    swapped: { top: { x: 392, y: 64, w: 400, h: 240 }, bottom: { x: 60, y: 64, w: 320, h: 240 } },
    radius: 6,
    hintsY: 340,
  },
  // Comme une vraie 3DS : écran du haut au-dessus de celui du bas, centrés.
  Stacked: {
    normal: { top: { x: 271, y: 8, w: 310, h: 186 }, bottom: { x: 302, y: 200, w: 248, h: 186 } },
    swapped: { top: { x: 271, y: 200, w: 310, h: 186 }, bottom: { x: 302, y: 8, w: 248, h: 186 } },
    radius: 5,
    hintsY: 340,
  },
  Focus: {
    normal: {
      top: { x: 56, y: 16, w: 540, h: 324 },
      bottom: { x: 608, y: 16, w: 188, h: 141 },
      swap: { x: 608, y: 169 },
      hint: { x: 608, y: 356 },
    },
    swapped: {
      top: { x: 500, y: 16, w: 296, h: 178 },
      bottom: { x: 56, y: 16, w: 432, h: 324 },
      swap: { x: 500, y: 206 },
      hint: { x: 500, y: 356 },
    },
    radius: 6,
    hintsY: 340,
  },
};

// 3DS, focus avec les contrôles tactiles (ThreeDSFocus.dc.html) : grand écran en haut au centre, petit écran dessous
// (le toucher l'agrandit : « Enlarge »), boutons sur les côtés.
const N3DS_FOCUS_TOUCH: Spec = {
  normal: { top: { x: 211, y: 10, w: 430, h: 258 }, bottom: { x: 366, y: 278, w: 120, h: 90 } },
  swapped: { top: { x: 351, y: 278, w: 150, h: 90 }, bottom: { x: 254, y: 10, w: 344, h: 258 } },
  radius: 6,
  hintsY: 340,
};

export type DsScreens = {
  top: Box;
  bottom: Box; // écran tactile
  radius: number;
  scale: number; // facteur appliqué aux mesures de la maquette
  toPoint: (x: number, y: number) => { x: number; y: number }; // point de la maquette → point de l'écran
  hints: Point; // côte à côte : rappels de boutons sous les écrans (740 de large, depuis la marge gauche)
  swap: Point; // focus : bouton « Swap screens »
  focusHint: Point; // focus : rappel « View + Menu · Game menu »
  touchFocus: boolean; // 3DS, focus avec les contrôles tactiles : petit écran sous le grand (ThreeDSFocus.dc.html)
};

export function dsScreens(
  system: DualSystem,
  layout: DsLayout,
  swapped: boolean,
  width: number,
  height: number,
  touchControls: boolean,
): DsScreens {
  const scale = Math.min(width / REF.width, height / REF.height);
  const left = (width - REF.width * scale) / 2;
  const top = (height - REF.height * scale) / 2;
  const toPoint = (x: number, y: number) => ({ x: left + x * scale, y: top + y * scale });
  const fit = (b: Box): Box => ({ ...toPoint(b.x, b.y), w: b.w * scale, h: b.h * scale });
  const touchFocus = system === '3ds' && layout === 'Focus' && touchControls;
  const spec = touchFocus ? N3DS_FOCUS_TOUCH : (system === '3ds' ? N3DS : DS)[layout];
  const places = swapped ? spec.swapped : spec.normal;
  const focus = (system === '3ds' ? N3DS : DS).Focus[swapped ? 'swapped' : 'normal'];
  return {
    top: fit(places.top),
    bottom: fit(places.bottom),
    radius: spec.radius * scale,
    scale,
    toPoint,
    hints: toPoint(56, spec.hintsY),
    swap: toPoint(focus.swap!.x, focus.swap!.y),
    focusHint: toPoint(focus.hint!.x, focus.hint!.y),
    touchFocus,
  };
}

// Prop dualScreen du module natif : écran du haut, écran du bas, arrondi.
export function dualScreenProp(s: DsScreens): number[] {
  return [s.top.x, s.top.y, s.top.w, s.top.h, s.bottom.x, s.bottom.y, s.bottom.w, s.bottom.h, s.radius];
}

// Place du doigt sur l'écran tactile, de 0 à 1 ; null s'il est en dehors.
export function touchScreenPoint(px: number, py: number, screen: Box): { x: number; y: number } | null {
  const x = (px - screen.x) / screen.w;
  const y = (py - screen.y) / screen.h;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}
