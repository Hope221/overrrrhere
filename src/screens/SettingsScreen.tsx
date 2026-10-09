import { BlurView } from 'expo-blur';
import * as WebBrowser from 'expo-web-browser';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FocusColorName, RETRO_RESOLUTIONS, Settings, resetSettings, updateSettings, useFocusColor, useSettings } from '../settings';
import { resetPlaytime } from '../playtime';
import { DS_LAYOUTS } from '../retro/dsLayout';
import { RetroGame, chooseRomFolder, gameBytes, useRetroLibrary } from '../retro/library';
import { formatSize } from '../retro/systems';
import { resetTiles } from '../tiles';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ButtonHint, PrimaryButton, Toggle, Wordmark } from '../ui/components';
import { useController } from '../ui/device';
import { ChevronIcon, CloudIcon, ConsoleIcon, ControllerIcon, Logo } from '../ui/icons';
import { useInput } from '../ui/input';
import { colors, focusColors, focusRing, fonts, layout } from '../ui/theme';
import { hasMicrosoftAccount } from '../xbox/auth';
import { XboxConsole } from '../xbox/consoles';

// Settings (design/ecrans/Settings.dc.html) : sections à gauche, réglages à droite.
// Manette : haut / bas = sections ; droite ou A = entrer ; A = activer ; gauche / droite = choix ; B = retour.

// Site de l'app (politique de confidentialité, aide, dons) : la ligne « Privacy & support » apparaît dès qu'il existe
// (étape 4 de la publication).
const SITE_URL: string | null = null;

export const SECTIONS = ['Controller', 'Xbox & Remote Play', 'Retro', 'Appearance', 'Tiles', 'Sound', 'About'] as const;
export type Section = (typeof SECTIONS)[number];

type Row =
  | { kind: 'toggle'; key: keyof Settings; label: string }
  | { kind: 'link'; label: string; onPress: () => void; destructive?: boolean; chevron?: boolean; subtitle?: string; value?: string; cloud?: boolean }
  | { kind: 'change'; label: string; onPress: () => void } // pilule à droite du titre (Change, Manage ROMs), toujours en premier
  | { kind: 'signIn'; onPress: () => void } // bouton blanc « Sign in with Microsoft » (sans compte, demandé le 29/09)
  | { kind: 'swatches' }
  | { kind: 'segmented'; key: SegmentedKey; label: string; subtitle?: string };

// Sélecteurs segmentés (pilule, option active blanche) : gauche / droite = choix.
type SegmentedKey = 'volume' | 'touchControls' | 'touchOpacity' | 'retroScreen' | 'retroSize' | 'retroResolution' | 'dsLayout';
const SEGMENTS: Record<SegmentedKey, string[]> = {
  volume: ['Low', 'Medium', 'High'],
  touchControls: ['Auto', 'Always', 'Off'],
  touchOpacity: ['Low', 'Medium', 'High'],
  retroScreen: ['Sharp', 'Smooth', 'CRT'],
  retroSize: ['Original', 'Fill screen'],
  retroResolution: RETRO_RESOLUTIONS,
  dsLayout: DS_LAYOUTS,
};

const SWATCHES: { name: FocusColorName; color: string }[] = [
  { name: 'White', color: focusColors.white },
  { name: 'Green', color: focusColors.green },
  { name: 'Orange', color: focusColors.orange },
];

type Props = {
  initialSection?: Section;
  xbox: XboxConsole | null;
  pinnedCount: number;
  onClose: () => void;
  onTestButtons: () => void;
  onManagePinned: () => void;
  onManageRoms: () => void;
  onChangeConsole: () => void;
  onShowWelcome: () => void;
  onLicenses: () => void;
  onSignOut: () => void;
  onSignIn: () => void;
};

