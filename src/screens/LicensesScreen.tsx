import { useEventListener } from 'expo';
import { BlurView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import Manette from '../../modules/manette';
import { LICENSE_TEXTS, LicenseTextId } from '../licenseTexts';
import { ButtonHint, PrimaryButton } from '../ui/components';
import { useFocusColor } from '../settings';
import { useInput } from '../ui/input';
import { colors, focusRing, fonts, layout } from '../ui/theme';

// Settings › About › Open-source licenses (maquette « About et licences » du 08/10/2026,
// https://claude.ai/artifact/PEGFGPpidWvLebc1J3wa5g) : liste à gauche, fiche à droite, A = texte complet.
// Texte complet : haut / bas ou stick droit pour défiler, B = retour à la liste.

type Item = { name: string; role: string; license: string; source: string; texts: LicenseTextId[] };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'This app',
    items: [{ name: 'overrrrhere', role: 'This app', license: 'GNU GPL v3', source: 'github.com/Hope221/overrrrhere', texts: ['GPL-3.0'] }],
  },
  {
    title: 'Emulators',
    items: [
      { name: 'FCEUmm', role: 'NES', license: 'GNU GPL v2', source: 'github.com/libretro/libretro-fceumm', texts: ['GPL-2.0'] },
      { name: 'Snes9x', role: 'Super Nintendo', license: 'Snes9x license', source: 'github.com/libretro/snes9x', texts: ['Snes9x'] },
      { name: 'mGBA', role: 'Game Boy · Color · Advance', license: 'Mozilla Public License 2.0', source: 'github.com/mgba-emu/mgba', texts: ['MPL-2.0'] },
      { name: 'Genesis Plus GX', role: 'Mega Drive', license: 'Genesis Plus GX license', source: 'github.com/libretro/Genesis-Plus-GX', texts: ['GenesisPlusGX'] },
      { name: 'Mupen64Plus-Next', role: 'Nintendo 64', license: 'GNU GPL v2', source: 'github.com/libretro/mupen64plus-libretro-nx', texts: ['GPL-2.0'] },
      { name: 'PPSSPP', role: 'PSP', license: 'GNU GPL v2 or later', source: 'github.com/hrydgard/ppsspp', texts: ['GPL-2.0'] },
      { name: 'melonDS DS', role: 'Nintendo DS', license: 'GNU GPL v3 · BSD 2-Clause', source: 'github.com/JesseTG/melonds-ds', texts: ['GPL-3.0', 'BSD-FreeBIOS'] },
      { name: 'Azahar', role: 'Nintendo 3DS', license: 'GNU GPL v2', source: 'github.com/azahar-emu/azahar', texts: ['GPL-2.0'] },
      { name: 'Dolphin (iCube)', role: 'GameCube · Wii', license: 'GNU GPL v2 or later', source: 'github.com/Hope221/overrrrhere-gamecube', texts: ['GPL-2.0'] },
    ],
  },
  {
    title: 'Components',
    items: [
      { name: 'libretro API', role: 'Emulator interface', license: 'MIT License', source: 'github.com/libretro/libretro-common', texts: ['MIT-libretro'] },
      { name: 'MoltenVK', role: '3D graphics', license: 'Apache License 2.0', source: 'github.com/KhronosGroup/MoltenVK', texts: ['Apache-2.0'] },
      { name: 'WebRTC', role: 'Xbox streaming', license: 'BSD 3-Clause · MIT', source: 'github.com/react-native-webrtc/react-native-webrtc', texts: ['BSD-WebRTC', 'MIT-ReactNativeWebRTC'] },
      { name: 'React Native and Expo', role: 'App framework', license: 'MIT License', source: 'github.com/facebook/react-native · github.com/expo/expo', texts: ['MIT-ReactNative', 'MIT-Expo'] },
      { name: 'Figtree, Bricolage Grotesque', role: 'Fonts', license: 'SIL Open Font License 1.1', source: 'fonts.google.com', texts: ['OFL-Figtree', 'OFL-Bricolage'] },
      { name: 'Interface sounds', role: 'Menu sounds', license: 'CC0 · Public domain', source: 'opengameart.org · obsydianx.itch.io', texts: ['CC0'] },
    ],
  },
];

const ITEMS = GROUPS.flatMap((g) => g.items);
const SCROLL_STEP = 120; // pt par appui (haut / bas, répété tant qu'on maintient)
const STICK_SPEED = 14; // pt par image au stick droit poussé à fond

