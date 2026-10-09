import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDuration, usePlaytimeMinutes } from '../../playtime';
import { RetroGame, SlotId, cancelDownload, deleteGame, removeDownload, saveSlots, useRetroLibrary } from '../../retro/library';
import { formatSize, systemById } from '../../retro/systems';
import { useFocusColor } from '../../settings';
import { retroArt, togglePin, useTiles } from '../../tiles';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { ButtonHint, PrimaryButton, TonalButton } from '../../ui/components';
import { CloudIcon } from '../../ui/icons';
import { useInput } from '../../ui/input';
import { colors, focusRing, fonts, layout } from '../../ui/theme';
import { formatLastPlayed } from '../../xbox/history';
import { TileEditorScreen } from '../TileEditorScreen';
import { formatWhen } from './RetroPlayScreen';
import { SaveImage } from './SaveImage';

// Retro game details (design/ecrans/RetroDetails.dc.html) : système, taille, Last played, Played here,
// sauvegardes en vignettes (Auto-save puis Slot 1 à 3, seulement celles qui existent).
// Le bouton principal devient « Load Slot N » quand un emplacement est sélectionné.
// Manette : gauche / droite = sauvegarde ; bas = Delete, haut = retour aux sauvegardes ;
// A ; Y Pin / Unpin ; X Edit tile ; B Back.
// Jeu du dossier iCloud (maquette « Dossier iCloud », écran 4) : « Remove download » à la place de Delete, sans
// confirmation (le jeu reste dans iCloud) ; rien en bas s'il n'est pas sur l'iPhone. Pendant son téléchargement, B annule.

type Props = {
  gameId: string;
  onPlay: (game: RetroGame, slot: SlotId | null) => void;
  onClose: () => void;
};

