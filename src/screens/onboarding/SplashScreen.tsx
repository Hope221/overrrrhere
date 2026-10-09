import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';

import { useSettings } from '../../settings';
import { colors, fonts } from '../../ui/theme';

// Splash (design/ecrans/Splash.dc.html) : icône 104 pt + mot-symbole 34 pt centrés.
// Les yeux de la mascotte regardent sur le côté puis reviennent (2,8 s), les « r » pulsent (1,6 s, décalés).
// « Reduce motion » : tout reste immobile.

const SIZE = 104;
const GLANCE = (-9 * 0.74 * SIZE) / 100; // -9 unités du dessin, groupe à l'échelle 0,74

export function SplashScreen({ onPress }: { onPress?: () => void }) {
  const { reduceMotion } = useSettings();
  const eyes = useRef(new Animated.Value(0)).current;
  const pulses = useRef([0, 1, 2, 3].map(() => new Animated.Value(1))).current;

  useEffect(() => {
    if (reduceMotion) return;
    const ease = Easing.inOut(Easing.ease);
    // @keyframes ovr-glance : 0-18 % au centre, 30-52 % à gauche, 64-100 % au centre.
    const glance = Animated.loop(
      Animated.sequence([
        Animated.delay(504),
        Animated.timing(eyes, { toValue: GLANCE, duration: 336, easing: ease, useNativeDriver: true }),
        Animated.delay(616),
        Animated.timing(eyes, { toValue: 0, duration: 336, easing: ease, useNativeDriver: true }),
        Animated.delay(1008),
      ]),
    );
    // @keyframes ovr-sig : opacité 0,15 → 1 → 0,15, décalée de 0,15 s par « r ».
    const signal = Animated.parallel(
      pulses.map((value, i) =>
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.loop(
            Animated.sequence([
              Animated.timing(value, { toValue: 0.15, duration: 0, useNativeDriver: true }),
              Animated.timing(value, { toValue: 1, duration: 800, easing: ease, useNativeDriver: true }),
              Animated.timing(value, { toValue: 0.15, duration: 800, easing: ease, useNativeDriver: true }),
            ]),
          ),
        ]),
      ),
    );
    glance.start();
    signal.start();
    return () => {
      glance.stop();
      signal.stop();
    };
  }, [reduceMotion, eyes, pulses]);

  return (
    <Pressable style={styles.screen} onPress={onPress}>
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
          <Rect x={0} y={0} width={100} height={100} rx={22.4} fill={colors.orange} />
          <G transform="translate(50 52) scale(0.74) translate(-50 -51)">
            <Path
              d="M20 34 C20 26 26 22 34 22 H66 C74 22 80 26 80 34 L86 64 C88 74 82 80 74 80 C68 80 64 76 61 70 L58 64 H42 L39 70 C36 76 32 80 26 80 C18 80 12 74 14 64 Z"
              fill={colors.white}
            />
          </G>
        </Svg>
        {/* Les yeux, sur un calque séparé pour pouvoir les animer. */}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: eyes }] }]}>
          <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100">
            <G transform="translate(50 52) scale(0.74) translate(-50 -51)">
              <Rect x={53} y={34} width={6} height={13} rx={3} fill={colors.orange} />
              <Rect x={63} y={34} width={6} height={13} rx={3} fill={colors.orange} />
            </G>
          </Svg>
        </Animated.View>
      </View>

      <View style={styles.wordmark}>
        <Text style={styles.letters}>ove</Text>
        {[1, 0.75, 0.5, 0.3].map((opacity, i) => (
          <Animated.Text key={i} style={[styles.letters, styles.r, { opacity: reduceMotion ? opacity : pulses[i] }]}>
            r
          </Animated.Text>
        ))}
        <Text style={styles.letters}>here</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  wordmark: {
    flexDirection: 'row',
  },
  letters: {
    color: colors.white,
    fontFamily: fonts.brand,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1.19,
  },
  r: {
    color: colors.orange,
  },
});
