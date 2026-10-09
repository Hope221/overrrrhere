import { BlurView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import Retro from '../../../modules/retro';
import { Download, ImportCandidate, RetroGame, SlotId, cancelDownload, candidateName, chooseRomFolder, fillDiscIds, hasAutoSave, syncRomFolder, useRetroLibrary } from '../../retro/library';
import { SYSTEMS, SystemId, fileSystem, formatSize, systemById } from '../../retro/systems';
import { usesMotion } from '../../retro/wii';
import { useFocusColor } from '../../settings';
import { retroArt, togglePin, useTiles } from '../../tiles';
import { ButtonHint } from '../../ui/components';
import { CartridgeIcon, CheckIcon, CloudDownloadIcon, CloudIcon, MotionIcon } from '../../ui/icons';
import { useInput } from '../../ui/input';
import { colors, focusRing, fonts, layout } from '../../ui/theme';
import { formatLastPlayed } from '../../xbox/history';
import { TileEditorScreen } from '../TileEditorScreen';
import { ADD_CHOICES, AddChoice, AddGamesChoices } from './AddGamesChoices';
import { RetroDetailsScreen } from './RetroDetailsScreen';
import { RomImportScreen } from './RomImportScreen';

// Bibliothèque rétro (design/ecrans/RetroLibrary.dc.html, mise à jour du 29/09) : trois zones qui ne se chevauchent
// jamais — en-tête fixe (0 à 112 pt), grille de 5 colonnes qui défile dessous, barre du bas fixe.
// Filtres par système (seulement ceux présents) avec LB / RB, qui défilent entre LB et RB.
// Manette sur un jeu : A Play / Continue, View Details, Y Pin, X Edit tile, B Back.
// « Add a ROM » (petit bouton de l'en-tête) : haut depuis la première rangée, A Open Files, bas revient à la grille.
// Dossier iCloud (maquette « Dossier iCloud ») : nuage sur les jeux pas encore sur l'iPhone ; A télécharge puis lance,
// pendant le téléchargement seul B (Cancel) répond.
// Bibliothèque vide (maquette « Premiers pas : Xbox et jeux » du 08/10/2026) : fond anthracite et lumière douce du haut,
// deux tuiles ROM folder / ROM files (gauche / droite, A), pas de pilule « Add a ROM » dans l'en-tête.

const COLUMNS = 5;
const GAP = 12;
const HEADER = 112; // hauteur de l'en-tête fixe
const GRID_TOP = 124; // marge de défilement en haut : la tuile sélectionnée reste sous l'en-tête
const GRID_BOTTOM = 96;

type Props = {
  onPlay: (game: RetroGame, slot: SlotId | null) => void; // slot = sauvegarde à charger (auto = Continue)
  onClose: () => void;
};

export function RetroLibraryScreen({ onPlay, onClose }: Props) {
  const { games, folder, download } = useRetroLibrary();
  const tiles = useTiles();
  const focusColor = useFocusColor();
  const { width: screenWidth } = useWindowDimensions();
  const [filter, setFilter] = useState<SystemId | 'all'>('all');
  const [selected, setSelected] = useState(0);
  const [onAdd, setOnAdd] = useState(false); // « Add a ROM » sélectionné (en-tête)
  const [emptyChoice, setEmptyChoice] = useState<AddChoice>('folder'); // bibliothèque vide : tuile sélectionnée
  const [importing, setImporting] = useState<ImportCandidate[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [details, setDetails] = useState<string | null>(null); // jeu ouvert dans Retro game details
  const [editing, setEditing] = useState<RetroGame | null>(null);
  const grid = useRef<ScrollView>(null);
  const filterRow = useRef<ScrollView>(null);
  const chipLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const [filterWidth, setFilterWidth] = useState(0);

  // Grille pleine largeur : 5 colonnes de 138 × 78 sur l'écran de référence (852 pt), agrandies sur un écran plus large.
  const tileWidth = Math.floor((screenWidth - 2 * layout.sideMargin - (COLUMNS - 1) * GAP) / COLUMNS);
  const tileHeight = Math.round((tileWidth * 78) / 138);
  const rowStep = tileHeight + GAP;

  // Jeux ajoutés au dossier iCloud depuis l'ouverture de l'app.
  useEffect(() => {
    syncRomFolder();
  }, []);
  // Wii : identifiant du disque des jeux sur l'iPhone (indicateur « Motion controls »), lu une seule fois par jeu.
  useEffect(() => {
    fillDiscIds();
  }, [games]);
  const downloading = download && !download.error ? download.id : null;
  const onDevice = games.filter((g) => !g.cloud || g.onDevice).length;

  // Filtres : All + les systèmes présents dans la bibliothèque, dans l'ordre du design.
  const present = SYSTEMS.filter((s) => games.some((g) => g.system === s.id));
  const filters: (SystemId | 'all')[] = ['all', ...present.map((s) => s.id)];
  const activeFilter = filters.includes(filter) ? filter : 'all';
  const shown = activeFilter === 'all' ? games : games.filter((g) => g.system === activeFilter);
  const index = Math.min(selected, Math.max(0, shown.length - 1));
  const addFocused = onAdd || shown.length === 0;
  const current = addFocused ? null : shown[index];
  const pinned = tiles.pinned ?? [];

  // La puce choisie avec LB / RB reste visible : centrée dans la zone qui défile.
  useEffect(() => {
    const chip = chipLayouts.current[activeFilter];
    if (!chip || !filterWidth) return;
    filterRow.current?.scrollTo({ x: Math.max(0, chip.x + chip.width / 2 - filterWidth / 2), animated: true });
  }, [activeFilter, filterWidth]);

  // Défilement aligné par rangée : la rangée sélectionnée est la première ou la deuxième visible, toujours entière.
  function select(next: number) {
    if (next < 0 || next >= shown.length) return;
    setOnAdd(false);
    setSelected(next);
    const row = Math.floor(next / COLUMNS);
    grid.current?.scrollTo({ y: Math.max(0, (row - 1) * rowStep), animated: true });
  }

  function cycleFilter(step: number) {
    const next = filters[(filters.indexOf(activeFilter) + step + filters.length) % filters.length];
    setFilter(next);
    setSelected(0);
    grid.current?.scrollTo({ y: 0, animated: false });
  }

  async function openFiles() {
    if (picking) return;
    setPicking(true);
    try {
      const files = await Retro.pickRoms();
      if (files.length === 0) return;
      setImporting(files.map((staged) => ({ staged, system: fileSystem(staged.name, staged.path), name: candidateName(staged), cover: null })));
    } finally {
      setPicking(false);
    }
  }

  // Bibliothèque vide : dossier iCloud (comme Settings › Retro › ROM folder) ou fichiers.
  function addFrom(choice: AddChoice) {
    setEmptyChoice(choice);
    if (choice === 'folder') chooseRomFolder().catch(() => {});
    else openFiles();
  }

  // Après « Add » : le premier jeu ajouté est sélectionné.
  function onAdded(added: RetroGame[]) {
    setImporting(null);
    setFilter('all');
    const position = games.length; // les jeux ajoutés sont à la fin de la liste
    if (added.length > 0) {
      setOnAdd(false);
      setSelected(position);
      grid.current?.scrollTo({ y: Math.max(0, (Math.floor(position / COLUMNS) - 1) * rowStep), animated: true });
    }
  }

  useInput(
    (button) => {
      if (downloading) {
        if (button === 'B') cancelDownload();
        return;
      }
      if (button === 'LB') cycleFilter(-1);
      if (button === 'RB') cycleFilter(1);
      if (button === 'B') onClose();
      if (games.length === 0) {
        const i = ADD_CHOICES.indexOf(emptyChoice);
        if (button === 'Left') setEmptyChoice(ADD_CHOICES[Math.max(0, i - 1)]);
        if (button === 'Right') setEmptyChoice(ADD_CHOICES[Math.min(ADD_CHOICES.length - 1, i + 1)]);
        if (button === 'A') addFrom(emptyChoice);
        return;
      }
      if (addFocused) {
        if (button === 'A') openFiles();
        if (button === 'Down' && shown.length > 0) setOnAdd(false);
        return;
      }
      if (!current) return;
      if (button === 'Left' && index % COLUMNS > 0) select(index - 1);
      if (button === 'Right' && index % COLUMNS < COLUMNS - 1) select(index + 1);
      if (button === 'Up') {
        if (index < COLUMNS) setOnAdd(true);
        else select(index - COLUMNS);
      }
      if (button === 'Down') select(Math.min(shown.length - 1, index + COLUMNS));
      if (button === 'A') onPlay(current, hasAutoSave(current) ? 'auto' : null);
      if (button === 'View') setDetails(current.id);
      if (button === 'Y') togglePin(current.id);
      if (button === 'X') setEditing(current);
    },
    importing === null && details === null && editing === null,
  );

  const backdrop = current ? retroArt(current, tiles).background : shown.find((g) => g.cover)?.cover;
  const isPinned = !!current && pinned.includes(current.id);

  return (
    <View style={[styles.screen, games.length === 0 && styles.screenEmpty]}>
      {backdrop && <Image source={{ uri: backdrop }} style={styles.backdrop} resizeMode="cover" blurRadius={26} />}
      {games.length === 0 ? (
        <View style={[StyleSheet.absoluteFill, styles.emptyLight]} pointerEvents="none" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,12,0.68)' }]} />
      )}

      {/* Grille : défile sous l'en-tête et la barre du bas. */}
      {games.length > 0 && (
        <ScrollView
          ref={grid}
          style={StyleSheet.absoluteFill}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          snapToInterval={rowStep}
          decelerationRate="fast"
        >
          {shown.map((game, i) => {
            const on = !addFocused && i === index;
            const ring = on ? `0 0 0 2px ${colors.ink}, 0 0 0 4px ${focusColor}, 0 10px 24px rgba(0,0,0,0.55)` : '0 4px 12px rgba(0,0,0,0.35)';
            const gamePinned = pinned.includes(game.id);
            return (
              <Pressable
                key={game.id}
                onPress={() => (on ? onPlay(game, hasAutoSave(game) ? 'auto' : null) : select(i))}
                style={[styles.tile, { width: tileWidth, height: tileHeight, boxShadow: ring }]}
              >
                <RetroTileArt game={game} pinned={gamePinned} motion />
                {gamePinned && (
                  <View style={styles.badge}>
                    <CheckIcon size={12} color={colors.ink} strokeWidth={3} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* En-tête fixe : fond presque opaque + flou, fondu de 16 pt en dessous (rien à masquer quand la bibliothèque est vide). */}
      {games.length > 0 && (
        <>
          <View style={styles.headerBackground}>
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,12,0.94)' }]} />
          </View>
          <View style={styles.headerFade} pointerEvents="none" />
        </>
      )}

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Retro</Text>
          <Text style={styles.subtitle}>
            {games.length === 0
              ? 'No games yet'
              : folder
                ? `${games.length} game${games.length > 1 ? 's' : ''} · ${onDevice} on this iPhone`
                : `${games.length} game${games.length > 1 ? 's' : ''} on this iPhone`}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {folder && (
            <View style={styles.folderNote}>
              <CloudIcon size={14} color="rgba(255,255,255,0.66)" strokeWidth={1.8} />
              <Text style={styles.headerNote}>{folder.name}</Text>
            </View>
          )}
          {games.length > 0 && (
            <Pressable onPress={openFiles} style={[styles.addButton, addFocused && { boxShadow: focusRing(focusColor) }]}>
              <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2.4} strokeLinecap="round">
                <Path d="M12 5v14M5 12h14" />
              </Svg>
              <Text style={styles.addText}>Add a ROM</Text>
            </Pressable>
          )}
        </View>
      </View>

      {games.length > 0 && (
        <View style={styles.filters}>
          <Text style={styles.bumper}>LB</Text>
          <View style={styles.filterArea} onLayout={(e) => setFilterWidth(e.nativeEvent.layout.width)}>
            <ScrollView ref={filterRow} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
              {filters.map((f) => {
                const on = f === activeFilter;
                return (
                  <Pressable
                    key={f}
                    onLayout={(e) => (chipLayouts.current[f] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width })}
                    onPress={() => {
                      setFilter(f);
                      setSelected(0);
                      grid.current?.scrollTo({ y: 0, animated: false });
                    }}
                    style={[styles.filter, on && styles.filterOn]}
                  >
                    <Text style={[styles.filterText, on && styles.filterTextOn]}>{f === 'all' ? 'All' : systemById(f).filter}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {/* Bords en fondu (12 pt à gauche, 24 pt à droite). */}
            <View style={[styles.filterFade, { left: 0, width: 12, experimental_backgroundImage: 'linear-gradient(90deg, rgba(10,10,12,0.94) 0%, rgba(10,10,12,0) 100%)' }]} pointerEvents="none" />
            <View style={[styles.filterFade, { right: 0, width: 24, experimental_backgroundImage: 'linear-gradient(270deg, rgba(10,10,12,0.94) 0%, rgba(10,10,12,0) 100%)' }]} pointerEvents="none" />
          </View>
          <Text style={styles.bumper}>RB</Text>
        </View>
      )}

      {games.length === 0 ? (
        <>
          <View style={styles.empty}>
            <View style={styles.emptyChoices}>
              <AddGamesChoices focused={emptyChoice} folderName={folder?.name ?? null} onPick={addFrom} variant="library" />
            </View>
          </View>
          <View style={[styles.footer, styles.emptyFooter]}>
            <ButtonHint glyph="A" label="Select" onPress={() => addFrom(emptyChoice)} />
            <ButtonHint glyph="B" label="Back" onPress={onClose} />
          </View>
        </>
      ) : (
        <>
          {/* Barre du bas fixe : dégradé à partir de 305 pt, contenu à 330 pt. */}
          <View style={styles.footerFade} pointerEvents="none" />
          <View style={styles.footer}>
            <View style={styles.footerText}>
              <Text style={styles.name} numberOfLines={1}>
                {current ? current.name : 'Add a ROM'}
              </Text>
              <Text style={styles.status} numberOfLines={1}>
                {current ? gameStatus(current, isPinned, download) : 'Import one or more game files from the Files app'}
              </Text>
            </View>
            {downloading ? (
              <View style={styles.hints}>
                <ButtonHint glyph="B" label="Cancel" onPress={cancelDownload} />
              </View>
            ) : (
              <View style={styles.hints}>
                <ButtonHint
                  glyph="A"
                  label={!current ? 'Open Files' : hasAutoSave(current) ? 'Continue' : 'Play'}
                  onPress={() => (current ? onPlay(current, hasAutoSave(current) ? 'auto' : null) : openFiles())}
                />
                {current && (
                  <>
                    <ButtonHint glyph="View" label="Details" onPress={() => setDetails(current.id)} />
                    <ButtonHint glyph="Y" label={isPinned ? 'Unpin' : 'Pin to home'} onPress={() => togglePin(current.id)} />
                    <ButtonHint glyph="X" label="Edit tile" onPress={() => setEditing(current)} />
                  </>
                )}
                <ButtonHint glyph="B" label="Back" onPress={onClose} />
              </View>
            )}
          </View>
        </>
      )}

      {importing && <RomImportScreen candidates={importing} onChooseAgain={openFiles} onAdded={onAdded} onCancel={() => setImporting(null)} />}
      {details && <RetroDetailsScreen gameId={details} onPlay={onPlay} onClose={() => setDetails(null)} />}
      {editing && <TileEditorScreen game={editing} onClose={() => setEditing(null)} />}
    </View>
  );
}

// Ligne sous le nom du jeu : téléchargement en cours (ou son échec), jeu encore dans iCloud, ou dernière partie.
function gameStatus(game: RetroGame, pinned: boolean, download: Download | null): string {
  const system = systemById(game.system).name;
  if (download?.id === game.id) {
    return download.error ?? `Downloading from iCloud · ${formatSize(game.size)} · The game starts when it's ready`;
  }
  const name = usesMotion(game.discId) ? `${system} · Uses motion controls` : system;
  if (game.cloud && !game.onDevice) return `${name} · ${formatSize(game.size)} · Downloads when you play`;
  return `${name} · ${pinned ? 'Pinned to home' : game.lastPlayed ? `Last played ${formatLastPlayed(game.lastPlayed)}` : 'Not played yet'}`;
}

// Image d'un jeu rétro (tuile de la bibliothèque, de Home) avec l'étiquette du système.
// Sans jaquette : tuile sombre avec le titre nettoyé (2 lignes) et une petite cartouche — jamais le nom de fichier.
// Jeu du dossier iCloud pas encore sur l'iPhone : nuage avec flèche en haut à droite (sauf s'il est épinglé :
// la coche prend la place), voile « Downloading » et barre qui défile pendant son téléchargement.
// motion : icône « Motion controls » en bas à droite (bibliothèque Retro seulement, RetroLibrary.dc.html).
export function RetroTileArt({ game, image, pinned = false, motion = false }: { game: RetroGame; image?: string | null; pinned?: boolean; motion?: boolean }) {
  const tiles = useTiles();
  const { download } = useRetroLibrary();
  const downloading = download?.id === game.id && !download.error;
  const art = image ?? retroArt(game, tiles).tile; // image choisie dans Edit tile, sinon la jaquette
  const inCloud = !!game.cloud && !game.onDevice && !downloading && !pinned;
  return (
    <View style={styles.tileClip}>
      {art ? (
        <Image source={{ uri: art }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={styles.noCover}>
          {!inCloud && !pinned && (
            <View style={styles.noCoverIcon}>
              <CartridgeIcon size={16} color="rgba(255,255,255,0.35)" pins={false} />
            </View>
          )}
          <Text style={styles.noCoverTitle} numberOfLines={2}>
            {game.name}
          </Text>
        </View>
      )}
      <View style={styles.chip}>
        <Text style={styles.chipText}>{systemById(game.system).chip}</Text>
      </View>
      {motion && usesMotion(game.discId) && (
        <View style={styles.motion}>
          <MotionIcon />
        </View>
      )}
      {inCloud && (
        <View style={styles.cloud}>
          <CloudDownloadIcon />
        </View>
      )}
      {downloading && <DownloadingVeil />}
    </View>
  );
}

// Voile de la tuile pendant le téléchargement : « Downloading » et une barre qui défile
// (iOS ne donne pas toujours le pourcentage : pas de faux chiffre).
function DownloadingVeil() {
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(slide, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [slide]);
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [-54, 140] });
  return (
    <View style={styles.veil}>
      <Text style={styles.veilText}>Downloading</Text>
      <View style={styles.bar}>
        <Animated.View style={[styles.barFill, { transform: [{ translateX }] }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.ink,
  },
  backdrop: {
    position: 'absolute',
    left: -40,
    top: -40,
    right: -40,
    bottom: -40,
  },
  // ---------- En-tête fixe (0 à 112 pt) ----------
  headerBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: HEADER,
    overflow: 'hidden',
  },
  headerFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: HEADER,
    height: 16,
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(10,10,12,0.94) 0%, rgba(10,10,12,0) 100%)',
  },
  header: {
    position: 'absolute',
    left: layout.sideMargin,
    right: layout.sideMargin,
    top: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  title: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.26,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  folderNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerNote: {
    color: 'rgba(255,255,255,0.66)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  // Petit bouton « Add a ROM » : pilule contour de 30 pt.
  addButton: {
    height: 30,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addText: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 12,
  },
  // Filtres : LB et RB fixés aux extrémités, les puces défilent entre les deux.
  filters: {
    position: 'absolute',
    left: layout.sideMargin,
    right: layout.sideMargin,
    top: 70,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterArea: {
    flex: 1,
    height: 32,
    justifyContent: 'center',
  },
  filterChips: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  filterFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  bumper: {
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.extraBold,
    fontSize: 10,
    lineHeight: 17,
  },
  filter: {
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
  },
  filterOn: {
    backgroundColor: colors.white,
  },
  filterText: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: fonts.semiBold,
    fontSize: 13,
  },
  filterTextOn: {
    color: colors.ink,
  },
  // ---------- Grille (défile sous l'en-tête et la barre du bas) ----------
  grid: {
    paddingTop: GRID_TOP,
    paddingBottom: GRID_BOTTOM,
    paddingHorizontal: layout.sideMargin,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  tile: {
    borderRadius: 10,
    backgroundColor: '#17181C',
  },
  tileClip: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Jeu sans jaquette : fond sombre en dégradé, titre à gauche sur 2 lignes, cartouche en haut à droite.
  noCover: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 26,
    justifyContent: 'center',
    experimental_backgroundImage: 'linear-gradient(150deg, #22232A 0%, #15161A 100%)',
  },
  noCoverIcon: {
    position: 'absolute',
    right: 8,
    top: 8,
  },
  noCoverTitle: {
    paddingRight: 16,
    color: 'rgba(255,255,255,0.9)',
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 15,
  },
  // Étiquette du système : 10 pt, gras, fond rgba(10,10,12,0.78), texte en entier.
  chip: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    height: 16,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: 'rgba(10,10,12,0.78)',
    justifyContent: 'center',
  },
  chipText: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  // Jeu qui demande beaucoup de gestes (Wii) : petite icône en bas à droite.
  motion: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: 'rgba(10,10,12,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Nuage + flèche : jeu du dossier iCloud pas encore téléchargé.
  cloud: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: 'rgba(10,10,12,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  veil: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,12,0.55)',
  },
  veilText: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 32,
    textAlign: 'center',
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  bar: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  barFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 54,
    borderRadius: 999,
    backgroundColor: colors.white,
  },
  badge: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 0 1.5px rgba(10,10,12,0.6), 0 2px 6px rgba(0,0,0,0.4)',
  },
  // ---------- Barre du bas fixe (dégradé sur 88 pt, contenu de 48 pt) ----------
  footerFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 88,
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(10,10,12,0) 0%, rgba(10,10,12,0.94) 22%, rgba(10,10,12,0.96) 100%)',
  },
  footer: {
    position: 'absolute',
    left: layout.sideMargin,
    right: layout.sideMargin,
    bottom: 15,
    height: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 20,
  },
  footerText: {
    flexShrink: 1,
  },
  name: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 22,
  },
  status: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  hints: {
    flexShrink: 0,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  // ---------- Bibliothèque vide ----------
  screenEmpty: {
    backgroundColor: '#141418', // anthracite (critique du 08/10 : le noir pur fondait les bords des jaquettes sombres)
  },
  emptyLight: {
    experimental_backgroundImage: 'radial-gradient(90% 90% at 50% 0%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 70%)',
  },
  empty: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 64,
    bottom: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChoices: {
    width: 600,
  },
  emptyFooter: {
    justifyContent: 'flex-start',
    gap: 18,
  },
});
