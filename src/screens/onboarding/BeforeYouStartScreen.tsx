import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { useFocusColor } from '../../settings';
import { Backdrop } from '../../ui/Backdrop';
import { ButtonHint, PrimaryButton } from '../../ui/components';
import { useInput } from '../../ui/input';
import { colors, fonts, layout } from '../../ui/theme';

// Before you start (maquette « Premiers pas : Xbox et jeux » du 08/10/2026) : entre Welcome et Sign in, les trois
// réglages de la Xbox sans lesquels le stream échoue. A = Continue (Sign in), B = Back (Welcome).

const STEPS = [
  { icon: 'remote', title: 'Remote features on', where: 'Settings › Devices & connections' },
  { icon: 'power', title: 'Power mode: Sleep', where: 'Settings › General › Power options' },
  { icon: 'wifi', title: 'Same Wi-Fi', where: 'Your Xbox and this iPhone' },
] as const;

export function BeforeYouStartScreen({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) {
  const focusColor = useFocusColor();

  useInput((button) => {
    if (button === 'A') onContinue();
    if (button === 'B') onBack();
  });

  return (
    <View style={styles.screen}>
      <Backdrop />
      <View style={styles.layout}>
        <View style={styles.heading}>
          <Text style={styles.title}>Before you start</Text>
          <Text style={styles.subtitle}>On your Xbox</Text>
        </View>

        <View style={styles.cards}>
          {STEPS.map((step, i) => (
            <View key={step.title} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.icon}>
                  <StepIcon kind={step.icon} />
                </View>
                <View style={styles.number}>
                  <Text style={styles.numberText}>{i + 1}</Text>
                </View>
              </View>
              <View style={{ flexGrow: 1 }} />
              <Text style={styles.cardTitle}>{step.title}</Text>
              <Text style={styles.cardWhere}>{step.where}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexGrow: 1 }} />

        <View style={styles.footer}>
          <PrimaryButton label="Continue" onPress={onContinue} focused focusColor={focusColor} />
          <ButtonHint glyph="B" label="Back" onPress={onBack} />
        </View>
      </View>
    </View>
  );
}

function StepIcon({ kind }: { kind: (typeof STEPS)[number]['icon'] }) {
  const props = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: colors.white, strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  if (kind === 'remote') {
    return (
      <Svg {...props}>
        <Rect x={3} y={6} width={18} height={12} rx={3} />
        <Path d="M7.5 12h3M9 10.5v3" />
        <Path d="M15.5 11h.01M17.5 13h.01" />
      </Svg>
    );
  }
  if (kind === 'power') {
    return (
      <Svg {...props}>
        <Path d="M12 3v8" />
        <Path d="M6.3 7.3a8 8 0 1 0 11.4 0" />
      </Svg>
    );
  }
  return (
    <Svg {...props}>
      <Path d="M2.5 8.5a14 14 0 0 1 19 0" />
      <Path d="M5.5 12a9.5 9.5 0 0 1 13 0" />
      <Path d="M8.7 15.4a5 5 0 0 1 6.6 0" />
      <Path d="M12 19h.01" />
    </Svg>
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
  cards: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 14,
  },
  card: {
    flex: 1,
    height: 172,
    padding: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(10,10,12,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  cardTitle: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 22,
  },
  cardWhere: {
    marginTop: 4,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
