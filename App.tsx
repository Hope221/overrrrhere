import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Root } from './src/Root';
import { preloadSounds } from './src/feedback';
import { loadPlaytime } from './src/playtime';
import { loadRetroLibrary, syncRomFolder } from './src/retro/library';
import { loadSettings } from './src/settings';
import { loadTiles } from './src/tiles';
import { useAppFonts } from './src/ui/fonts';
import { loadXboxCache } from './src/xbox/cache';
import { InputProvider } from './src/ui/input';
import { colors } from './src/ui/theme';

export default function App() {
  const fontsLoaded = useAppFonts();
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    Promise.all([loadSettings(), loadTiles(), loadPlaytime(), loadRetroLibrary(), loadXboxCache()]).finally(() => {
      setSettingsLoaded(true);
      syncRomFolder(); // jeux du dossier iCloud, sans attendre
    });
    preloadSounds();
  }, []);

  return (
    <InputProvider>
      {fontsLoaded && settingsLoaded ? <Root /> : <View style={{ flex: 1, backgroundColor: colors.ink }} />}
      <StatusBar hidden />
    </InputProvider>
  );
}
