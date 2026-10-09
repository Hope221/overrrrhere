import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useFocusColor } from '../../settings';
import { colors, focusRing, fonts } from '../../ui/theme';

// Deux grandes tuiles « ROM folder » / « ROM files » (maquette « Premiers pas : Xbox et jeux » du 08/10/2026,
// https://claude.ai/artifact/BVFefyUSmVjGcX4GWrYapy) : fin des premiers pas (Add your games) et bibliothèque Retro vide.
// Manette : gauche / droite = choix, A = ouvrir (géré par l'écran qui les affiche).

export type AddChoice = 'folder' | 'files';
export const ADD_CHOICES: AddChoice[] = ['folder', 'files'];

type Props = {
  focused: AddChoice | null; // null : aucune tuile sélectionnée à la manette
  folderName: string | null; // dossier déjà choisi (Settings › Retro › ROM folder)
  onPick: (choice: AddChoice) => void;
  variant: 'onboarding' | 'library'; // onboarding : panneaux sombres sur le fond clair ; library : sur l'anthracite
};

export function AddGamesChoices({ focused, folderName, onPick, variant }: Props) {
  const focusColor = useFocusColor();
  const onboarding = variant === 'onboarding';
  const items: { key: AddChoice; title: string; sub: string }[] = [
    { key: 'folder', title: 'ROM folder', sub: folderName ? `iCloud Drive › ${folderName}` : 'iCloud Drive · All your games' },
    { key: 'files', title: 'ROM files', sub: 'Files app' },
  ];
  return (
    <View style={styles.row}>
      {items.map((item) => {
        const on = focused === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => onPick(item.key)}
            style={[
              styles.tile,
              onboarding ? styles.tileOnboarding : styles.tileLibrary,
              on && (onboarding ? styles.tileOnboardingOn : styles.tileLibraryOn),
              on && { boxShadow: focusRing(focusColor) },
            ]}
          >
            <View style={[styles.icon, !onboarding && styles.iconSmall]}>{item.key === 'folder' ? <FolderCloudIcon /> : <FilePlusIcon />}</View>
            <View style={{ flexGrow: 1 }} />
            <Text style={[styles.title, !onboarding && styles.titleSmall]}>{item.title}</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {item.sub}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FolderCloudIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Path d="M9.5 15.5h5a2 2 0 0 0 .2-4 3 3 0 0 0-5.7-.6 1.8 1.8 0 0 0 .5 4.6z" />
    </Svg>
  );
}

function FilePlusIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <Path d="M14 3v5h5" />
      <Path d="M12 11v6M9 14h6" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  tile: {
    flex: 1,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
  },
  tileOnboarding: {
    height: 188,
    backgroundColor: 'rgba(10,10,12,0.36)',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  tileOnboardingOn: {
    backgroundColor: 'rgba(10,10,12,0.6)',
  },
  tileLibrary: {
    height: 156,
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tileLibraryOn: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSmall: {
    width: 48,
    height: 48,
  },
  title: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  titleSmall: {
    fontSize: 18,
    lineHeight: 24,
  },
  sub: {
    marginTop: 4,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 19,
  },
});
