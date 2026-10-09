import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import Retro from '../../../modules/retro';
import { ImportCandidate, candidateName, chooseRomFolder, useRetroLibrary } from '../../retro/library';
import { fileSystem } from '../../retro/systems';
import { Backdrop } from '../../ui/Backdrop';
import { ButtonHint } from '../../ui/components';
import { useInput } from '../../ui/input';
import { colors, fonts, layout } from '../../ui/theme';
import { ADD_CHOICES, AddChoice, AddGamesChoices } from '../retro/AddGamesChoices';
import { RomImportScreen } from '../retro/RomImportScreen';

// Add your games (maquette « Premiers pas : Xbox et jeux » du 08/10/2026) : dernière étape des premiers pas, avec ou
// sans Xbox. A = ouvrir le choix sélectionné (dossier iCloud ou fichiers), B = Later (Home).
// Déjà des jeux sur l'iPhone (Show the welcome again) : l'étape est sautée.

export function AddGamesScreen({ onDone }: { onDone: () => void }) {
  const { games, folder } = useRetroLibrary();
  const [focused, setFocused] = useState<AddChoice>('folder');
  const [importing, setImporting] = useState<ImportCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (games.length > 0 && !busy && !importing) onDone();
  }, []);

  async function open(choice: AddChoice) {
    if (busy) return;
    setFocused(choice);
    setBusy(true);
    try {
      if (choice === 'folder') {
        if (await chooseRomFolder().catch(() => null)) onDone();
        return;
      }
      const files = await Retro.pickRoms();
      if (files.length > 0) {
        setImporting(files.map((staged) => ({ staged, system: fileSystem(staged.name, staged.path), name: candidateName(staged), cover: null })));
      }
    } finally {
      setBusy(false);
    }
  }

  useInput(
    (button) => {
      const i = ADD_CHOICES.indexOf(focused);
      if (button === 'Left') setFocused(ADD_CHOICES[Math.max(0, i - 1)]);
      if (button === 'Right') setFocused(ADD_CHOICES[Math.min(ADD_CHOICES.length - 1, i + 1)]);
      if (button === 'A') open(focused);
      if (button === 'B') onDone();
    },
    importing === null,
  );

  return (
    <View style={styles.screen}>
      <Backdrop />
      <View style={styles.layout}>
        <View style={styles.heading}>
          <Text style={styles.title}>Add your games</Text>
          <Text style={styles.subtitle}>Your own ROMs · No games included</Text>
        </View>

        <View style={styles.choices}>
          <AddGamesChoices focused={focused} folderName={folder?.name ?? null} onPick={open} variant="onboarding" />
        </View>

        <View style={{ flexGrow: 1 }} />

        <View style={styles.hints}>
          <ButtonHint glyph="A" label="Select" onPress={() => open(focused)} />
          <ButtonHint glyph="B" label="Later" onPress={onDone} />
        </View>
      </View>

      {importing && <RomImportScreen candidates={importing} onChooseAgain={() => open('files')} onAdded={onDone} onCancel={() => setImporting(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  layout: {
    flex: 1,
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: layout.sideMargin,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 14,
  },
  title: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.45,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 14,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.86)',
    fontFamily: fonts.regular,
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 10,
  },
  choices: {
    marginTop: 22,
  },
  hints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
});