export function SettingsScreen(props: Props) {
  const { initialSection = 'Controller', xbox, pinnedCount, onClose, onTestButtons, onManagePinned, onManageRoms, onChangeConsole, onShowWelcome, onLicenses, onSignOut, onSignIn } = props;
  const settings = useSettings();
  const retro = useRetroLibrary();
  const focusColor = useFocusColor();
  const controller = useController();
  const [section, setSection] = useState<Section>(initialSection);
  const [area, setArea] = useState<'nav' | 'rows'>('nav');
  const [rowIndex, setRowIndex] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null); // null : pas encore vérifié

  useEffect(() => {
    hasMicrosoftAccount().then(setSignedIn);
  }, []);

  const rows: Record<Section, Row[]> = {
    Controller: [
      { kind: 'toggle', key: 'vibration', label: 'Phone vibration' },
      { kind: 'segmented', key: 'touchControls', label: 'Touch controls' },
      { kind: 'segmented', key: 'touchOpacity', label: 'Touch controls opacity' },
      { kind: 'link', label: 'Test buttons', chevron: true, onPress: onTestButtons },
    ],
    // Sans compte Microsoft : pas de console à changer, « Sign in with Microsoft » au lieu de « Sign out ».
    'Xbox & Remote Play':
      signedIn === false
        ? [
            { kind: 'toggle', key: 'wifiCheck', label: 'Check Wi-Fi before playing' },
            { kind: 'toggle', key: 'autoSleep', label: 'Put Xbox to sleep when I quit' },
            { kind: 'signIn', onPress: onSignIn },
          ]
        : [
            { kind: 'change', label: 'Change', onPress: onChangeConsole },
            { kind: 'toggle', key: 'wifiCheck', label: 'Check Wi-Fi before playing' },
            { kind: 'toggle', key: 'autoSleep', label: 'Put Xbox to sleep when I quit' },
            { kind: 'link', label: 'Sign out of Microsoft', destructive: true, onPress: onSignOut },
          ],
    // Maquette du 29/09 : « Manage ROMs » en pilule à droite du titre, ligne « DS screen layout ».
    Retro: [
      { kind: 'change', label: 'Manage ROMs', onPress: onManageRoms },
      { kind: 'toggle', key: 'retroAutosave', label: 'Auto-save when I quit' },
      { kind: 'segmented', key: 'retroScreen', label: 'Screen' },
      { kind: 'segmented', key: 'retroSize', label: 'Picture size' },
      // Maquette « Résolution interne » (06/10/2026).
      {
        kind: 'segmented',
        key: 'retroResolution',
        label: 'Internal resolution',
        subtitle: 'Wii, GameCube, 3DS up to 2× · Uses more battery', // 3DS : 2× au plus (essais du 06/10/2026)
      },
      { kind: 'segmented', key: 'dsLayout', label: 'DS screen layout' },
      // Maquette « Dossier iCloud » : le dossier de ROM choisi une fois (A ouvre le sélecteur de dossier de Fichiers).
      {
        kind: 'link',
        label: 'ROM folder',
        chevron: true,
        value: retro.folder?.name ?? 'Choose a folder',
        cloud: !!retro.folder,
        onPress: () => {
          chooseRomFolder().catch(() => {});
        },
      },
    ],
    Appearance: [
      { kind: 'swatches' },
      { kind: 'toggle', key: 'artBg', label: 'Game art in the background' },
      { kind: 'toggle', key: 'reduceMotion', label: 'Reduce motion' },
      { kind: 'toggle', key: 'clock24', label: '24-hour clock' },
    ],
    Tiles: [
      { kind: 'toggle', key: 'autoPin', label: 'Auto-pin recently played games' },
      { kind: 'toggle', key: 'showPlayTime', label: 'Show play time on home' },
      { kind: 'toggle', key: 'consoleTile', label: 'Show the Console home tile' },
      { kind: 'link', label: 'Manage pinned games', chevron: true, onPress: onManagePinned },
    ],
    Sound: [
      { kind: 'toggle', key: 'sounds', label: 'Interface sounds' },
      { kind: 'toggle', key: 'readyChime', label: 'Chime when your game is ready' },
      { kind: 'segmented', key: 'volume', label: 'Volume' },
    ],
    About: [
      { kind: 'link', label: 'Show the welcome again', chevron: true, onPress: onShowWelcome },
      // Maquette « About et licences » (08/10/2026).
      { kind: 'link', label: 'Open-source licenses', chevron: true, onPress: onLicenses },
      ...(SITE_URL
        ? [{ kind: 'link' as const, label: 'Privacy & support', chevron: true, onPress: () => WebBrowser.openBrowserAsync(SITE_URL).catch(() => {}) }]
        : []),
      {
        kind: 'link',
        label: 'Reset overrrrhere',
        destructive: true,
        subtitle: 'Erases pinned games, play time and settings on this iPhone',
        onPress: () => setConfirmReset(true), // fenêtre de confirmation (maquette du 25/09)
      },
    ],
  };
  const current = rows[section];
  const headerButton = current[0]?.kind === 'change' ? current[0] : null;

  function activate(row: Row) {
    if (row.kind === 'toggle') updateSettings({ [row.key]: !settings[row.key] });
    if (row.kind === 'link' || row.kind === 'change' || row.kind === 'signIn') row.onPress();
    if (row.kind === 'swatches') cycle(row, 1);
    if (row.kind === 'segmented') {
      const options = SEGMENTS[row.key];
      updateSettings({ [row.key]: options[(options.indexOf(settings[row.key]) + 1) % options.length] });
    }
  }

  // Gauche / droite sur une ligne à choix (couleur, sélecteur). Renvoie false si la ligne n'en a pas.
  function cycle(row: Row, step: number): boolean {
    if (row.kind === 'swatches') {
      const i = SWATCHES.findIndex((s) => s.name === settings.focusColor);
      updateSettings({ focusColor: SWATCHES[(i + step + SWATCHES.length) % SWATCHES.length].name });
      return true;
    }
    if (row.kind === 'segmented') {
      const options = SEGMENTS[row.key];
      const i = options.indexOf(settings[row.key]);
      updateSettings({ [row.key]: options[Math.max(0, Math.min(options.length - 1, i + step))] });
      return true;
    }
    return false;
  }

  function pickSection(index: number) {
    setSection(SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, index))]);
    setRowIndex(0);
  }

  useInput((button) => {
    const sectionIndex = SECTIONS.indexOf(section);
    if (area === 'nav') {
      if (button === 'Up') pickSection(sectionIndex - 1);
      if (button === 'Down') pickSection(sectionIndex + 1);
      if (button === 'Right' || button === 'A') setArea('rows');
      if (button === 'B') onClose();
      return;
    }
    const row = current[rowIndex];
    if (button === 'Up') setRowIndex(Math.max(0, rowIndex - 1));
    if (button === 'Down') setRowIndex(Math.min(current.length - 1, rowIndex + 1));
    if (button === 'A' && row) activate(row);
    if (button === 'Right' && row) cycle(row, 1);
    if (button === 'Left' && !(row && cycle(row, -1))) setArea('nav');
    if (button === 'B') setArea('nav');
  });

  const focusedRow = area === 'rows' ? rowIndex : -1;

  // Liste qui défile (Retro : trop de lignes pour l'écran, maquette « Résolution interne ») : la ligne choisie à la
  // manette reste visible.
  const list = useRef<ScrollView>(null);
  const rowPlaces = useRef(new Map<number, { y: number; height: number }>());
  const listHeight = useRef(0);
  const listOffset = useRef(0);
  useEffect(() => {
    list.current?.scrollTo({ y: 0, animated: false });
    listOffset.current = 0;
  }, [section]);
  useEffect(() => {
    const place = rowPlaces.current.get(focusedRow);
    if (!place || !listHeight.current) return;
    const top = place.y - 4;
    const bottom = place.y + place.height + 4;
    let next = listOffset.current;
    if (top < next) next = Math.max(0, top);
    else if (bottom > next + listHeight.current) next = bottom - listHeight.current;
    if (next === listOffset.current) return;
    list.current?.scrollTo({ y: next, animated: true });
    list.current?.flashScrollIndicators();
  }, [focusedRow, section]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Accueil derrière : flou 28 px, luminosité 40 %, voile rgba(8,8,10,0.4). */}
      <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,10,0.7)' }]} />

      <View style={styles.layout}>
        <View style={styles.nav}>
          <Text style={styles.title}>Settings</Text>
          <View style={styles.navItems}>
            {SECTIONS.map((name) => {
              const on = name === section;
              return (
                <Pressable
                  key={name}
                  onPress={() => {
                    pickSection(SECTIONS.indexOf(name));
                    setArea('nav');
                  }}
                  style={[styles.navItem, on && styles.navItemOn, on && area === 'nav' && { boxShadow: focusRing(focusColor) }]}
                >
                  <Text style={[styles.navText, on && styles.navTextOn]}>{name}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexGrow: 1 }} />
          <View style={styles.hints}>
            <ButtonHint glyph="A" label="Select" />
            <ButtonHint glyph="B" label="Back" onPress={onClose} />
          </View>
        </View>

        <View style={styles.card}>
          <Header
            section={section}
            xbox={xbox}
            pinnedCount={pinnedCount}
            retroSummary={section === 'Retro' ? retroSummary(retro.games, !!retro.folder) : ''}
            controllerName={controller.name}
            controllerConnected={controller.connected}
            signedOut={signedIn === false}
          >
            {headerButton && (
              <Pressable onPress={headerButton.onPress} style={[styles.change, focusedRow === 0 && { boxShadow: focusRing(focusColor) }]}>
                <Text style={styles.changeText}>{headerButton.label}</Text>
              </Pressable>
            )}
          </Header>
          <View style={styles.divider} />

          <ScrollView
            ref={list}
            style={styles.list}
            scrollEventThrottle={16}
            onScroll={(e) => (listOffset.current = e.nativeEvent.contentOffset.y)}
            onLayout={(e) => (listHeight.current = e.nativeEvent.layout.height)}
          >
          {current.map((row, i) =>
            row.kind === 'change' ? null : row.kind === 'signIn' ? (
              <View key={i} style={styles.signIn}>
                <PrimaryButton label="Sign in with Microsoft" onPress={row.onPress} focused={focusedRow === i} focusColor={focusColor} />
              </View>
            ) : (
              <Pressable
                key={i}
                onPress={() => {
                  setArea('rows');
                  setRowIndex(i);
                  activate(row);
                }}
                onLayout={(e) => rowPlaces.current.set(i, { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height })}
                style={[styles.row, row.kind === 'link' && row.subtitle ? styles.rowTwoLines : null, focusedRow === i && styles.rowFocused]}
              >
                <RowContent row={row} settings={settings} />
              </Pressable>
            ),
          )}
          </ScrollView>
          {section === 'About' && (
            <Text style={styles.legal}>Not affiliated with Microsoft. Xbox is a trademark of Microsoft. No games included.</Text>
          )}
        </View>
      </View>

      {confirmReset && (
        <ConfirmDialog
          title="Reset overrrrhere?"
          message="This erases your pinned games, play time and settings on this iPhone. Your Xbox and your games are not affected."
          confirmLabel="Reset"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            setConfirmReset(false);
            resetSettings();
            resetTiles(); // épinglages et images personnalisées
            resetPlaytime(); // temps joué ici (« Played here »)
          }}
        />
      )}
    </View>
  );
}

