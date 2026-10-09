import { BlurView } from 'expo-blur';
import { useKeepAwake } from 'expo-keep-awake';
import { ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import Manette from '../../../modules/manette';
import Retro, { RetroView } from '../../../modules/retro';
import { addPlaytime } from '../../playtime';
import { DS_LAYOUTS, DsLayout, dsScreens, dualScreenProp, isDualScreen } from '../../retro/dsLayout';
import {
  MANUAL_SLOTS,
  RetroGame as RetroGameInfo,
  SaveSlot,
  SlotId,
  getRetroGame,
  markPlayed,
  nativePath,
  romPath,
  saveSlots,
  setGameResolution,
  setWiiChoice,
  sramFile,
  stateFile,
  stateImage,
  touchSaves,
  useRetroLibrary,
} from '../../retro/library';
import { SystemId, systemById } from '../../retro/systems';
import { WII_POINTERS, WII_PROFILES, WII_SPEEDS, WiiPointer, WiiPointerSpeed, WiiProfile, autoWiiProfile, usesPointer, wiiGameBox, wiiOptions } from '../../retro/wii';
import { RETRO_RESOLUTIONS, RetroResolution, useSettings } from '../../settings';
import { TouchMode, setSessionTouchMode, useTouchControlsVisible, useTouchMode } from '../../touch';
import { ButtonHint, Toggle } from '../../ui/components';
import { useBattery, useController } from '../../ui/device';
import { ControllerIcon, DsOptionsIcon, FastForwardIcon, HomeIcon, LoadStateIcon, PlayIcon, ResolutionIcon, SaveStateIcon, TouchMenuIcon } from '../../ui/icons';
import { useInput } from '../../ui/input';
import { colors, fonts, layout } from '../../ui/theme';
import { NoController } from '../NoController';
import { DsScreens } from './DsScreens';
import { SaveImage } from './SaveImage';
import { TouchPSP } from './TouchPSP';
import { TouchRetro } from './TouchRetro';
import { WII_OPTION_ROWS, WiiControlsScreen, WiiNotices, WiiOptionsMenu, nextProfile } from './WiiScreens';

// Jeu rétro (design/ecrans/RetroPlay.dc.html). View + Menu ouvre le menu du jeu, et le jeu se met en pause :
// Resume, Save state (prochain emplacement libre), Load state (liste dans le panneau), Fast forward,
// Touch controls, Back to launcher. Emplacements pleins : « All slots are full », Cancel par défaut.
// En quittant (ou en passant en arrière-plan), la sauvegarde auto est écrite par le module natif.
// DS (DSMenu.dc.html) : ligne « DS options › » en plus (Screen layout, Swap screens, Blow into the microphone,
// Close the lid). Pour souffler, le jeu reprend seulement pendant que A est tenu sur la ligne « Blow ».
// 3DS (maquettes 3DS) : ligne « 3DS options › » avec Screen layout et Swap screens seulement (micro et couvercle
// laissés de côté, décision d'Elhadji du 26/09/2026).

const TOUCH_MODES: TouchMode[] = ['Auto', 'On', 'Off'];
const RELATIVE_DAY = 86_400_000;
const DS_OPTIONS_ROW = 3; // place de « DS options » (et « Wii options ») dans le menu principal
const BLOW_ROW = 2; // place de « Blow into the microphone » dans « DS options »

type Menu = null | { view: 'main' | 'load' | 'overwrite' | 'ds' | 'wii' | 'wiiControls'; selected: number };
type Toast = { text: string; image: string | null };

type Props = {
  gameId: string;
  slot: SlotId | null; // sauvegarde à charger au démarrage (« Continue » = auto)
  onExit: () => void;
};

// GameCube : réglages de Dolphin envoyés au lancement, choisis après les essais de vitesse du 27/09/2026
// (Le Retour du Roi, sur iPhone 16 Pro Max). Tous sont envoyés à chaque fois (Dolphin garde sinon la valeur précédente).
// Essai 1 : double cœur, avec la synchronisation de sécurité (Le Retour du Roi : 0,52 → 0,70, sans blocage).
// Essai 2 : double cœur + horloge automatique (Le Retour du Roi : vitesse ≈ 1,00 avec le processeur à 55–70 %).
// Essai 3 : + raccourcis graphiques (efb_access 0, bbox 0) : 1,00, 60 images/s, processeur 95–100 %, image normale ;
//   mais cinématique en vidéo : l'horloge descend à 35 % et l'image tombe à 2,5 images/s.
// Essai 4 : essai 3 sans l'horloge automatique : en jeu 0,57–0,79 → l'horloge reste nécessaire.
// Essai 5 : essai 3 avec le processeur fixé à 60 % : jeu 1,00 (41–60 images/s, « un peu moins fluide, pas désagréable »),
//   cinématiques normales → les vidéos ramaient à cause de l'horloge descendue à 30 %, pas des raccourcis XFB.
// Réglages retenus (build 26) : essai 3 + horloge automatique plus sûre (plancher 50 %, remonte si baisser n'aide pas).
const GAMECUBE_OPTIONS: Record<string, number> = {
  dual_core: 1, // processeur et carte graphique de la GameCube sur deux cœurs de l'iPhone
  sync_gpu: 1, // synchronisation des deux (évite des blocages du double cœur)
  efb_access: 0, // lecture de l'image par le processeur (0 = plus rapide, peut casser des effets)
  bbox: 0, // « bounding box » : sert à peu de jeux (Paper Mario)
  defer_efb_copies: 1,
  auto_clock: 1, // horloge automatique du processeur simulé
  cpu_clock: 1, // vitesse de départ du processeur simulé
  clock_floor: 0.5, // l'horloge automatique ne descend pas plus bas (cinématiques en vidéo)
  invert_c_x: 1, // stick droit : inverser gauche / droite (Harry Potter : demandé par Elhadji)
  invert_c_y: 1, // stick droit : inverser haut / bas (idem)
};


export function RetroPlayScreen({ gameId, slot, onExit }: Props) {
  useKeepAwake();
  useRetroLibrary(); // relit les emplacements après chaque sauvegarde
  const game = getRetroGame(gameId);
  if (!game) return <Missing onExit={onExit} message="This game is no longer on this iPhone." />;
  return <RetroGame game={game} slot={slot} onExit={onExit} />;
}

function RetroGame({ game, slot, onExit }: { game: RetroGameInfo; slot: SlotId | null; onExit: () => void }) {
  const gameId = game.id;
  const settings = useSettings();
  const controller = useController();
  const touchMode = useTouchMode();
  const touchVisible = useTouchControlsVisible();
  const [menu, setMenu] = useState<Menu>(null);
  const [fast, setFast] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const playSince = useRef<number | null>(null);

  // DS et 3DS : disposition des écrans (choisie dans le menu, sinon celle de Settings › Retro › DS screen layout avec
  // la manette, empilés avec les contrôles tactiles), écrans échangés ; DS seulement : couvercle fermé, souffle en
  // cours. Pour cette partie seulement.
  const dual = isDualScreen(game.system) ? game.system : null;
  const ds = game.system === 'nds';
  const screenSize = useWindowDimensions();
  const [dsChoice, setDsChoice] = useState<DsLayout | null>(null);
  const [swapped, setSwapped] = useState(false);
  const [lid, setLid] = useState(false);
  const [blowing, setBlowing] = useState(false);
  const dsLayout: DsLayout = dsChoice ?? (touchVisible ? 'Stacked' : settings.dsLayout);
  const screens = dual ? dsScreens(dual, dsLayout, swapped, screenSize.width, screenSize.height, touchVisible) : null;
  // 3DS, focus avec les contrôles tactiles (ThreeDSFocus.dc.html) : le petit écran s'agrandit au toucher ; l'écran
  // tactile ne reçoit le doigt que quand il est le grand.
  const touchFocus = screens?.touchFocus ?? false;
  const smallScreen = screens && touchFocus ? (swapped ? screens.top : screens.bottom) : undefined;

  // Wii : mêmes réglages que la GameCube, plus le profil de commandes et le pointeur (src/retro/wii.ts), choisis
  // dans « Wii options » pour ce jeu ; sinon profil automatique d'après l'identifiant du jeu, pointeur au stick, Medium.
  const wii = game.system === 'wii';
  const rom = romPath(game);
  const autoProfile = useMemo(() => (wii ? autoWiiProfile(Retro.discGameId(rom)) : null), [wii, rom]);
  const wiiProfile: WiiProfile | null = wii ? game.wii?.profile ?? autoProfile : null;
  const wiiPointer: WiiPointer = game.wii?.pointer ?? 'Right stick';
  const wiiSpeed: WiiPointerSpeed = game.wii?.speed ?? 'Medium';
  // Résolution interne (maquette du 06/10/2026) : Wii, GameCube et 3DS ; celle choisie pour ce jeu dans le menu,
  // sinon celle de Settings › Retro. Wii et GameCube : changée en pleine partie (prop resolution) ; 3DS : au prochain
  // lancement, et 2× au plus (essais du 06/10/2026 : Super Street Fighter IV trop lent en 3×).
  const gameCube = game.system === 'gc' || wii;
  const hasResolution = gameCube || game.system === '3ds';
  const resolutions = game.system === '3ds' ? RETRO_RESOLUTIONS.slice(0, 2) : RETRO_RESOLUTIONS;
  const chosen: RetroResolution = game.resolution ?? settings.retroResolution;
  const resolution = resolutions.includes(chosen) ? chosen : resolutions[resolutions.length - 1];
  const scale = hasResolution ? Number(resolution[0]) : 1;
  const [launchScale] = useState(scale); // 3DS : celle du lancement reste jusqu'à la fin de la partie
  const resolutionValue = game.resolution ? resolution : `${resolution} · Default`;
  function nextResolution() {
    const next = resolutions[(resolutions.indexOf(resolution) + 1) % resolutions.length];
    setGameResolution(game.id, next);
    if (game.system === '3ds') setToast({ text: `Resolution ${next} from the next start`, image: null });
  }

  // Réglages du lancement ; ensuite, les changements du menu partent au jeu en cours (setWiiControls).
  const [gameCubeOptions] = useState(() => ({
    ...GAMECUBE_OPTIONS,
    efb_scale: scale,
    ...(wiiProfile ? wiiOptions(wiiProfile, wiiPointer, wiiSpeed) : {}),
  }));
  const wiiChanged = useRef(false);
  useEffect(() => {
    if (!wiiProfile) return;
    if (wiiChanged.current) Retro.setWiiControls(wiiOptions(wiiProfile, wiiPointer, wiiSpeed));
    wiiChanged.current = true;
  }, [wiiProfile, wiiPointer, wiiSpeed]);
  const wiiImage = wiiGameBox(screenSize.width, screenSize.height, touchVisible, settings.retroSize === 'Fill screen');
  // Profils à pointeur : avec les contrôles tactiles, toucher l'image vise toujours (maquette des contrôles tactiles
  // Wii) ; avec la manette, seulement en mode Touch.
  const wiiAim = wiiProfile !== null && usesPointer(wiiProfile) ? wiiImage : undefined;
  const wiiBox = wiiPointer === 'Touch' ? wiiAim : undefined;
  // Zone qui reçoit le doigt avec les contrôles tactiles : écran tactile de la DS / 3DS, ou image Wii.
  const touchScreen = screens ? (touchFocus && !swapped ? undefined : screens.bottom) : wiiAim;
  const [controlsTab, setControlsTab] = useState<WiiProfile>('Remote + Nunchuk'); // onglet de « Wii controls »
  // Notices du début de partie (WiiPlay.dc.html), d'après les réglages du lancement.
  const [notices] = useState(() => ({
    firstLaunch: game.lastPlayed === null,
    chosen: wii && !game.wii?.profile && autoProfile !== 'Remote + Nunchuk' ? autoProfile : null,
    pointer: wiiProfile && usesPointer(wiiProfile) ? wiiPointer : null,
  }));
  const [recentered, setRecentered] = useState(0);
  const [edge, setEdge] = useState<string | null>(null);

  // Manette branchée ou débranchée (contrôles tactiles masqués ou affichés) : le choix du menu est oublié,
  // on revient à la disposition par défaut (côte à côte avec la manette, empilés sans).
  useEffect(() => setDsChoice(null), [touchVisible]);

  useEffect(() => {
    if (ds) Retro.setLidClosed(lid);
  }, [ds, lid]);
  useEffect(() => {
    if (ds) Retro.setBlow(blowing);
  }, [ds, blowing]);

  // Souffle à la manette : tant que A est tenu sur la ligne « Blow » (le module manette signale aussi le relâchement).
  const onBlowRow = ds && menu?.view === 'ds' && menu.selected === BLOW_ROW;
  useEffect(() => {
    if (!onBlowRow) return;
    const subscription = Manette.addListener('onButton', (event) => {
      if (event.button === 'A') setBlowing(event.pressed);
    });
    return () => {
      subscription.remove();
      setBlowing(false);
    };
  }, [onBlowRow]);

  // Le choix « Touch controls » du menu ne vaut que pour cette partie.
  useEffect(() => () => setSessionTouchMode(null), []);

  // « Played here » : temps de jeu réel (hors menu), compté en quittant ou en ouvrant le menu.
  const running = startedAt !== null && menu === null && !error;
  useEffect(() => {
    if (!running) return;
    playSince.current = Date.now();
    return () => {
      if (playSince.current) addPlaytime(`retro:${gameId}`, (Date.now() - playSince.current) / 1000);
      playSince.current = null;
    };
  }, [running, gameId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const slots = saveSlots(game);
  const freeSlot = MANUAL_SLOTS.find((id) => !slots.some((s) => s.id === id)) ?? null;
  const manual = slots.filter((s) => s.id !== 'auto');

  async function save(target: SlotId) {
    const ok = await Retro.saveState(nativePath(stateFile(game, target)), nativePath(stateImage(game, target)));
    touchSaves();
    const name = `Slot ${target.slice(4)}`;
    setToast(ok ? { text: `Saved to ${name}`, image: `${stateImage(game, target).uri}?t=${Date.now()}` } : { text: 'The game could not be saved', image: null });
    setMenu({ view: 'main', selected: 1 });
  }

  async function load(saved: SaveSlot) {
    const ok = await Retro.loadState(nativePath(stateFile(game, saved.id)));
    setToast(ok ? { text: `Loaded ${saved.name}`, image: saved.image } : { text: 'This save could not be loaded', image: null });
    setMenu({ view: 'main', selected: 2 });
  }

  const actions: MenuAction[] = [
    { label: 'Resume', Icon: PlayIcon, run: () => setMenu(null) },
    {
      label: 'Save state',
      Icon: SaveStateIcon,
      value: freeSlot ? `Slot ${freeSlot.slice(4)}` : 'Full',
      run: () => (freeSlot ? save(freeSlot) : setMenu({ view: 'overwrite', selected: 0 })),
    },
    {
      label: 'Load state',
      Icon: LoadStateIcon,
      value: `${slots.length} save${slots.length === 1 ? '' : 's'}`,
      run: () => slots.length > 0 && setMenu({ view: 'load', selected: 0 }),
    },
    ...(dual
      ? [{ label: dual === '3ds' ? '3DS options' : 'DS options', Icon: DsOptionsIcon, value: '›', run: () => setMenu({ view: 'ds', selected: 0 }) }]
      : []),
    ...(wii ? [{ label: 'Wii options', Icon: ControllerIcon, value: '›', run: () => setMenu({ view: 'wii', selected: 0 }) }] : []),
    // Wii et GameCube : Resolution dans le menu principal (3DS : dans « 3DS options », le menu principal est plein).
    ...(gameCube
      ? [
          {
            label: 'Resolution',
            Icon: ResolutionIcon,
            value: resolutionValue,
            note: game.resolution ? `Resolution ${resolution} for this game. Changes right away.` : undefined,
            run: nextResolution,
          },
        ]
      : []),
    // GameCube : pas d'avance rapide (sans JIT, elle tient tout juste la vitesse normale ; maquette GameCube.html).
    ...(game.system === 'gc' || game.system === 'wii' ? [] : [{ label: 'Fast forward', Icon: FastForwardIcon, toggle: fast, run: () => setFast((f) => !f) }]),
    {
      label: 'Touch controls',
      Icon: TouchMenuIcon,
      value: touchMode,
      run: () => setSessionTouchMode(TOUCH_MODES[(TOUCH_MODES.indexOf(touchMode) + 1) % TOUCH_MODES.length]),
    },
    { label: 'Back to launcher', Icon: HomeIcon, run: onExit },
  ];

  // DS options (DSMenu.dc.html). « Blow » n'a pas d'action au clic : A tenu (ou le doigt posé) fait souffler.
  // 3DS options : les deux premières lignes seulement.
  const dsOptions: DsOption[] = [
    { label: 'Screen layout', value: dsLayout, run: () => setDsChoice(DS_LAYOUTS[(DS_LAYOUTS.indexOf(dsLayout) + 1) % DS_LAYOUTS.length]) },
    { label: 'Swap screens', hint: 'Right stick click', run: () => setSwapped((s) => !s) },
    ...(dual === '3ds'
      ? [{ label: 'Resolution', detail: 'Applies next time you start the game', value: resolutionValue, run: nextResolution }]
      : []),
    ...(ds
      ? [
          { label: 'Blow into the microphone', detail: 'For games that ask you to blow. Hold A here.', blow: true },
          { label: 'Close the lid', toggle: lid, run: () => setLid((l) => !l) },
        ]
      : []),
  ];

  // Wii options (WiiMenu.dc.html) : A passe au réglage suivant ; gardé pour ce jeu.
  function runWii(row: number) {
    if (!wiiProfile) return;
    if (row === 0) setWiiChoice(game.id, { profile: nextProfile(wiiProfile) });
    if (row === 1 && usesPointer(wiiProfile)) setWiiChoice(game.id, { pointer: WII_POINTERS[(WII_POINTERS.indexOf(wiiPointer) + 1) % WII_POINTERS.length] });
    if (row === 2) setWiiChoice(game.id, { speed: WII_SPEEDS[(WII_SPEEDS.indexOf(wiiSpeed) + 1) % WII_SPEEDS.length] });
    if (row === 3) Retro.recenterWiiPointer();
    if (row === 4) {
      setControlsTab(wiiProfile);
      setMenu({ view: 'wiiControls', selected: 0 });
    }
  }

  // Liste du panneau : chargement (toutes les sauvegardes) ou remplacement (Cancel + Slot 1 à 3).
  const listLength = menu?.view === 'load' ? slots.length : manual.length + 1;

  function pickFromList(index: number) {
    if (!menu) return;
    if (menu.view === 'load') return slots[index] && load(slots[index]);
    if (index === 0) return setMenu({ view: 'main', selected: 1 }); // Cancel
    save(manual[index - 1].id);
  }

  function back(view: 'load' | 'overwrite' | 'ds' | 'wii' | 'wiiControls') {
    if (view === 'wiiControls') return setMenu({ view: 'wii', selected: 4 });
    setMenu({ view: 'main', selected: view === 'ds' || view === 'wii' ? DS_OPTIONS_ROW : view === 'load' ? 2 : 1 });
  }

  useInput(
    (button) => {
      if (!menu) return; // pendant le jeu, la manette est lue par le module natif
      if (menu.view === 'wiiControls') {
        // Wii controls : LB / RB changent d'onglet.
        const step = button === 'RB' ? 1 : button === 'LB' ? -1 : 0;
        if (step) setControlsTab(WII_PROFILES[(WII_PROFILES.indexOf(controlsTab) + step + WII_PROFILES.length) % WII_PROFILES.length]);
        if (button === 'B') back('wiiControls');
        return;
      }
      if (menu.view === 'wii' && menu.selected === 2 && (button === 'Left' || button === 'Right')) {
        const index = Math.min(WII_SPEEDS.length - 1, Math.max(0, WII_SPEEDS.indexOf(wiiSpeed) + (button === 'Right' ? 1 : -1)));
        setWiiChoice(game.id, { speed: WII_SPEEDS[index] });
        return;
      }
      const count =
        menu.view === 'main' ? actions.length : menu.view === 'ds' ? dsOptions.length : menu.view === 'wii' ? WII_OPTION_ROWS : listLength;
      if (button === 'Up') setMenu({ ...menu, selected: Math.max(0, menu.selected - 1) });
      if (button === 'Down') setMenu({ ...menu, selected: Math.min(count - 1, menu.selected + 1) });
      if (button === 'A') {
        if (menu.view === 'main') actions[menu.selected].run();
        else if (menu.view === 'ds') dsOptions[menu.selected].run?.();
        else if (menu.view === 'wii') runWii(menu.selected);
        else pickFromList(menu.selected);
      }
      if (button === 'B') (menu.view === 'main' ? setMenu(null) : back(menu.view));
    },
    true,
    { silent: menu === null },
  );

  const system = systemById(game.system);
  const autoSave: [string, string] | null = settings.retroAutosave
    ? [nativePath(stateFile(game, 'auto')), nativePath(stateImage(game, 'auto'))]
    : null;

  return (
    <View style={styles.screen}>
      <RetroView
        style={StyleSheet.absoluteFill}
        romPath={rom}
        sramPath={nativePath(sramFile(game))}
        startStatePath={slot ? nativePath(stateFile(game, slot)) : null}
        autoSave={autoSave}
        paused={menu !== null && !blowing} // souffle : le jeu tourne le temps de l'appui sur A
        fastForward={fast}
        screenMode={settings.retroScreen}
        fillScreen={settings.retroSize === 'Fill screen'}
        touchControls={touchVisible}
        touchOverImage={game.system === 'psp'} // TouchPSP.dc.html : image pleine hauteur, boutons posés dessus
        gameCube={game.system === 'gc' || game.system === 'wii'}
        gameCubeOptions={gameCubeOptions}
        resolution={game.system === '3ds' ? launchScale : scale}
        dualScreen={screens ? dualScreenProp(screens) : null}
        onStart={() => {
          setStartedAt(Date.now());
          markPlayed(game.id);
        }}
        onMenu={() => setMenu({ view: 'main', selected: 0 })}
        onSwapScreens={() => dual && setSwapped((s) => !s)}
        onError={(event) => setError(event.nativeEvent.message)}
        onWiiPointer={({ nativeEvent: e }) => {
          if (e.recentered) setRecentered((n) => n + 1);
          if (e.edge !== undefined) setEdge(e.edge || null);
        }}
      />

      {screens && !error && (
        <DsScreens
          screens={screens}
          layout={dsLayout}
          swapped={swapped}
          capture={!touchVisible} // avec les contrôles tactiles, c'est TouchRetro qui reçoit le doigt
          controller={controller.connected}
          onSwap={() => setSwapped((s) => !s)}
        />
      )}

      {wiiProfile && !error && menu?.view !== 'wiiControls' && (
        <WiiNotices
          started={startedAt !== null}
          firstLaunch={notices.firstLaunch}
          chosen={notices.chosen}
          pointer={notices.pointer}
          recentered={recentered}
          edge={menu ? null : edge}
          box={wiiImage}
        />
      )}

      {menu?.view === 'wiiControls' && wiiProfile && (
        <WiiControlsScreen profile={controlsTab} onTab={setControlsTab} onBack={() => back('wiiControls')} />
      )}

      {menu && menu.view !== 'wiiControls' && (
        <>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,10,0.45)' }]} />
          {/* Un panneau complet par écran du menu (key) : retiré et reposé en entier à chaque changement, sans jamais
              changer de largeur ni de contenu. Avant, un seul panneau changeait de contenu et de largeur (Wii options :
              340) ; React Native s'y trompait parfois de place en retirant un élément (« Attempt to unmount a view
              which has a different index », plantages du 06/10/2026, surtout après Back to launcher). Le contenu est
              dans une boîte jamais aplatie (collapsable={false}). */}
          <View key={menu.view} style={[styles.panel, menu.view === 'wii' && { width: 340 }]}>
            <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(22,22,26,0.84)' }]} />
            <View collapsable={false} style={{ flex: 1 }}>
              {menu.view === 'main' ? (
                <MainMenu
                  title={game.name}
                  chip={system.chip}
                  startedAt={startedAt}
                  actions={actions}
                  selected={menu.selected}
                  onSelect={(selected) => setMenu({ ...menu, selected })}
                />
              ) : menu.view === 'wii' && wiiProfile ? (
                <WiiOptionsMenu
                  profile={wiiProfile}
                  auto={!game.wii?.profile}
                  pointer={wiiPointer}
                  speed={wiiSpeed}
                  selected={menu.selected}
                  onSelect={(selected) => setMenu({ ...menu, selected })}
                  onRun={runWii}
                  onSpeed={(speed) => setWiiChoice(game.id, { speed })}
                  onBack={() => back('wii')}
                />
              ) : menu.view === 'ds' ? (
                <DsOptionsMenu
                  title={dual === '3ds' ? '3DS options' : 'DS options'}
                  subtitle={dual === '3ds' ? 'Screens and picture' : 'Screens and special controls'}
                  options={dsOptions}
                  selected={menu.selected}
                  onSelect={(selected) => setMenu({ ...menu, selected })}
                  onBlow={setBlowing}
                  onBack={() => back('ds')}
                />
              ) : (
                <SlotList
                  overwrite={menu.view === 'overwrite'}
                  slots={menu.view === 'load' ? slots : manual}
                  system={game.system}
                  selected={menu.selected}
                  onPick={pickFromList}
                  onBack={() => back(menu.view === 'load' ? 'load' : 'overwrite')}
                />
              )}
            </View>
          </View>
        </>
      )}

      {toast && (
        <View style={styles.toast}>
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(22,22,26,0.9)' }]} />
          {toast.image ? (
            <View style={styles.toastImage}>
              <SaveImage uri={toast.image} system={game.system} />
            </View>
          ) : (
            <View style={{ width: 4 }} />
          )}
          <Text style={styles.toastText}>{toast.text}</Text>
        </View>
      )}

      {/* Contrôles tactiles (TouchRetro.dc.html) : la pastille au logo ouvre le menu du jeu.
          L'image reste réduite quand le menu est ouvert, pour ne pas sauter. */}
      {touchVisible &&
        menu === null &&
        !error &&
        (game.system === 'psp' ? (
          <TouchPSP onMenu={() => setMenu({ view: 'main', selected: 0 })} />
        ) : (
          <TouchRetro
            system={game.system}
            wiiProfile={wiiProfile}
            onMenu={() => setMenu({ view: 'main', selected: 0 })}
            touchScreen={touchScreen}
            dsFocus={touchFocus}
            smallScreen={smallScreen}
            onEnlarge={() => setSwapped((s) => !s)}
          />
        ))}

      {/* Wii, pointeur Touch avec la manette (sans contrôles tactiles) : toucher l'image place le pointeur. */}
      {wiiBox && !touchVisible && menu === null && !error && (
        <View
          style={{ position: 'absolute', left: wiiBox.x, top: wiiBox.y, width: wiiBox.w, height: wiiBox.h }}
          onTouchStart={(e) => Retro.setWiiPointer(e.nativeEvent.locationX / wiiBox.w, e.nativeEvent.locationY / wiiBox.h)}
          onTouchMove={(e) => Retro.setWiiPointer(e.nativeEvent.locationX / wiiBox.w, e.nativeEvent.locationY / wiiBox.h)}
        />
      )}

      {/* Sans manette ni contrôles tactiles (réglés sur Off) : « Connect your controller ».
          Pas quand le menu est ouvert, pour pouvoir y remettre « Touch controls » sur Auto ou On. */}
      {!controller.connected && !touchVisible && menu === null && <NoController onContinueWithTouch={() => setSessionTouchMode('On')} />}

      {error && <Missing onExit={onExit} message={error} />}
    </View>
  );
}

type MenuAction = {
  label: string;
  Icon: (props: { color: string }) => ReactElement;
  run: () => void;
  value?: string;
  toggle?: boolean;
  note?: string; // phrase en bas du panneau, quand la ligne est choisie (à la place de celle par défaut)
};

function MainMenu(props: { title: string; chip: string; startedAt: number | null; actions: MenuAction[]; selected: number; onSelect: (i: number) => void }) {
  const battery = useBattery();
  const minutes = props.startedAt ? Math.max(1, Math.round((Date.now() - props.startedAt) / 60_000)) : 0;
  const details = [props.chip, `${minutes} min`, battery.percent !== null ? `Battery ${battery.percent}%` : null].filter(Boolean).join(' · ');
  return (
    <View style={styles.panelBody}>
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
              {action.toggle !== undefined && (
                <View style={{ marginLeft: 'auto' }}>
                  <Toggle on={action.toggle} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexGrow: 1 }} />
      <Text style={styles.panelNote}>{props.actions[props.selected]?.note ?? 'Game paused'}</Text>
    </View>
  );
}

type DsOption = {
  label: string;
  run?: () => void;
  value?: string; // « Side by side »
  hint?: string; // « Right stick click »
  detail?: string; // seconde ligne, sous le libellé
  toggle?: boolean;
  blow?: boolean; // tenir A (ou le doigt) fait souffler
};

// DS options (DSMenu.dc.html) et 3DS options : lignes de 44 pt (52 avec une seconde ligne), rappels A Select / B Back.
function DsOptionsMenu(props: {
  title: string;
  subtitle: string;
  options: DsOption[];
  selected: number;
  onSelect: (i: number) => void;
  onBlow: (on: boolean) => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.panelBody}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{props.title}</Text>
        <Text style={styles.panelDetails}>{props.subtitle}</Text>
      </View>
      <View style={styles.panelItems}>
        {props.options.map((option, i) => {
          const on = i === props.selected;
          return (
            <Pressable
              key={option.label}
              onPress={option.run}
              onPressIn={() => {
                props.onSelect(i);
                if (option.blow) props.onBlow(true);
              }}
              onPressOut={() => option.blow && props.onBlow(false)}
              style={[styles.dsRow, option.detail ? styles.dsRowTall : null, on && styles.panelItemOn]}
            >
              <View style={{ flexShrink: 1 }}>
                <Text style={[styles.panelItemText, { color: on ? colors.white : 'rgba(255,255,255,0.8)' }, on && styles.panelItemTextOn]}>
                  {option.label}
                </Text>
                {option.detail && <Text style={styles.dsDetail}>{option.detail}</Text>}
              </View>
              {option.value && <Text style={styles.dsValue}>{option.value}</Text>}
              {option.hint && <Text style={styles.dsHint}>{option.hint}</Text>}
              {option.toggle !== undefined && (
                <View style={{ marginLeft: 'auto' }}>
                  <Toggle on={option.toggle} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexGrow: 1 }} />
      <View style={styles.listHints}>
        <ButtonHint glyph="A" label="Select" onPress={() => props.options[props.selected]?.run?.()} />
        <ButtonHint glyph="B" label="Back" onPress={props.onBack} />
      </View>
    </View>
  );
}

function SlotList(props: {
  overwrite: boolean;
  slots: SaveSlot[];
  system: SystemId;
  selected: number;
  onPick: (i: number) => void;
  onBack: () => void;
}) {
  // Remplacement : « Cancel » en premier, sélectionné par défaut.
  const offset = props.overwrite ? 1 : 0;
  return (
    <View style={styles.panelBody}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{props.overwrite ? 'All slots are full' : 'Load state'}</Text>
        <Text style={styles.panelDetails}>{props.overwrite ? 'Choose a slot to replace' : 'Your game picks up from this moment'}</Text>
      </View>
      <View style={styles.panelItems}>
        {props.overwrite && (
          <Pressable onPress={() => props.onPick(0)} style={[styles.panelItem, props.selected === 0 && styles.panelItemOn]}>
            <Text style={[styles.panelItemText, { color: colors.white }, props.selected === 0 && styles.panelItemTextOn]}>Cancel</Text>
          </Pressable>
        )}
        {props.slots.map((s, i) => {
          const on = props.selected === i + offset;
          return (
            <Pressable key={s.id} onPress={() => props.onPick(i + offset)} style={[styles.slot, on && styles.panelItemOn]}>
              <View style={styles.slotImage}>{s.image && <SaveImage uri={s.image} system={props.system} />}</View>
              <View>
                <Text style={styles.slotName}>{s.name}</Text>
                <Text style={styles.slotWhen}>{formatWhen(s.time)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexGrow: 1 }} />
      <View style={styles.listHints}>
        <ButtonHint glyph="A" label={props.overwrite ? 'Replace' : 'Load'} onPress={() => props.onPick(props.selected)} />
        <ButtonHint glyph="B" label="Back" onPress={props.onBack} />
      </View>
    </View>
  );
}

// « 2 h ago », « Yesterday », « Sep 20 » (maquette RetroPlay).
export function formatWhen(time: number, now = Date.now()): string {
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  if (now - time < 2 * RELATIVE_DAY) return 'Yesterday';
  return new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Missing({ message, onExit }: { message: string; onExit: () => void }) {
  useInput((button) => {
    if (button === 'B' || button === 'A') onExit();
  });
  return (
    <View style={[StyleSheet.absoluteFill, styles.screen, styles.missing]}>
      <Text style={styles.missingTitle}>This game can't start</Text>
      <Text style={styles.missingText}>{message}</Text>
      <View style={{ marginTop: 18 }}>
        <ButtonHint glyph="B" label="Back" onPress={onExit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 320,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  panelBody: {
    flex: 1,
    paddingTop: 18,
    paddingBottom: 18,
    paddingLeft: layout.sideMargin,
    paddingRight: 20,
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
    marginTop: 12,
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
  dsRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  dsRowTall: {
    height: 52,
  },
  dsDetail: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  dsValue: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  dsHint: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  slot: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  slotImage: {
    width: 44,
    height: 33,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: colors.tileBackground,
  },
  slotName: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  slotWhen: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  listHints: {
    flexDirection: 'row',
    gap: 18,
    paddingHorizontal: 12,
  },
  toast: {
    position: 'absolute',
    right: layout.sideMargin,
    top: 16,
    height: 48,
    paddingLeft: 6,
    paddingRight: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toastImage: {
    width: 48,
    height: 36,
    borderRadius: 6,
    overflow: 'hidden',
  },
  toastText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  missing: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.sideMargin,
  },
  missingTitle: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 22,
  },
  missingText: {
    marginTop: 6,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    textAlign: 'center',
  },
});
