import { Image, StyleSheet, Text, View } from 'react-native';

import { formatDuration, usePlaytimeMinutes, xboxKey } from '../playtime';
import { togglePin, useTiles, withArt } from '../tiles';
import { ButtonHint, PrimaryButton, TonalButton } from '../ui/components';
import { useInput } from '../ui/input';
import { colors, fonts, layout } from '../ui/theme';
import { InstalledGame } from '../xbox/games';
import { formatLastPlayed } from '../xbox/history';

// Game details (design/ecrans/GameDetails.dc.html), ouvert depuis Home avec View / « Details ».
// Chaque bloc est masqué si sa donnée manque. Manette : A Play ; Y Pin / Unpin from home ; X Edit tile ; B Back.

type Props = {
  game: InstalledGame;
  onPlay: (game: InstalledGame) => void;
  onEdit: (game: InstalledGame) => void;
  onClose: () => void;
};

export function GameDetailsScreen({ game: raw, onPlay, onEdit, onClose }: Props) {
  const tiles = useTiles();
  const game = withArt(raw, tiles); // images personnalisées (Edit tile) si elles existent
  const pinned = (tiles.pinned ?? []).includes(game.titleId);
  const playedHere = usePlaytimeMinutes(xboxKey(game.titleId));

  useInput((button) => {
    if (button === 'A') onPlay(raw);
    if (button === 'Y') togglePin(game.titleId);
    if (button === 'X') onEdit(raw);
    if (button === 'B') onClose();
  });

  const subtitle = [game.publisher, game.genre, 'Installed on your Xbox'].filter(Boolean).join(' · ');
  const a = game.achievements;

  return (
    <View style={styles.screen}>
      {game.background && <Image source={{ uri: game.background }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
      <View style={[StyleSheet.absoluteFill, styles.shadeLeft]} />
      <View style={[StyleSheet.absoluteFill, styles.shadeBottom]} />

      <View style={styles.content}>
        <View style={{ flexGrow: 1 }} />

        {game.tile && <Image source={{ uri: game.tile }} style={styles.tile} resizeMode="cover" />}
        <Text style={styles.title} numberOfLines={1}>
          {game.name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
        {game.description && (
          <Text style={styles.description} numberOfLines={3}>
            {game.description}
          </Text>
        )}

        <View style={styles.facts}>
          {game.lastPlayed > 0 && <Fact label="Last played" value={capitalize(formatLastPlayed(game.lastPlayed))} />}
          {playedHere > 0 && <Fact label="Played here" value={formatDuration(playedHere)} />}
          {a && (
            <View>
              <Text style={styles.factLabel}>Achievements</Text>
              <Text style={styles.factValue}>
                {a.current} of {a.total} <Text style={styles.factMuted}>· {a.gamerscore} G</Text>
              </Text>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, a.percent))}%` }]} />
              </View>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <View style={styles.buttons}>
            <PrimaryButton label="Play" onPress={() => onPlay(raw)} />
            <TonalButton glyph="Y" label={pinned ? 'Unpin from home' : 'Pin to home'} onPress={() => togglePin(game.titleId)} />
            <TonalButton glyph="X" label="Edit tile" onPress={() => onEdit(raw)} />
          </View>
          <ButtonHint glyph="B" label="Back" onPress={onClose} />
        </View>
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

// « yesterday » → « Yesterday » (maquette).
function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.ink,
  },
  // Dégradés de la maquette : gauche (90°) et bas (0°).
  shadeLeft: {
    experimental_backgroundImage: 'linear-gradient(90deg, rgba(8,8,10,0.94) 0%, rgba(8,8,10,0.82) 42%, rgba(8,8,10,0.2) 72%, rgba(8,8,10,0) 100%)',
  },
  shadeBottom: {
    experimental_backgroundImage: 'linear-gradient(0deg, rgba(8,8,10,0.7) 0%, rgba(8,8,10,0) 40%)',
  },
  content: {
    flex: 1,
    paddingTop: 22,
    paddingBottom: 20,
    paddingHorizontal: layout.sideMargin,
  },
  tile: {
    width: 112,
    height: 63,
    borderRadius: 8,
    boxShadow: '0 8px 20px rgba(0,0,0,0.45)',
  },
  title: {
    marginTop: 12,
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.28,
  },
  subtitle: {
    marginTop: 2,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  description: {
    marginTop: 10,
    width: 430,
    color: 'rgba(255,255,255,0.84)',
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  facts: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 28,
  },
  factLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.semiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.66,
    textTransform: 'uppercase',
  },
  factValue: {
    marginTop: 3,
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  factMuted: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.medium,
  },
  bar: {
    marginTop: 5,
    width: 140,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.white,
  },
  actions: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