export function LicensesScreen({ onExit }: { onExit: () => void }) {
  const focusColor = useFocusColor();
  const [index, setIndex] = useState(0);
  const [reading, setReading] = useState(false);
  const item = ITEMS[index];

  // Liste : la ligne choisie reste visible.
  const list = useRef<ScrollView>(null);
  const places = useRef(new Map<number, { group: string; y: number; height: number }>()); // y : dans son groupe
  const groupPlaces = useRef(new Map<string, number>());
  const listHeight = useRef(0);
  const listOffset = useRef(0);
  useEffect(() => {
    const place = places.current.get(index);
    if (!place || !listHeight.current) return;
    const y = (groupPlaces.current.get(place.group) ?? 0) + place.y;
    let next = listOffset.current;
    if (y - 8 < next) next = Math.max(0, y - 8);
    else if (y + place.height + 8 > next + listHeight.current) next = y + place.height + 8 - listHeight.current;
    if (next !== listOffset.current) list.current?.scrollTo({ y: next, animated: true });
  }, [index]);

  // Texte complet.
  const reader = useRef<ScrollView>(null);
  const readerOffset = useRef(0);
  const readerMax = useRef(0);
  const readerHeight = useRef(0);
  const stickY = useRef(0);
  function scrollBy(delta: number, animated: boolean) {
    const next = Math.max(0, Math.min(readerMax.current, readerOffset.current + delta));
    readerOffset.current = next;
    reader.current?.scrollTo({ y: next, animated });
  }

  useEventListener(Manette, 'onStick', (event) => {
    if (event.stick === 'RS') stickY.current = Math.abs(event.y) > 0.2 ? event.y : 0;
  });
  useEffect(() => {
    if (!reading) return;
    let frame = 0;
    const tick = () => {
      if (stickY.current) scrollBy(-stickY.current * STICK_SPEED, false); // y : +1 = haut
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reading]);

  function open() {
    readerOffset.current = 0;
    setReading(true);
  }

  useInput((button) => {
    if (reading) {
      if (button === 'Up') scrollBy(-SCROLL_STEP, true);
      if (button === 'Down') scrollBy(SCROLL_STEP, true);
      if (button === 'B') setReading(false);
      return;
    }
    if (button === 'Up') setIndex(Math.max(0, index - 1));
    if (button === 'Down') setIndex(Math.min(ITEMS.length - 1, index + 1));
    if (button === 'A') open();
    if (button === 'B') onExit();
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: reading ? 'rgba(8,8,10,0.8)' : 'rgba(8,8,10,0.7)' }]} />

      <View style={styles.layout}>
        <View style={styles.header}>
          {reading ? (
            <View>
              <Text style={styles.crumb}>Open-source licenses › {item.name}</Text>
              <Text style={styles.readerTitle}>{item.license}</Text>
            </View>
          ) : (
            <Text style={styles.title}>Open-source licenses</Text>
          )}
          <View style={styles.hints}>
            {reading ? <ButtonHint glyph="R" label="Scroll" /> : <ButtonHint glyph="A" label="Read license" onPress={open} />}
            <ButtonHint glyph="B" label="Back" onPress={() => (reading ? setReading(false) : onExit())} />
          </View>
        </View>

        {reading ? (
          <ScrollView
            ref={reader}
            style={styles.reader}
            contentContainerStyle={styles.readerContent}
            indicatorStyle="white"
            scrollEventThrottle={16}
            onScroll={(e) => (readerOffset.current = e.nativeEvent.contentOffset.y)}
            onContentSizeChange={(_, h) => (readerMax.current = Math.max(0, h - readerHeight.current))}
            onLayout={(e) => (readerHeight.current = e.nativeEvent.layout.height)}
          >
            {item.texts.map((id, i) => (
              // Un bloc par paragraphe : les longues licences (Genesis Plus GX : 64 Ko) s'affichent sans à-coup.
              <View key={id} style={i > 0 && styles.licenseTextNext}>
                {LICENSE_TEXTS[id].split('\n\n').map((paragraph, p) => (
                  <Text key={p} style={[styles.licenseText, p > 0 && styles.paragraph]}>
                    {paragraph}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.body}>
            <ScrollView
              ref={list}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => (listOffset.current = e.nativeEvent.contentOffset.y)}
              onLayout={(e) => (listHeight.current = e.nativeEvent.layout.height)}
            >
              {GROUPS.map((group) => (
                <View key={group.title} onLayout={(e) => groupPlaces.current.set(group.title, e.nativeEvent.layout.y)}>
                  <Text style={styles.groupTitle}>{group.title}</Text>
                  {group.items.map((it) => {
                    const i = ITEMS.indexOf(it);
                    const on = i === index;
                    return (
                      <Pressable
                        key={it.name}
                        onPress={() => (on ? open() : setIndex(i))}
                        onLayout={(e) => places.current.set(i, { group: group.title, y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height })}
                        style={[styles.item, on && styles.itemOn, on && { boxShadow: focusRing(focusColor) }]}
                      >
                        <Text style={styles.itemText} numberOfLines={1}>
                          {it.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>

            <View style={styles.card}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.role}>{item.role}</Text>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{item.license}</Text>
              </View>
              <Text style={styles.source}>{item.source}</Text>
              <View style={{ flexGrow: 1 }} />
              <View style={{ alignItems: 'flex-start' }}>
                <PrimaryButton label="Read the full license" onPress={open} />
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    paddingVertical: 18,
    paddingHorizontal: layout.sideMargin,
    gap: 12,
  },
  header: {
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.26,
  },
  crumb: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  readerTitle: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.22,
  },
  hints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    gap: 20,
  },
  list: {
    width: 250,
    flexGrow: 0,
  },
  listContent: {
    padding: 4,
    paddingBottom: 12,
  },
  groupTitle: {
    paddingTop: 10,
    paddingBottom: 4,
    paddingHorizontal: 12,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.bold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
  },
  item: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: 2,
    borderRadius: 10,
  },
  itemOn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  itemText: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 14,
  },
  card: {
    flex: 1,
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  name: {
    color: colors.white,
    fontFamily: fonts.extraBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.24,
  },
  role: {
    marginTop: 4,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  pill: {
    alignSelf: 'flex-start',
    marginTop: 14,
    height: 26,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  pillText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  source: {
    marginTop: 14,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  reader: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(22,22,26,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  readerContent: {
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  licenseText: {
    color: 'rgba(255,255,255,0.86)',
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  paragraph: {
    marginTop: 12,
  },
  licenseTextNext: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
});
