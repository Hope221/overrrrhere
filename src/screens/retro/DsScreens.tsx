import { useEffect, useRef } from 'react';
import { GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import Retro from '../../../modules/retro';
import { DsLayout, DsScreens as Screens } from '../../retro/dsLayout';
import { colors, fonts } from '../../ui/theme';
import { rectStyle } from '../../ui/touchLayout';

// Habillage des deux écrans de la DS et de la 3DS, par-dessus les images du module natif (DSSideBySide, DSStacked,
// DSFocus.dc.html ; maquettes 3DS) :
// fin contour de l'écran tactile, étiquette « Touch » (côte à côte et focus), rappels de boutons sous les écrans,
// bouton « Swap screens » (focus). 3DS, focus avec les contrôles tactiles (ThreeDSFocus.dc.html) : petit écran
// sous le grand, contour clair et pastille « Enlarge » (TouchRetro l'agrandit au toucher), pas de bouton Swap. capture : le doigt posé sur l'écran tactile part au jeu (Retro.setTouchScreen) ;
// sinon ce sont les contrôles tactiles (TouchRetro) qui s'en chargent, avec les boutons.

type Props = {
  screens: Screens;
  layout: DsLayout;
  swapped: boolean;
  capture: boolean;
  controller: boolean; // manette connectée : rappels de boutons
  onSwap: () => void;
};

export function DsScreens({ screens, layout, swapped, capture, controller, onSwap }: Props) {
  const { top, bottom, radius, scale, hints, swap, focusHint, touchFocus } = screens;
  const down = useRef(false);

  function touch(event: GestureResponderEvent, pressed: boolean) {
    const t = event.nativeEvent;
    const x = Math.min(1, Math.max(0, (t.pageX - bottom.x) / bottom.w));
    const y = Math.min(1, Math.max(0, (t.pageY - bottom.y) / bottom.h));
    down.current = pressed;
    Retro.setTouchScreen(pressed, x, y);
  }

  // Écran quitté ou toucher confié aux contrôles tactiles : le doigt se relève.
  useEffect(
    () => () => {
      if (down.current) Retro.setTouchScreen(false, 0, 0);
    },
    [capture],
  );

  // Étiquette « Touch » : absente des empilés ; plus petite sur le petit écran du focus ; focus tactile de la 3DS :
  // seulement quand l'écran tactile est le grand.
  const small = layout === 'Focus' && !swapped;
  const label = touchFocus ? swapped : layout !== 'Stacked';
  const enlarge = touchFocus ? (swapped ? top : bottom) : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        pointerEvents={capture ? 'auto' : 'none'}
        style={[styles.touchScreen, enlarge === bottom && styles.noBorder, rectStyle(bottom), { borderRadius: radius }]}
        onTouchStart={(e) => touch(e, true)}
        onTouchMove={(e) => touch(e, true)}
        onTouchEnd={(e) => touch(e, false)}
        onTouchCancel={(e) => touch(e, false)}
      >
        {label && (
          <View style={[styles.label, small ? styles.labelSmall : null]}>
            <HandIcon size={small ? 10 : 11} />
            <Text style={styles.labelText}>Touch</Text>
          </View>
        )}
      </View>

      {layout === 'Side by side' && controller && (
        <View style={[styles.hints, { left: hints.x, top: hints.y, width: 740 * scale }]} pointerEvents="none">
          <Text style={styles.hint}>View + Menu · Game menu</Text>
          <Text style={styles.hint}>Right stick click · Swap screens</Text>
        </View>
      )}

      {enlarge && (
        <View style={[styles.enlarge, rectStyle(enlarge), { borderRadius: radius }]} pointerEvents="none">
          <View style={styles.enlargePill}>
            <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </Svg>
            <Text style={styles.enlargeText}>Enlarge</Text>
          </View>
        </View>
      )}

      {layout === 'Focus' && !touchFocus && (
        <>
          <Pressable onPress={onSwap} style={[styles.swap, { left: swap.x, top: swap.y }]}>
            <View style={styles.rs}>
              <Text style={styles.rsText}>RS</Text>
            </View>
            <Text style={styles.swapText}>Swap screens</Text>
          </Pressable>
          {controller && (
            <View style={[styles.focusHint, { left: focusHint.x, top: focusHint.y }]} pointerEvents="none">
              <Text style={styles.hint}>View + Menu · Game menu</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// Main qui touche (maquettes DS), le même tracé que l'icône « Touch controls ».
function HandIcon({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 11V5a2 2 0 0 1 4 0v5" />
      <Path d="M13 10a2 2 0 0 1 4 0v1a2 2 0 0 1 3 1.7V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.9-2.5L5 15.5a1.8 1.8 0 0 1 2.8-2.2L9 14.5" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  touchScreen: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  label: {
    position: 'absolute',
    right: 8,
    top: 8,
    height: 20,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(10,10,12,0.62)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  noBorder: {
    borderWidth: 0,
  },
  // Petit écran du focus tactile (ThreeDSFocus.dc.html) : contour 1,5 rgba(255,255,255,0.45), pastille en bas au centre.
  enlarge: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
  },
  enlargePill: {
    height: 20,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(10,10,12,0.72)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  enlargeText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 10,
  },
  labelSmall: {
    right: 6,
    top: 6,
    height: 18,
    paddingLeft: 5,
    paddingRight: 7,
  },
  labelText: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: fonts.bold,
    fontSize: 10,
  },
  hints: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
  },
  hint: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: fonts.regular,
    fontSize: 11,
  },
  focusHint: {
    position: 'absolute',
  },
  swap: {
    position: 'absolute',
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
    paddingRight: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  rs: {
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
  },
  rsText: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 9,
  },
  swapText: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 13,
  },
});
