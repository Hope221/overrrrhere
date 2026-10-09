import { Image, StyleSheet, Text, View } from 'react-native';

import { useBattery, useClock, useController } from './device';
import { BatteryIcon, ControllerIcon, GamerPicPlaceholder, Logo } from './icons';
import { colors, fonts } from './theme';

// Barre du haut de Home (design/ecrans/Main.dc.html) : logo | photo + gamertag … console, manette, batterie, heure.
// Hors ligne (mise à jour du 29/09) : la pastille console devient point gris + « Offline ».
export function TopBar(props: { gamertag?: string; picture?: string | null; consoleName?: string; consoleReady?: boolean; offline?: boolean }) {
  const battery = useBattery();
  const controller = useController();
  const clock = useClock();

  return (
    <View style={styles.bar}>
      <View style={styles.group}>
        <Logo size={24} />
        <View style={styles.divider} />
        <View style={styles.picture}>
          {props.picture ? <Image source={{ uri: props.picture }} style={StyleSheet.absoluteFill} /> : <GamerPicPlaceholder />}
        </View>
        <Text style={styles.gamertag}>{props.gamertag ?? ''}</Text>
      </View>

      <View style={[styles.group, styles.right]}>
        {props.offline ? (
          <View style={styles.chip}>
            <View style={[styles.dot, styles.dotOffline]} />
            <Text style={styles.chipText}>Offline</Text>
          </View>
        ) : (
          props.consoleName && (
            <View style={styles.chip}>
              <View style={[styles.dot, !props.consoleReady && styles.dotIdle]} />
              <Text style={styles.chipText}>{props.consoleName}</Text>
            </View>
          )
        )}
        {controller.connected && <ControllerIcon />}
        <View style={styles.battery}>
          <BatteryIcon level={battery.level} />
          {battery.percent !== null && <Text style={styles.batteryText}>{battery.percent}%</Text>}
        </View>
        <Text style={styles.clock}>{clock}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  right: {
    gap: 16,
  },
  divider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  picture: {
    width: 28,
    height: 28,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    experimental_backgroundImage: 'linear-gradient(160deg, #3A3B44 0%, #1C1D22 100%)',
    boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.22)',
  },
  gamertag: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    letterSpacing: 0.14,
  },
  chip: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.ready,
  },
  dotIdle: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotOffline: {
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  chipText: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: fonts.semiBold,
    fontSize: 12,
  },
  battery: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  batteryText: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: fonts.medium,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  clock: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: fonts.semiBold,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
});
