import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BlurView } from 'expo-blur';

import { humanError, isNetworkError } from '../errors';
import { playStartupMelody } from '../feedback';
import { useFocusColor, useSettings } from '../settings';
import { CartridgeIcon, SparkleIcon } from '../ui/icons';
import { TopBar } from '../ui/TopBar';
import { MenuHint, PrimaryButton, TonalButton } from '../ui/components';
import { useOnline } from '../ui/device';
import { useInput } from '../ui/input';
import { colors, focusRing, fonts, layout } from '../ui/theme';
import { Profile, SignedOutError, getProfile } from '../xbox/auth';
import { getXboxCache, saveXboxCache } from '../xbox/cache';
import { XboxConsole, getConsoles, turnOff } from '../xbox/consoles';
import { InstalledGame, getInstalledGames } from '../xbox/games';
import { formatLastPlayed } from '../xbox/history';
import { formatDuration, usePlaytimeMinutes, xboxKey } from '../playtime';
import { RetroGame, SlotId, cancelDownload, fetchMissingCovers, hasAutoSave, useRetroLibrary } from '../retro/library';
import { systemById } from '../retro/systems';
import { GameDetailsScreen } from './GameDetailsScreen';
import { LaunchIssue } from './LaunchIssue';
import { initPinned, retroArt, useTiles, withArt } from '../tiles';
import { RetroDetailsScreen } from './retro/RetroDetailsScreen';
import { RetroLibraryScreen, RetroTileArt } from './retro/RetroLibraryScreen';
import { ControllerTestScreen } from './ControllerTestScreen';
import { LibraryScreen } from './LibraryScreen';
import type { PlayTarget } from './PlayScreen';
import { QuickMenu, QuickMenuAction } from './QuickMenu';
import { LicensesScreen } from './LicensesScreen';
import { Section, SettingsScreen } from './SettingsScreen';
import { TileEditorScreen } from './TileEditorScreen';

// Panneaux affichés par-dessus Home (qui reste chargé derrière, flouté).
type Overlay =
  | null
  | { name: 'menu'; item?: QuickMenuAction } // item : élément à resélectionner au retour
  | { name: 'settings'; section: Section }
  | { name: 'test' }
  | { name: 'licenses' }
  | { name: 'library'; titleId?: number }
  | { name: 'retro' }
  | { name: 'retroDetails'; gameId: string }
  | { name: 'details'; game: InstalledGame }
  | { name: 'editor'; game: InstalledGame; from: 'library' | 'details' }
  | { name: 'noInternet' }; // LaunchIssue « No internet » (mise à jour du 29/09)

// Écran Home (design/ecrans/Main.dc.html) : barre du haut, rangée de tuiles, fond du jeu sélectionné,
// titre, infos, bouton principal. A ouvre l'écran Launch (PlayScreen).

export type Tile =
  | { kind: 'game'; key: string; game: InstalledGame }
  | { kind: 'retroGame'; key: string; game: RetroGame }
  | { kind: 'home'; key: string }
  | { kind: 'retro'; key: string } // bibliothèque rétro (icône cartouche)
  | { kind: 'library'; key: string };


const TILE = { width: 128, height: 72, selectedWidth: 160, selectedHeight: 90, gap: 14 };

// Hors ligne (Main.dc.html, Tweak « offline ») : ces tuiles ont besoin de la Xbox, donc d'internet.
const needsXbox = (tile: Tile | undefined) => tile?.kind === 'game' || tile?.kind === 'home' || tile?.kind === 'library';
const OFFLINE_META = "You're offline · Retro games still work";

type Props = {
  onPlay: (target: PlayTarget) => void;
  onChangeConsole: () => void;
  onShowWelcome: () => void;
  onPlayRetro: (gameId: string, slot: SlotId | null, fromLibrary: boolean) => void;
  initialOverlay?: 'retro'; // retour d'un jeu rétro lancé depuis la bibliothèque
  onSignOut: () => void;
  onSignIn: () => void; // sans compte Microsoft : Console home et All games ouvrent Sign in
};

