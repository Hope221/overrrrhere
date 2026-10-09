import { BlurView } from 'expo-blur';
import { ReactElement, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ButtonHint } from '../ui/components';
import { useBattery, useClock } from '../ui/device';
import { GearIcon, GridIcon, HomeIcon, MenuControllerIcon, SleepIcon } from '../ui/icons';
import { useInput } from '../ui/input';
import { colors, fonts, layout } from '../ui/theme';

// Menu rapide (design/ecrans/Menu.dc.html) : panneau à gauche sur l'accueil flouté.
// Haut / bas pour choisir, A pour valider, B pour fermer.

export type QuickMenuAction = 'home' | 'tiles' | 'settings' | 'controller' | 'sleep';

const ITEMS: { action: QuickMenuAction; label: string; Icon: (props: { color: string }) => ReactElement }[] = [
  { action: 'home', label: 'Home', Icon: HomeIcon },
  { action: 'tiles', label: 'Manage tiles', Icon: GridIcon },
  { action: 'settings', label: 'Settings', Icon: GearIcon },
  { action: 'controller', label: 'Controller', Icon: MenuControllerIcon },
  { action: 'sleep', label: 'Put Xbox to sleep', Icon: SleepIcon },
];

// initial : l'élément choisi avant, quand on revient de Settings ou Manage tiles (B ramène au menu).
export function QuickMenu({ onAction, onClose, initial }: { onAction: (action: QuickMenuAction) => void; onClose: () => void; initial?: QuickMenuAction }) {
  const [selected, setSelected] = useState(() => Math.max(0, ITEMS.findIndex((item) => item.action === initial)));
  const clock = useClock();
  const battery = useBattery();

  useInput((button) => {
    if (button === 'Up') setSelected(Math.max(0, selected - 1));
    if (button === 'Down') setSelected(Math.min(ITEMS.length - 1, selected + 1));
    if (button === 'A') onAction(ITEMS[selected].action);
    if (button === 'B' || button === 'Menu') onClose();
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Accueil derrière : flou 10 px, luminosité 55 %, voile rgba(8,8,10,0.35). */}
      <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
      <Pressable style={[StyleSheet.absoluteFill, styles.dim]} onPress={onClose} />

      <View style={styles.panel}>
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(22,22,26,0.82)' }]} />

        <View style={styles.status}>
          <Text style={styles.clock}>{clock}</Text>
          {battery.percent !== null && <Text style={styles.battery}>{battery.percent}%</Text>}
        </View>

        <View style={styles.items}>
          {ITEMS.map((item, i) => {
            const on = i === selected;
            const color = on ? colors.white : 'rgba(255,255,255,0.72)';
            return (
              <Pressable
                key={item.action}
                onPressIn={() => setSelected(i)}
                onPress={() => onAction(item.action)}
                style={[styles.item, on && styles.itemOn]}
              >
                <item.Icon color={color} />
                <Text style={[styles.itemText, { color }, on && styles.itemTextOn]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexGrow: 1 }} />
        <View style={styles.hints}>
          <ButtonHint glyph="A" label="Select" onPress={() => onAction(ITEMS[selected].action)} />
          <ButtonHint glyph="B" label="Close" onPress={onClose} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: 'rgba(8,8,10,0.6)',
  },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 304,
    paddingTop: 16,
    paddingBottom: 18,
    paddingLeft: layout.sideMargin,
    paddingRight: 20,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  status: {
    height: 28,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clock: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  battery: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  items: {
    marginTop: 14,
    gap: 4,
  },
  item: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  itemOn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  itemText: {
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  itemTextOn: {
    fontFamily: fonts.semiBold,
  },
  hints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 12,
  },
});