// « 6 games · 184 MB on this iPhone » (ROM, sauvegardes et jaquettes).
// Avec le dossier iCloud : « 24 games · 6 on this iPhone · 1.6 GB ».
function retroSummary(games: RetroGame[], folder: boolean) {
  if (games.length === 0) return 'No games on this iPhone yet';
  const bytes = games.reduce((total, game) => total + gameBytes(game), 0);
  const count = `${games.length} game${games.length > 1 ? 's' : ''}`;
  if (folder) return `${count} · ${games.filter((g) => !g.cloud || g.onDevice).length} on this iPhone · ${formatSize(bytes)}`;
  return `${count} · ${formatSize(bytes)} on this iPhone`;
}

function Header(props: {
  section: Section;
  xbox: XboxConsole | null;
  pinnedCount: number;
  retroSummary: string;
  controllerName: string;
  controllerConnected: boolean;
  signedOut: boolean;
  children?: ReactNode;
}) {
  if (props.section === 'Controller' || props.section === 'Xbox & Remote Play') {
    const isController = props.section === 'Controller';
    const name = isController ? props.controllerName || 'Mobile controller' : props.xbox?.name ?? 'No console';
    const ready = isController ? props.controllerConnected : props.xbox?.state !== 'offline' && !!props.xbox;
    const status = isController
      ? props.controllerConnected
        ? 'Connected'
        : 'Not connected'
      : props.signedOut
        ? 'Not signed in'
        : !props.xbox
          ? 'Not found'
          : props.xbox.state === 'offline'
            ? 'Offline'
            : `Ready · ${props.xbox.state === 'on' ? 'On' : 'Asleep'}`;
    return (
      <View style={[styles.header, styles.headerRow]}>
        <View style={styles.headerIdentity}>
          <View style={styles.iconBox}>{isController ? <ControllerIcon size={22} color={colors.white} /> : <ConsoleIcon />}</View>
          <View>
            <Text style={styles.headerTitle}>{name}</Text>
            <View style={styles.statusLine}>
              <View style={[styles.statusDot, !ready && styles.statusDotIdle]} />
              <Text style={styles.headerSubtitle}>{status}</Text>
            </View>
          </View>
        </View>
        {props.children}
      </View>
    );
  }
  if (props.section === 'About') {
    return (
      <View style={[styles.header, styles.headerIdentity]}>
        <Logo size={40} />
        <View>
          <Wordmark size={20} />
          <Text style={styles.headerSubtitle}>Version 1.0 · Free and open source</Text>
        </View>
      </View>
    );
  }
  const subtitles: Record<string, string> = {
    Retro: props.retroSummary,
    Tiles: `${props.pinnedCount} games pinned to your home`,
  };
  return (
    <View style={[styles.header, props.children ? styles.headerRow : null]}>
      <View>
        <Text style={styles.headerTitle}>{props.section}</Text>
        {subtitles[props.section] ? <Text style={styles.headerSubtitle}>{subtitles[props.section]}</Text> : null}
      </View>
      {props.children}
    </View>
  );
}