export function HomeScreen({ onPlay, onChangeConsole, onShowWelcome, onSignOut, onSignIn, onPlayRetro, initialOverlay }: Props) {
  const settings = useSettings();
  const tileState = useTiles();
  const retro = useRetroLibrary();
  const online = useOnline();
  // Dernières données Xbox gardées sur l'iPhone : affichées tout de suite, puis rafraîchies si internet répond.
  const [profile, setProfile] = useState<Profile | null>(() => getXboxCache()?.profile ?? null);
  const [xbox, setXbox] = useState<XboxConsole | null>(() => getXboxCache()?.console ?? null);
  const [games, setGames] = useState<InstalledGame[] | null>(() => getXboxCache()?.games ?? null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false); // Xbox Live injoignable alors que l'iPhone se croit en ligne
  const [signedOut, setSignedOut] = useState(false); // « Continue without Xbox » : pas de compte Microsoft
  const offline = !online || unreachable;
  const [overlay, setOverlay] = useState<Overlay>(initialOverlay === 'retro' ? { name: 'retro' } : null);
  const [homeReady, setHomeReady] = useState(false); // notice « Your home is ready » (premier lancement)
  const row = useRef<ScrollView>(null);
  // Settings, Manage tiles ou Controller ouverts depuis le menu : B y revient (demandé le 29/09).
  const fromMenu = useRef<QuickMenuAction | null>(null);

  // Revenu sur Home par un autre chemin (Manage ROMs…) : l'origine « menu » est oubliée.
  useEffect(() => {
    if (overlay === null) fromMenu.current = null;
  }, [overlay]);

  // Ferme le panneau : retour au menu s'il a été ouvert depuis le menu, sinon à Home.
  function closeOverlay() {
    const item = fromMenu.current;
    fromMenu.current = null;
    setOverlay(item ? { name: 'menu', item } : null);
  }

  // Mélodie de démarrage, une fois par ouverture de l'app, à l'apparition du launcher.
  useEffect(() => {
    playStartupMelody();
  }, []);

  // Rechargé quand internet revient.
  useEffect(() => {
    if (!online) {
      setGames((g) => g ?? []); // rien de gardé : seulement le rétro
      return;
    }
    fetchMissingCovers(); // jaquettes rétro manquantes, en arrière-plan
    let cancelled = false;
    getProfile()
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        saveXboxCache({ profile: p });
      })
      .catch(() => {});
    (async () => {
      try {
        const consoles = await getConsoles();
        // La console choisie dans « Choose your console » (sinon la première du compte).
        const chosen = consoles.find((c) => c.id === settings.consoleId) ?? consoles[0] ?? null;
        if (cancelled) return;
        setXbox(chosen);
        const list = chosen ? await getInstalledGames(chosen.id) : [];
        if (cancelled) return;
        setGames(list);
        setError(null);
        setUnreachable(false);
        setSignedOut(false);
        saveXboxCache({ console: chosen, games: list });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof SignedOutError) setSignedOut(true);
        else if (isNetworkError(e)) setUnreachable(true);
        else setError(humanError(e, "Couldn't reach your Xbox right now.", 'Home'));
        setGames((g) => g ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.consoleId, online]);

  // Premier lancement (ou après « Reset ») : épinglage automatique selon le réglage Auto-pin,
  // annoncé par la notice « Your home is ready » (Main.dc.html, firstRun).
  useEffect(() => {
    if (games?.length && tileState.pinned === null) {
      initPinned(games, settings.autoPin);
      if (settings.autoPin) setHomeReady(true);
    }
  }, [games, tileState.pinned, settings.autoPin]);

  useEffect(() => {
    if (!homeReady) return;
    const timer = setTimeout(() => setHomeReady(false), 8000);
    return () => clearTimeout(timer);
  }, [homeReady]);

  // Jeux épinglés dans l'ordre de Home : Xbox (titleId) et rétro (identifiant texte) mélangés.
  const pinned: Tile[] = (tileState.pinned ?? []).flatMap((id): Tile[] => {
    if (typeof id === 'string') {
      const game = retro.games.find((g) => g.id === id);
      return game ? [{ kind: 'retroGame', key: id, game }] : [];
    }
    const game = games?.find((g) => g.titleId === id);
    return game ? [{ kind: 'game', key: String(id), game: withArt(game, tileState) }] : [];
  });
  const tiles: Tile[] = [
    ...pinned,
    ...(settings.consoleTile ? [{ kind: 'home' as const, key: 'home' }] : []),
    { kind: 'retro', key: 'retro' },
    { kind: 'library', key: 'library' },
  ];
  const current = tiles[Math.min(selected, tiles.length - 1)];
  // « Played here » : temps joué via l'app (src/playtime.ts, option A du 26/09).
  const playedHere = usePlaytimeMinutes(
    current?.kind === 'game' ? xboxKey(current.game.titleId) : current?.kind === 'retroGame' ? `retro:${current.game.id}` : null,
  );
  const info = describe(current, playedHere, settings.showPlayTime, retro.games.length);
  const xboxOffline = offline && needsXbox(current);
  const shownError = offline ? null : error;

  // Game details (lot 2) : depuis Home, à partir d'une tuile de jeu (bouton « Details » ou View).
  // Jeu rétro épinglé : Retro game details (lot 4).
  function openDetails() {
    if (current?.kind === 'retroGame') return setOverlay({ name: 'retroDetails', gameId: current.game.id });
    if (current?.kind !== 'game') return;
    const game = games?.find((g) => g.titleId === current.game.titleId);
    if (game) setOverlay({ name: 'details', game });
  }

  function select(index: number) {
    const next = Math.max(0, Math.min(tiles.length - 1, index));
    if (next === selected) return;
    if (!settings.reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'scaleXY'));
    setSelected(next);
    // Garde la tuile sélectionnée visible, avec deux tuiles d'avance à gauche.
    row.current?.scrollTo({ x: Math.max(0, (next - 2) * (TILE.width + TILE.gap)), animated: true });
  }

  function activate(tile: Tile) {
    if (tile.kind === 'retro') return setOverlay({ name: 'retro' });
    if (tile.kind === 'retroGame') return onPlayRetro(tile.game.id, hasAutoSave(tile.game) ? 'auto' : null, false);
    // Jeux Xbox, Console home, All games : il faut internet et un compte Microsoft.
    if (offline) return setOverlay({ name: 'noInternet' });
    if (signedOut) return onSignIn();
    if (tile.kind === 'library') return setOverlay({ name: 'library' });
    if (!xbox) return;
    onPlay({ consoleId: xbox.id, consoleName: xbox.name, game: tile.kind === 'game' ? tile.game : null });
  }

  function playFromLibrary(game: InstalledGame) {
    if (offline) return setOverlay({ name: 'noInternet' });
    if (!xbox) return;
    onPlay({ consoleId: xbox.id, consoleName: xbox.name, game: withArt(game, tileState) });
  }

  function onMenuAction(action: QuickMenuAction) {
    if (action === 'settings' || action === 'controller' || action === 'tiles') fromMenu.current = action;
    if (action === 'settings') return setOverlay({ name: 'settings', section: 'Controller' });
    if (action === 'controller') return setOverlay({ name: 'settings', section: 'Controller' });
    if (action === 'sleep' && xbox) {
      if (offline) return setOverlay({ name: 'noInternet' });
      turnOff(xbox.id).catch((e) => setError(humanError(e, "Couldn't put your Xbox to sleep.", 'Home')));
      setXbox({ ...xbox, state: 'asleep', powerState: 'ConnectedStandby' });
    }
    if (action === 'tiles') return setOverlay({ name: 'library' });
    setOverlay(null); // « Home » ferme le menu
  }

  // Désactivé sous un panneau : au retour d'un jeu rétro, Home et la bibliothèque apparaissent ensemble
  // et Home s'inscrirait après elle (donc au-dessus de la pile) et lui volerait B.
  useInput(
    (button) => {
      // Jeu du dossier iCloud en cours de téléchargement (tuile épinglée) : seul B répond, il annule.
      if (retro.download && !retro.download.error) {
        if (button === 'B') cancelDownload();
        return;
      }
      setHomeReady(false); // la notice disparaît au premier geste
      if (button === 'Left') select(selected - 1);
      if (button === 'Right') select(selected + 1);
      if (button === 'A' && current) activate(current);
      if (button === 'View') openDetails(); // carte de boutons commune : View = Details
      if (button === 'Menu') setOverlay({ name: 'menu' });
    },
    overlay === null,
  );

  return (
    <View style={styles.screen}>
      <Background tile={settings.artBg ? current : { kind: 'library', key: 'plain' }} />
      <View style={[StyleSheet.absoluteFill, styles.shadeLeft]} />
      <View style={[StyleSheet.absoluteFill, styles.shadeBottom]} />
      <View style={styles.shadeTop} />

      <View style={styles.content}>
        <View style={styles.topBar}>
          <TopBar
            gamertag={profile?.gamertag}
            picture={profile?.picture}
            consoleName={xbox?.name}
            consoleReady={xbox?.state === 'on'}
            offline={offline}
          />
        </View>
        <View style={{ flexGrow: 1 }} />

        {games === null ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.white} />
          </View>
        ) : (
          <ScrollView
            ref={row}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.row}
            contentContainerStyle={styles.rowContent}
          >
            {tiles.map((tile, i) => (
              <TileView
                key={tile.key}
                tile={tile}
                selected={i === selected}
                dimmed={offline && needsXbox(tile) && i !== selected}
                onPress={() => (i === selected ? activate(tile) : select(i))}
              />
            ))}
          </ScrollView>
        )}

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {info.title}
          </Text>
          <Text style={[styles.meta, !xboxOffline && shownError && styles.error]} numberOfLines={1}>
            {xboxOffline ? OFFLINE_META : (shownError ?? info.meta)}
          </Text>
        </View>

        <View style={styles.actions}>
          <View style={styles.mainButtons}>
            <PrimaryButton label={info.action} onPress={() => current && activate(current)} />
            {/* Sur une tuile de jeu seulement (pas Console home ni All games) : Details, glyphe View. */}
            {(current?.kind === 'game' || current?.kind === 'retroGame') && <TonalButton glyph="View" label="Details" onPress={openDetails} />}
          </View>
          <MenuHint onPress={() => setOverlay({ name: 'menu' })} />
        </View>
      </View>

      {homeReady && (
        <View style={styles.notice}>
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(22,22,26,0.88)' }]} />
          <SparkleIcon />
          <View style={styles.noticeText}>
            <Text style={styles.noticeTitle}>Your home is ready</Text>
            <Text style={styles.noticeBody}>Your recent games are pinned here.</Text>
          </View>
        </View>
      )}

      {overlay?.name === 'menu' && <QuickMenu initial={overlay.item} onAction={onMenuAction} onClose={() => setOverlay(null)} />}
      {overlay?.name === 'settings' && (
        <SettingsScreen
          initialSection={overlay.section}
          xbox={xbox}
          pinnedCount={pinned.length}
          onClose={closeOverlay}
          onTestButtons={() => setOverlay({ name: 'test' })}
          onManagePinned={() => setOverlay({ name: 'library' })}
          onManageRoms={() => setOverlay({ name: 'retro' })}
          onChangeConsole={onChangeConsole}
          onShowWelcome={onShowWelcome}
          onLicenses={() => setOverlay({ name: 'licenses' })}
          onSignOut={onSignOut}
          onSignIn={onSignIn}
        />
      )}
      {overlay?.name === 'retro' && (
        <RetroLibraryScreen
          onPlay={(game, slot) => onPlayRetro(game.id, slot, true)}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.name === 'retroDetails' && (
        <RetroDetailsScreen gameId={overlay.gameId} onPlay={(game, slot) => onPlayRetro(game.id, slot, false)} onClose={() => setOverlay(null)} />
      )}
      {overlay?.name === 'noInternet' && (
        <LaunchIssue issue="noInternet" onPrimary={() => setOverlay({ name: 'retro' })} onSecondary={() => setOverlay(null)} />
      )}
      {overlay?.name === 'test' && <ControllerTestScreen onExit={() => setOverlay({ name: 'settings', section: 'Controller' })} />}
      {overlay?.name === 'licenses' && <LicensesScreen onExit={() => setOverlay({ name: 'settings', section: 'About' })} />}
      {(overlay?.name === 'library' || (overlay?.name === 'editor' && overlay.from === 'library')) && (
        <LibraryScreen
          games={games ?? []}
          consoleName={xbox?.name ?? 'your Xbox'}
          initialTitleId={overlay.name === 'library' ? overlay.titleId : overlay.game.titleId}
          onPlay={playFromLibrary}
          onEdit={(game) => setOverlay({ name: 'editor', game, from: 'library' })}
          onClose={closeOverlay}
        />
      )}
      {(overlay?.name === 'details' || (overlay?.name === 'editor' && overlay.from === 'details')) && (
        <GameDetailsScreen
          game={overlay.game}
          onPlay={playFromLibrary}
          onEdit={(game) => setOverlay({ name: 'editor', game, from: 'details' })}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.name === 'editor' && (
        <TileEditorScreen
          game={overlay.game}
          onClose={() =>
            setOverlay(overlay.from === 'details' ? { name: 'details', game: overlay.game } : { name: 'library', titleId: overlay.game.titleId })
          }
        />
      )}
    </View>
  );
}

