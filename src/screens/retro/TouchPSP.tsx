import { useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, G, Path, Pattern } from 'react-native-svg';

import Retro from '../../../modules/retro';
import { tapFeedback } from '../../feedback';
import { useSettings } from '../../settings';
import { Logo } from '../../ui/icons';
import { colors, fonts } from '../../ui/theme';
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

// Contrôles tactiles PSP (design/ecrans/TouchPSP.dc.html) : L et R en haut, croix en quatre flèches et stick
// à gauche, × ○ □ △ à droite (symboles seuls, choix d'Elhadji du 26/09/2026), SELECT et START en bas.
// L'image du jeu garde toute la hauteur (prop touchOverImage de RetroView) : les boutons sont posés dessus.
// Chaque bouton garde la place du bouton Xbox correspondant : × en bas, ○ à droite, □ à gauche, △ en haut.
// Les boutons appuyés partent au module natif (Retro.setTouchButtons), le stick en Retro.setTouchSticks.
// Comme pour le stream, un seul calque reçoit tous les doigts (multi-touch).

type Face = 'Cross' | 'Circle' | 'Square' | 'Triangle';
type PspKey = Face | 'L' | 'R' | 'Select' | 'Start';

// Numéros des boutons de la manette libretro (RETRO_DEVICE_ID_JOYPAD_*), lus par PPSSPP :
// croix sur B, rond sur A, carré sur Y, triangle sur X (libretro.cpp du core).
const BITS: Record<PspKey | DpadDirection, number> = {
  Cross: 0,
  Square: 1,
  Select: 2,
  Start: 3,
  Up: 4,
  Down: 5,
  Left: 6,
  Right: 7,
  Circle: 8,
  Triangle: 9,
  L: 10,
  R: 11,
};

type KeyDef = Placed & { key: PspKey };

const FACE = { w: 48, h: 48 };
const KEYS: KeyDef[] = [
  { key: 'L', box: { x: 56, y: 10, w: 100, h: 34 }, h: 'start', v: 'start' },
  { key: 'R', box: { x: 696, y: 10, w: 100, h: 34 }, h: 'end', v: 'start' },
  { key: 'Triangle', box: { x: 702, y: 96, ...FACE }, h: 'end', v: 'center' },
  { key: 'Square', box: { x: 652, y: 146, ...FACE }, h: 'end', v: 'center' },
  { key: 'Circle', box: { x: 752, y: 146, ...FACE }, h: 'end', v: 'center' },
  { key: 'Cross', box: { x: 702, y: 196, ...FACE }, h: 'end', v: 'center' },
  { key: 'Select', box: { x: 634, y: 318, w: 76, h: 26 }, h: 'end', v: 'end' },
  { key: 'Start', box: { x: 720, y: 318, w: 76, h: 26 }, h: 'end', v: 'end' },
];

// Croix : quatre flèches de 46 × 46 ; au toucher, une seule zone (leur carré) à 8 directions, pour les diagonales.
const ARROW = 46;
const ARROWS: { direction: DpadDirection; x: number; y: number; rotation: number }[] = [
  { direction: 'Up', x: 107, y: 96, rotation: 0 },
  { direction: 'Right', x: 153, y: 142, rotation: 90 },
  { direction: 'Down', x: 107, y: 188, rotation: 180 },
  { direction: 'Left', x: 61, y: 142, rotation: 270 },
];
const DPAD: Placed = { box: { x: 61, y: 96, w: ARROW * 3, h: ARROW * 3 }, h: 'start', v: 'center' };
const STICK: Placed = { box: { x: 108, y: 252, w: 92, h: 92 }, h: 'start', v: 'end' };
const STICK_BORDER = 2;
const KNOB = 52;
const PILL: Placed = { box: { x: 380, y: 10, w: 92, h: 30 }, h: 'center', v: 'start' };

const IDLE = 'rgba(10,10,12,0.22)';
const ON = 'rgba(255,255,255,0.92)';
const LINE = 'rgba(255,255,255,0.9)';

type Target = 'key' | 'dpad' | 'stick' | 'menu';
type Pad = { keys: Set<PspKey>; dpad: Set<DpadDirection>; stick: Vector };
const EMPTY: Pad = { keys: new Set(), dpad: new Set(), stick: { x: 0, y: 0 } };