function RowContent({ row, settings }: { row: Row; settings: Settings }) {
  if (row.kind === 'toggle') {
    return (
      <>
        <Text style={styles.rowLabel}>{row.label}</Text>
        <Toggle on={settings[row.key] as boolean} />
      </>
    );
  }
  if (row.kind === 'swatches') {
    return (
      <>
        <Text style={styles.rowLabel}>Focus color</Text>
        <View style={styles.swatches}>
          {SWATCHES.map((s) => (
            <Pressable
              key={s.name}
              onPress={() => updateSettings({ focusColor: s.name })}
              style={[styles.swatch, { backgroundColor: s.color }, settings.focusColor === s.name && styles.swatchOn]}
            />
          ))}
        </View>
      </>
    );
  }
  if (row.kind === 'segmented') {
    return (
      <>
        {row.subtitle ? (
          <View style={{ flexShrink: 1, marginRight: 12 }}>
            <Text style={[styles.rowLabel, { lineHeight: 19 }]}>{row.label}</Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {row.subtitle}
            </Text>
          </View>
        ) : (
          <Text style={styles.rowLabel}>{row.label}</Text>
        )}
        <View style={styles.segmented}>
          {SEGMENTS[row.key].map((v) => {
            const on = settings[row.key] === v;
            return (
              <Pressable key={v} onPress={() => updateSettings({ [row.key]: v })} style={[styles.segment, on && styles.segmentOn]}>
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{v}</Text>
              </Pressable>
            );
          })}
        </View>
      </>
    );
  }
  if (row.kind === 'link') {
    if (row.subtitle) {
      return (
        <View>
          <Text style={[styles.rowLabel, row.destructive && styles.destructive]}>{row.label}</Text>
          <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
        </View>
      );
    }
    return (
      <>
        <Text style={[styles.rowLabel, row.destructive && styles.destructive]}>{row.label}</Text>
        {row.value ? (
          <View style={styles.rowValue}>
            {row.cloud && <CloudIcon size={18} color={colors.textSecondary} strokeWidth={1.8} />}
            <Text style={styles.rowValueText} numberOfLines={1}>
              {row.value}
            </Text>
            {row.chevron && <ChevronIcon />}
          </View>
        ) : (
          row.chevron && <ChevronIcon />
        )}
      </>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  signIn: {
    marginTop: 12,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
  },
  rowValue: {
    flexShrink: 1,
    marginLeft: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowValueText: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  layout: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    paddingVertical: 18,
    paddingHorizontal: layout.sideMargin,
    flexDirection: 'row',
    gap: 28,
  },
  nav: {
    width: 188,
  },
  title: {
    marginLeft: 12,
    marginBottom: 10,
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.26,
  },
  navItems: {
    gap: 2,
  },
  navItem: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  navItemOn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  navText: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: fonts.semiBold,
    fontSize: 15,
  },
  navTextOn: {
    color: colors.white,
  },
  hints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 12,
  },
  card: {
    flex: 1,
    marginTop: 46,
    marginBottom: 4,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  header: {
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  headerRow: {
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 22,
  },
  legal: {
    paddingHorizontal: 12,
    paddingTop: 8,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.ready,
  },
  statusDotIdle: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  change: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  changeText: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 13,
  },
  list: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  row: {
    height: 46,
    marginTop: 4,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowTwoLines: {
    justifyContent: 'flex-start',
  },
  rowFocused: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  rowLabel: {
    color: colors.white,
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  rowSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  destructive: {
    color: colors.destructive,
    fontFamily: fonts.semiBold,
  },
  swatches: {
    flexDirection: 'row',
    gap: 12,
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 999,
  },
  swatchOn: {
    boxShadow: '0 0 0 2px #1A1A1E, 0 0 0 4px #FFFFFF',
  },
  segmented: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  segment: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 999,
    justifyContent: 'center',
  },
  segmentOn: {
    backgroundColor: colors.white,
  },
  segmentText: {
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
    fontSize: 13,
  },
  segmentTextOn: {
    color: colors.ink,
  },
});
