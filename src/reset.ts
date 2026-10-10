import { resetPlaytime } from './playtime';
import { resetRetroLibrary } from './retro/library';
import { resetSettings } from './settings';
import { resetTiles } from './tiles';
import { signOut } from './xbox/auth';

// Settings › About › Reset overrrrhere (décision d'Elhadji du 09/10/2026) : comme une console remise à zéro,
// tout ce que l'app garde sur l'iPhone est effacé, puis l'app revient au Welcome.
// Jamais touchés : le dossier iCloud Drive de l'utilisateur et sa Xbox.
export async function resetApp() {
  resetRetroLibrary(); // jeux rétro, jaquettes, sauvegardes, cartes mémoire GameCube, sauvegardes Wii, lien du dossier
  await Promise.all([
    resetSettings(), // réglages, console choisie, premiers pas
    resetTiles(), // épinglages et images personnalisées
    resetPlaytime(), // temps joué ici
    signOut().catch(() => {}), // connexion Microsoft (trousseau) et jeux Xbox gardés hors ligne
  ]);
}
