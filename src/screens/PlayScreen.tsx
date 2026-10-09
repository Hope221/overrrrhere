import { useEventListener } from 'expo';
import { BlurView } from 'expo-blur';
import { useKeepAwake } from 'expo-keep-awake';
import { ReactElement, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { RTCView } from 'react-native-webrtc';

import Manette from '../../modules/manette';
import * as Network from 'expo-network';

import { playReadyChime, rumble } from '../feedback';
import { addPlaytime, xboxKey } from '../playtime';
import { useSettings } from '../settings';
import { TouchMode, setSessionTouchMode, useTouchControlsVisible, useTouchMode } from '../touch';
import { SignedOutError } from '../xbox/auth';
import { Issue, LaunchIssue } from './LaunchIssue';
import { ButtonHint } from '../ui/components';
import { useBattery, useController, useWifi } from '../ui/device';
import { BatteryIcon, CheckIcon, HomeIcon, PlayIcon, SleepIcon, SwitchIcon, TouchMenuIcon } from '../ui/icons';
import { useInput } from '../ui/input';
import { colors, fonts, layout } from '../ui/theme';
import { ensureAwake, turnOff } from '../xbox/consoles';
import { InstalledGame, launchGame } from '../xbox/games';
import { BUTTON_BITS, EMPTY_PAD, PadState, StreamPlayer } from '../xbox/stream/player';
import { StreamSession } from '../xbox/stream/session';
import { Background } from './HomeScreen';
import { NoController } from './NoController';
import { TouchStream } from './TouchStream';

// Écran Play : Launch (design/ecrans/Launch.dc.html) par-dessus le Stream (design/ecrans/Stream.dc.html).
// L'écran Launch s'efface quand l'image de la console arrive.

export type PlayTarget = {
  consoleId: string;
  consoleName: string;
  game: InstalledGame | null; // null = « Console home » (stream sans lancer de jeu)
};

type Step = 'wake' | 'launch' | 'connect' | 'playing';

const COMBO_WINDOW = 120; // ms : View et Menu sont retenus ce temps pour détecter View + Menu
const TOUCH_MODES: TouchMode[] = ['Auto', 'On', 'Off']; // ligne « Touch controls » du panneau

// Une tentative de lancement. « Try again », « Reconnect » et « Play anyway » en démarrent une nouvelle.
type Attempt = { n: number; skipWifi: boolean; skipLaunch: boolean };

export function PlayScreen({ target, onExit, onSignIn }: { target: PlayTarget; onExit: () => void; onSignIn: () => void }) {
  const settings = useSettings();
  const [step, setStep] = useState<Step>('wake');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null); // écran Launch problem affiché
  const [attempt, setAttempt] = useState<Attempt>({ n: 0, skipWifi: false, skipLaunch: false });
  const [panel, setPanel] = useState<number | null>(null); // index sélectionné, null = panneau fermé
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const player = useRef<StreamPlayer | null>(null);
  const session = useRef<StreamSession | null>(null);
  const wasPlaying = useRef(false); // le stream a-t-il déjà démarré ? (coupure = « dropped », sinon « offline »)
  const pad = useRef<PadState>(EMPTY_PAD);
  const held = useRef<{ button: 'View' | 'Menu'; timer: ReturnType<typeof setTimeout> } | null>(null);
  const overlay = useRef(new Animated.Value(1)).current;
  const touchMode = useTouchMode();
  const touchVisible = useTouchControlsVisible();
  const controller = useController();

  useKeepAwake();

  // Le choix « Touch controls » du panneau ne vaut que pour cette partie.
  useEffect(() => () => setSessionTouchMode(null), []);

  function retry(options: { skipLaunch: boolean }) {
    setAttempt((a) => ({ n: a.n + 1, skipWifi: true, skipLaunch: options.skipLaunch }));
  }

  // ---------- Vérification Wi-Fi, réveil, lancement, connexion ----------
  useEffect(() => {
    let cancelled = false;
    const p = new StreamPlayer();
    player.current = p;
    setIssue(null);
    setPanel(null);
    setVideoUrl(null);
    setStep('wake');

    const fail = (reason: Issue) => {
      if (cancelled) return;
      setPanel(null);
      setIssue(reason);
    };

    p.onVideo = (stream) => setVideoUrl(stream.toURL());
    p.onRumble = rumble; // réglage « Phone vibration »
    p.onEnded = () => fail('dropped');
    p.onConnectionState = (state) => {
      if (state === 'connected') {
        if (!wasPlaying.current) playReadyChime(); // réglage « Chime when your game is ready »
        wasPlaying.current = true;
        session.current?.startKeepalive();
        setStartedAt((t) => t ?? Date.now());
        setStep('playing');
      }
      if (state === 'failed') fail(wasPlaying.current ? 'dropped' : 'offline'); // « disconnected » peut se rétablir seul
    };

    (async () => {
      try {
        // Réglage « Check Wi-Fi before playing » (Settings > Xbox & Remote Play).
        if (settings.wifiCheck && !attempt.skipWifi) {
          const network = await Network.getNetworkStateAsync();
          if (network.type !== Network.NetworkStateType.WIFI) return fail('wifi');
        }
        if (!(await ensureAwake(target.consoleId))) return fail('offline');
        if (cancelled) return;
        if (target.game?.productId && !attempt.skipLaunch) {
          setStep('launch');
          // Si le lancement à distance échoue, le stream s'ouvre quand même sur l'accueil (plan, étape 5).
          await launchGame(target.consoleId, target.game.productId).catch(() => {});
        }
        if (cancelled) return;
        setStep('connect');
        const s = await StreamSession.start(target.consoleId);
        session.current = s;
        if (cancelled) return s.stop();
        await s.waitUntilReady(() => {});
        await p.setAnswer(await s.exchangeSdp(await p.createOffer()));
        await p.addRemoteCandidates(await s.exchangeIce(await p.getLocalCandidates()));
      } catch (e) {
        console.warn('[Play] échec :', e instanceof Error ? e.message : e);
        fail(e instanceof SignedOutError ? 'signedOut' : wasPlaying.current ? 'dropped' : 'offline');
      }
    })();

    return () => {
      cancelled = true;
      if (held.current) clearTimeout(held.current.timer);
      p.destroy();
      session.current?.stop();
      session.current = null;
    };
  }, [target.consoleId, target.game?.productId, attempt]);

  // « Played here » : chronomètre tant que l'image du jeu est affichée (pas pour Console home).
  const inGame = step === 'playing' && !issue && !!target.game;
  useEffect(() => {
    if (!inGame || !target.game) return;
    const started = Date.now();
    const key = xboxKey(target.game.titleId);
    return () => addPlaytime(key, (Date.now() - started) / 1000);
  }, [inGame, target.game]);

  // L'écran Launch s'efface (250 ms) quand le stream démarre.
  useEffect(() => {
    Animated.timing(overlay, { toValue: step === 'playing' ? 0 : 1, duration: 250, useNativeDriver: true }).start();
  }, [step, overlay]);

  // ---------- Manette vers la console ----------
  const playing = step === 'playing' && !issue && panel === null;

  function send(next: PadState) {
    pad.current = next;
    player.current?.setPad(next);
  }

  function setBit(button: keyof typeof BUTTON_BITS, pressed: boolean) {
    const bit = BUTTON_BITS[button];
    send({ ...pad.current, buttons: pressed ? pad.current.buttons | bit : pad.current.buttons & ~bit });
  }

  function setTrigger(trigger: 'LT' | 'RT', value: number) {
    send({ ...pad.current, [trigger === 'LT' ? 'leftTrigger' : 'rightTrigger']: value });
  }

  // x, y : -1 à 1, convention de PadState (bas = +1).
  function setStick(stick: 'LS' | 'RS', x: number, y: number) {
    if (stick === 'LS') send({ ...pad.current, leftX: x, leftY: y });
    else send({ ...pad.current, rightX: x, rightY: y });
  }

  function openPanel() {
    send(EMPTY_PAD); // le jeu ne doit pas continuer à recevoir un bouton enfoncé
    setPanel(0);
  }

  useEventListener(Manette, 'onButton', (event) => {
    if (!playing || event.button === 'LT' || event.button === 'RT') return;

    // View + Menu : réservé à l'app. Chacun est retenu 120 ms pour voir si l'autre suit.
    if (event.button === 'View' || event.button === 'Menu') {
      const button = event.button;
      if (event.pressed) {
        if (held.current && held.current.button !== button) {
          clearTimeout(held.current.timer);
          held.current = null;
          openPanel();
          return;
        }
        held.current = {
          button,
          timer: setTimeout(() => {
            held.current = null;
            setBit(button, true);
          }, COMBO_WINDOW),
        };
      } else if (held.current?.button === button) {
        // Appui bref : on transmet quand même l'appui, puis le relâchement.
        clearTimeout(held.current.timer);
        held.current = null;
        setBit(button, true);
        setTimeout(() => setBit(button, false), 50);
      } else {
        setBit(button, false);
      }
      return;
    }

    setBit(event.button, event.pressed);
  });

  useEventListener(Manette, 'onStick', (event) => {
    if (!playing) return;
    // GameController : haut = +1 ; PadState suit la convention du navigateur (haut = -1).
    setStick(event.stick, event.x, -event.y);
  });

  useEventListener(Manette, 'onTrigger', (event) => {
    if (!playing) return;
    setTrigger(event.trigger, event.value);
  });

  // ---------- Panneau du stream ----------
  const actions = [
    { label: 'Resume', Icon: PlayIcon, run: () => setPanel(null) },
    { label: 'Switch game', Icon: SwitchIcon, run: onExit }, // All games : étape 4
    {
      label: 'Touch controls',
      Icon: TouchMenuIcon,
      value: touchMode,
      run: () => setSessionTouchMode(TOUCH_MODES[(TOUCH_MODES.indexOf(touchMode) + 1) % TOUCH_MODES.length]),
    },
    {
      label: 'Back to launcher',
      Icon: HomeIcon,
      run: backToLauncher,
    },
    {
      label: 'Put Xbox to sleep',
      Icon: SleepIcon,
      run: () => {
        turnOff(target.consoleId).catch(() => {});
        onExit();
      },
    },
  ];

  useInput(
    (button) => {
      if (panel === null) return;
      if (button === 'Up') setPanel(Math.max(0, panel - 1));
      if (button === 'Down') setPanel(Math.min(actions.length - 1, panel + 1));
      if (button === 'A') actions[panel].run();
      if (button === 'B') setPanel(null);
    },
    panel !== null,
  );

  // Écran Launch : B = annuler.
  useInput((button) => {
    if (button === 'B') onExit();
  }, step !== 'playing' && !issue);

  const issueActions: Record<Issue, { primary: () => void; secondary?: () => void }> = {
    noInternet: { primary: onExit, secondary: onExit }, // montré par Home avant le lancement, jamais ici
    wifi: { primary: onExit, secondary: () => setAttempt((a) => ({ ...a, n: a.n + 1, skipWifi: true })) },
    offline: { primary: () => retry({ skipLaunch: false }), secondary: onExit },
    signedOut: { primary: onSignIn },
    dropped: { primary: () => retry({ skipLaunch: true }), secondary: backToLauncher }, // le jeu tourne toujours
  };

  return (
    <View style={styles.screen}>
      {videoUrl && <RTCView streamURL={videoUrl} objectFit="contain" style={StyleSheet.absoluteFill} />}

      {step === 'playing' && !issue && <LowBatteryPill />}

      {/* Contrôles tactiles (TouchStream.dc.html) : mêmes signaux que la manette. View + Menu étant
          impossible sans manette, la pastille au logo ouvre le panneau. */}
      {playing && touchVisible && (
        <TouchStream onButton={setBit} onTrigger={setTrigger} onStick={setStick} onMenu={openPanel} />
      )}

      {panel !== null && (
        <StreamPanel
          title={target.game?.name ?? 'Console home'}
          consoleName={target.consoleName}
          startedAt={startedAt}
          actions={actions}
          selected={panel}
          onSelect={setPanel}
        />
      )}

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlay }]} pointerEvents={step === 'playing' ? 'none' : 'auto'}>
        <LaunchView target={target} step={step} onCancel={onExit} />
      </Animated.View>

      {issue && (
        <LaunchIssue
          issue={issue}
          backdrop={<Background tile={target.game ? { kind: 'game', key: 'g', game: target.game } : { kind: 'home', key: 'home' }} />}
          onPrimary={issueActions[issue].primary}
          onSecondary={issueActions[issue].secondary}
        />
      )}

      {/* Sans manette ni contrôles tactiles (réglés sur Off) : « Connect your controller ».
          Pas quand le panneau est ouvert, pour pouvoir y remettre « Touch controls » sur Auto ou On. */}
      {!controller.connected && !touchVisible && panel === null && (
        <NoController onContinueWithTouch={() => setSessionTouchMode('On')} />
      )}
    </View>
  );

  // « Back to launcher » (panneau du stream, et « The stream dropped »).
  function backToLauncher() {
    // Réglage « Put Xbox to sleep when I quit » (Settings > Xbox & Remote Play).
    if (settings.autoSleep) turnOff(target.consoleId).catch(() => {});
    onExit();
  }
}

