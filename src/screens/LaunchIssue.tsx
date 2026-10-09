import { BlurView } from 'expo-blur';
import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { PrimaryButton, SecondaryButton } from '../ui/components';
import { WifiOffIcon } from '../ui/icons';
import { useInput } from '../ui/input';
import { colors, fonts, layout } from '../ui/theme';

// Launch problem (design/ecrans/LaunchIssue.dc.html), 5 variantes.
// « No internet » (mise à jour du 29/09) : ouvert par Home quand un jeu Xbox est lancé hors ligne.

export type Issue = 'noInternet' | 'wifi' | 'offline' | 'signedOut' | 'dropped';

const CONTENT: Record<Issue, { title: string; text: string; primary: string; secondary?: { glyph: 'X' | 'B'; label: string } }> = {
  noInternet: {
    title: "You're offline",
    text: 'Retro games still work.',
    primary: 'Go to Retro',
    secondary: { glyph: 'B', label: 'Go back' },
  },
  wifi: {
    title: "You're not on Wi-Fi",
    text: 'On cellular data: expect lag and heavy data use.',
    primary: 'Go back',
    secondary: { glyph: 'X', label: 'Play anyway' },
  },
  offline: {
    title: "Your Xbox isn't reachable",
    text: "Check that it's plugged in and online, and that its power mode is set to Sleep so it can wake up remotely.",
    primary: 'Try again',
    secondary: { glyph: 'B', label: 'Go back' },
  },
  signedOut: {
    title: 'Sign in again',
    text: 'Your Microsoft sign-in expired. Your pinned games and settings are still here.',
    primary: 'Sign in with Microsoft',
  },
  dropped: {
    title: 'The stream dropped',
    text: 'Your game is still running. Reconnect to pick up where you left off.',
    primary: 'Reconnect',
    secondary: { glyph: 'B', label: 'Back to launcher' },
  },
};

type Props = {
  issue: Issue;
  backdrop?: ReactNode; // ce qu'il y a derrière (flouté) ; sinon fond sombre
  onPrimary: () => void;
  onSecondary?: () => void;
};

export function LaunchIssue({ issue, backdrop, onPrimary, onSecondary }: Props) {
  const content = CONTENT[issue];

  useInput((button) => {
    if (button === 'A') onPrimary();
    if (content.secondary && button === content.secondary.glyph) onSecondary?.();
    // B revient aussi en arrière quand l'action secondaire est « X Play anyway ».
    if (button === 'B' && issue === 'wifi') onPrimary();
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      {backdrop}
      {/* Accueil ou jeu derrière : flou 22 px, luminosité 30 %. */}
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,10,0.7)' }]} />

      <View style={styles.layout}>
        <View style={styles.iconBox}>
          <IssueIcon issue={issue} />
        </View>
        <Text style={styles.title}>{content.title}</Text>
        <Text style={[styles.text, issue === 'noInternet' && { width: 420 }]}>{content.text}</Text>
        <View style={styles.buttons}>
          <PrimaryButton label={content.primary} onPress={onPrimary} />
          {content.secondary && <SecondaryButton glyph={content.secondary.glyph} label={content.secondary.label} onPress={onSecondary} />}
        </View>
      </View>
    </View>
  );
}

// Icônes 26 pt de la maquette : Wi-Fi barré (No internet et No Wi-Fi), alimentation, personne, reconnexion.
function IssueIcon({ issue }: { issue: Issue }) {
  if (issue === 'noInternet' || issue === 'wifi') return <WifiOffIcon size={26} strokeWidth={1.7} />;
  const paths: Record<Exclude<Issue, 'noInternet' | 'wifi'>, ReactNode> = {
    offline: (
      <>
        <Path d="M12 3v8" />
        <Path d="M6.6 6.6a8 8 0 1 0 10.8 0" />
      </>
    ),
    signedOut: (
      <>
        <Circle cx={12} cy={8} r={4} />
        <Path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </>
    ),
    dropped: (
      <>
        <Path d="M20 12a8 8 0 0 1-13.7 5.6" />
        <Path d="M4 12a8 8 0 0 1 13.7-5.6" />
        <Path d="M18 3v4h-4" />
        <Path d="M6 21v-4h4" />
      </>
    ),
  };
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {paths[issue]}
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
    paddingTop: 14,
    paddingBottom: 26,
    paddingHorizontal: layout.sideMargin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 18,
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.24,
    textAlign: 'center',
  },
  text: {
    marginTop: 6,
    width: 440,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  buttons: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
