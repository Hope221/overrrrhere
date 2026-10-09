import { StyleSheet, View } from 'react-native';

import { Box, Vector, rectStyle } from './touchLayout';

// Stick tactile (maquette TouchStream.dc.html) : cercle de base, et bouton qui suit le doigt.
// Utilisé par le stream Xbox (TouchStream) et le N64 (TouchRetro).
type Props = {
  rect: Box;
  knob: number; // diamètre du bouton
  knobColor: string;
  value: Vector; // -1 à 1, bas = +1
};

export function TouchStickView({ rect, knob, knobColor, value }: Props) {
  const travel = (rect.w - knob) / 2;
  return (
    <View style={[styles.base, rectStyle(rect)]}>
      <View
        style={[
          styles.knob,
          { width: knob, height: knob, left: travel + value.x * travel, top: travel + value.y * travel, backgroundColor: knobColor },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
  },
  knob: {
    position: 'absolute',
    borderRadius: 999,
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  },
});