type Props = {
  onMenu: () => void; // pastille avec le logo : menu du jeu
};

export function TouchPSP({ onMenu }: Props) {
  const { touchOpacity } = useSettings();
  const { width, height } = useWindowDimensions();
  const [pad, setPad] = useState<Pad>(EMPTY);
  const sent = useRef(0); // boutons envoyés au module natif
  const sentStick = useRef('0,0'); // stick envoyé au module natif
  const touches = useRef(new Map<string, Target>()); // doigt → commande saisie au moment de l'appui
  const latestMenu = useRef(onMenu);
  latestMenu.current = onMenu;

  const keys = KEYS.map((k) => ({ ...k, rect: place(k, width, height) }));
  const dpad = place(DPAD, width, height);
  const stick = place(STICK, width, height);
  const pill = place(PILL, width, height);

  function keyAt(px: number, py: number): PspKey | null {
    let best: PspKey | null = null;
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
    if (distanceToBox(px, py, dpad) <= HIT_MARGIN) return 'dpad';
    if (inStickReach(px, py, stick)) return 'stick';
    return null;
  }

  function emit(next: Pad) {
    let bits = 0;
    next.keys.forEach((k) => (bits |= 1 << BITS[k]));
    next.dpad.forEach((d) => (bits |= 1 << BITS[d]));
    // Petite vibration à chaque nouvel appui (le stick n'en fait pas, comme dans le stream).
    if (bits & ~sent.current) tapFeedback();
    if (bits !== sent.current) {
      Retro.setTouchButtons(bits);
      sent.current = bits;
    }
    const stickKey = `${next.stick.x},${next.stick.y}`;
    if (stickKey !== sentStick.current) {
      Retro.setTouchSticks(next.stick.x, next.stick.y, 0, 0);
      sentStick.current = stickKey;
    }
    setPad(next);
  }

  function update(event: GestureResponderEvent, phase: 'start' | 'move' | 'end' | 'cancel') {
    const { touches: all, changedTouches } = event.nativeEvent;
    const ended = new Set(phase === 'end' ? changedTouches.map((t) => String(t.identifier)) : []);
    const active = phase === 'cancel' ? [] : all.filter((t) => !ended.has(String(t.identifier)));
    const ids = new Set(active.map((t) => String(t.identifier)));

    for (const id of [...touches.current.keys()]) if (!ids.has(id)) touches.current.delete(id);

    const next: Pad = { keys: new Set(), dpad: new Set(), stick: { x: 0, y: 0 } };
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
      }
      if (target === 'key') {
        // Le doigt peut glisser d'un bouton à l'autre (× → ○) sans se relever.
        const key = keyAt(t.pageX, t.pageY);
        if (key) next.keys.add(key);
      } else if (target === 'dpad') {
        const c = center(dpad);
        dpadDirections(t.pageX - c.x, t.pageY - c.y).forEach((d) => next.dpad.add(d));
      } else if (target === 'stick') {
        next.stick = stickVector(t.pageX, t.pageY, stick);
      }
    }
    emit(next);
  }

  // Contrôles masqués (manette connectée, menu ouvert, jeu quitté) : on relâche tout.
  useEffect(
    () => () => {
      Retro.setTouchButtons(0);
      Retro.setTouchSticks(0, 0, 0, 0);
    },
    [],
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
          const fg = on ? colors.ink : colors.white;
          if (k.key === 'L' || k.key === 'R') return <Shoulder key={k.key} side={k.key} rect={k.rect} on={on} />;
          if (k.key === 'Select' || k.key === 'Start') {
            return (
              <View key={k.key} style={[styles.small, rectStyle(k.rect), on && styles.on]}>
                <Text style={[styles.smallText, { color: fg }]}>{k.key.toUpperCase()}</Text>
              </View>
            );
          }
          return (
            <View key={k.key} style={[styles.face, rectStyle(k.rect), on && styles.on]}>
              <FaceSymbol face={k.key} color={fg} />
            </View>
          );
        })}

        {ARROWS.map((a) => (
          <DpadArrow key={a.direction} rect={arrowRect(a, dpad)} rotation={a.rotation} on={pad.dpad.has(a.direction)} />
        ))}

        <View style={[styles.stick, rectStyle(stick)]}>
          <Knob value={pad.stick} travel={(stick.w - 2 * STICK_BORDER - KNOB) / 2} />
        </View>
      </View>
    </View>
  );
}

