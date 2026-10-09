import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { humanError, isNetworkError } from '../../errors';
import { useFocusColor, useSettings } from '../../settings';
import { Backdrop } from '../../ui/Backdrop';
import { ButtonHint, PrimaryButton, SecondaryButton } from '../../ui/components';
import { useOnline } from '../../ui/device';
import { LockIcon, TouchIcon, WifiOffIcon } from '../../ui/icons';
import { useInput } from '../../ui/input';
import { colors, focusRing, fonts, layout } from '../../ui/theme';
import { requestDeviceCode, waitForSignIn } from '../../xbox/auth';

// Sign in (design/ecrans/SignIn.dc.html). A = ouvre la connexion Microsoft (page au toucher, code prérempli).
// Gauche / droite : passe au lien « Continue without Xbox » (mise à jour du 29/09), A le valide.
// Pendant l'attente : B = annuler.
// Sans internet : carte « You're offline », A = Continue without Xbox, X = Try again.

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function SignInScreen({ onSignedIn, onContinueWithoutXbox }: { onSignedIn: () => void; onContinueWithoutXbox: () => void }) {
  const focusColor = useFocusColor();
  const online = useOnline();
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [networkFailed, setNetworkFailed] = useState(false); // Microsoft injoignable alors que l'iPhone se croit en ligne
  const [focus, setFocus] = useState<'signIn' | 'skip'>('signIn');
  const signal = useRef({ cancelled: false });
  const offline = !online || networkFailed;

  async function signIn() {
    if (waiting || offline) return;
    setError(null);
    setWaiting(true);
    signal.current = { cancelled: false };
    const current = signal.current;
    try {
      const code = await requestDeviceCode();
      WebBrowser.openBrowserAsync(code.verificationUrl).catch(() => {});
      await waitForSignIn(code, current);
      WebBrowser.dismissBrowser().catch(() => {});
      onSignedIn();
    } catch (e) {
      if (current.cancelled) return;
      WebBrowser.dismissBrowser().catch(() => {});
      if (isNetworkError(e)) setNetworkFailed(true);
      else setError(humanError(e, "Couldn't sign in. Try again in a moment.", 'SignIn'));
    } finally {
      setWaiting(false);
    }
  }

  function cancel() {
    signal.current.cancelled = true;
    WebBrowser.dismissBrowser().catch(() => {});
    setWaiting(false);
  }

  // « Try again » : la carte disparaît si internet est revenu (sinon elle reste).
  function retry() {
    setNetworkFailed(false);
  }

  useInput((button) => {
    if (offline) {
      if (button === 'A') onContinueWithoutXbox();
      if (button === 'X') retry();
      return;
    }
    if (waiting) {
      if (button === 'B') cancel();
      return;
    }
    if (button === 'Left') setFocus('signIn');
    if (button === 'Right') setFocus('skip');
    if (button === 'A') {
      if (focus === 'skip') onContinueWithoutXbox();
      else signIn();
    }
  });

  return (
    <View style={styles.screen}>
      <Backdrop />
      <View style={styles.layout}>
        <View style={styles.text}>
          <Text style={styles.title}>Connect your Xbox</Text>
          <Text style={styles.body}>
            Your installed games show up here. Press A to play.
          </Text>
          {offline ? (
            <>
              <View style={styles.offlineCard}>
                <View style={{ marginTop: 1 }}>
                  <WifiOffIcon />
                </View>
                <View style={styles.offlineText}>
                  <Text style={styles.offlineTitle}>You're offline</Text>
                  <Text style={styles.offlineBody}>Retro games still work.</Text>
                </View>
              </View>
              <View style={[styles.button, { marginTop: 18, gap: 10 }]}>
                <PrimaryButton label="Continue without Xbox" onPress={onContinueWithoutXbox} />
                <SecondaryButton glyph="X" label="Try again" onPress={retry} />
              </View>
            </>
          ) : (
            <>
              <View style={[styles.button, !waiting && { gap: 10 }]}>
                <PrimaryButton label={waiting ? 'Waiting for Microsoft…' : 'Sign in with Microsoft'} onPress={signIn} />
                {waiting ? (
                  <ButtonHint glyph="B" label="Cancel" onPress={cancel} />
                ) : (
                  <Pressable onPress={onContinueWithoutXbox} style={[styles.skip, focus === 'skip' && { boxShadow: focusRing(focusColor) }]}>
                    <Text style={styles.skipText}>Continue without Xbox</Text>
                  </Pressable>
                )}
              </View>
              <View style={[styles.note, { marginTop: 16 }]}>
                <LockIcon />
                <Text style={styles.noteText}>Your sign-in stays on this iPhone.</Text>
              </View>
              <View style={[styles.note, { marginTop: 8 }]}>
                <TouchIcon />
                <Text style={styles.noteText}>Microsoft's page opens next: use touch for this one step.</Text>
              </View>
              {error && <Text style={styles.error}>{error}</Text>}
            </>
          )}
        </View>
        <Illustration />
      </View>
    </View>
  );
}

// Téléphone, console et liaison pointillée verte qui défile (@keyframes lp-dash, 1,2 s).
function Illustration() {
  const { reduceMotion } = useSettings();
  const dash = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(dash, { toValue: 0, duration: 1200, easing: Easing.linear, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, dash]);

  return (
    <Svg width={300} height={160} viewBox="0 0 300 160" fill="none" stroke={colors.white} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={10} y={20} width={62} height={120} rx={10} />
      <Path d="M22 124h38" opacity={0.4} />
      <Circle cx={41} cy={40} r={4} opacity={0.6} />
      <Rect x={196} y={52} width={94} height={56} rx={10} transform="rotate(90 243 80)" />
      <Rect x={206} y={62} width={74} height={36} rx={5} opacity={0.25} transform="rotate(90 243 80)" />
      <AnimatedPath d="M84 80 H186" stroke={colors.ready} strokeDasharray="4 8" strokeDashoffset={dash} />
      <Circle cx={135} cy={80} r={15} stroke={colors.ready} />
      <Path d="M129 80l4 4 8-8" stroke={colors.ready} />
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
    paddingTop: 18,
    paddingBottom: 24,
    paddingHorizontal: layout.sideMargin,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  text: {
    width: 380,
  },
  title: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.45,
  },
  body: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.78)',
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  button: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  // Lien « Continue without Xbox » : pilule sans fond, 44 pt (SignIn.dc.html, mise à jour du 29/09).
  skip: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    justifyContent: 'center',
  },
  skipText: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: fonts.semiBold,
    fontSize: 14,
  },
  // Carte « You're offline » (SignIn.dc.html, Tweak « offline »).
  offlineCard: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(10,10,12,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row',
    gap: 12,
  },
  offlineText: {
    flex: 1,
    gap: 2,
  },
  offlineTitle: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 19,
  },
  offlineBody: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noteText: {
    color: 'rgba(255,255,255,0.66)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  error: {
    marginTop: 12,
    color: colors.destructive,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
});