// ---------- Launch ----------

function LaunchView({ target, step, onCancel }: { target: PlayTarget; step: Step; onCancel: () => void }) {
  const { reduceMotion } = useSettings();
  const zoom = useRef(new Animated.Value(reduceMotion ? 1 : 1.08)).current;
  useEffect(() => {
    Animated.timing(zoom, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [zoom]);

  const order: Step[] = ['wake', 'launch', 'connect', 'playing'];
  const status = (s: Step) => (order.indexOf(step) > order.indexOf(s) ? 'done' : step === s ? 'active' : 'pending');
  const steps = [
    { key: 'wake' as Step, label: 'Console awake' },
    ...(target.game ? [{ key: 'launch' as Step, label: 'Launching the game on your console' }] : []),
    { key: 'connect' as Step, label: 'Connecting the stream' },
  ];

  return (
    <View style={styles.launch}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: zoom }] }]}>
        <Background tile={target.game ? { kind: 'game', key: 'g', game: target.game } : { kind: 'home', key: 'home' }} />
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,10,0.32)' }]} />
      <View style={[StyleSheet.absoluteFill, styles.launchShadeBottom]} />
      <View style={styles.launchShadeTop} />

      <Checks />

      <View style={styles.launchContent}>
        <View style={styles.launchText}>
          <Text style={styles.launchTitle} numberOfLines={2}>
            {target.game?.name ?? 'Console home'}
          </Text>
          <Text style={styles.launchSubtitle}>Starting on {target.consoleName}</Text>
          <View style={styles.steps}>
            {steps.map((s) => (
              <StepRow key={s.key} label={s.label} status={status(s.key)} />
            ))}
          </View>
        </View>
        <ButtonHint glyph="B" label="Cancel" onPress={onCancel} />
      </View>
    </View>
  );
}

