import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { colors } from './theme';

// Icônes du design : tracés SVG copiés tels quels depuis design/ecrans/*.dc.html.

// Logo arrondi (Main.dc.html, barre du haut ; aussi Splash, Welcome) : manette blanche sur fond orange,
// yeux en découpes orange (règle du 29/09).
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={0} y={0} width={100} height={100} rx={22.4} fill={colors.orange} />
      <G transform="translate(50 52) scale(0.74) translate(-50 -51)">
        <Path
          d="M20 34 C20 26 26 22 34 22 H66 C74 22 80 26 80 34 L86 64 C88 74 82 80 74 80 C68 80 64 76 61 70 L58 64 H42 L39 70 C36 76 32 80 26 80 C18 80 12 74 14 64 Z"
          fill={colors.white}
        />
        <Rect x={53} y={34} width={6} height={13} rx={3} fill={colors.orange} />
        <Rect x={63} y={34} width={6} height={13} rx={3} fill={colors.orange} />
      </G>
    </Svg>
  );
}

// Silhouette affichée tant que la photo de profil n'est pas chargée (Main.dc.html).
export function GamerPicPlaceholder({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="rgba(255,255,255,0.55)">
      <Circle cx={12} cy={9} r={4.2} />
      <Path d="M3.5 24a8.5 8 0 0 1 17 0z" />
    </Svg>
  );
}

// Manette connectée (Main.dc.html, barre du haut).
export function ControllerIcon({ size = 20, color = 'rgba(255,255,255,0.9)' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6.5 6h11A3.5 3.5 0 0 1 21 9.5l.8 5.6a2.4 2.4 0 0 1-4.2 1.9L15 14H9l-2.6 3a2.4 2.4 0 0 1-4.2-1.9L3 9.5A3.5 3.5 0 0 1 6.5 6z" />
      <Path d="M7.5 10h3M9 8.5v3" />
      <Path d="M15.5 9.5h.01M17.5 11.5h.01" />
    </Svg>
  );
}

// Batterie (Main.dc.html ; variante « faible » orange de Stream.dc.html).
// La jauge fait 13,5 de large à 78 % et 3,6 à 20 % : pleine = 17,5.
export function BatteryIcon({ level, low, width = 26 }: { level: number; low?: boolean; width?: number }) {
  const color = low ? colors.white : 'rgba(255,255,255,0.9)';
  const fill = Math.max(1.5, Math.min(17.5, 17.5 * level));
  return (
    <Svg width={width} height={(width * 12) / 26} viewBox="0 0 26 12">
      <Rect x={0.75} y={0.75} width={21.5} height={10.5} rx={3} fill="none" stroke={color} strokeWidth={1.2} opacity={0.6} />
      <Rect x={2.5} y={2.5} width={fill} height={7} rx={low ? 1.2 : 1.5} fill={low ? colors.orange : color} />
      <Rect x={23.5} y={4} width={1.8} height={4} rx={0.9} fill={color} opacity={0.6} />
    </Svg>
  );
}

// Coche (Launch.dc.html : vérifications et étape terminée).
export function CheckIcon({ size = 14, color = colors.ready, strokeWidth = 2.4 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

// Icônes du panneau du stream (Stream.dc.html), 18 pt.
export function PlayIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill={color}>
      <Path d="M8 5.5v13l10.5-6.5z" />
    </Svg>
  );
}

function StrokeIcon({ color, paths }: { color: string; paths: string[] }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  );
}

// Menu rapide (Menu.dc.html) : Manage tiles, Settings, Controller.
export function GridIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={4} y={4} width={7} height={7} rx={1.5} />
      <Rect x={13} y={4} width={7} height={7} rx={1.5} />
      <Rect x={4} y={13} width={7} height={7} rx={1.5} />
      <Rect x={13} y={13} width={7} height={7} rx={1.5} />
    </Svg>
  );
}

export function GearIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  );
}

export const MenuControllerIcon = ({ color }: { color: string }) => (
  <StrokeIcon
    color={color}
    paths={['M6.5 6h11A3.5 3.5 0 0 1 21 9.5l.8 5.6a2.4 2.4 0 0 1-4.2 1.9L15 14H9l-2.6 3a2.4 2.4 0 0 1-4.2-1.9L3 9.5A3.5 3.5 0 0 1 6.5 6z', 'M7.5 10h3M9 8.5v3']}
  />
);

// Chevron des lignes qui ouvrent un écran (Settings.dc.html), 16 pt.
export function ChevronIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

// Console (Settings.dc.html, section Xbox & Remote Play), 16 × 24.
export function ConsoleIcon() {
  return (
    <Svg width={16} height={24} viewBox="0 0 34 54" fill="none" stroke={colors.white} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={2} y={2} width={30} height={50} rx={5} />
      <Circle cx={17} cy={11} r={5} opacity={0.6} />
    </Svg>
  );
}

// Sign in (SignIn.dc.html) : notes « stays on this iPhone » et « use touch », 14 pt.
export function LockIcon({ color = 'rgba(255,255,255,0.66)' }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={5} y={11} width={14} height={9} rx={2} />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function TouchIcon({ color = 'rgba(255,255,255,0.66)' }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 11V5a2 2 0 0 1 4 0v5" />
      <Path d="M13 10a2 2 0 0 1 4 0v1a2 2 0 0 1 3 1.7V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.9-2.5L5 15.5a1.8 1.8 0 0 1 2.8-2.2L9 14.5" />
    </Svg>
  );
}

