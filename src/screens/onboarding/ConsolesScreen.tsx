import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { humanError } from '../../errors';
import { useFocusColor } from '../../settings';
import { Backdrop } from '../../ui/Backdrop';
import { ButtonHint, PrimaryButton } from '../../ui/components';
import { ConsoleCardIcon, InfoIcon } from '../../ui/icons';
import { useInput } from '../../ui/input';
import { colors, focusRing, fonts, layout } from '../../ui/theme';
import { XboxConsole, getConsoles } from '../../xbox/consoles';

// Choose your console (design/ecrans/Consoles.dc.html). Manette : gauche / droite, A = Continue, B = Back.

export function ConsolesScreen({ selectedId, onContinue, onBack }: { selectedId?: string | null; onContinue: (console: XboxConsole) => void; onBack: () => void }) {
  const focusColor = useFocusColor();
  const [consoles, setConsoles] = useState<XboxConsole[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    getConsoles()
      .then((list) => {
        setConsoles(list);
        setSelected(Math.max(0, list.findIndex((c) => c.id === selectedId)));
      })
      .catch((e) => {
        setError(humanError(e, "Couldn't load your consoles. Check your internet and try again.", 'Consoles'));
        setConsoles([]);
      });
  }, [selectedId]);

  const current = consoles?.[selected];

  useInput((button) => {
    if (button === 'Left') setSelected(Math.max(0, selected - 1));
    if (button === 'Right' && consoles) setSelected(Math.min(consoles.length - 1, selected + 1));
    if (button === 'A' && current) onContinue(current);
    if (button === 'B') onBack();
  });

  return (
    <View style={styles.screen}>
      <Backdrop />
      <View style={styles.layout}>
        <Text style={styles.title}>Choose your console</Text>
        <Text style={styles.subtitle}>Consoles linked to your Microsoft account</Text>

        <View style={styles.cards}>
          {consoles === null && <ActivityIndicator color={colors.white} />}
          {consoles?.length === 0 && !error && <Text style={styles.subtitle}>No console found on this account.</Text>}
          {consoles?.map((c, i) => {
            const status = statusOf(c);
            return (
              <Pressable
                key={c.id}
                onPress={() => (i === selected ? onContinue(c) : setSelected(i))}
                style={[styles.card, { boxShadow: i === selected ? focusRing(focusColor) : 'none' }]}
              >
                <ConsoleCardIcon />
                <View style={styles.cardText}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <View style={styles.statusLine}>
                    <View style={[styles.dot, !status.ready && styles.dotIdle]} />
                    <Text style={styles.status}>{status.label}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.help}>
          <InfoIcon />
          <Text style={styles.helpText}>
            Don't see it? On your Xbox: Settings › Devices &amp; connections › Remote features
          </Text>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}

        <View style={{ flexGrow: 1 }} />

        <View style={styles.footer}>
          <PrimaryButton label="Continue" onPress={() => current && onContinue(current)} />
          <ButtonHint glyph="B" label="Back" onPress={onBack} />
        </View>
      </View>
    </View>
  );
}

// « Ready · Asleep » dans le design : console joignable (fonctionnalités à distance activées) et son état.
function statusOf(c: XboxConsole): { label: string; ready: boolean } {
  if (!c.remoteManagementEnabled) return { label: 'Remote features off', ready: false };
  if (c.state === 'offline') return { label: 'Offline', ready: false };
  return { label: `Ready · ${c.state === 'on' ? 'On' : 'Asleep'}`, ready: true };
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  layout: {
    flex: 1,
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: layout.sideMargin,
  },
  title: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.26,
  },
  subtitle: {
    marginTop: 4,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  cards: {
    marginTop: 26,
    flexDirection: 'row',
    gap: 16,
    minHeight: 112,
    alignItems: 'center',
  },
  card: {
    width: 260,
    height: 112,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: 'rgba(10,10,12,0.42)', // fond clair des premiers pas (08/10/2026) : panneau sombre translucide
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  cardName: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 22,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  status: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  help: {
    marginTop: 22,
    width: 440,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  helpText: {
    flex: 1,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    marginTop: 10,
    color: colors.destructive,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
