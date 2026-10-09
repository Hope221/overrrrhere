import { BlurView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import {
  PROFILE_HINTS,
  PROFILE_MAPS,
  PROFILE_TABS,
  WII_PROFILES,
  WII_SPEEDS,
  WiiPointer,
  WiiPointerSpeed,
  WiiProfile,
  pointerHint,
  usesPointer,
} from '../../retro/wii';
import { ButtonHint } from '../../ui/components';
import { colors, fonts, layout } from '../../ui/theme';

// Écrans Wii de la mise à jour du 05/10/2026 (lot 3) : « Wii options » (WiiMenu.dc.html), « Wii controls »
// (WiiControls.dc.html) et les notices en jeu (WiiPlay.dc.html).

// ---------- Wii options (panneau du menu en jeu) ----------

export const WII_OPTION_ROWS = 5; // Controller, Pointer, Pointer speed, Recenter pointer, See all controls

export function WiiOptionsMenu(props: {
  profile: WiiProfile;
  auto: boolean; // profil choisi automatiquement (« · Auto »)
  pointer: WiiPointer;
  speed: WiiPointerSpeed;
  selected: number;
  onSelect: (i: number) => void;
  onRun: (i: number) => void;
  onSpeed: (speed: WiiPointerSpeed) => void;
  onBack: () => void;
}) {
  const noPointer = !usesPointer(props.profile);
  const rowStyle = (i: number) => [styles.row, i === props.selected && styles.rowOn];
  const labelStyle = (i: number) => [styles.rowLabel, i === props.selected && styles.rowLabelOn];
  const press = (i: number) => ({ onPressIn: () => props.onSelect(i), onPress: () => props.onRun(i) });
  return (
    <View style={styles.panelBody}>
      <View style={styles.header}>
        <Text style={styles.title}>Wii options</Text>
        <Text style={styles.subtitle}>Saved for this game</Text>
      </View>
      <View style={styles.rows}>
        <Pressable {...press(0)} style={rowStyle(0)}>
          <Text style={labelStyle(0)}>Controller</Text>
          <Text style={[styles.rowValue, props.selected === 0 && styles.rowValueOn]}>
            {props.auto ? `${props.profile} · Auto` : props.profile}
          </Text>
        </Pressable>
        <Pressable {...press(1)} style={rowStyle(1)}>
          <Text style={labelStyle(1)}>Pointer</Text>
          <Text style={[styles.rowValue, props.selected === 1 && styles.rowValueOn]}>{noPointer ? 'Not used' : props.pointer}</Text>
        </Pressable>
        <Pressable {...press(2)} style={rowStyle(2)}>
          <Text style={labelStyle(2)}>Pointer speed</Text>
          <View style={styles.segments}>
            {WII_SPEEDS.map((speed) => {
              const on = speed === props.speed;
              return (
                <Pressable
                  key={speed}
                  onPressIn={() => props.onSelect(2)}
                  onPress={() => props.onSpeed(speed)}
                  style={[styles.segment, on && styles.segmentOn]}
                >
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{speed}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
        <Pressable {...press(3)} style={rowStyle(3)}>
          <Text style={labelStyle(3)}>Recenter pointer</Text>
          <Text style={styles.rowHint}>Right stick click</Text>
        </Pressable>
        <Pressable {...press(4)} style={rowStyle(4)}>
          <Text style={labelStyle(4)}>See all controls</Text>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M9 6l6 6-6 6" />
          </Svg>
        </Pressable>
      </View>
      <View style={{ flexGrow: 1 }} />
      <Text style={styles.hint}>{pointerHint(props.profile, props.pointer)}</Text>
      <View style={styles.hints}>
        <ButtonHint glyph="A" label="Change" onPress={() => props.onRun(props.selected)} />
        <ButtonHint glyph="B" label="Back" onPress={props.onBack} />
      </View>
    </View>
  );
}

// Profil suivant (ligne Controller) et réglages suivants, dans l'ordre de la maquette.
export function nextProfile(profile: WiiProfile): WiiProfile {
  return WII_PROFILES[(WII_PROFILES.indexOf(profile) + 1) % WII_PROFILES.length];
}

// ---------- Wii controls (référence des commandes, plein écran) ----------

export function WiiControlsScreen({ profile, onTab, onBack }: { profile: WiiProfile; onTab: (profile: WiiProfile) => void; onBack: () => void }) {
  const rows = PROFILE_MAPS[profile];
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* L'image du jeu, floue et assombrie (comme la maquette). */}
      <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,12,0.78)' }]} />
      <View style={styles.controls}>
        <View style={styles.controlsTop}>
          <View>
            <Text style={styles.controlsTitle}>Wii controls</Text>
            <Text style={styles.controlsHint}>{PROFILE_HINTS[profile]}</Text>
          </View>
          <View style={styles.tabs}>
            <Text style={styles.shoulder}>LB</Text>
            {WII_PROFILES.map((p) => {
              const on = p === profile;
              return (
                <Pressable key={p} onPress={() => onTab(p)} style={[styles.tab, on && styles.tabOn]}>
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>{PROFILE_TABS[p]}</Text>
                </Pressable>
              );
            })}
            <Text style={styles.shoulder}>RB</Text>
          </View>
        </View>
        <View style={styles.grid}>
          {rows.map(([xbox, wii, app]) => (
            <View key={`${xbox}-${wii}`} style={styles.gridRow}>
              <Text style={styles.xbox}>{xbox}</Text>
              <Text style={[styles.wii, app && { color: colors.orange }]}>{wii}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexGrow: 1 }} />
        <View style={styles.controlsBottom}>
          <ButtonHint glyph="B" label="Back" onPress={onBack} />
        </View>
      </View>
    </View>
  );
}

// ---------- Notices en jeu (WiiPlay.dc.html) ----------

type Box = { x: number; y: number; w: number; h: number };

// Courtes notices qui disparaissent seules. Le curseur est dessiné par le jeu, pas par l'app.
// - First launch (premier lancement du jeu) : en bas, 6 s.
// - Controls chosen (profil automatique autre que Remote + Nunchuk), puis Pointer mode shown (profil avec pointeur) :
//   en haut, l'une après l'autre, 3 s chacune, au début de la partie.
// - Recentered : petit cercle qui pulse au centre de l'image + « Pointer recentered », 1,5 s.
// - Pointer off screen : barre lumineuse sur le bord + notice, tant que le pointeur y reste.
export function WiiNotices(props: {
  started: boolean;
  firstLaunch: boolean;
  chosen: WiiProfile | null;
  pointer: WiiPointer | null;
  recentered: number; // change à chaque recentrage
  edge: string | null;
  box: Box;
}) {
  const [top, setTop] = useState<'controls' | 'pointer' | null>(null);
  const [bottom, setBottom] = useState(false);
  const [ring, setRing] = useState(false);
  const shown = useRef(false);

  useEffect(() => {
    if (!props.started || shown.current) return;
    shown.current = true;
    const queue: ('controls' | 'pointer')[] = [];
    if (props.chosen) queue.push('controls');
    if (props.pointer) queue.push('pointer');
    const timers = queue.map((notice, i) => setTimeout(() => setTop(notice), i * 3000));
    timers.push(setTimeout(() => setTop(null), queue.length * 3000));
    if (props.firstLaunch) {
      setBottom(true);
      timers.push(setTimeout(() => setBottom(false), 6000));
    }
    return () => timers.forEach(clearTimeout);
  }, [props.started, props.chosen, props.pointer, props.firstLaunch]);

  useEffect(() => {
    if (props.recentered === 0) return;
    setRing(true);
    const timer = setTimeout(() => setRing(false), 1500);
    return () => clearTimeout(timer);
  }, [props.recentered]);

  const { box } = props;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {ring && <RecenterRing x={box.x + box.w / 2} y={box.y + box.h / 2} />}
      {ring ? (
        <View style={[styles.notice, styles.noticeSmall, styles.noticeTop]}>
          <Text style={styles.noticeTitleSmall}>Pointer recentered</Text>
        </View>
      ) : top === 'controls' && props.chosen ? (
        <Notice icon="controller" title={`Controls: ${props.chosen}`} detail="Chosen for this game · Change it in the menu" />
      ) : top === 'pointer' && props.pointer ? (
        <Notice icon="pointer" title={`Pointer · ${props.pointer}`} detail="Click the right stick to recenter" />
      ) : null}
      {props.edge && <OffScreen edge={props.edge} box={box} />}
      {bottom && (
        <View style={[styles.notice, styles.noticeBottom]}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx={12} cy={12} r={9} />
            <Path d="M12 7v5l3 2" />
          </Svg>
          <Text style={styles.noticeLine}>May stutter at first, then gets smoother.</Text>
        </View>
      )}
    </View>
  );
}

function Notice({ icon, title, detail }: { icon: 'controller' | 'pointer'; title: string; detail: string }) {
  return (
    <View style={[styles.notice, styles.noticeTop]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.noticeIcon}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          {icon === 'pointer' ? (
            <>
              <Circle cx={12} cy={12} r={8} />
              <Circle cx={12} cy={12} r={3.5} fill={colors.white} />
            </>
          ) : (
            <>
              <Rect x={3} y={8} width={18} height={8} rx={3} />
              <Path d="M7 12h2M8 11v2M15 12h.01M17 12h.01" />
            </>
          )}
        </Svg>
      </View>
      <View>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function RecenterRing({ x, y }: { x: number; y: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [progress]);
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.2] });
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] });
  return <Animated.View style={[styles.ring, { left: x - 22, top: y - 22, opacity, transform: [{ scale }] }]} />;
}

