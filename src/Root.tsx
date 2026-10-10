import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { stopStartupMelody } from './feedback';
import { NoController } from './screens/NoController';
import { useController } from './ui/device';

import { HomeScreen } from './screens/HomeScreen';
import { PlayScreen, PlayTarget } from './screens/PlayScreen';
import { RetroPlayScreen } from './screens/retro/RetroPlayScreen';
import { SlotId, backupSavesSoon, getRetroGame, prepareGame } from './retro/library';
import { AddGamesScreen } from './screens/onboarding/AddGamesScreen';
import { BeforeYouStartScreen } from './screens/onboarding/BeforeYouStartScreen';
import { ConsolesScreen } from './screens/onboarding/ConsolesScreen';
import { SignInScreen } from './screens/onboarding/SignInScreen';
import { SplashScreen } from './screens/onboarding/SplashScreen';
import { WelcomeScreen } from './screens/onboarding/WelcomeScreen';
import { getSettings, updateSettings, useSettings } from './settings';
import { SignedOutError, getProfile, signOut } from './xbox/auth';

// Enchaînement des écrans (navigation simple, un écran à la fois ; les panneaux s'affichent par-dessus).
// Premier lancement : Splash → Welcome → Before you start → Sign in → Choose console → Add your games → Home
// (Before you start et Add your games : maquette « Premiers pas : Xbox et jeux » du 08/10/2026).
// Ensuite : Splash → Home (ou Sign in si la session Microsoft a expiré).
// Sans internet ou avec « Continue without Xbox » (mise à jour du 29/09) : Home directement, le rétro marche hors ligne.

type Screen =
  | { name: 'splash' }
  | { name: 'welcome' }
  | { name: 'beforeStart' }
  | { name: 'signIn' }
  | { name: 'addGames' }
  | { name: 'consoles'; from: 'onboarding' | 'settings' }
  | { name: 'home'; reopen?: 'retro' } // reopen : revenir sur la bibliothèque rétro
  | { name: 'play'; target: PlayTarget }
  | { name: 'retroPlay'; gameId: string; slot: SlotId | null; fromLibrary: boolean }; // jeu rétro (slot = sauvegarde à charger)

const SPLASH_MIN = 1400; // ms : le temps de voir l'animation du splash

export function Root() {
  const settings = useSettings();
  const [screen, setScreen] = useState<Screen>({ name: 'splash' });

  // Où aller une fois connecté (ou si la connexion n'a pas pu être vérifiée).
  async function route() {
    let hasAccount = false;
    try {
      await getProfile();
      hasAccount = true;
    } catch (e) {
      // Jetons présents mais Microsoft injoignable (hors ligne…) : Home s'ouvre quand même, en mode hors ligne.
      hasAccount = !(e instanceof SignedOutError);
    }
    const { onboarded, consoleId, xboxSkipped } = getSettings();
    if (!onboarded) return setScreen({ name: 'welcome' });
    if (!hasAccount) return setScreen(xboxSkipped ? { name: 'home' } : { name: 'signIn' });
    if (!consoleId) return setScreen({ name: 'consoles', from: 'onboarding' });
    setScreen({ name: 'home' });
  }

  useEffect(() => {
    const started = Date.now();
    (async () => {
      await getProfile().catch(() => {}); // prépare les jetons pendant le splash
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, SPLASH_MIN - (Date.now() - started))));
      await route();
    })();
  }, []);

  async function afterSignIn() {
    updateSettings({ xboxSkipped: false });
    const { onboarded, consoleId } = getSettings();
    setScreen(onboarded && consoleId ? { name: 'home' } : { name: 'consoles', from: 'onboarding' });
  }

  // No controller : par-dessus tout écran du launcher (sauf le splash) tant qu'aucune manette n'est connectée.
  // « Play with touch controls » le masque jusqu'à la prochaine connexion de la manette.
  // Pendant le stream, c'est PlayScreen qui le gère (les contrôles tactiles le remplacent).
  const controller = useController();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (controller.connected) setDismissed(false);
  }, [controller.connected]);
  const showNoController = !controller.connected && !dismissed && screen.name !== 'splash' && screen.name !== 'play' && screen.name !== 'retroPlay';

  return (
    <View style={{ flex: 1 }}>
      {renderScreen()}
      {showNoController && <NoController onContinueWithTouch={() => setDismissed(true)} />}
    </View>
  );

  function renderScreen() {
    switch (screen.name) {
      case 'splash':
        return <SplashScreen />;
      case 'welcome':
        return (
          <WelcomeScreen
            onGetStarted={async () => {
              try {
                await getProfile();
                setScreen({ name: 'consoles', from: 'onboarding' });
              } catch {
                setScreen({ name: 'beforeStart' });
              }
            }}
          />
        );
      case 'beforeStart':
        return <BeforeYouStartScreen onContinue={() => setScreen({ name: 'signIn' })} onBack={() => setScreen({ name: 'welcome' })} />;
      case 'addGames':
        return <AddGamesScreen onDone={() => setScreen({ name: 'home' })} />;
      case 'signIn':
        return (
          <SignInScreen
            onSignedIn={afterSignIn}
            onContinueWithoutXbox={() => {
              updateSettings({ onboarded: true, xboxSkipped: true });
              setScreen({ name: 'addGames' });
            }}
          />
        );
      case 'consoles':
        return (
          <ConsolesScreen
            selectedId={settings.consoleId}
            onContinue={(console) => {
              updateSettings({ consoleId: console.id, onboarded: true });
              setScreen(screen.from === 'onboarding' ? { name: 'addGames' } : { name: 'home' });
            }}
            onBack={() => setScreen(screen.from === 'settings' ? { name: 'home' } : { name: 'signIn' })}
          />
        );
      case 'home':
        return (
          <HomeScreen
            onPlay={(target) => {
            stopStartupMelody(); // ne pas se mélanger au son du jeu
            setScreen({ name: 'play', target });
          }}
            onChangeConsole={() => setScreen({ name: 'consoles', from: 'settings' })}
            onSignIn={() => setScreen({ name: 'signIn' })}
            onShowWelcome={() => setScreen({ name: 'welcome' })}
            onReset={() => setScreen({ name: 'welcome' })}
            initialOverlay={screen.reopen}
            onPlayRetro={async (gameId, slot, fromLibrary) => {
              // Jeu du dossier iCloud : téléchargé d'abord (B annule), puis lancé.
              const game = getRetroGame(gameId);
              if (game && !(await prepareGame(game))) return;
              stopStartupMelody();
              setScreen({ name: 'retroPlay', gameId, slot, fromLibrary });
            }}
            onSignOut={async () => {
              await signOut();
              setScreen({ name: 'signIn' });
            }}
          />
        );
      case 'play':
        return <PlayScreen target={screen.target} onExit={() => setScreen({ name: 'home' })} onSignIn={() => setScreen({ name: 'signIn' })} />;
      case 'retroPlay':
        return (
          <RetroPlayScreen
            gameId={screen.gameId}
            slot={screen.slot}
            onExit={() => {
              backupSavesSoon(screen.gameId); // jeu du dossier iCloud : sauvegardes copiées dans le dossier
              setScreen({ name: 'home', reopen: screen.fromLibrary ? 'retro' : undefined });
            }}
          />
        );
    }
  }
}
