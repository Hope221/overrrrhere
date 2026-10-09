import { useEventListener } from 'expo';
import { BlurView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import Manette, { ManetteButton } from '../../modules/manette';
import { ButtonHint } from '../ui/components';
import { useInput } from '../ui/input';
import { colors, fonts, layout } from '../ui/theme';

// Test buttons (design/ecrans/ControllerTest.dc.html) : chaque bouton pressé s'allume.
// Maintenir B pour sortir.

const HOLD_TO_EXIT = 1000; // ms

// Positions, tailles et arrondis exacts de la maquette (schéma de 540 × 200).
const BUTTONS: { k: ManetteButton; name: string; x: number; y: number; w: number; h: number; r: number; t: string }[] = [
  { k: 'LT', name: 'Left trigger', x: 18, y: 0, w: 46, h: 22, r: 8, t: 'LT' },
  { k: 'LB', name: 'Left bumper', x: 70, y: 0, w: 46, h: 22, r: 8, t: 'LB' },
  { k: 'RB', name: 'Right bumper', x: 424, y: 0, w: 46, h: 22, r: 8, t: 'RB' },
  { k: 'RT', name: 'Right trigger', x: 476, y: 0, w: 46, h: 22, r: 8, t: 'RT' },
  { k: 'LS', name: 'Left stick', x: 34, y: 54, w: 44, h: 44, r: 999, t: 'LS' },
  { k: 'Up', name: 'D-pad up', x: 55, y: 112, w: 22, h: 22, r: 5, t: '' },
  { k: 'Down', name: 'D-pad down', x: 55, y: 154, w: 22, h: 22, r: 5, t: '' },
  { k: 'Left', name: 'D-pad left', x: 34, y: 133, w: 22, h: 22, r: 5, t: '' },
  { k: 'Right', name: 'D-pad right', x: 76, y: 133, w: 22, h: 22, r: 5, t: '' },
  { k: 'View', name: 'View', x: 100, y: 96, w: 22, h: 16, r: 999, t: '' },
  { k: 'Menu', name: 'Menu', x: 418, y: 96, w: 22, h: 16, r: 999, t: '' },
  { k: 'Y', name: 'Y', x: 463, y: 48, w: 22, h: 22, r: 999, t: 'Y' },
  { k: 'X', name: 'X', x: 441, y: 70, w: 22, h: 22, r: 999, t: 'X' },
  { k: 'B', name: 'B', x: 485, y: 70, w: 22, h: 22, r: 999, t: 'B' },
  { k: 'A', name: 'A', x: 463, y: 92, w: 22, h: 22, r: 999, t: 'A' },
  { k: 'RS', name: 'Right stick', x: 444, y: 128, w: 44, h: 44, r: 999, t: 'RS' },
];

export function ControllerTestScreen({ onExit }: { onExit: () => void }) {
  const [pressed, setPressed] = useState<Partial<Record<ManetteButton, boolean>>>({});
  const [tilted, setTilted] = useState<{ LS: boolean; RS: boolean }>({ LS: false, RS: false });
  const [last, setLast] = useState('—');
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cet écran capte toute la manette : rien n'est transmis aux écrans derrière.
  useInput(() => {}, true, { silent: true });

  function nameOf(button: ManetteButton) {
    return BUTTONS.find((b) => b.k === button)?.name ?? button;
  }

  useEventListener(Manette, 'onButton', (event) => {
    setPressed((p) => ({ ...p, [event.button]: event.pressed }));
    if (event.pressed) setLast(nameOf(event.button));

    if (event.button === 'B') {
      if (exitTimer.current) clearTimeout(exitTimer.current);
      exitTimer.current = event.pressed ? setTimeout(onExit, HOLD_TO_EXIT) : null;
    }
  });

  useEventListener(Manette, 'onStick', (event) => {
    const on = Math.hypot(event.x, event.y) > 0.3;
    setTilted((t) => {
      if (t[event.stick] === on) return t;
      if (on) setLast(nameOf(event.stick));
      return { ...t, [event.stick]: on };
    });
  });

  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Accueil derrière : flou 28 px, luminosité 30 %. */}
      <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,10,0.75)' }]} />

      <View style={styles.layout}>
        <View>
          <Text style={styles.title}>Test buttons</Text>
          <Text style={styles.subtitle}>Press any button.</Text>
        </View>

        <View style={styles.center}>
          <View style={styles.diagram}>
            <Svg width={540} height={200} viewBox="0 0 540 200" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={StyleSheet.absoluteFill}>
              <Path d="M130 36 H62 C32 36 14 54 12 82 L8 146 C6 172 24 190 46 190 C66 190 78 178 88 162 L130 118 Z" />
              <Path d="M410 36 H478 C508 36 526 54 528 82 L532 146 C534 172 516 190 494 190 C474 190 462 178 452 162 L410 118 Z" />
              <Rect x={130} y={30} width={280} height={148} rx={14} stroke="rgba(255,255,255,0.8)" />
              <Rect x={142} y={42} width={256} height={124} rx={6} opacity={0.3} />
            </Svg>

            <View style={styles.screen}>
              <Text style={styles.lastLabel}>Last pressed</Text>
              <Text style={styles.last}>{last}</Text>
            </View>

            {BUTTONS.map((b) => {
              const on = !!pressed[b.k] || ((b.k === 'LS' || b.k === 'RS') && tilted[b.k]);
              return (
                <View
                  key={b.k}
                  style={[
                    styles.button,
                    { left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: b.r },
                    on && styles.buttonOn,
                  ]}
                >
                  <Text style={[styles.buttonText, on && styles.buttonTextOn]}>{b.t}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={() => {
              setPressed({});
              setLast('—');
            }}
          >
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
          <ButtonHint glyph="B" label="Hold to exit" onPress={onExit} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: layout.sideMargin,
  },
  title: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.24,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagram: {
    width: 540,
    height: 200,
  },
  screen: {
    position: 'absolute',
    left: 142,
    top: 42,
    width: 256,
    height: 124,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  lastLabel: {
    color: 'rgba(255,255,255,0.66)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  last: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 30,
    lineHeight: 36,
  },
  button: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonOn: {
    backgroundColor: colors.white,
  },
  buttonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 10,
  },
  buttonTextOn: {
    color: colors.ink,
  },
  footer: {
    height: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clear: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});