export function RetroDetailsScreen({ gameId, onPlay, onClose }: Props) {
  const { games, download } = useRetroLibrary(); // relu aussi après une sauvegarde (vignettes à jour)
  const tiles = useTiles();
  const focusColor = useFocusColor();
  const game = games.find((g) => g.id === gameId);
  const playedHere = usePlaytimeMinutes(`retro:${gameId}`);
  const [selected, setSelected] = useState(0);
  const [focus, setFocus] = useState<'saves' | 'delete'>('saves');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const slots = game ? saveSlots(game) : [];
  const slot = slots[Math.min(selected, slots.length - 1)] ?? null;
  const pinned = (tiles.pinned ?? []).includes(gameId);
  const downloading = download?.id === gameId && !download.error;
  // Bouton du bas : Delete (jeu importé), Remove download (jeu du dossier, sur l'iPhone), ou aucun.
  const bottom: 'delete' | 'remove' | null = !game ? null : !game.cloud ? 'delete' : game.onDevice ? 'remove' : null;

  function pressBottom() {
    if (!game) return;
    if (bottom === 'delete') setConfirmDelete(true);
    if (bottom === 'remove') {
      removeDownload(game);
      setFocus('saves');
    }
  }

  function play() {
    if (game) onPlay(game, slot?.id ?? null);
  }

  useInput(
    (button) => {
      if (!game) return;
      if (downloading) {
        if (button === 'B') cancelDownload();
        return;
      }
      if (button === 'Left' && focus === 'saves') setSelected(Math.max(0, selected - 1));
      if (button === 'Right' && focus === 'saves') setSelected(Math.min(slots.length - 1, selected + 1));
      if (button === 'Down' && bottom) setFocus('delete');
      if (button === 'Up') setFocus('saves');
      if (button === 'A') (focus === 'delete' && bottom ? pressBottom : play)();
      if (button === 'Y') togglePin(gameId);
      if (button === 'X') setEditing(true);
      if (button === 'B') onClose();
    },
    !editing && !confirmDelete,
  );

  if (!game) return null;

  const art = retroArt(game, tiles);
  const facts = [
    game.lastPlayed ? { label: 'Last played', value: capitalize(formatLastPlayed(game.lastPlayed)) } : null,
    playedHere > 0 ? { label: 'Played here', value: formatDuration(playedHere) } : null,
  ].filter((f): f is { label: string; value: string } => !!f);
  const playLabel = !slot ? 'Play' : slot.id === 'auto' ? 'Continue' : `Load ${slot.name}`;

  return (
    <View style={styles.screen}>
      {art.background && <Image source={{ uri: art.background }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
      <View style={[StyleSheet.absoluteFill, styles.shadeLeft]} />
      <View style={[StyleSheet.absoluteFill, styles.shadeBottom]} />

      <View style={styles.content}>
        <View style={{ flexGrow: 1 }} />

        <Text style={styles.title} numberOfLines={1}>
          {game.name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {download?.id === gameId
            ? download.error ?? `Downloading from iCloud · ${formatSize(game.size)} · The game starts when it's ready`
            : game.cloud
              ? `${systemById(game.system).name} · In iCloud${game.onDevice ? ' · On this iPhone' : ''} · ${formatSize(game.size)}`
              : `${systemById(game.system).name} · On this iPhone · ${formatSize(game.size)}`}
        </Text>

        {facts.length > 0 && (
          <View style={styles.facts}>
            {facts.map((f) => (
              <View key={f.label}>
                <Text style={styles.label}>{f.label}</Text>
                <Text style={styles.factValue}>{f.value}</Text>
              </View>
            ))}
          </View>
        )}

        {slots.length > 0 && (
          <>
            <Text style={[styles.label, styles.savesLabel]}>Save states</Text>
            <View style={styles.saves}>
              {slots.map((s, i) => {
                const on = s === slot;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => {
                      setSelected(i);
                      setFocus('saves');
                    }}
                    style={styles.save}
                  >
                    <View style={[styles.saveImage, { boxShadow: on ? `0 0 0 2px ${colors.ink}, 0 0 0 4px ${focusColor}` : '0 4px 12px rgba(0,0,0,0.4)' }]}>
                      {s.image && <SaveImage uri={s.image} system={game.system} />}
                    </View>
                    <View>
                      <Text style={styles.saveName}>{s.name}</Text>
                      <Text style={styles.saveWhen}>{formatWhen(s.time)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <View style={styles.actions}>
          <View style={styles.buttons}>
            <PrimaryButton label={playLabel} onPress={play} />
            <TonalButton glyph="Y" label={pinned ? 'Unpin from home' : 'Pin to home'} onPress={() => togglePin(gameId)} />
            <TonalButton glyph="X" label="Edit tile" onPress={() => setEditing(true)} />
            {bottom === 'delete' && (
              <Pressable
                onPressIn={() => setFocus('delete')}
                onPress={pressBottom}
                style={[styles.delete, focus === 'delete' && { boxShadow: focusRing(focusColor) }]}
              >
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            )}
            {bottom === 'remove' && (
              <Pressable
                onPressIn={() => setFocus('delete')}
                onPress={pressBottom}
                style={[styles.remove, focus === 'delete' && { boxShadow: focusRing(focusColor) }]}
              >
                <CloudIcon size={16} strokeWidth={1.8} download />
                <Text style={styles.removeText}>Remove download</Text>
              </Pressable>
            )}
          </View>
          {downloading ? (
            <ButtonHint glyph="B" label="Cancel" onPress={cancelDownload} />
          ) : (
            <ButtonHint glyph="B" label="Back" onPress={onClose} />
          )}
        </View>
      </View>

      {editing && <TileEditorScreen game={game} onClose={() => setEditing(false)} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this game?"
          message="The ROM file and its save states will be removed from this iPhone."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            onClose();
            deleteGame(gameId);
          }}
        />
      )}
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
    experimental_backgroundImage: 'linear-gradient(90deg, rgba(8,8,10,0.95) 0%, rgba(8,8,10,0.85) 48%, rgba(8,8,10,0.25) 78%, rgba(8,8,10,0.1) 100%)',
  },
  shadeBottom: {
    experimental_backgroundImage: 'linear-gradient(0deg, rgba(8,8,10,0.75) 0%, rgba(8,8,10,0) 42%)',
  },
  content: {
    flex: 1,
    paddingTop: 22,
    paddingBottom: 20,
    paddingHorizontal: layout.sideMargin,
  },
  title: {
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
  facts: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 28,
  },
  label: {
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
  savesLabel: {
    marginTop: 16,
  },
  saves: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 14,
  },
  save: {
    gap: 6,
  },
  saveImage: {
    width: 96,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.tileBackground,
  },
  saveName: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
  },
  saveWhen: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 14,
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
  // Delete : contour rouge rgba(255,138,115,0.55), texte #FF8A73.
  delete: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,138,115,0.55)',
    justifyContent: 'center',
  },
  // Remove download : bouton secondaire (contour rgba(255,255,255,0.35)), rien n'est perdu.
  remove: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  removeText: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 15,
  },
  deleteText: {
    color: colors.destructive,
    fontFamily: fonts.semiBold,
    fontSize: 15,
  },
});
