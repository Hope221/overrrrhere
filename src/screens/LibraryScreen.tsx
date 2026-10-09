import { BlurView } from 'expo-blur';
import { useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useFocusColor } from '../settings';
import { togglePin, useTiles, withArt } from '../tiles';
import { ButtonHint } from '../ui/components';
import { CheckIcon } from '../ui/icons';
import { useInput } from '../ui/input';
import { colors, fonts, layout } from '../ui/theme';
import { InstalledGame } from '../xbox/games';
import Svg, { Path } from 'react-native-svg';

// All games (design/ecrans/Library.dc.html) : grille de 4 colonnes des jeux installés.
// Manette : A = Play, Y = Pin / Unpin, X = Edit tile, B = Back.

const COLUMNS = 4;
const TILE = { width: 160, height: 90, gap: 14 };

type Props = {
  games: InstalledGame[];
  consoleName: string;
  initialTitleId?: number;
  onPlay: (game: InstalledGame) => void;
  onEdit: (game: InstalledGame) => void;
  onClose: () => void;
};

export function LibraryScreen({ games, consoleName, initialTitleId, onPlay, onEdit, onClose }: Props) {
  const tiles = useTiles();
  const focusColor = useFocusColor();
  const [selected, setSelected] = useState(() => Math.max(0, games.findIndex((g) => g.titleId === initialTitleId)));
  const grid = useRef<ScrollView>(null);

  const current = games[selected];
  const pinned = tiles.pinned ?? [];
  const position = current ? pinned.indexOf(current.titleId) + 1 : 0;

  function select(index: number) {
    if (index < 0 || index >= games.length) return;
    setSelected(index);
    // Garde la rangée sélectionnée visible (une rangée d'avance au-dessus).
    const row = Math.floor(index / COLUMNS);
    grid.current?.scrollTo({ y: Math.max(0, (row - 1) * (TILE.height + TILE.gap)), animated: true });
  }

  useInput((button) => {
    if (button === 'Left' && selected % COLUMNS > 0) select(selected - 1);
    if (button === 'Right' && selected % COLUMNS < COLUMNS - 1) select(selected + 1);
    if (button === 'Up') select(selected - COLUMNS);
    if (button === 'Down') select(Math.min(games.length - 1, selected + COLUMNS));
    if (!current) return button === 'B' && onClose();
    if (button === 'A') onPlay(current);
    if (button === 'Y') togglePin(current.titleId);
    if (button === 'X') onEdit(current);
    if (button === 'B') onClose();
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Accueil derrière : flou 28 px, luminosité 36 %. */}
      <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,10,0.72)' }]} />

      <View style={styles.layout}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>All games</Text>
            <Text style={styles.subtitle}>
              {games.length} installed on {consoleName} · Synced just now
            </Text>
          </View>
        </View>

        <ScrollView ref={grid} style={styles.gridScroll} contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {games.map((raw, i) => {
            const game = withArt(raw, tiles);
            const on = i === selected;
            return (
              <Pressable
                key={game.titleId}
                onPress={() => (on ? onPlay(raw) : select(i))}
                style={[
                  styles.tile,
                  { boxShadow: on ? `0 0 0 2px ${colors.ink}, 0 0 0 4px ${focusColor}, 0 12px 28px rgba(0,0,0,0.55)` : '0 6px 16px rgba(0,0,0,0.35)' },
                ]}
              >
                <View style={styles.tileClip}>
                  {game.tile ? <Image source={{ uri: game.tile }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Placeholder />}
                </View>
                {pinned.includes(game.titleId) && (
                  <View style={styles.badge}>
                    <CheckIcon size={12} color={colors.ink} strokeWidth={3} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.footerText}>
            <Text style={styles.name} numberOfLines={1}>
              {current?.name ?? 'No games installed'}
            </Text>
            <Text style={styles.status}>{position > 0 ? `Pinned to home · Position ${position}` : ''}</Text>
          </View>
          <View style={styles.hints}>
            <ButtonHint glyph="A" label="Play" onPress={() => current && onPlay(current)} />
            <ButtonHint glyph="Y" label={position > 0 ? 'Unpin' : 'Pin to home'} onPress={() => current && togglePin(current.titleId)} />
            <ButtonHint glyph="X" label="Edit tile" onPress={() => current && onEdit(current)} />
            <ButtonHint glyph="B" label="Back" onPress={onClose} />
          </View>
        </View>
      </View>
    </View>
  );
}

// Tuile sans visuel : silhouette de manette (Library.dc.html).
function Placeholder() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6.5 6h11A3.5 3.5 0 0 1 21 9.5l.8 5.6a2.4 2.4 0 0 1-4.2 1.9L15 14H9l-2.6 3a2.4 2.4 0 0 1-4.2-1.9L3 9.5A3.5 3.5 0 0 1 6.5 6z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  layout: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    paddingVertical: 16,
    paddingHorizontal: layout.sideMargin,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  title: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.26,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  gridScroll: {
    flex: 1,
    marginTop: 12,
    marginHorizontal: -6, // place pour l'anneau de focus au bord
    overflow: 'visible',
  },
  grid: {
    width: 682 + 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE.gap,
    padding: 6,
  },
  tile: {
    width: TILE.width,
    height: TILE.height,
    borderRadius: 10,
    backgroundColor: '#17181C',
  },
  tileClip: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
  },
  footer: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  footerText: {
    flexShrink: 1,
    marginRight: 16,
  },
  name: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 24,
  },
  status: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  hints: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
});
