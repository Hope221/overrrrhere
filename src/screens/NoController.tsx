import { BlurView } from 'expo-blur';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useSettings } from '../settings';
import { useBattery, useClock } from '../ui/device';
import { colors, fonts, layout } from '../ui/theme';

// No controller (design/ecrans/NoController.dc.html) : affiché par-dessus l'écran en cours tant
// qu'aucune manette n'est connectée. Disparaît dès qu'elle est détectée, ou avec « Play with touch controls »
// (navigation au toucher sur le launcher, contrôles tactiles pendant le stream : voir Root.tsx).

export function NoController({ onContinueWithTouch }: { onContinueWithTouch: () => void }) {
  const battery = useBattery();
  const clock = useClock();

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* L'écran derrière : flou 22 px, luminosité 28 %. */}
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,10,0.72)' }]} />

      <View style={styles.layout}>
        <View style={styles.status}>
          {battery.percent !== null && <Text style={styles.battery}>{battery.percent}%</Text>}
          <Text style={styles.clock}>{clock}</Text>
        </View>

        <View style={{ flexGrow: 1 }} />

        <Illustration />
        <Text style={styles.title}>Connect your controller</Text>
        <Text style={styles.text}>The launcher opens as soon as it's detected</Text>

        <View style={{ flexGrow: 1 }} />

        <Pressable onPress={onContinueWithTouch} style={styles.link}>
          <Text style={styles.linkText}>Play with touch controls</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Manette ouverte autour du téléphone, et point vert qui pulse (@keyframes lp-pulse, 1,8 s).
function Illustration() {
  const { reduceMotion } = useSettings();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.4] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });

  return (
    <View style={styles.illustration}>
      <Svg width={300} height={120} viewBox="0 0 300 120" fill="none" stroke={colors.white} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M18 38 C18 26 26 20 38 20 H66 V100 H44 C28 100 14 92 12 78 L8 58 C6 46 10 38 18 38 Z" opacity={0.55} />
        <Circle cx={40} cy={48} r={7} opacity={0.55} />
        <Path d="M36 74h8M40 70v8" opacity={0.55} />
        <Path d="M282 38 C282 26 274 20 262 20 H234 V100 H256 C272 100 286 92 288 78 L292 58 C294 46 290 38 282 38 Z" opacity={0.55} />
        <Circle cx={260} cy={76} r={7} opacity={0.55} />
        <Circle cx={256} cy={46} r={2.4} fill={colors.white} stroke="none" opacity={0.55} />
        <Circle cx={266} cy={54} r={2.4} fill={colors.white} stroke="none" opacity={0.55} />
        <Rect x={92} y={28} width={132} height={64} rx={12} />
        <Rect x={100} y={36} width={116} height={48} rx={6} opacity={0.25} />
        <Path d="M76 60 H84" strokeDasharray="2 4" opacity={0.6} />
        <Path d="M228 60 H236" strokeDasharray="2 4" opacity={0.6} />
      </Svg>
      {!reduceMotion && <Animated.View style={[styles.pulse, { opacity, transform: [{ scale }] }]} />}
      <View style={styles.dot} />
    </View>
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
    paddingBottom: 18,
    paddingHorizontal: layout.sideMargin,
    alignItems: 'center',
  },
  status: {
    alignSelf: 'stretch',
    height: 32,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 14,
  },
  battery: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.medium,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  clock: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  illustration: {
    width: 300,
    height: 120,
  },
  pulse: {
    position: 'absolute',
    left: 222,
    top: 52,
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.ready,
  },
  dot: {
    position: 'absolute',
    left: 227,
    top: 57,
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.ready,
  },
  title: {
    marginTop: 22,
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.24,
    textAlign: 'center',
  },
  text: {
    marginTop: 4,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  link: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  linkText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
