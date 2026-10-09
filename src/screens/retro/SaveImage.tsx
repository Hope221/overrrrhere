import { Image, StyleSheet } from 'react-native';

import { SystemId } from '../../retro/systems';

// Image d'une sauvegarde d'état, dans une vignette 4:3 qui coupe ce qui dépasse (overflow: 'hidden').
// DS : l'image enregistrée contient les deux écrans l'un sur l'autre (256 × 384) ; la vignette ne montre
// que l'écran du haut (256 × 192, en 4:3 lui aussi), celui de l'action dans la plupart des jeux.
// 3DS : pareil (400 × 480), mais l'écran du haut est plus large (5:3) : il remplit la hauteur de la vignette
// et ses bords gauche et droit sont coupés, sans être déformé.
export function SaveImage({ uri, system }: { uri: string; system: SystemId }) {
  if (system === 'nds') return <Image source={{ uri }} style={styles.topScreen} resizeMode="stretch" />;
  if (system === '3ds') return <Image source={{ uri }} style={[styles.topScreen, styles.wideTopScreen]} resizeMode="stretch" />;
  return <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  topScreen: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '200%',
  },
  wideTopScreen: {
    left: '-12.5%',
    width: '125%',
  },
});