// Flèche de la croix, placée par rapport au carré de la croix (qui suit le bord gauche de l'écran).
function arrowRect(a: (typeof ARROWS)[number], dpad: Box): Box {
  return { x: dpad.x + a.x - DPAD.box.x, y: dpad.y + a.y - DPAD.box.y, w: ARROW, h: ARROW };
}

// L et R : coin biseauté vers l'extérieur, comme les gâchettes de la PSP.
const SHOULDER_PATHS = {
  L: 'M16 2 H94 a4 4 0 0 1 4 4 V28 a4 4 0 0 1-4 4 H6 a4 4 0 0 1-4-4 V16 Z',
  R: 'M84 2 H6 a4 4 0 0 0-4 4 V28 a4 4 0 0 0 4 4 H94 a4 4 0 0 0 4-4 V16 Z',
};

function Shoulder({ side, rect, on }: { side: 'L' | 'R'; rect: Box; on: boolean }) {
  return (
    <View style={[styles.shoulder, rectStyle(rect)]}>
      <Svg width={rect.w} height={rect.h} viewBox="0 0 100 34" style={StyleSheet.absoluteFill}>
        <Path d={SHOULDER_PATHS[side]} fill={on ? ON : IDLE} stroke={LINE} strokeWidth={2} />
      </Svg>
      <Text style={[styles.shoulderText, { color: on ? colors.ink : colors.white }]}>{side}</Text>
    </View>
  );
}

function DpadArrow({ rect, rotation, on }: { rect: Box; rotation: number; on: boolean }) {
  return (
    <Svg width={ARROW} height={ARROW} viewBox="0 0 46 46" style={[styles.arrow, rectStyle(rect)]}>
      <G transform={`rotate(${rotation} 23 23)`}>
        <Path d="M9 3 H37 a4 4 0 0 1 4 4 V29 L23 43 L5 29 V7 a4 4 0 0 1 4-4 Z" fill={on ? ON : IDLE} stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
        <Path d="M23 12 L29 20 H17 Z" fill={on ? colors.ink : colors.white} />
      </G>
    </Svg>
  );
}

// × ○ □ △ (tracés de la maquette, variante « pspSymbols », agrandis au centre du bouton).
const FACE_PATHS: Record<Face, string> = {
  Cross: 'M2 2L8 8M8 2L2 8',
  Circle: 'M5 1.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7z',
  Square: 'M2 2h6v6h-6z',
  Triangle: 'M5 1.5L8.5 8h-7z',
};

function FaceSymbol({ face, color }: { face: Face; color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 10 10" fill="none">
      <Path d={FACE_PATHS[face]} stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Bouton du stick, avec sa texture de points (maquette : radial-gradient 6 × 6).
// travel = écart entre le bouton centré et le bord intérieur du cercle (placement à l'intérieur de la bordure).
function Knob({ value, travel }: { value: Vector; travel: number }) {
  return (
    <View style={[styles.knob, { left: travel + value.x * travel, top: travel + value.y * travel }]}>
      <Svg width={KNOB - 4} height={KNOB - 4}>
        <Defs>
          <Pattern id="pspKnobDots" width={6} height={6} patternUnits="userSpaceOnUse">
            <Circle cx={3} cy={3} r={1.3} fill="rgba(255,255,255,0.75)" />
          </Pattern>
        </Defs>
        <Circle cx={(KNOB - 4) / 2} cy={(KNOB - 4) / 2} r={(KNOB - 4) / 2} fill="url(#pspKnobDots)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(10,10,12,0.45)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  shoulder: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shoulderText: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
  },
  arrow: {
    position: 'absolute',
  },
  face: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: LINE,
    backgroundColor: IDLE,
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    position: 'absolute',
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: LINE,
    backgroundColor: IDLE,
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallText: {
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  on: {
    backgroundColor: ON,
  },
  stick: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: STICK_BORDER,
    borderColor: LINE,
    backgroundColor: IDLE,
    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
  },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: LINE,
    backgroundColor: 'rgba(255,255,255,0.18)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