// Vérifications en haut à droite : Wi-Fi, batterie, manette (coche verte quand c'est bon).
function Checks() {
  const wifi = useWifi();
  const battery = useBattery();
  const controller = useController();
  const items = [
    { label: 'Wi-Fi', ok: wifi },
    { label: battery.percent !== null ? `Battery ${battery.percent}%` : 'Battery', ok: !battery.low },
    { label: 'Controller', ok: controller.connected },
  ];
  return (
    <View style={styles.checks}>
      {items.map((item) => (
        <View key={item.label} style={styles.check}>
          {item.ok ? <CheckIcon /> : <View style={styles.checkMissing} />}
          <Text style={styles.checkText}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function StepRow({ label, status }: { label: string; status: 'done' | 'active' | 'pending' | 'failed' }) {
  return (
    <View style={styles.step}>
      {status === 'done' && (
        <View style={styles.stepDone}>
          <CheckIcon size={11} color={colors.ink} strokeWidth={3.2} />
        </View>
      )}
      {status === 'active' && <Spinner />}
      {status === 'pending' && <View style={styles.stepPending} />}
      {status === 'failed' && <View style={[styles.stepPending, { borderColor: colors.destructive }]} />}
      <Text style={[styles.stepText, status === 'done' && styles.stepTextDone, status === 'active' && styles.stepTextActive, status === 'pending' && styles.stepTextPending]}>
        {label}
      </Text>
    </View>
  );
}

// Rond qui tourne (0,9 s par tour), bordure 2 pt dont le haut en blanc.
function Spinner() {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]} />;
}

// ---------- Stream ----------

type Action = { label: string; Icon: (props: { color: string }) => ReactElement; run: () => void; value?: string };

function StreamPanel(props: { title: string; consoleName: string; startedAt: number | null; actions: Action[]; selected: number; onSelect: (i: number) => void }) {
  const battery = useBattery();
  const minutes = props.startedAt ? Math.max(1, Math.round((Date.now() - props.startedAt) / 60_000)) : 0;
  const details = [props.consoleName, `${minutes} min`, battery.percent !== null ? `Battery ${battery.percent}%` : null].filter(Boolean).join(' · ');

  return (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,10,0.45)' }]} />
      <View style={styles.panel}>
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(22,22,26,0.84)' }]} />

        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle} numberOfLines={1}>
            {props.title}
          </Text>
          <Text style={styles.panelDetails}>{details}</Text>
        </View>

        <View style={styles.panelItems}>
          {props.actions.map((action, i) => {
            const on = i === props.selected;
            const color = on ? colors.white : 'rgba(255,255,255,0.72)';
            return (
              <Pressable key={action.label} onPress={action.run} onPressIn={() => props.onSelect(i)} style={[styles.panelItem, on && styles.panelItemOn]}>
                <action.Icon color={color} />
                <Text style={[styles.panelItemText, { color }, on && styles.panelItemTextOn]}>{action.label}</Text>
                {action.value && <Text style={styles.panelItemValue}>{action.value}</Text>}
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexGrow: 1 }} />
        <Text style={styles.panelNote}>Game keeps running</Text>
      </View>
    </>
  );
}

// Pastille « Battery at 20% · Plug in to keep playing » (variante de Stream.dc.html).
function LowBatteryPill() {
  const battery = useBattery();
  if (!battery.low) return null;
  return (
    <View style={styles.pill}>
      <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(22,22,26,0.88)' }]} />
      <BatteryIcon level={battery.level} low width={24} />
      <Text style={styles.pillTitle}>Battery at {battery.percent}%</Text>
      <Text style={styles.pillText}>Plug in to keep playing</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  // Launch
  launch: {
    flex: 1,
    backgroundColor: colors.ink,
    overflow: 'hidden',
  },
  launchShadeBottom: {
    experimental_backgroundImage: 'linear-gradient(0deg, rgba(8,8,10,0.92) 0%, rgba(8,8,10,0.4) 40%, rgba(8,8,10,0) 62%)',
  },
  launchShadeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 70,
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(8,8,10,0.6) 0%, rgba(8,8,10,0) 100%)',
  },
  checks: {
    position: 'absolute',
    right: layout.sideMargin,
    top: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkMissing: {
    width: 8,
    height: 8,
    margin: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  checkText: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  launchContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    paddingTop: 18,
    paddingBottom: 26,
    paddingHorizontal: layout.sideMargin,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  launchText: {
    width: 380,
  },
  launchTitle: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.28,
  },
  launchSubtitle: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.78)',
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  steps: {
    marginTop: 14,
    gap: 8,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepDone: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: colors.ready,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPending: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  spinner: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    borderTopColor: colors.white,
  },
  stepText: {
    color: colors.white,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  stepTextDone: {
    color: 'rgba(255,255,255,0.78)',
  },
  stepTextActive: {
    fontFamily: fonts.semiBold,
  },
  stepTextPending: {
    color: 'rgba(255,255,255,0.55)',
  },
  error: {
    marginTop: 10,
    color: colors.destructive,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  // Stream : panneau de gauche
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 320,
    paddingTop: 18,
    paddingBottom: 18,
    paddingLeft: layout.sideMargin,
    paddingRight: 20,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  panelHeader: {
    paddingHorizontal: 12,
  },
  panelTitle: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 22,
  },
  panelDetails: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  panelItems: {
    marginTop: 10,
    gap: 2,
  },
  panelItem: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  panelItemOn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  panelItemText: {
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  panelItemTextOn: {
    fontFamily: fonts.semiBold,
  },
  panelItemValue: {
    marginLeft: 'auto',
    color: 'rgba(255,255,255,0.55)',
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  panelNote: {
    paddingHorizontal: 12,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  // Stream : alerte batterie
  pill: {
    position: 'absolute',
    right: layout.sideMargin,
    top: 16,
    height: 40,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pillTitle: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  pillText: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.regular,
    fontSize: 12,
  },
});
