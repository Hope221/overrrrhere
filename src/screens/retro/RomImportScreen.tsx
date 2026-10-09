import * as ImagePicker from 'expo-image-picker';
import { ReactNode, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ImportCandidate, RetroGame, addGames, discardCandidates, findCover } from '../../retro/library';
import { formatSize } from '../../retro/systems';
import { PrimaryButton, SecondaryButton } from '../../ui/components';
import { FileIcon } from '../../ui/icons';
import { useInput } from '../../ui/input';
import { colors, fonts, layout } from '../../ui/theme';

// Add a ROM (design/ecrans/RomImport.dc.html), 3 versions :
// un fichier (« Add this game? »), plusieurs (« Add these games? »), aucun pris en charge (« This file isn't supported »).
// Manette : A = ajouter (ou choisir un autre fichier), B = Cancel.

const MAX_ROWS = 5;

type Props = {
  candidates: ImportCandidate[];
  onAdded: (games: RetroGame[]) => void;
  onChooseAgain: () => void;
  onCancel: () => void;
};

export function RomImportScreen({ candidates: initial, onAdded, onChooseAgain, onCancel }: Props) {
  const [candidates, setCandidates] = useState(initial);
  const [searching, setSearching] = useState(true);
  const [adding, setAdding] = useState(false);
  const ready = candidates.filter((c) => c.system);
  const single = candidates.length === 1 && ready.length === 1 ? ready[0] : null;

  // Jaquettes trouvées automatiquement dans libretro-thumbnails.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const c of initial) {
        if (!c.system) continue;
        const cover = await findCover(c.system, c.staged.name);
        if (cancelled) return;
        if (cover) setCandidates((list) => list.map((x) => (x.staged.path === c.staged.path && !x.cover ? { ...x, cover } : x)));
      }
      if (!cancelled) setSearching(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initial]);

  async function add() {
    if (adding || ready.length === 0) return;
    setAdding(true);
    try {
      const added = await addGames(ready);
      discardCandidates(candidates.filter((c) => !c.system));
      onAdded(added);
    } finally {
      setAdding(false);
    }
  }

  function cancel() {
    discardCandidates(candidates);
    onCancel();
  }

  function chooseAgain() {
    discardCandidates(candidates);
    onCancel();
    onChooseAgain();
  }

  async function coverFromPhotos() {
    if (!single) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.9 });
    if (result.canceled || !result.assets?.[0]) return;
    const uri = result.assets[0].uri;
    setCandidates((list) => list.map((x) => (x === single ? { ...x, cover: uri } : x)));
  }

  function rename(name: string) {
    setCandidates((list) => list.map((x) => (x === single ? { ...x, name } : x)));
  }

  useInput((button) => {
    if (button === 'A') (ready.length === 0 ? chooseAgain : add)();
    if (button === 'B') cancel();
  });

  const backdrop = ready.find((c) => c.cover)?.cover;

  return (
    <View style={styles.screen}>
      {backdrop && <Image source={{ uri: backdrop }} style={styles.backdrop} resizeMode="cover" blurRadius={28} />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,12,0.7)' }]} />

      {ready.length === 0 ? (
        <NotSupported onChooseAgain={chooseAgain} onCancel={cancel} />
      ) : single ? (
        <View style={styles.content}>
          <Text style={styles.title}>Add this game?</Text>
          <Text style={styles.subtitle}>Imported from Files</Text>

          <View style={styles.oneRow}>
            <View style={styles.coverColumn}>
              <View style={styles.cover}>
                {single.cover && <Image source={{ uri: single.cover }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{single.system!.chip}</Text>
                </View>
              </View>
              <View style={styles.coverNote}>
                <View style={[styles.dot, { backgroundColor: single.cover ? colors.ready : 'rgba(255,255,255,0.3)' }]} />
                <Text style={styles.coverNoteText}>{single.cover ? 'Cover found' : searching ? 'Looking for the cover…' : 'No cover found'}</Text>
              </View>
            </View>

            <View style={styles.fields}>
              <Field label="File">
                <Text style={styles.fieldValue} numberOfLines={1}>
                  {single.staged.name} · {formatSize(single.staged.size)}
                </Text>
              </Field>
              <Field label="System">
                <Text style={styles.fieldValue}>
                  {single.system!.name} <Text style={styles.detected}>Detected</Text>
                </Text>
              </Field>
              <Field label="Name" highlighted>
                <TextInput
                  value={single.name}
                  onChangeText={rename}
                  style={styles.nameInput}
                  selectionColor={colors.orange}
                  returnKeyType="done"
                  maxLength={80}
                />
                <Text style={styles.fieldHint}>Edit with touch</Text>
              </Field>
              <Pressable onPress={coverFromPhotos}>
                <Field label="Cover" last>
                  <Text style={styles.fieldValue}>Change from Photos</Text>
                </Field>
              </Pressable>
            </View>
          </View>

          <View style={{ flexGrow: 1 }} />
          <View style={styles.buttons}>
            <PrimaryButton label={adding ? 'Adding…' : 'Add to library'} onPress={add} />
            <SecondaryButton glyph="B" label="Cancel" onPress={cancel} />
          </View>
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={styles.title}>Add these games?</Text>
          <View style={styles.counts}>
            <Text style={styles.subtitle}>
              {candidates.length} files imported from Files
            </Text>
            <View style={styles.count}>
              <View style={[styles.dot, { backgroundColor: colors.ready }]} />
              <Text style={styles.subtitle}>{ready.length} ready</Text>
            </View>
            {candidates.length > ready.length && (
              <View style={styles.count}>
                <View style={[styles.dot, { backgroundColor: colors.destructive }]} />
                <Text style={styles.subtitle}>{candidates.length - ready.length} not supported</Text>
              </View>
            )}
          </View>

          <View style={styles.list}>
            {candidates.slice(0, MAX_ROWS).map((c) => (
              <View key={c.staged.path} style={[styles.listRow, !c.system && { opacity: 0.8 }]}>
                {c.system ? (
                  <View style={styles.listArt}>{c.cover && <Image source={{ uri: c.cover }} style={StyleSheet.absoluteFill} resizeMode="cover" />}</View>
                ) : (
                  <View style={[styles.listArt, styles.listArtBad]}>
                    <FileIcon />
                  </View>
                )}
                <Text style={styles.listName} numberOfLines={1}>
                  {c.system ? c.name : c.staged.name}
                </Text>
                <Text style={[styles.listSystem, !c.system && { color: colors.destructive }]} numberOfLines={1}>
                  {c.system ? c.system.name : 'Not supported'}
                </Text>
                <Text style={styles.listSize}>{formatSize(c.staged.size)}</Text>
              </View>
            ))}
            {candidates.length > MAX_ROWS && (
              <Text style={styles.more}>
                and {candidates.length - MAX_ROWS} more {candidates.length - MAX_ROWS > 1 ? 'files' : 'file'}
              </Text>
            )}
          </View>

          <View style={{ flexGrow: 1 }} />
          <View style={styles.buttons}>
            <PrimaryButton label={adding ? 'Adding…' : `Add ${ready.length} game${ready.length > 1 ? 's' : ''}`} onPress={add} />
            <SecondaryButton glyph="B" label="Cancel" onPress={cancel} />
          </View>
        </View>
      )}
    </View>
  );
}

function Field({ label, children, highlighted, last }: { label: string; children: ReactNode; highlighted?: boolean; last?: boolean }) {
  return (
    <View style={[styles.field, highlighted && styles.fieldHighlighted, !highlighted && !last && styles.fieldLine]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRight}>{children}</View>
    </View>
  );
}

// Texte exact de la maquette RomImport.dc.html (mise à jour du 05/10/2026).
function NotSupported({ onChooseAgain, onCancel }: { onChooseAgain: () => void; onCancel: () => void }) {
  return (
    <View style={styles.bad}>
      <View style={styles.badIcon}>
        <FileIcon size={26} crossed />
      </View>
      <Text style={styles.badTitle}>This file isn't supported</Text>
      <Text style={styles.badText}>
        overrrrhere plays NES, SNES, Game Boy, GBA, Mega Drive, N64, PSP, DS, 3DS, GameCube and Wii games. For GameCube and Wii, use .iso,
        .rvz or .wbfs files.
      </Text>
      <View style={[styles.buttons, { marginTop: 22 }]}>
        <PrimaryButton label="Choose another file" onPress={onChooseAgain} />
        <SecondaryButton glyph="B" label="Cancel" onPress={onCancel} />
      </View>
    </View>
  );
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
  backdrop: {
    position: 'absolute',
    left: -40,
    top: -40,
    right: -40,
    bottom: -40,
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
  oneRow: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 28,
  },
  coverColumn: {
    width: 240,
    gap: 8,
  },
  cover: {
    width: 240,
    height: 135,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.tileBackground,
    boxShadow: '0 0 0 2px #0A0A0C, 0 0 0 4px #FFFFFF, 0 14px 32px rgba(0,0,0,0.5)',
  },
  chip: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    height: 18,
    paddingHorizontal: 7,
    borderRadius: 5,
    backgroundColor: 'rgba(10,10,12,0.78)',
    justifyContent: 'center',
  },
  chipText: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  coverNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coverNoteText: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  fields: {
    flex: 1,
  },
  field: {
    height: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLine: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  fieldHighlighted: {
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  fieldLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  fieldRight: {
    flexShrink: 1,
    marginLeft: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldValue: {
    flexShrink: 1,
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 14,
  },
  detected: {
    color: colors.ready,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  nameInput: {
    minWidth: 120,
    maxWidth: 230,
    padding: 0,
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    textAlign: 'right',
  },
  fieldHint: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  counts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  count: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  list: {
    marginTop: 14,
  },
  listRow: {
    height: 40,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  listArt: {
    width: 48,
    height: 27,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.tileBackground,
  },
  listArtBad: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listName: {
    flex: 1,
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 14,
  },
  listSystem: {
    width: 150,
    color: 'rgba(255,255,255,0.74)',
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  listSize: {
    width: 56,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.55)',
    fontFamily: fonts.regular,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  more: {
    paddingTop: 8,
    paddingHorizontal: 12,
    color: 'rgba(255,255,255,0.55)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  bad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.sideMargin,
  },
  badIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badTitle: {
    marginTop: 18,
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.24,
  },
  badText: {
    marginTop: 6,
    width: 470,
    textAlign: 'center',
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
});
