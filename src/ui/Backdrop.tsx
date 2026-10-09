import { Image, StyleSheet, View } from 'react-native';

// Fond des premiers pas après Welcome (Before you start, Sign in, Choose your console, Add your games) :
// scène du matin, claire, floutée (maquette « Premiers pas : Xbox et jeux » du 08/10/2026 : flou 20 px,
// luminosité 68 %, voile plus sombre en haut et en bas pour les titres et les rappels de boutons).
// Le Welcome garde le coucher de soleil (welcome-fond.jpg) dans le téléphone de la manette.
// Une image fournie avec l'app prend sa taille d'origine : largeur et hauteur 100 % obligatoires.
export function Backdrop() {
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Image source={require('../../assets/images/onboarding-fond.jpg')} style={styles.image} blurRadius={20} resizeMode="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,12,0.32)' }]} />
      <View style={[StyleSheet.absoluteFill, styles.veil]} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.08 }],
  },
  veil: {
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(10,10,12,0.42) 0%, rgba(10,10,12,0.12) 50%, rgba(10,10,12,0.38) 100%)',
  },
});
