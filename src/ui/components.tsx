import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { colors, focusRing, fonts } from './theme';

// Composants récurrents du design (mesures relevées dans design/ecrans/*.dc.html).

type ButtonProps = {
  label: string;
  glyph?: string; // lettre du bouton de manette affichée à gauche (A, B, X, Y)
  onPress?: () => void;
  focused?: boolean;
  focusColor?: string;
};

// Bouton principal : pilule blanche, hauteur 44, glyphe rond « A » noir à gauche (Main, Consoles, Welcome).
export function PrimaryButton({ label, glyph = 'A', onPress, focused, focusColor }: ButtonProps) {
  return (
    <Pressable onPress={onPress} style={[styles.button, styles.primary, focused && { boxShadow: focusRing(focusColor) }]}>
      <View style={styles.primaryGlyph}>
        <Text style={styles.primaryGlyphText}>{glyph}</Text>
      </View>
      <Text style={styles.primaryLabel}>{label}</Text>
    </Pressable>
  );
}

// Bouton secondaire : pilule contour rgba(255,255,255,0.35), glyphe cerclé (LaunchIssue).
export function SecondaryButton({ label, glyph, onPress, focused, focusColor }: ButtonProps) {
  return (
    <Pressable onPress={onPress} style={[styles.button, styles.secondary, focused && { boxShadow: focusRing(focusColor) }]}>
      {glyph && (
        <View style={styles.secondaryGlyph}>
          <Text style={styles.secondaryGlyphText}>{glyph}</Text>
        </View>
      )}
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

// Bouton secondaire « teinté » : fond rgba(255,255,255,0.1), contour 0.28, glyphe cerclé (Main : Details ;
// GameDetails : Pin, Edit tile). glyph = une lettre, ou « View » pour le glyphe ⧉ du bouton View.
export function TonalButton({ label, glyph, onPress, focused, focusColor }: ButtonProps) {
  return (
    <Pressable onPress={onPress} style={[styles.button, styles.tonal, focused && { boxShadow: focusRing(focusColor) }]}>
      <View style={styles.secondaryGlyph}>
        {glyph === 'View' ? <ViewGlyph /> : <Text style={styles.secondaryGlyphText}>{glyph}</Text>}
      </View>
      <Text style={styles.secondaryLabel}>{label}</Text>
    </Pressable>
  );
}

// Glyphe du bouton View de la manette (deux carrés superposés), 12 pt (Main.dc.html).
export function ViewGlyph({ size = 12, color = colors.white }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke={color} strokeWidth={1.4}>
      <Rect x={1} y={3.5} width={6.5} height={6.5} rx={1.2} />
      <Path d="M4.5 3.5V2.2A1.2 1.2 0 0 1 5.7 1H9.8A1.2 1.2 0 0 1 11 2.2v4.1a1.2 1.2 0 0 1-1.2 1.2H7.5" />
    </Svg>
  );
}

// Rappel de bouton : cercle 18 pt avec la lettre + libellé 12 pt (Consoles, Main).
// glyph « View » : le glyphe ⧉ en 9 pt (RetroLibrary : View Details).
export function ButtonHint({ glyph, label, onPress }: { glyph: string; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.hint}>
      <View style={styles.hintCircle}>
        {glyph === 'View' ? <ViewGlyph size={9} /> : <Text style={styles.hintGlyph}>{glyph}</Text>}
      </View>
      <Text style={styles.hintLabel}>{label}</Text>
    </Pressable>
  );
}

// Interrupteur 40 × 24 : piste blanche + pastille sombre quand activé.
export function Toggle({ on }: { on: boolean }) {
  return (
    <View style={[styles.track, on && styles.trackOn]}>
      <View style={[styles.knob, on && styles.knobOn]} />
    </View>
  );
}

// Mot-symbole « overrrrhere » : Bricolage Grotesque 800, les quatre « r » en orange à opacité décroissante.
export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <Text style={{ color: colors.white, fontFamily: fonts.brand, fontSize: size, lineHeight: size * 1.2, letterSpacing: -0.035 * size }}>
      ove
      {/* Orange #FF5A1F à 100 / 75 / 50 / 30 % (l'opacité n'agit pas sur un texte imbriqué). */}
      {[1, 0.75, 0.5, 0.3].map((opacity) => (
        <Text key={opacity} style={{ color: `rgba(255,90,31,${opacity})` }}>
          r
        </Text>
      ))}
      here
    </Text>
  );
}

// Rappel du bouton Menu : même cercle, avec trois traits à la place de la lettre (Main).
export function MenuHint({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.hint}>
      <View style={styles.hintCircle}>
        <View style={styles.menuLines}>
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
          <View style={styles.menuLine} />
        </View>
      </View>
      <Text style={styles.hintLabel}>Menu</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 40,
    height: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  trackOn: {
    backgroundColor: colors.white,
  },
  knob: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: colors.white,
  },
  knobOn: {
    left: 19,
    backgroundColor: colors.ink,
  },
  button: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 10,
    paddingRight: 22,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  primary: {
    backgroundColor: colors.white,
  },
  primaryGlyph: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryGlyphText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  primaryLabel: {
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  secondary: {
    borderWidth: 1.5,
    borderColor: colors.secondaryBorder,
  },
  tonal: {
    paddingRight: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  secondaryGlyph: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.hintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryGlyphText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  secondaryLabel: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 15,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  hintCircle: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.hintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintGlyph: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 10,
  },
  hintLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  menuLines: {
    gap: 1.5,
  },
  menuLine: {
    width: 7,
    height: 1.4,
    borderRadius: 1,
    backgroundColor: colors.white,
  },
});