function describe(tile: Tile | undefined, playedHereMinutes: number, showPlayTime: boolean, retroCount: number) {
  if (!tile || tile.kind === 'library') {
    return { title: 'All games', meta: 'Every game installed on your Xbox · Pin your favorites here', action: 'Open' };
  }
  if (tile.kind === 'retro') {
    const count = retroCount === 0 ? 'No games on this iPhone yet' : `${retroCount} game${retroCount > 1 ? 's' : ''} on this iPhone`;
    return { title: 'Retro', meta: `${count} · Add your own ROMs from Files`, action: 'Open' };
  }
  if (tile.kind === 'retroGame') {
    // « Super Nintendo · Last played yesterday · 3 h played » ; A = Continue s'il existe une sauvegarde auto.
    const meta = [systemById(tile.game.system).name];
    if (tile.game.lastPlayed) meta.push(`Last played ${formatLastPlayed(tile.game.lastPlayed)}`);
    if (showPlayTime && playedHereMinutes > 0) meta.push(`${formatDuration(playedHereMinutes)} played`);
    return { title: tile.game.name, meta: meta.join(' · '), action: hasAutoSave(tile.game) ? 'Continue' : 'Play' };
  }
  if (tile.kind === 'home') {
    return { title: 'Console home', meta: "Stream your Xbox's home screen without launching a game", action: 'Stream' };
  }
  // « Last played yesterday · 14 h played » (Main.dc.html, mise à jour du 25/09 : sans « Installed on your Xbox »,
  // mention gardée dans All games et Game details).
  const meta: string[] = [];
  if (tile.game.lastPlayed) meta.push(`Last played ${formatLastPlayed(tile.game.lastPlayed)}`);
  if (showPlayTime && playedHereMinutes > 0) meta.push(`${formatDuration(playedHereMinutes)} played`);
  return { title: tile.game.name, meta: meta.join(' · '), action: 'Play' };
}

