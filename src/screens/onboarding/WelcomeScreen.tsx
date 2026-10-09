import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';

import { useSettings } from '../../settings';
import { PrimaryButton, Wordmark } from '../../ui/components';
import { Logo } from '../../ui/icons';
import { useInput } from '../../ui/input';
import { colors, fonts, layout } from '../../ui/theme';

// Welcome (design/ecrans/Welcome.dc.html). Manette : A = Get started.
// La partie droite (panneau orange + manette) est calée sur le bord droit, la gauche sur le bord gauche,
// pour tenir sur les iPhone plus larges que la maquette (852 × 393).

// manette.png : l'écran du téléphone occupe x 22,98 %, y 14,56 %, largeur 54,05 %, hauteur 72,80 % (CLAUDE.md).
const CONTROLLER = { width: 432, height: 154 };
const SCREEN = {
  left: CONTROLLER.width * 0.2298,
  top: CONTROLLER.height * 0.1456,
  width: CONTROLLER.width * 0.5405,
  height: CONTROLLER.height * 0.728,
};

export function WelcomeScreen({ onGetStarted }: { onGetStarted: () => void }) {
  const { reduceMotion } = useSettings();
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    // @keyframes ovr-float : 0 → -5 → 0 en 4 s.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: -5, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, float]);

  useInput((button) => {
    if (button === 'A') onGetStarted();
  });

  return (
    <View style={styles.screen}>
      {/* Partie droite : cadre de 444 × 393 (852 − 408) centré verticalement, collé au bord droit. */}
      <View style={styles.art}>
        <View style={styles.panel} />
        <View style={[styles.panel, styles.panelShade]} />
        <View style={styles.floorShadow} />
        <Animated.View style={[styles.controller, { transform: [{ translateY: float }] }]}>
          {/* Taille explicite : sinon l'image garde sa taille d'origine (2494 × 886). */}
          <Image source={require('../../../assets/images/manette.png')} style={styles.controllerImage} resizeMode="stretch" />
          <Image source={require('../../../assets/images/welcome-fond.jpg')} style={styles.phoneScreen} resizeMode="cover" />
        </Animated.View>
      </View>

      <View style={styles.left}>
        <View style={styles.brand}>
          <Logo size={28} />
          <Wordmark size={20} />
        </View>

        <View style={{ flexGrow: 1 }} />

        <Text style={styles.title}>
          Your games,{'\n'}over <Text style={{ color: colors.orange }}>here</Text>.
        </Text>
        <Text style={styles.text}>Play your Xbox games and your retro games on your iPhone, with your controller.</Text>

        <View style={styles.actions}>
          <PrimaryButton label="Get started" onPress={onGetStarted} />
          <Text style={styles.compat}>Xbox Series X|S · Xbox One · Your own ROMs</Text>
        </View>

        <View style={{ flexGrow: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  art: {
    position: 'absolute',
    right: 0,
    top: '50%',
    marginTop: -393 / 2,
    width: 852 - 408,
    height: 393,
  },
  // Panneau orange : 312 de large, coins 36 à gauche (x 540 → bord droit).
  panel: {
    position: 'absolute',
    right: 0,
    top: -200,
    bottom: -200,
    width: 312,
    backgroundColor: colors.orange,
    borderTopLeftRadius: 36,
    borderBottomLeftRadius: 36,
  },
  panelShade: {
    backgroundColor: 'transparent',
    experimental_backgroundImage: 'linear-gradient(200deg, rgba(10,10,12,0) 45%, rgba(10,10,12,0.35) 100%)',
  },
  // Ombre au sol sous la manette (x 452, y 262, 350 × 24, floutée).
  floorShadow: {
    position: 'absolute',
    left: 452 - 408,
    top: 262,
    width: 350,
    height: 24,
    borderRadius: 175,
    backgroundColor: 'rgba(0,0,0,0.3)',
    boxShadow: '0 0 18px 10px rgba(0,0,0,0.3)',
  },
  controller: {
    position: 'absolute',
    left: 0,
    top: 120,
    width: CONTROLLER.width,
    height: CONTROLLER.height,
  },
  controllerImage: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: CONTROLLER.width,
    height: CONTROLLER.height,
  },
  phoneScreen: {
    position: 'absolute',
    left: SCREEN.left,
    top: SCREEN.top,
    width: SCREEN.width,
    height: SCREEN.height,
    borderRadius: 9,
  },
  left: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 470,
    paddingTop: 20,
    paddingBottom: 24,
    paddingLeft: layout.sideMargin,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: colors.white,
    fontFamily: fonts.brand,
    fontSize: 44,
    lineHeight: 44,
    letterSpacing: -1.54,
  },
  text: {
    marginTop: 12,
    width: 340,
    color: 'rgba(255,255,255,0.76)',
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  actions: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  compat: {
    width: 200, // sur deux lignes (maquette du 25/09)
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
});
