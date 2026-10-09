import { BlurView } from 'expo-blur';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ButtonHint } from './components';
import { useInput } from './input';
import { colors, fonts } from './theme';

// Fenêtre de confirmation (design/ecrans/Settings.dc.html, « Reset overrrrhere? » ; CLAUDE.md) :
// titre qui nomme l'action, une phrase de conséquence, Cancel sélectionné par défaut (blanc),
// action destructive en contour rouge. Manette : gauche / droite, A = valider le bouton sélectionné, B = Cancel.

type Props = {
  title: string; // « Reset overrrrhere? », « Delete this game? »
  message: string;
  confirmLabel: string; // « Reset », « Delete »
  onConfirm: () => void;
  onCancel: () => void;
};

// Anneau de sélection de la maquette : liseré de la couleur de la carte, puis anneau blanc.
const SELECTED_RING = '0 0 0 2px #18181C, 0 0 0 4px #FFFFFF';

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<'cancel' | 'confirm'>('cancel');

  useInput((button) => {
    if (button === 'Left') setSelected('cancel');
    if (button === 'Right') setSelected('confirm');
    if (button === 'A') (selected === 'cancel' ? onCancel : onConfirm)();
    if (button === 'B') onCancel();
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Fond : voile rgba(8,8,10,0.62) et léger flou (6 px). */}
      <BlurView intensity={15} tint="dark" style={StyleSheet.absoluteFill} />
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,10,0.62)' }]} onPress={onCancel} />

      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.buttons}>
            <Pressable
              onPressIn={() => setSelected('cancel')}
              onPress={onCancel}
              style={[styles.cancel, selected === 'cancel' && { boxShadow: SELECTED_RING }]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPressIn={() => setSelected('confirm')}
              onPress={onConfirm}
              style={[styles.destructive, selected === 'confirm' && { boxShadow: SELECTED_RING }]}
            >
              <Text style={styles.destructiveText}>{confirmLabel}</Text>
            </Pressable>
          </View>

          <View style={styles.hints}>
            <ButtonHint glyph="A" label="Select" />
            <ButtonHint glyph="B" label="Cancel" onPress={onCancel} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 420,
    paddingTop: 22,
    paddingHorizontal: 24,
    paddingBottom: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(24,24,28,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
  },
  title: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 20,
    lineHeight: 26,
  },
  message: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.76)',
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  buttons: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 12,
  },
  cancel: {
    height: 44,
    paddingHorizontal: 26,
    borderRadius: 999,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  cancelText: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  destructive: {
    height: 44,
    paddingHorizontal: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,138,115,0.6)',
    justifyContent: 'center',
  },
  destructiveText: {
    color: colors.destructive,
    fontFamily: fonts.semiBold,
    fontSize: 15,
  },
  hints: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 18,
  },
});
