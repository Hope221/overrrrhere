// Couleurs, polices et mesures du design (CLAUDE.md « Design system », design/ecrans/*.dc.html).

export const colors = {
  ink: '#0A0A0C', // fond
  white: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.74)',
  orange: '#FF5A1F', // logo, bouton A, accents rares
  ready: '#7CE3A6', // uniquement pour les états prêts / connectés
  destructive: '#FF8A73', // Se déconnecter, Réinitialiser
  panel: 'rgba(22,22,26,0.88)',
  hintBorder: 'rgba(255,255,255,0.7)',
  secondaryBorder: 'rgba(255,255,255,0.35)',
  tileBackground: '#141416',
};

// Couleurs de focus proposées dans Settings > Appearance (blanc par défaut).
export const focusColors = {
  white: '#FFFFFF',
  green: '#7CE3A6',
  orange: '#FF5A1F',
};

export const fonts = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semiBold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
  extraBold: 'Figtree_800ExtraBold',
  brand: 'BricolageGrotesque_800ExtraBold', // logo et titres de marque
};

// Écran de référence 852 × 393 pt (iPhone en paysage), marges latérales 56 pt (encoche).
export const layout = {
  sideMargin: 56,
};

// Anneau de focus du design : « 0 0 0 2px #0A0A0C, 0 0 0 4px <couleur>, 0 14px 32px rgba(0,0,0,0.55) ».
export function focusRing(color: string = focusColors.white): string {
  return `0 0 0 2px ${colors.ink}, 0 0 0 4px ${color}, 0 14px 32px rgba(0,0,0,0.55)`;
}
