import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { RetroGame } from '../retro/library';
import { useFocusColor } from '../settings';
import { movePinned, saveArt, useTiles } from '../tiles';
import { PrimaryButton, SecondaryButton } from '../ui/components';
import { useInput } from '../ui/input';
import { colors, fonts } from '../ui/theme';
import { InstalledGame } from '../xbox/games';

// Edit tile (design/ecrans/TileEditor.dc.html) : images de la tuile et du fond, position sur Home.
// Les changements ne s'appliquent qu'avec Save. Manette : haut / bas, A, gauche / droite (position), B = Cancel.
// Sert aussi aux jeux rétro : l'image d'origine est alors la jaquette (« Reset to cover art »).

type Item = 'tile' | 'background' | 'position' | 'reset' | 'save';

export function TileEditorScreen({ game, onClose }: { game: InstalledGame | RetroGame; onClose: () => void }) {
  const tiles = useTiles();
  const focusColor = useFocusColor();
  const isXbox = 'titleId' in game;
  const id = isXbox ? game.titleId : game.id;
  const original = isXbox ? { tile: game.tile, background: game.background } : { tile: game.cover, background: game.cover };
  const custom = tiles.custom[id] ?? {};
  const pinned = tiles.pinned ?? [];
  const isPinned = pinned.includes(id);

  // Brouillon : null = visuel Xbox.
  const [tile, setTile] = useState<string | null>(custom.tile ?? null);
  const [background, setBackground] = useState<string | null>(custom.background ?? null);
  const [position, setPosition] = useState(Math.max(0, pinned.indexOf(id)));
  const [focus, setFocus] = useState<Item>('tile');
  const [saving, setSaving] = useState(false);

  const items: Item[] = ['tile', 'background', ...(isPinned ? (['position'] as Item[]) : []), 'reset', 'save'];

  async function pick(target: 'tile' | 'background') {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.9 });
    if (result.canceled || !result.assets?.[0]) return;
    (target === 'tile' ? setTile : setBackground)(result.assets[0].uri);
  }

  function move(step: number) {
    setPosition((p) => Math.max(0, Math.min(pinned.length - 1, p + step)));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await saveArt(id, { tile, background });
      if (isPinned) movePinned(id, position);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function activate(item: Item) {
    setFocus(item);
    if (item === 'tile' || item === 'background') pick(item);
    if (item === 'position') move(position >= pinned.length - 1 ? -position : 1);
    if (item === 'reset') {
      setTile(null);
      setBackground(null);
    }
    if (item === 'save') save();
  }

  useInput((button) => {
    const index = items.indexOf(focus);
    if (button === 'Up') setFocus(items[Math.max(0, index - 1)]);
    if (button === 'Down') setFocus(items[Math.min(items.length - 1, index + 1)]);
    if (button === 'Left' && focus === 'position') move(-1);
    if (button === 'Right' && focus === 'position') move(1);
    if (button === 'A') activate(focus);
    if (button === 'B') onClose();
  });

  const row = (item: Item, label: string, value?: string, dim?: boolean) => (
    <Pressable key={item} onPress={() => activate(item)} style={[styles.row, focus === item && styles.rowFocused]}>
      <Text style={[styles.rowLabel, dim && styles.rowLabelDim]}>{label}</Text>
      {value && <Text style={styles.rowValue}>{value}</Text>}
    </Pressable>
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* All games derrière : flou 8 px, luminosité 45 %. */}
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,10,0.55)' }]} onPress={onClose} />

      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.dialog}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(24,24,28,0.9)' }]} />

          <View style={styles.previews}>
            <View style={styles.tilePreview}>
              {(tile ?? original.tile) && <Image source={{ uri: tile ?? original.tile! }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
            </View>
            <View style={styles.backgroundLine}>
              <View style={styles.backgroundPreview}>
                {(background ?? original.background) && (
                  <Image source={{ uri: background ?? original.background! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                )}
              </View>
              <Text style={styles.caption}>Home background when this tile is selected</Text>
            </View>
          </View>

          <View style={styles.form}>
            <Text style={styles.title}>Edit tile</Text>
            {row('tile', 'Tile image', tile ? 'Custom photo' : 'From Photos')}
            {row('background', 'Background image', background ? 'Custom photo' : 'From Photos')}
            {isPinned && row('position', 'Position on home', ordinal(position + 1))}
            {row('reset', isXbox ? 'Reset to Xbox art' : 'Reset to cover art', undefined, true)}

            <View style={styles.buttons}>
              <PrimaryButton label={saving ? 'Saving…' : 'Save'} onPress={save} focused={focus === 'save'} focusColor={focusColor} />
              <SecondaryButton glyph="B" label="Cancel" onPress={onClose} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function ordinal(n: number) {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
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
  dialog: {
    width: 600,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
    overflow: 'hidden',
    flexDirection: 'row',
    gap: 22,
  },
  previews: {
    width: 224,
    gap: 10,
  },
  tilePreview: {
    width: 224,
    height: 126,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.tileBackground,
    boxShadow: '0 0 0 2px #18181C, 0 0 0 4px #FFFFFF',
  },
  backgroundLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backgroundPreview: {
    width: 96,
    height: 54,
    borderRadius: 8,
    overflow: 'hidden',
    opacity: 0.9,
    backgroundColor: colors.tileBackground,
  },
  caption: {
    flex: 1,
    color: 'rgba(255,255,255,0.66)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  form: {
    flex: 1,
  },
  title: {
    paddingHorizontal: 10,
    paddingBottom: 8,
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 22,
  },
  row: {
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowFocused: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  rowLabel: {
    color: colors.white,
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  rowLabelDim: {
    color: colors.textSecondary,
  },
  rowValue: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  buttons: {
    marginTop: 12,
    paddingHorizontal: 2,
    flexDirection: 'row',
    gap: 10,
  },
});
