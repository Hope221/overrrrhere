import { sendCommand, xccs } from './consoles';
import { Achievements, TitleHistory, getTitleHistory } from './history';

// Jeux installés sur une console et leurs visuels.
// Sources (vérifiées le 2026-09-24) :
// - liste : xccs.xboxlive.com/lists/installedApps — github.com/OpenXbox/xbox-webapi-python, provider smartglass ;
// - visuels : catalogue public du Microsoft Store displaycatalog.mp.microsoft.com/v7.0/products
//   (provider « catalog » de xbox-webapi-python) ;
// - lancement : commande Shell/ActivateApplicationWithOneStoreProductId (launch_app de xbox-webapi-python).
// NON OFFICIEL : Microsoft peut changer ces services sans prévenir.

export type InstalledGame = {
  titleId: number;
  productId: string | null; // identifiant Store, nécessaire pour lancer le jeu et trouver ses visuels
  name: string;
  tile: string | null; // image 16:9 avec titre (TitledHeroArt)
  background: string | null; // image 16:9 sans titre (SuperHeroArt)
  lastPlayed: number; // horodatage, 0 si jamais
  // Game details (lot 2) : null si la donnée manque (le bloc est alors masqué).
  publisher: string | null;
  genre: string | null;
  description: string | null;
  achievements: Achievements | null;
};

export async function getInstalledGames(consoleId: string): Promise<InstalledGame[]> {
  const body = await xccs('GET', `/lists/installedApps?deviceId=${encodeURIComponent(consoleId)}`);
  const seen = new Set<number>();
  const games: InstalledGame[] = [];

  for (const app of body.result ?? []) {
    // « isGame » n'est plus renvoyé (constaté le 2026-09-24) : le type est dans « contentType ».
    const isGame = app.isGame === true || app.contentType === 'Game';
    if (!isGame || seen.has(app.titleId)) continue;
    seen.add(app.titleId);
    games.push({
      titleId: app.titleId,
      productId: app.oneStoreProductId ?? null,
      name: app.name ?? 'Jeu',
      tile: null,
      background: null,
      lastPlayed: app.lastActiveTime ? Date.parse(app.lastActiveTime) : 0,
      publisher: null,
      genre: null,
      description: null,
      achievements: null,
    });
  }

  // Dernière partie et succès : historique Xbox (titlehub), puisque « lastActiveTime » n'est plus renvoyé.
  const [history] = await Promise.all([getTitleHistory().catch(() => new Map<number, TitleHistory>()), addCatalogInfo(games)]);
  for (const game of games) {
    const entry = history.get(game.titleId);
    game.lastPlayed = entry?.lastPlayed ?? game.lastPlayed;
    game.achievements = entry?.achievements ?? null;
  }

  // Plus récemment joué d'abord ; sans date de partie, par ordre alphabétique.
  return games.sort((a, b) => b.lastPlayed - a.lastPlayed || a.name.localeCompare(b.name));
}

export function launchGame(consoleId: string, productId: string) {
  return sendCommand(consoleId, 'Shell', 'ActivateApplicationWithOneStoreProductId', [{ oneStoreProductId: productId }]);
}

// Visuels, éditeur, genre et description du catalogue Store, par paquets de 20 identifiants.
async function addCatalogInfo(games: InstalledGame[]) {
  const withId = games.filter((g) => g.productId);

  for (let i = 0; i < withId.length; i += 20) {
    const batch = withId.slice(i, i + 20);
    const ids = batch.map((g) => g.productId).join(',');
    const res = await fetch(`https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${ids}&market=US&languages=en-US`);
    if (!res.ok) continue; // sans visuels, le jeu reste affiché avec son nom

    const body = await res.json();
    for (const product of body.Products ?? []) {
      const game = batch.find((g) => g.productId?.toUpperCase() === String(product.ProductId).toUpperCase());
      const localized = product.LocalizedProperties?.[0] ?? {};
      const images: { ImagePurpose: string; Uri: string }[] = localized.Images ?? [];
      if (!game) continue;
      game.tile = image(images, 'TitledHeroArt', 480) ?? image(images, 'BoxArt', 480);
      game.background = image(images, 'SuperHeroArt', 1920) ?? image(images, 'TitledHeroArt', 1920);
      // Ex. Hell is Us : « Nacon · Action & adventure » (vérifié le 2026-09-26).
      game.publisher = localized.PublisherName || null;
      game.genre = product.Properties?.Category || null;
      game.description = (localized.ShortDescription || localized.ProductDescription || '').trim() || null;
    }
  }
}

// Les adresses du Store commencent par « // » ; « ?w= » demande une image réduite (700 Ko → 53 Ko en 480 px).
function image(images: { ImagePurpose: string; Uri: string }[], purpose: string, width: number) {
  const found = images.find((i) => i.ImagePurpose === purpose);
  return found ? `https:${found.Uri}?w=${width}` : null;
}
