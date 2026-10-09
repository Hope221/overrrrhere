import { useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { tapFeedback } from '../feedback';
import { useSettings } from '../settings';
import { ViewGlyph } from '../ui/components';
import { Logo } from '../ui/icons';
import { colors, fonts } from '../ui/theme';
import { TouchStickView } from '../ui/TouchStickView';
import {
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
} from '../ui/touchLayout';

// Contrôles tactiles du stream (design/ecrans/TouchStream.dc.html) : disposition Xbox complète.
// Positions de la maquette (852 × 393), ancrées au bord le plus proche pour s'adapter aux autres iPhone.
// Un seul calque reçoit tous les doigts et retrouve lui-même la commande touchée (multi-touch) :
// le système « responder » de React Native ne suit qu'un doigt à la fois.

export type TouchKey = 'A' | 'B' | 'X' | 'Y' | 'LB' | 'RB' | 'LT' | 'RT' | 'View' | 'Menu';
type Stick = 'LS' | 'RS';

type Props = {
  onButton: (button: Exclude<TouchKey, 'LT' | 'RT'> | DpadDirection, pressed: boolean) => void;
  onTrigger: (trigger: 'LT' | 'RT', value: number) => void;
  onStick: (stick: Stick, x: number, y: number) => void; // -1 à 1, bas = +1 (convention de PadState)
  onMenu: () => void; // pastille avec le logo : menu du stream
};

const KEYS: (Placed & { key: TouchKey; radius: number; fontSize: number })[] = [
  { key: 'LT', box: { x: 56, y: 12, w: 58, h: 30 }, h: 'start', v: 'start', radius: 10, fontSize: 12 },
  { key: 'LB', box: { x: 122, y: 12, w: 58, h: 30 }, h: 'start', v: 'start', radius: 10, fontSize: 12 },
  { key: 'RB', box: { x: 672, y: 12, w: 58, h: 30 }, h: 'end', v: 'start', radius: 10, fontSize: 12 },
  { key: 'RT', box: { x: 738, y: 12, w: 58, h: 30 }, h: 'end', v: 'start', radius: 10, fontSize: 12 },
  { key: 'Y', box: { x: 700, y: 100, w: 46, h: 46 }, h: 'end', v: 'start', radius: 999, fontSize: 15 },
  { key: 'X', box: { x: 652, y: 148, w: 46, h: 46 }, h: 'end', v: 'start', radius: 999, fontSize: 15 },
  { key: 'B', box: { x: 748, y: 148, w: 46, h: 46 }, h: 'end', v: 'start', radius: 999, fontSize: 15 },
  { key: 'A', box: { x: 700, y: 196, w: 46, h: 46 }, h: 'end', v: 'start', radius: 999, fontSize: 15 },
  { key: 'View', box: { x: 372, y: 318, w: 36, h: 36 }, h: 'center', v: 'end', radius: 999, fontSize: 13 },
  { key: 'Menu', box: { x: 444, y: 318, w: 36, h: 36 }, h: 'center', v: 'end', radius: 999, fontSize: 16 },
];

const STICKS: (Placed & { stick: Stick; knob: number; knobColor: string })[] = [
  { stick: 'LS', box: { x: 66, y: 116, w: 112, h: 112 }, h: 'start', v: 'start', knob: 50, knobColor: 'rgba(255,255,255,0.85)' },
  { stick: 'RS', box: { x: 566, y: 246, w: 100, h: 100 }, h: 'end', v: 'end', knob: 46, knobColor: 'rgba(255,255,255,0.55)' },
];

const DPAD: Placed = { box: { x: 156, y: 248, w: 96, h: 96 }, h: 'start', v: 'end' };
const PILL: Placed = { box: { x: 380, y: 10, w: 92, h: 30 }, h: 'center', v: 'start' };

type Target = { type: 'key' } | { type: 'dpad' } | { type: 'stick'; stick: Stick } | { type: 'menu' };
type Pad = { keys: Set<TouchKey>; dpad: Set<DpadDirection>; LS: Vector; RS: Vector };
const EMPTY: Pad = { keys: new Set(), dpad: new Set(), LS: { x: 0, y: 0 }, RS: { x: 0, y: 0 } };

export function TouchStream(props: Props) {
  const { touchOpacity } = useSettings();
  const { width, height } = useWindowDimensions();
  const [pad, setPad] = useState<Pad>(EMPTY);
  const current = useRef<Pad>(EMPTY);
  const touches = useRef(new Map<string, Target>()); // doigt → commande saisie au moment de l'appui
  const latest = useRef(props);
  latest.current = props;

  const keys = KEYS.map((k) => ({ ...k, rect: place(k, width, height) }));
  const sticks = STICKS.map((s) => ({ ...s, rect: place(s, width, height) }));
  const dpad = place(DPAD, width, height);
  const pill = place(PILL, width, height);

  function keyAt(px: number, py: number): TouchKey | null {
    let best: TouchKey | null = null;
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
    if (keyAt(px, py)) return { type: 'key' };
    if (distanceToBox(px, py, pill) <= 6) return { type: 'menu' };
    if (distanceToBox(px, py, dpad) <= HIT_MARGIN) return { type: 'dpad' };
    for (const s of sticks) {
      if (inStickReach(px, py, s.rect)) return { type: 'stick', stick: s.stick };
    }
    return null;
  }

  // Envoie à la console ce qui a changé depuis le dernier état, comme une vraie manette.
  function emit(next: Pad) {
    const prev = current.current;
    const { onButton, onTrigger, onStick } = latest.current;
    let pressedSomething = false;
    for (const k of KEYS.map((d) => d.key)) {
      const was = prev.keys.has(k);
      const is = next.keys.has(k);
      if (was === is) continue;
      if (is) pressedSomething = true;
      if (k === 'LT' || k === 'RT') onTrigger(k, is ? 1 : 0);
      else onButton(k, is);
    }
    for (const d of ['Up', 'Down', 'Left', 'Right'] as DpadDirection[]) {
      const was = prev.dpad.has(d);
      const is = next.dpad.has(d);
      if (was === is) continue;
      if (is) pressedSomething = true;
      onButton(d, is);
    }
    for (const s of ['LS', 'RS'] as Stick[]) {
      if (prev[s].x !== next[s].x || prev[s].y !== next[s].y) onStick(s, next[s].x, next[s].y);
    }
    if (pressedSomething) tapFeedback(); // petite vibration à chaque appui
    current.current = next;
    setPad(next);
  }

  function update(event: GestureResponderEvent, phase: 'start' | 'move' | 'end' | 'cancel') {
    const { touches: all, changedTouches } = event.nativeEvent;
    const ended = new Set(phase === 'end' ? changedTouches.map((t) => String(t.identifier)) : []);
    const active = phase === 'cancel' ? [] : all.filter((t) => !ended.has(String(t.identifier)));
    const ids = new Set(active.map((t) => String(t.identifier)));

    for (const id of [...touches.current.keys()]) if (!ids.has(id)) touches.current.delete(id);

    const next: Pad = { keys: new Set(), dpad: new Set(), LS: { x: 0, y: 0 }, RS: { x: 0, y: 0 } };
    for (const t of active) {
      const id = String(t.identifier);
      let target = touches.current.get(id);
      if (!target) {
        const found = targetAt(t.pageX, t.pageY);
        if (!found) continue;
        target = found;
        touches.current.set(id, target);
        if (target.type === 'menu') {
          latest.current.onMenu();
          continue;
        }
      }
      if (target.type === 'key') {
        // Le doigt peut glisser d'un bouton à l'autre (A → B) sans se relever.
        const key = keyAt(t.pageX, t.pageY);
        if (key) next.keys.add(key);
      } else if (target.type === 'dpad') {
        const c = center(dpad);
        dpadDirections(t.pageX - c.x, t.pageY - c.y).forEach((d) => next.dpad.add(d));
      } else if (target.type === 'stick') {
        const s = sticks.find((item) => item.stick === target.stick)!;
        next[s.stick] = stickVector(t.pageX, t.pageY, s.rect);
      }
    }
    emit(next);
  }

  // Contrôles masqués (manette connectée, menu ouvert) : on relâche tout ce qui était appuyé.
  useEffect(() => () => emit(EMPTY), []);

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
          const color = on ? colors.ink : colors.white;
          return (
            <View key={k.key} style={[styles.key, rectStyle(k.rect), { borderRadius: k.radius }, on && styles.keyOn]}>
              {k.key === 'View' ? (
                <ViewGlyph size={14} color={color} />
              ) : k.key === 'Menu' ? (
                <MenuGlyph color={color} />
              ) : (
                <Text style={[styles.keyText, { fontSize: k.fontSize, color }]}>{k.key}</Text>
              )}
            </View>
          );
        })}

        {sticks.map((s) => (
          <TouchStickView key={s.stick} rect={s.rect} knob={s.knob} knobColor={s.knobColor} value={pad[s.stick]} />
        ))}

        <View style={[styles.dpad, rectStyle(dpad)]}>
          <View style={[styles.dpadBar, styles.dpadShadow, { left: 32, top: 0, width: 32, height: 96 }]} />
          <View style={[styles.dpadBar, { left: 0, top: 32, width: 96, height: 32 }]} />
          <View style={styles.dpadCenter} />
          {pad.dpad.has('Up') && <View style={[styles.dpadOn, { left: 32, top: 0 }]} />}
          {pad.dpad.has('Down') && <View style={[styles.dpadOn, { left: 32, top: 64 }]} />}
          {pad.dpad.has('Left') && <View style={[styles.dpadOn, { left: 0, top: 32 }]} />}
          {pad.dpad.has('Right') && <View style={[styles.dpadOn, { left: 64, top: 32 }]} />}
        </View>
      </View>
    </View>
  );
}

// Glyphe du bouton Menu de la manette (≡). À ne pas confondre avec la pastille au logo (menu de l'app).
function MenuGlyph({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round">
      <Path d="M2.5 3.5h9M2.5 7h9M2.5 10.5h9" />
    </Svg>
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
    left: 33.5,
    top: 33.5,
    width: 29,
    height: 29,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  dpadOn: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
});