// ---------- Fond plein écran ----------

// Fond d'une tuile : visuel du jeu, « Console home » ou « All games ». Réutilisé par l'écran Launch.
export function Background({ tile }: { tile: Tile | undefined }) {
  const tiles = useTiles();
  const retroBackground = tile?.kind === 'retroGame' ? retroArt(tile.game, tiles).background : null;
  if (retroBackground) {
    return <Image source={{ uri: retroBackground }} style={StyleSheet.absoluteFill} resizeMode="cover" />;
  }
  if (tile?.kind === 'game' && tile.game.background) {
    return <Image source={{ uri: tile.game.background }} style={StyleSheet.absoluteFill} resizeMode="cover" />;
  }
  if (tile?.kind === 'home') {
    // « Console home » : ciel vert très sombre et ondes de signal centrées en (640, 190).
    return (
      <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'linear-gradient(180deg, #050E09 0%, #0E2B1C 100%)' }]}>
        <Signal cx={640} cy={190} radii={[38, 80, 128, 182]} opacities={[0.5, 0.32, 0.2, 0.11]} stroke={1.5} dot={6} glow={30} />
      </View>
    );
  }
  return <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'linear-gradient(180deg, #0C0C0F 0%, #1A1B21 100%)' }]} />;
}

// Cercles concentriques de la tuile « Console home » (dessinés en vues, sans SVG).
function Signal(props: { cx: number; cy: number; radii: number[]; opacities: number[]; stroke: number; dot: number; glow: number }) {
  const color = '#8FE8B4';
  const circle = (r: number) => ({ position: 'absolute' as const, left: props.cx - r, top: props.cy - r, width: r * 2, height: r * 2, borderRadius: r });
  return (
    <>
      <View style={[circle(props.glow), { backgroundColor: color, opacity: 0.25 }]} />
      <View style={[circle(props.dot), { backgroundColor: color }]} />
      {props.radii.map((r, i) => (
        <View key={r} style={[circle(r), { borderWidth: props.stroke, borderColor: color, opacity: props.opacities[i] }]} />
      ))}
    </>
  );
}