// Pointeur collé à un bord de l'image : barre lumineuse sur ce bord, notice à côté, flèche vers le bord.
function OffScreen({ edge, box }: { edge: string; box: Box }) {
  const vertical = edge === 'left' || edge === 'right';
  const bar = vertical
    ? { left: edge === 'right' ? box.x + box.w - 4 : box.x, top: box.y + box.h / 2 - 46, width: 4, height: 92 }
    : { left: box.x + box.w / 2 - 46, top: edge === 'bottom' ? box.y + box.h - 4 : box.y, width: 92, height: 4 };
  const place =
    edge === 'right'
      ? { right: 64, top: box.y + box.h / 2 - 20 }
      : edge === 'left'
        ? { left: 64, top: box.y + box.h / 2 - 20 }
        : edge === 'top'
          ? { alignSelf: 'center' as const, top: box.y + 14 }
          : { alignSelf: 'center' as const, top: box.y + box.h - 54 };
  const rotate = { right: '0deg', bottom: '90deg', left: '180deg', top: '270deg' }[edge] ?? '0deg';
  const arrow = (
    <View style={{ transform: [{ rotate }] }}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M9 6l6 6-6 6" />
      </Svg>
    </View>
  );
  return (
    <>
      <View style={[styles.edgeBar, bar, vertical ? styles.edgeBarVertical : styles.edgeBarHorizontal]} />
      <View style={[styles.offScreen, place]}>
        {edge === 'left' && arrow}
        <View style={{ alignItems: edge === 'left' ? 'flex-start' : 'flex-end' }}>
          <Text style={styles.offTitle}>Pointer off screen</Text>
          <Text style={styles.noticeDetail}>Click the right stick to bring it back</Text>
        </View>
        {edge !== 'left' && arrow}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  panelBody: {
    flex: 1,
    paddingTop: 18,
    paddingBottom: 18,
    paddingLeft: layout.sideMargin,
    paddingRight: 20,
  },
  header: {
    paddingHorizontal: 12,
  },
  title: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 22,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  rows: {
    marginTop: 12,
    gap: 2,
  },
  row: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  rowOn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  rowLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  rowLabelOn: {
    color: colors.white,
    fontFamily: fonts.semiBold,
  },
  rowValue: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  rowValueOn: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fonts.medium,
  },
  rowHint: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  segments: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  segment: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    justifyContent: 'center',
  },
  segmentOn: {
    backgroundColor: colors.white,
  },
  segmentText: {
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
    fontSize: 12,
  },
  segmentTextOn: {
    color: colors.ink,
  },
  hint: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  hints: {
    flexDirection: 'row',
    gap: 18,
    paddingHorizontal: 12,
  },
  controls: {
    flex: 1,
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: layout.sideMargin,
  },
  controlsTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  controlsTitle: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.24,
  },
  controlsHint: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shoulder: {
    height: 20,
    lineHeight: 17,
    paddingHorizontal: 6,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.extraBold,
    fontSize: 10,
    overflow: 'hidden',
  },
  tab: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tabOn: {
    backgroundColor: colors.white,
  },
  tabText: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: fonts.semiBold,
    fontSize: 12,
  },
  tabTextOn: {
    color: colors.ink,
  },
  grid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 28,
  },
  gridRow: {
    width: '47%',
    flexGrow: 1,
    flexBasis: '40%',
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  xbox: {
    height: 22,
    lineHeight: 19,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 11,
    letterSpacing: 0.22,
    overflow: 'hidden',
  },
  wii: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 14,
  },
  controlsBottom: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    height: 32,
    alignItems: 'center',
  },
  notice: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(22,22,26,0.9)',
    overflow: 'hidden',
  },
  noticeTop: {
    alignSelf: 'center',
    top: 14,
    height: 44,
    paddingLeft: 8,
    paddingRight: 16,
    boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
  },
  noticeSmall: {
    height: 36,
    paddingLeft: 14,
    paddingRight: 14,
  },
  noticeBottom: {
    alignSelf: 'center',
    bottom: 18,
    height: 40,
    paddingLeft: 12,
    paddingRight: 16,
  },
  noticeIcon: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeTitle: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 17,
  },
  noticeTitleSmall: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  noticeDetail: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 14,
  },
  noticeLine: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  ring: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.white,
  },
  edgeBar: {
    position: 'absolute',
    borderRadius: 4,
  },
  edgeBarVertical: {
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0) 100%)',
  },
  edgeBarHorizontal: {
    experimental_backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0) 100%)',
  },
  offScreen: {
    position: 'absolute',
    height: 40,
    paddingLeft: 10,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(22,22,26,0.88)',
    boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
  },
  offTitle: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
  },
});