// Wi-Fi barré : carte « You're offline » de Sign in (20 pt, trait 1,8) et écran « No internet » (LaunchIssue, 26 pt, trait 1,7).
export function WifiOffIcon({ size = 20, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2.5 8.5a14 14 0 0 1 19 0" />
      <Path d="M5.5 12a9.5 9.5 0 0 1 13 0" />
      <Path d="M8.7 15.4a5 5 0 0 1 6.6 0" />
      <Path d="M12 19h.01" />
      <Path d="M3 3l18 18" />
    </Svg>
  );
}

// Notice « Your home is ready » (Main.dc.html), 18 pt orange.
export function SparkleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.orange} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 1 }}>
      <Path d="M12 3l2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4z" />
    </Svg>
  );
}

// Choose your console (Consoles.dc.html) : aide et carte de console.
export function InfoIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={1.8} strokeLinecap="round">
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 11v5M12 8h.01" />
    </Svg>
  );
}

export function ConsoleCardIcon() {
  return (
    <Svg width={34} height={54} viewBox="0 0 34 54" fill="none" stroke={colors.white} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={1.5} y={1.5} width={31} height={51} rx={5} />
      <Circle cx={17} cy={11} r={5} opacity={0.5} />
      <Path d="M8 44h18" opacity={0.4} />
    </Svg>
  );
}

export const SwitchIcon =({ color }: { color: string }) => <StrokeIcon color={color} paths={['M4 8h13l-3-3', 'M20 16H7l3 3']} />;
export const HomeIcon = ({ color }: { color: string }) => <StrokeIcon color={color} paths={['M4 11l8-6.5 8 6.5', 'M6 9.5V19h12V9.5']} />;
export const TouchMenuIcon = ({ color }: { color: string }) => (
  <StrokeIcon
    color={color}
    paths={['M9 11V5a2 2 0 0 1 4 0v5', 'M13 10a2 2 0 0 1 4 0v1a2 2 0 0 1 3 1.7V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.9-2.5L5 15.5a1.8 1.8 0 0 1 2.8-2.2L9 14.5']}
  />
);
export const SleepIcon = ({ color }: { color: string }) => <StrokeIcon color={color} paths={['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z']} />;

// Rétro (RetroLibrary, RetroPlay, RomImport) : cartouche, sauvegarde, chargement, avance rapide, fichiers.
// pins = false : petite cartouche des tuiles sans jaquette (RetroLibrary.dc.html, mise à jour du 29/09).
export function CartridgeIcon({ size = 22, color = 'rgba(255,255,255,0.85)', pins = true }: { size?: number; color?: string; pins?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 3h12v13l-2 2v3H8v-3l-2-2z" />
      <Rect x={9} y={6} width={6} height={5} rx={1} />
      {pins && <Path d="M10 18v3M14 18v3" />}
    </Svg>
  );
}
export const SaveStateIcon = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M5 4h11l3 3v13H5z" />
    <Path d="M8 4v5h7V4" />
    <Rect x={8} y={13} width={8} height={5} rx={1} />
  </Svg>
);
export const LoadStateIcon = ({ color }: { color: string }) => <StrokeIcon color={color} paths={['M4 12a8 8 0 1 0 2.3-5.6', 'M4 4v4h4', 'M12 8v4l3 2']} />;
// Resolution (maquette « Résolution interne ») : un écran avec deux coins d'agrandissement.
export const ResolutionIcon = ({ color }: { color: string }) => (
  <StrokeIcon color={color} paths={['M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M7 9h3M7 9v3M17 15h-3M17 15v-3']} />
);
// DS options (DSMenu.dc.html) : les deux écrans de la DS.
export const DsOptionsIcon = ({ color }: { color: string }) => <StrokeIcon color={color} paths={['M6 3h12v8H6z', 'M6 13h12v8H6z']} />;
export function FastForwardIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill={color}>
      <Path d="M3 6.5v11l8-5.5zM12 6.5v11l8-5.5z" />
    </Svg>
  );
}
// Nuage : jeu du dossier iCloud (maquette « Dossier iCloud »). download : flèche vers le bas (Remove download).
export function CloudIcon({ size = 13, color = colors.white, strokeWidth = 2.2, download = false }: { size?: number; color?: string; strokeWidth?: number; download?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.2 4.4 4.4 0 0 0 7 18z" />
      {download && <Path d="M12 10v5M9.8 12.8 12 15l2.2-2.2" />}
    </Svg>
  );
}

// Nuage + flèche vers le bas des tuiles rétro pas encore téléchargées (RetroLibrary.dc.html, mise à jour du 29/09).
export function CloudDownloadIcon({ size = 13, color = colors.white }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1 0 8" />
      <Path d="M12 12v8M9 17l3 3 3-3" />
    </Svg>
  );
}

// Jeu Wii à gestes (RetroLibrary.dc.html) : Wiimote et ondes de mouvement.
export function MotionIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={9} y={7} width={6} height={12} rx={2} />
      <Path d="M5 9a6 6 0 0 0 0 6M19 9a6 6 0 0 1 0 6M3 6.5a10 10 0 0 0 0 11M21 6.5a10 10 0 0 1 0 11" />
    </Svg>
  );
}

export function PlusIcon({ color = 'rgba(255,255,255,0.85)' }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  );
}
export function FileIcon({ size = 14, crossed = false }: { size?: number; crossed?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={crossed ? 1.7 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <Path d="M14 3v5h5" />
      {crossed && <Path d="M10 12l4 4M14 12l-4 4" />}
    </Svg>
  );
}