// ---------- Tuiles ----------

function TileView({ tile, selected, dimmed, onPress }: { tile: Tile; selected: boolean; dimmed: boolean; onPress: () => void }) {
  const focusColor = useFocusColor();
  const width = selected ? TILE.selectedWidth : TILE.width;
  const height = selected ? TILE.selectedHeight : TILE.height;
  const scale = width / 852; // les dessins du design sont en coordonnées 852 × 393

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tile,
        { width, height, boxShadow: selected ? focusRing(focusColor) : '0 6px 16px rgba(0,0,0,0.35)' },
        (tile.kind === 'library' || tile.kind === 'retro') && styles.libraryTile,
        dimmed && { opacity: 0.45 },
      ]}
    >
      {tile.kind === 'retroGame' ? (
        <RetroTileArt game={tile.game} />
      ) : (
      <View style={styles.tileClip}>
        {tile.kind === 'game' &&
          (tile.game.tile ? (
            <Image source={{ uri: tile.game.tile }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <Text style={styles.tileName} numberOfLines={2}>
              {tile.game.name}
            </Text>
          ))}

        {tile.kind === 'home' && (
          <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'linear-gradient(180deg, #050E09 0%, #0E2B1C 100%)' }]}>
            <Signal
              cx={426 * scale}
              cy={(196 * height) / 393}
              radii={[60, 120, 185].map((r) => r * scale)}
              opacities={[0.55, 0.35, 0.2]}
              stroke={6 * scale}
              dot={6 * scale}
              glow={30 * scale}
            />
          </View>
        )}

        {tile.kind === 'retro' && <CartridgeIcon />}

        {tile.kind === 'library' && (
          <View style={styles.libraryIcon}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.librarySquare} />
            ))}
          </View>
        )}
      </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  // Dégradés du design : gauche (90°), bas (0°), bandeau du haut (180°, 60 pt).
  shadeLeft: {
    experimental_backgroundImage: 'linear-gradient(90deg, rgba(8,8,10,0.88) 0%, rgba(8,8,10,0.55) 38%, rgba(8,8,10,0) 64%)',
  },
  shadeBottom: {
    experimental_backgroundImage: 'linear-gradient(0deg, rgba(8,8,10,0.92) 0%, rgba(8,8,10,0.45) 34%, rgba(8,8,10,0) 58%)',
  },
  // Bandeau du haut : 96 pt, pour que la barre reste lisible sur les images claires (mise à jour du 25/09).
  shadeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 96,
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(8,8,10,0.72) 0%, rgba(8,8,10,0.42) 45%, rgba(8,8,10,0) 100%)',
  },
  content: {
    flex: 1,
    paddingTop: 14,
    paddingBottom: 18,
  },
  topBar: {
    height: 32,
    marginHorizontal: layout.sideMargin,
  },
  loading: {
    height: 92,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: layout.sideMargin,
  },
  row: {
    flexGrow: 0,
    overflow: 'visible',
  },
  rowContent: {
    height: 92,
    alignItems: 'flex-end',
    gap: TILE.gap,
    paddingHorizontal: layout.sideMargin,
  },
  tile: {
    borderRadius: 10,
    backgroundColor: colors.tileBackground,
  },
  tileClip: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileName: {
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  libraryTile: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  // Icône grille 22 pt (quatre carrés arrondis, trait 1,7).
  libraryIcon: {
    width: 20,
    height: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  librarySquare: {
    width: 9,
    height: 9,
    borderRadius: 1.5,
    borderWidth: 1.6,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  info: {
    marginTop: 16,
    paddingHorizontal: layout.sideMargin,
  },
  title: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.24,
  },
  meta: {
    marginTop: 3,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    color: colors.destructive,
  },
  // Notice « Your home is ready » : panneau 290 pt en haut à droite (Main.dc.html, firstRun).
  notice: {
    position: 'absolute',
    right: layout.sideMargin,
    top: 56,
    width: 290,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    boxShadow: '0 14px 36px rgba(0,0,0,0.45)',
    overflow: 'hidden',
    flexDirection: 'row',
    gap: 12,
  },
  noticeText: {
    flex: 1,
    gap: 3,
  },
  noticeTitle: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 18,
  },
  noticeBody: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  mainButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actions: {
    marginTop: 12,
    paddingHorizontal: layout.sideMargin,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
