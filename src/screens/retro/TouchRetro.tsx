import { useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import Retro from '../../../modules/retro';
import { tapFeedback } from '../../feedback';
import { touchScreenPoint } from '../../retro/dsLayout';
import { SystemId } from '../../retro/systems';
import type { WiiProfile } from '../../retro/wii';
import { useSettings } from '../../settings';
import { Logo } from '../../ui/icons';
import { colors, fonts } from '../../ui/theme';
import { TouchStickView } from '../../ui/TouchStickView';
import {
  Box,
  DpadDirection,
  HIT_MARGIN,
  Placed,
  Vector,
  center,
  distanceToBox,
  dpadDirections,
  inStickReach,
  place,
  rectStyle,
  stickVector,
} from '../../ui/touchLayout';

// Contrôles tactiles rétro (design/ecrans/TouchRetro.dc.html) : disposition selon le système.
// La maquette montre la SNES ; les autres gardent ses positions, avec seulement leurs boutons.
// L'image du jeu rétrécit (prop touchControls de RetroView) pour laisser les bandes latérales aux boutons.
// Les boutons appuyés partent au module natif (Retro.setTouchButtons), qui les ajoute à la manette.
// Comme pour le stream, un seul calque reçoit tous les doigts (multi-touch).
// N64 (pas de maquette, disposition validée par Elhadji le 26/09/2026) : stick analogique à la place de la croix,
// boutons C (stick droit du core, Retro.setTouchSticks), Z = L2.
// DS (DSStacked.dc.html) : ses propres places, pastille à gauche à côté de L ; le doigt posé sur l'écran tactile
// de la DS (touchScreen) part au jeu (Retro.setTouchScreen), en même temps que les boutons.
// 3DS (maquette « Empilés + contrôles tactiles » validée par Elhadji le 26/09/2026) : comme la DS, plus ZL / ZR,
// le Circle Pad (stick gauche) au-dessus de la croix et le petit stick C (stick droit) en bas à droite.
// GameCube (design/ecrans/GameCube.html) : comme la manette d'origine, stick principal au-dessus d'une petite croix,
// grand A entouré de B, X et Y, stick C en bas à droite, Z sous R. Le module natif les passe à Dolphin
// (GameCubeSession.send) : A, B, X, Y par la lettre ; L et R = gâchettes à fond ; R2 libretro = Z.

type CKey = 'CUp' | 'CDown' | 'CLeft' | 'CRight';
type RetroKey = 'A' | 'B' | 'X' | 'Y' | 'L' | 'R' | 'L2' | 'R2' | 'Select' | 'Start' | CKey;

// Numéros des boutons de la manette libretro (RETRO_DEVICE_ID_JOYPAD_*).
const BITS: Record<Exclude<RetroKey, CKey> | DpadDirection, number> = {
  B: 0,
  Y: 1,
  Select: 2,
  Start: 3,
  Up: 4,
  Down: 5,
  Left: 6,
  Right: 7,
  A: 8,
  X: 9,
  L: 10,
  R: 11,
  L2: 12,
  R2: 13,
};

// Boutons C du N64 : Mupen64Plus-Next les lit sur le stick droit (bas = +1).
const C_DIRECTIONS: Record<CKey, Vector> = { CUp: { x: 0, y: -1 }, CDown: { x: 0, y: 1 }, CLeft: { x: -1, y: 0 }, CRight: { x: 1, y: 0 } };
const isCKey = (key: RetroKey): key is CKey => key in C_DIRECTIONS;

type Arrow = 'up' | 'down' | 'left' | 'right';
type KeyDef = Placed & { key: RetroKey; label: string; radius: number; fontSize: number; letterSpacing?: number; arrow?: Arrow };

// SNES : boutons placés comme sur la manette d'origine (X en haut, Y à gauche, A à droite, B en bas).
const SNES: KeyDef[] = [
  { key: 'L', label: 'L', box: { x: 56, y: 12, w: 72, h: 30 }, h: 'start', v: 'start', radius: 10, fontSize: 13 },
  { key: 'R', label: 'R', box: { x: 724, y: 12, w: 72, h: 30 }, h: 'end', v: 'start', radius: 10, fontSize: 13 },
  { key: 'X', label: 'X', box: { x: 710, y: 130, w: 42, h: 42 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
  { key: 'Y', label: 'Y', box: { x: 668, y: 172, w: 42, h: 42 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
  { key: 'A', label: 'A', box: { x: 752, y: 172, w: 42, h: 42 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
  { key: 'B', label: 'B', box: { x: 710, y: 214, w: 42, h: 42 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
  { key: 'Select', label: 'SELECT', box: { x: 72, y: 324, w: 70, h: 28 }, h: 'start', v: 'end', radius: 999, fontSize: 10, letterSpacing: 0.6 },
  { key: 'Start', label: 'START', box: { x: 710, y: 324, w: 70, h: 28 }, h: 'end', v: 'end', radius: 999, fontSize: 10, letterSpacing: 0.6 },
];

// NES, Game Boy / Color : A et B en diagonale (places A et B de la SNES), Select et Start.
const GAME_BOY = SNES.filter((k) => ['A', 'B', 'Select', 'Start'].includes(k.key));
// GBA : la même chose, plus L et R.
const GBA = SNES.filter((k) => k.key !== 'X' && k.key !== 'Y');

// Mega Drive (manette 3 boutons) : A, B, C en ligne montante comme sur la manette d'origine, et Start.
// Genesis Plus GX lit A sur le bouton Y libretro, B sur B, C sur A.
const MEGA_DRIVE: KeyDef[] = [
  { key: 'Y', label: 'A', box: { x: 654, y: 196, w: 42, h: 42 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
  { key: 'B', label: 'B', box: { x: 703, y: 182, w: 42, h: 42 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
  { key: 'A', label: 'C', box: { x: 752, y: 168, w: 42, h: 42 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
  ...SNES.filter((k) => k.key === 'Start'),
];

// N64 : comme la manette d'origine. À gauche L, Z juste dessous (pressé par la main qui tient le stick), le stick ;
// à droite R, les quatre boutons C en losange, B en haut à gauche de A (plus grand), Start en bas.
// Mupen64Plus-Next lit A N64 sur B libretro et B N64 sur Y (comme la manette physique, RetroView.readPad).
const C_BUTTON = { w: 30, h: 30 };
const N64: KeyDef[] = [
  { key: 'L', label: 'L', box: { x: 56, y: 12, w: 72, h: 30 }, h: 'start', v: 'start', radius: 10, fontSize: 13 },
  { key: 'L2', label: 'Z', box: { x: 56, y: 50, w: 72, h: 30 }, h: 'start', v: 'start', radius: 10, fontSize: 13 },
  { key: 'R', label: 'R', box: { x: 724, y: 12, w: 72, h: 30 }, h: 'end', v: 'start', radius: 10, fontSize: 13 },
  { key: 'CUp', label: 'C', arrow: 'up', box: { x: 731, y: 62, ...C_BUTTON }, h: 'end', v: 'center', radius: 999, fontSize: 11 },
  { key: 'CLeft', label: 'C', arrow: 'left', box: { x: 698, y: 95, ...C_BUTTON }, h: 'end', v: 'center', radius: 999, fontSize: 11 },
  { key: 'CRight', label: 'C', arrow: 'right', box: { x: 764, y: 95, ...C_BUTTON }, h: 'end', v: 'center', radius: 999, fontSize: 11 },
  { key: 'CDown', label: 'C', arrow: 'down', box: { x: 731, y: 128, ...C_BUTTON }, h: 'end', v: 'center', radius: 999, fontSize: 11 },
  { key: 'Y', label: 'B', box: { x: 672, y: 176, w: 42, h: 42 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
  { key: 'B', label: 'A', box: { x: 724, y: 200, w: 48, h: 48 }, h: 'end', v: 'center', radius: 999, fontSize: 15 },
  ...SNES.filter((k) => k.key === 'Start'),
];

// DS (DSStacked.dc.html) : comme la SNES (X en haut, Y à gauche, A à droite, B en bas), boutons un peu plus grands.
// melonDS DS lit chaque bouton sur le bouton libretro du même nom.
const DS: KeyDef[] = [
  { key: 'L', label: 'L', box: { x: 56, y: 12, w: 72, h: 30 }, h: 'start', v: 'start', radius: 10, fontSize: 13 },
  { key: 'R', label: 'R', box: { x: 724, y: 12, w: 72, h: 30 }, h: 'end', v: 'start', radius: 10, fontSize: 13 },
  { key: 'X', label: 'X', box: { x: 654, y: 128, w: 46, h: 46 }, h: 'end', v: 'center', radius: 999, fontSize: 15 },
  { key: 'Y', label: 'Y', box: { x: 606, y: 174, w: 46, h: 46 }, h: 'end', v: 'center', radius: 999, fontSize: 15 },
  { key: 'A', label: 'A', box: { x: 702, y: 174, w: 46, h: 46 }, h: 'end', v: 'center', radius: 999, fontSize: 15 },
  { key: 'B', label: 'B', box: { x: 654, y: 220, w: 46, h: 46 }, h: 'end', v: 'center', radius: 999, fontSize: 15 },
  { key: 'Select', label: 'SELECT', box: { x: 142, y: 330, w: 72, h: 28 }, h: 'start', v: 'end', radius: 999, fontSize: 10, letterSpacing: 0.6 },
  { key: 'Start', label: 'START', box: { x: 640, y: 330, w: 72, h: 28 }, h: 'end', v: 'end', radius: 999, fontSize: 10, letterSpacing: 0.6 },
];

// 3DS : A B X Y en losange comme la DS (Azahar lit chaque bouton sur le bouton libretro du même nom),
// ZL et ZR sous L et R (L2 et R2 libretro).
const N3DS: KeyDef[] = [
  { key: 'L', label: 'L', box: { x: 56, y: 12, w: 72, h: 30 }, h: 'start', v: 'start', radius: 10, fontSize: 13 },
  { key: 'L2', label: 'ZL', box: { x: 56, y: 50, w: 72, h: 30 }, h: 'start', v: 'start', radius: 10, fontSize: 13 },
  { key: 'R', label: 'R', box: { x: 724, y: 12, w: 72, h: 30 }, h: 'end', v: 'start', radius: 10, fontSize: 13 },
  { key: 'R2', label: 'ZR', box: { x: 724, y: 50, w: 72, h: 30 }, h: 'end', v: 'start', radius: 10, fontSize: 13 },
  { key: 'X', label: 'X', box: { x: 667, y: 86, w: 46, h: 46 }, h: 'end', v: 'center', radius: 999, fontSize: 15 },
  { key: 'Y', label: 'Y', box: { x: 619, y: 134, w: 46, h: 46 }, h: 'end', v: 'center', radius: 999, fontSize: 15 },
  { key: 'A', label: 'A', box: { x: 715, y: 134, w: 46, h: 46 }, h: 'end', v: 'center', radius: 999, fontSize: 15 },
  { key: 'B', label: 'B', box: { x: 667, y: 182, w: 46, h: 46 }, h: 'end', v: 'center', radius: 999, fontSize: 15 },
  { key: 'Select', label: 'SELECT', box: { x: 122, y: 334, w: 72, h: 28 }, h: 'start', v: 'end', radius: 999, fontSize: 10, letterSpacing: 0.6 },
  { key: 'Start', label: 'START', box: { x: 652, y: 334, w: 72, h: 28 }, h: 'end', v: 'end', radius: 999, fontSize: 10, letterSpacing: 0.6 },
];

// 3DS, focus (ThreeDSFocus.dc.html) : les boutons de la 3DS autour du grand écran, ZL / ZR plus petits,
// SELECT plus à gauche (la pastille du menu passe en bas à gauche).
const N3DS_FOCUS: KeyDef[] = [
  { key: 'L', label: 'L', box: { x: 56, y: 10, w: 72, h: 28 }, h: 'start', v: 'start', radius: 10, fontSize: 13 },
  { key: 'L2', label: 'ZL', box: { x: 56, y: 44, w: 72, h: 26 }, h: 'start', v: 'start', radius: 10, fontSize: 11 },
  { key: 'R', label: 'R', box: { x: 724, y: 10, w: 72, h: 28 }, h: 'end', v: 'start', radius: 10, fontSize: 13 },
  { key: 'R2', label: 'ZR', box: { x: 724, y: 44, w: 72, h: 26 }, h: 'end', v: 'start', radius: 10, fontSize: 11 },
  { key: 'X', label: 'X', box: { x: 697, y: 98, w: 42, h: 42 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
  { key: 'Y', label: 'Y', box: { x: 653, y: 142, w: 42, h: 42 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
  { key: 'A', label: 'A', box: { x: 741, y: 142, w: 42, h: 42 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
  { key: 'B', label: 'B', box: { x: 697, y: 186, w: 42, h: 42 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
  { key: 'Select', label: 'SELECT', box: { x: 140, y: 337, w: 64, h: 28 }, h: 'start', v: 'end', radius: 999, fontSize: 9, letterSpacing: 0.5 },
  { key: 'Start', label: 'START', box: { x: 724, y: 337, w: 72, h: 28 }, h: 'end', v: 'end', radius: 999, fontSize: 10, letterSpacing: 0.6 },
];

// GameCube : A plus grand au centre des boutons (comme la manette), B en bas à gauche, X à droite, Y au-dessus.
const GAMECUBE: KeyDef[] = [
  { key: 'L', label: 'L', box: { x: 56, y: 12, w: 72, h: 30 }, h: 'start', v: 'start', radius: 10, fontSize: 13 },
  { key: 'R', label: 'R', box: { x: 724, y: 12, w: 72, h: 30 }, h: 'end', v: 'start', radius: 10, fontSize: 13 },
  { key: 'R2', label: 'Z', box: { x: 724, y: 50, w: 72, h: 30 }, h: 'end', v: 'start', radius: 10, fontSize: 13 },
  { key: 'Y', label: 'Y', box: { x: 697, y: 99, w: 38, h: 38 }, h: 'end', v: 'center', radius: 999, fontSize: 13 },
  { key: 'X', label: 'X', box: { x: 758, y: 141, w: 38, h: 38 }, h: 'end', v: 'center', radius: 999, fontSize: 13 },
  { key: 'A', label: 'A', box: { x: 703, y: 153, w: 54, h: 54 }, h: 'end', v: 'center', radius: 999, fontSize: 17 },
  { key: 'B', label: 'B', box: { x: 669, y: 195, w: 38, h: 38 }, h: 'end', v: 'center', radius: 999, fontSize: 13 },
  { key: 'Start', label: 'START', box: { x: 710, y: 330, w: 70, h: 28 }, h: 'end', v: 'end', radius: 999, fontSize: 10, letterSpacing: 0.6 },
];

// La PSP a sa propre maquette et son propre composant (TouchPSP).
export type TouchRetroSystem = Exclude<SystemId, 'psp'>;
const LAYOUTS: Record<TouchRetroSystem, KeyDef[]> = {
  snes: SNES,
  nes: GAME_BOY,
  gb: GAME_BOY,
  gbc: GAME_BOY,
  gba: GBA,
  md: MEGA_DRIVE,
  n64: N64,
  nds: DS,
  '3ds': N3DS,
  gc: GAMECUBE,
  wii: GAMECUBE, // remplacé par la disposition du profil de commandes (WII_LAYOUTS)
};
// Systèmes à stick analogique : le stick remplace la croix (même taille que le stick gauche du stream).
const ANALOG: TouchRetroSystem[] = ['n64'];

const DPAD: Placed = { box: { x: 70, y: 146, w: 102, h: 102 }, h: 'start', v: 'center' };
const STICK: Placed = { box: { x: 66, y: 141, w: 112, h: 112 }, h: 'start', v: 'center' };
const KNOB = 50;
const PILL: Placed = { box: { x: 380, y: 22, w: 92, h: 30 }, h: 'center', v: 'start' };
// DS : croix plus à droite, pastille à gauche (l'écran du haut occupe le milieu).
const DS_DPAD: Placed = { box: { x: 126, y: 146, w: 102, h: 102 }, h: 'start', v: 'center' };
const DS_PILL: Placed = { box: { x: 136, y: 12, w: 76, h: 30 }, h: 'start', v: 'start' };
// 3DS : Circle Pad au-dessus de la croix (plus petite), pastille un peu plus à droite (ZL occupe le dessous de L),
// stick C en bas à droite des boutons.
const N3DS_STICK: Placed = { box: { x: 108, y: 94, w: 100, h: 100 }, h: 'start', v: 'center' };
const N3DS_DPAD: Placed = { box: { x: 110, y: 218, w: 96, h: 96 }, h: 'start', v: 'center' };
const N3DS_PILL: Placed = { box: { x: 140, y: 12, w: 76, h: 30 }, h: 'start', v: 'start' };
const N3DS_CSTICK: Placed = { box: { x: 728, y: 240, w: 52, h: 52 }, h: 'end', v: 'center' };
const C_KNOB = 23;
// 3DS, focus (ThreeDSFocus.dc.html) : Circle Pad au-dessus de la croix, petit stick C sous les boutons,
// pastille du menu en bas à gauche.
const N3DS_FOCUS_STICK: Placed = { box: { x: 87, y: 112, w: 92, h: 92 }, h: 'start', v: 'center' };
const N3DS_FOCUS_DPAD: Placed = { box: { x: 88, y: 222, w: 90, h: 90 }, h: 'start', v: 'center' };
const N3DS_FOCUS_CSTICK: Placed = { box: { x: 700, y: 250, w: 36, h: 36 }, h: 'end', v: 'center' };
const N3DS_FOCUS_PILL: Placed = { box: { x: 56, y: 336, w: 76, h: 30 }, h: 'start', v: 'end' };
// GameCube : stick principal au-dessus d'une petite croix, stick C sous les boutons, pastille au centre (comme la SNES).
const GC_STICK: Placed = { box: { x: 70, y: 98, w: 104, h: 104 }, h: 'start', v: 'center' };
const GC_DPAD: Placed = { box: { x: 80, y: 238, w: 84, h: 84 }, h: 'start', v: 'center' };
const GC_CSTICK: Placed = { box: { x: 724, y: 244, w: 56, h: 56 }, h: 'end', v: 'center' };
const GC_C_KNOB = 25;

// Wii (maquette « Wii · contrôles tactiles », validée le 06/10/2026) : une disposition par profil de commandes,
// image 480 × 270 au centre ; profils à pointeur : toucher l'image vise (touchScreen). Pas de bouton Home.
// Boutons libretro lus par GameCubeSession : Remote + Nunchuk : A, B, X = 1, Y = 2, L = C, R2 = Z, L2 = SHAKE ;
// Sideways : A = 2, B = 1, L2 = SHAKE ; Classic : A = b, B = a, X = y, Y = x (même règle que la manette),
// L, R, L2 = ZL, R2 = ZR ; GameCube : comme la GameCube. Partout Select = −, Start = +.
type WiiLayout = {
  keys: KeyDef[];
  dpad: Placed;
  stick?: Placed;
  stickLabel?: string;
  cstick?: Placed;
  cKnob?: number;
  cLabel?: string;
};

const MINUS_PLUS = { radius: 999, fontSize: 15 };

const WII_LAYOUTS: Record<WiiProfile, WiiLayout> = {
  'Remote + Nunchuk': {
    keys: [
      { key: 'R2', label: 'Z', box: { x: 56, y: 12, w: 72, h: 30 }, h: 'start', v: 'start', radius: 10, fontSize: 13 },
      { key: 'L', label: 'C', box: { x: 74, y: 50, w: 36, h: 36 }, h: 'start', v: 'start', radius: 999, fontSize: 13 },
      { key: 'B', label: 'B', box: { x: 724, y: 12, w: 72, h: 30 }, h: 'end', v: 'start', radius: 10, fontSize: 13 },
      { key: 'L2', label: 'SHAKE', box: { x: 724, y: 50, w: 72, h: 30 }, h: 'end', v: 'start', radius: 10, fontSize: 10, letterSpacing: 0.6 },
      { key: 'A', label: 'A', box: { x: 704, y: 100, w: 56, h: 56 }, h: 'end', v: 'center', radius: 999, fontSize: 18 },
      { key: 'Select', label: '−', box: { x: 686, y: 172, w: 36, h: 26 }, h: 'end', v: 'center', ...MINUS_PLUS },
      { key: 'Start', label: '+', box: { x: 742, y: 172, w: 36, h: 26 }, h: 'end', v: 'center', ...MINUS_PLUS },
      { key: 'X', label: '1', box: { x: 713, y: 214, w: 38, h: 38 }, h: 'end', v: 'center', radius: 999, fontSize: 13 },
      { key: 'Y', label: '2', box: { x: 713, y: 262, w: 38, h: 38 }, h: 'end', v: 'center', radius: 999, fontSize: 13 },
    ],
    stick: { box: { x: 70, y: 104, w: 104, h: 104 }, h: 'start', v: 'center' },
    stickLabel: 'NUNCHUK',
    dpad: { box: { x: 80, y: 246, w: 84, h: 84 }, h: 'start', v: 'center' },
  },
  'Sideways Remote': {
    keys: [
      { key: 'L2', label: 'SHAKE', box: { x: 724, y: 12, w: 72, h: 30 }, h: 'end', v: 'start', radius: 10, fontSize: 10, letterSpacing: 0.6 },
      { key: 'B', label: '1', box: { x: 680, y: 186, w: 54, h: 54 }, h: 'end', v: 'center', radius: 999, fontSize: 17 },
      { key: 'A', label: '2', box: { x: 742, y: 150, w: 54, h: 54 }, h: 'end', v: 'center', radius: 999, fontSize: 17 },
      { key: 'Select', label: '−', box: { x: 686, y: 330, w: 40, h: 28 }, h: 'end', v: 'end', ...MINUS_PLUS },
      { key: 'Start', label: '+', box: { x: 740, y: 330, w: 40, h: 28 }, h: 'end', v: 'end', ...MINUS_PLUS },
    ],
    dpad: { box: { x: 64, y: 136, w: 116, h: 116 }, h: 'start', v: 'center' },
  },
  'Classic Controller': {
    keys: [
      { key: 'L', label: 'L', box: { x: 56, y: 12, w: 72, h: 30 }, h: 'start', v: 'start', radius: 10, fontSize: 13 },
      { key: 'L2', label: 'ZL', box: { x: 56, y: 50, w: 72, h: 30 }, h: 'start', v: 'start', radius: 10, fontSize: 13 },
      { key: 'R', label: 'R', box: { x: 724, y: 12, w: 72, h: 30 }, h: 'end', v: 'start', radius: 10, fontSize: 13 },
      { key: 'R2', label: 'ZR', box: { x: 724, y: 50, w: 72, h: 30 }, h: 'end', v: 'start', radius: 10, fontSize: 13 },
      { key: 'Y', label: 'x', box: { x: 714, y: 92, w: 38, h: 38 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
      { key: 'X', label: 'y', box: { x: 672, y: 132, w: 38, h: 38 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
      { key: 'B', label: 'a', box: { x: 756, y: 132, w: 38, h: 38 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
      { key: 'A', label: 'b', box: { x: 714, y: 172, w: 38, h: 38 }, h: 'end', v: 'center', radius: 999, fontSize: 14 },
      { key: 'Select', label: '−', box: { x: 92, y: 336, w: 40, h: 28 }, h: 'start', v: 'end', ...MINUS_PLUS },
      { key: 'Start', label: '+', box: { x: 717, y: 336, w: 40, h: 28 }, h: 'end', v: 'end', ...MINUS_PLUS },
    ],
    dpad: { box: { x: 80, y: 100, w: 84, h: 84 }, h: 'start', v: 'center' },
    stick: { box: { x: 70, y: 204, w: 104, h: 104 }, h: 'start', v: 'center' },
    cstick: { box: { x: 705, y: 228, w: 64, h: 64 }, h: 'end', v: 'center' },
    cKnob: 29,
  },
  'GameCube Controller': {
    keys: GAMECUBE,
    dpad: GC_DPAD,
    stick: GC_STICK,
    cstick: GC_CSTICK,
    cKnob: GC_C_KNOB,
    cLabel: 'C',
  },
};

type Target = 'key' | 'dpad' | 'stick' | 'cstick' | 'menu' | 'screen' | 'enlarge';
type Pad = { keys: Set<RetroKey>; dpad: Set<DpadDirection>; stick: Vector; cstick: Vector };
const EMPTY: Pad = { keys: new Set(), dpad: new Set(), stick: { x: 0, y: 0 }, cstick: { x: 0, y: 0 } };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type Props = {
  system: TouchRetroSystem;
  onMenu: () => void; // pastille avec le logo : menu du jeu
  touchScreen?: Box; // DS, 3DS : place de l'écran tactile (celui du bas) ; Wii (profils à pointeur) : image du jeu
  wiiProfile?: WiiProfile | null; // Wii : profil de commandes en cours (disposition de la maquette)
  dsFocus?: boolean; // 3DS, focus : disposition de ThreeDSFocus.dc.html
  smallScreen?: Box; // 3DS, focus : le petit écran, que le doigt agrandit (onEnlarge)
  onEnlarge?: () => void;
};

export function TouchRetro({ system, onMenu, touchScreen, wiiProfile, dsFocus, smallScreen, onEnlarge }: Props) {
  const { touchOpacity } = useSettings();
  const { width, height } = useWindowDimensions();
  const [pad, setPad] = useState<Pad>(EMPTY);
  const sent = useRef(0); // boutons envoyés au module natif
  const sentSticks = useRef('0,0,0,0'); // sticks envoyés au module natif
  const sentScreen = useRef(''); // doigt sur l'écran de la DS envoyé au module natif
  const pressed = useRef(new Set<RetroKey>()); // boutons appuyés juste avant (vibration)
  const touches = useRef(new Map<string, Target>()); // doigt → commande saisie au moment de l'appui
  const latestMenu = useRef(onMenu);
  latestMenu.current = onMenu;
  const latestEnlarge = useRef(onEnlarge);
  latestEnlarge.current = onEnlarge;

  const ds = system === 'nds' || system === '3ds'; // deux écrans : écran tactile, relâché en quittant
  const n3ds = system === '3ds'; // Circle Pad ET croix, stick C
  const focus3ds = n3ds && !!dsFocus;
  const gc = system === 'gc'; // stick principal ET croix, stick C
  const wii = system === 'wii' ? WII_LAYOUTS[wiiProfile ?? 'Remote + Nunchuk'] : null;
  const analog = ANALOG.includes(system);
  const hasStick = wii ? !!wii.stick : analog || n3ds || gc;
  const hasCStick = wii ? !!wii.cstick : n3ds || gc;
  const keys = (wii?.keys ?? (focus3ds ? N3DS_FOCUS : LAYOUTS[system])).map((k) => ({ ...k, rect: place(k, width, height) }));
  const dpad = place(wii?.dpad ?? (gc ? GC_DPAD : focus3ds ? N3DS_FOCUS_DPAD : n3ds ? N3DS_DPAD : ds ? DS_DPAD : DPAD), width, height);
  const stick = place(wii?.stick ?? (gc ? GC_STICK : focus3ds ? N3DS_FOCUS_STICK : n3ds ? N3DS_STICK : STICK), width, height);
  const cstick = place(wii?.cstick ?? (gc ? GC_CSTICK : focus3ds ? N3DS_FOCUS_CSTICK : N3DS_CSTICK), width, height);
  const stickLabel = wii ? wii.stickLabel : n3ds && !focus3ds ? 'CIRCLE PAD' : undefined;
  const cLabel = wii ? wii.cLabel : 'C';
  const cKnob = wii?.cKnob ?? (gc ? GC_C_KNOB : focus3ds ? 16 : C_KNOB);
  const knob = focus3ds ? 48 : KNOB;
  const pill = place(focus3ds ? N3DS_FOCUS_PILL : n3ds ? N3DS_PILL : ds ? DS_PILL : PILL, width, height);
  const arm = dpad.w / 3; // largeur d'une branche de la croix

  function keyAt(px: number, py: number): RetroKey | null {
    let best: RetroKey | null = null;
    let bestDistance = HIT_MARGIN;
    for (const k of keys) {
      const d = distanceToBox(px, py, k.rect);
      if (d <= bestDistance) {
        best = k.key;
        bestDistance = d;
      }
    }
    return best;
  }

  function targetAt(px: number, py: number): Target | null {
    if (keyAt(px, py)) return 'key';
    if (distanceToBox(px, py, pill) <= 6) return 'menu';
    if (smallScreen && touchScreenPoint(px, py, smallScreen)) return 'enlarge';
    // Wii : l'image peut toucher les sticks, qui passent d'abord.
    const onStick = (hasStick && inStickReach(px, py, stick)) || (hasCStick && inStickReach(px, py, cstick));
    if (touchScreen && !(wii && onStick) && touchScreenPoint(px, py, touchScreen)) return 'screen';
    if (analog) return inStickReach(px, py, stick) ? 'stick' : null;
    if (hasStick && inStickReach(px, py, stick)) return 'stick';
    if (hasCStick && inStickReach(px, py, cstick)) return 'cstick';
    if (distanceToBox(px, py, dpad) <= HIT_MARGIN) return 'dpad';
    return null;
  }

  function emit(next: Pad) {
    let bits = 0;
    const c = { x: 0, y: 0 }; // boutons C : stick droit
    next.keys.forEach((k) => {
      if (isCKey(k)) {
        c.x += C_DIRECTIONS[k].x;
        c.y += C_DIRECTIONS[k].y;
      } else {
        bits |= 1 << BITS[k];
      }
    });
    next.dpad.forEach((d) => (bits |= 1 << BITS[d]));
    // Petite vibration à chaque nouvel appui (le stick n'en fait pas, comme dans le stream).
    if ([...next.keys].some((k) => !pressed.current.has(k)) || bits & ~sent.current) tapFeedback();
    pressed.current = next.keys;
    if (bits !== sent.current) {
      Retro.setTouchButtons(bits);
      sent.current = bits;
    }
    // Stick droit : stick C de la 3DS, de la GameCube et du Classic Controller, ou boutons C du N64.
    const sticks = analog ? [next.stick.x, next.stick.y, Math.sign(c.x), Math.sign(c.y)] : [next.stick.x, next.stick.y, next.cstick.x, next.cstick.y];
    const sticksKey = sticks.join(',');
    if (sticksKey !== sentSticks.current) {
      Retro.setTouchSticks(sticks[0], sticks[1], sticks[2], sticks[3]);
      sentSticks.current = sticksKey;
    }
    setPad(next);
  }

  function update(event: GestureResponderEvent, phase: 'start' | 'move' | 'end' | 'cancel') {
    const { touches: all, changedTouches } = event.nativeEvent;
    const ended = new Set(phase === 'end' ? changedTouches.map((t) => String(t.identifier)) : []);
    const active = phase === 'cancel' ? [] : all.filter((t) => !ended.has(String(t.identifier)));
    const ids = new Set(active.map((t) => String(t.identifier)));

    for (const id of [...touches.current.keys()]) if (!ids.has(id)) touches.current.delete(id);

    const next: Pad = { keys: new Set(), dpad: new Set(), stick: { x: 0, y: 0 }, cstick: { x: 0, y: 0 } };
    let screenPoint: { x: number; y: number } | null = null; // un seul doigt pour l'écran de la DS : le premier
    for (const t of active) {
      const id = String(t.identifier);
      let target = touches.current.get(id);
      if (!target) {
        const found = targetAt(t.pageX, t.pageY);
        if (!found) continue;
        target = found;
        touches.current.set(id, target);
        if (target === 'menu') {
          latestMenu.current();
          continue;
        }
        if (target === 'enlarge') {
          latestEnlarge.current?.();
          continue;
        }
      }
      if (target === 'key') {
        // Le doigt peut glisser d'un bouton à l'autre (B → A) sans se relever.
        const key = keyAt(t.pageX, t.pageY);
        if (key) next.keys.add(key);
      } else if (target === 'dpad') {
        const c = center(dpad);
        dpadDirections(t.pageX - c.x, t.pageY - c.y).forEach((d) => next.dpad.add(d));
      } else if (target === 'stick') {
        next.stick = stickVector(t.pageX, t.pageY, stick);
      } else if (target === 'cstick') {
        next.cstick = stickVector(t.pageX, t.pageY, cstick);
      } else if (target === 'screen' && touchScreen && !screenPoint) {
        // Le doigt qui glisse hors de l'écran reste à son bord (comme un stylet qui déborde).
        screenPoint = { x: clamp01((t.pageX - touchScreen.x) / touchScreen.w), y: clamp01((t.pageY - touchScreen.y) / touchScreen.h) };
      }
    }
    if (touchScreen) {
      const key = screenPoint ? `${screenPoint.x},${screenPoint.y}` : '';
      if (key !== sentScreen.current) {
        // Wii : le pointeur reste au dernier endroit touché.
        if (system === 'wii') {
          if (screenPoint) Retro.setWiiPointer(screenPoint.x, screenPoint.y);
        } else {
          Retro.setTouchScreen(screenPoint !== null, screenPoint?.x ?? 0, screenPoint?.y ?? 0);
        }
        sentScreen.current = key;
      }
    }
    emit(next);
  }

  // Contrôles masqués (manette connectée, menu ouvert, jeu quitté) : on relâche tout.
  useEffect(
    () => () => {
      Retro.setTouchButtons(0);
      Retro.setTouchSticks(0, 0, 0, 0);
      if (ds) Retro.setTouchScreen(false, 0, 0);
    },
    [ds],
  );

  const opacity = { Low: 0.5, Medium: 0.8, High: 1 }[touchOpacity];

  return (
    <View
      style={[StyleSheet.absoluteFill, { opacity }]}
      onTouchStart={(e) => update(e, 'start')}
      onTouchMove={(e) => update(e, 'move')}
      onTouchEnd={(e) => update(e, 'end')}
      onTouchCancel={(e) => update(e, 'cancel')}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[styles.pill, rectStyle(pill)]}>
          <Logo size={16} />
          <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M6 9l6 6 6-6" />
          </Svg>
        </View>

        {keys.map((k) => {
          const on = pad.keys.has(k.key);
          return (
            <View key={k.key} style={[styles.key, rectStyle(k.rect), { borderRadius: k.radius }, on && styles.keyOn]}>
              {k.arrow ? (
                <ArrowGlyph direction={k.arrow} color={on ? colors.ink : colors.white} />
              ) : (
                <Text style={[styles.keyText, { fontSize: k.fontSize, letterSpacing: k.letterSpacing ?? 0, color: on ? colors.ink : colors.white }]}>
                  {k.label}
                </Text>
              )}
            </View>
          );
        })}

        {hasStick && <TouchStickView rect={stick} knob={knob} knobColor="rgba(255,255,255,0.85)" value={pad.stick} />}
        {hasStick && stickLabel && (
          <Text style={[styles.stickLabel, { left: stick.x, top: stick.y + stick.h + 2, width: stick.w }]}>{stickLabel}</Text>
        )}
        {hasCStick && <TouchStickView rect={cstick} knob={cKnob} knobColor="rgba(255,255,255,0.85)" value={pad.cstick} />}
        {hasCStick && cLabel && (
          <Text style={[styles.stickLabel, { left: cstick.x, top: cstick.y + cstick.h + 2, width: cstick.w }]}>{cLabel}</Text>
        )}
        {!analog && (
          <View style={[styles.dpad, rectStyle(dpad)]}>
            <View style={[styles.dpadBar, styles.dpadShadow, { left: arm, top: 0, width: arm, height: arm * 3 }]} />
            <View style={[styles.dpadBar, { left: 0, top: arm, width: arm * 3, height: arm }]} />
            <View style={[styles.dpadCenter, { left: arm + 1.5, top: arm + 1.5, width: arm - 3, height: arm - 3 }]} />
            {pad.dpad.has('Up') && <View style={[styles.dpadOn, { left: arm, top: 0, width: arm, height: arm }]} />}
            {pad.dpad.has('Down') && <View style={[styles.dpadOn, { left: arm, top: arm * 2, width: arm, height: arm }]} />}
            {pad.dpad.has('Left') && <View style={[styles.dpadOn, { left: 0, top: arm, width: arm, height: arm }]} />}
            {pad.dpad.has('Right') && <View style={[styles.dpadOn, { left: arm * 2, top: arm, width: arm, height: arm }]} />}
          </View>
        )}
      </View>
    </View>
  );
}

// Flèche d'un bouton C (triangle plein, pointe vers la direction).
const ARROWS: Record<Arrow, string> = { up: 'M6 2 L11 10 H1 Z', down: 'M6 10 L11 2 H1 Z', left: 'M2 6 L10 1 V11 Z', right: 'M10 6 L2 1 V11 Z' };

function ArrowGlyph({ direction, color }: { direction: Arrow; color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12">
      <Path d={ARROWS[direction]} fill={color} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(10,10,12,0.5)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  key: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.14)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyOn: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  keyText: {
    fontFamily: fonts.extraBold,
  },
  dpad: {
    position: 'absolute',
  },
  dpadBar: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  dpadShadow: {
    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
  },
  dpadCenter: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  dpadOn: {
    position: 'absolute',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  // Nom sous les sticks de la 3DS (maquette : 9 pt, gras, espacé).
  stickLabel: {
    position: 'absolute',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.55)',
    fontFamily: fonts.bold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
});
