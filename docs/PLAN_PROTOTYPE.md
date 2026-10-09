# Plan du prototype

Principe : on teste d'abord ce qui peut faire échouer le projet. Les écrans viennent après. Chaque étape se termine par un test sur l'iPhone d'Elhadji, avec un critère clair de réussite.

---

## Étape 0 — Mise en place

- Créer le projet Expo (TypeScript) dans ce dossier.
- Verrouiller l'orientation en **paysage**.
- Configurer EAS et faire un premier **development build** iOS, installé sur l'iPhone.
- Mettre l'icône et le splash de `assets/brand/`.

**Réussi si :** l'app s'ouvre sur l'iPhone, en paysage, avec l'icône orange.

---

## Étape 1 — La manette (risque moyen)

- Module natif Swift local (Expo Modules API) avec le framework `GameController`.
- Détecter la connexion / déconnexion de la manette et envoyer chaque bouton (A, B, X, Y, croix, sticks, gâchettes, Menu, View) au JavaScript.
- Écran de test minimal : affiche le dernier bouton pressé.

**Réussi si :** chaque bouton de la manette s'affiche à l'écran, et brancher / débrancher la manette est détecté.
**Si ça échoue :** s'arrêter et expliquer. Tout le reste en dépend.

---

## Étape 2 — Connexion Microsoft (risque élevé, non officiel)

- Connexion Microsoft dans l'app (page Microsoft, au toucher), récupération des jetons Xbox Live.
- Stocker les jetons dans `expo-secure-store`, gérer leur renouvellement.
- Afficher le gamertag et la photo de profil.

**Réussi si :** après connexion, le gamertag d'Elhadji s'affiche, et il reste connecté après avoir relancé l'app.
**Référence :** mécanisme de connexion de Greenlight (il a changé récemment : vérifier la version actuelle).

---

## Étape 3 — Consoles (risque élevé)

- Lister les consoles du compte, avec leur nom et leur état (allumée, en veille, hors ligne).

**Réussi si :** « Xbox Series X » (ou le nom de sa console) s'affiche avec le bon état.
**Prérequis console :** Paramètres > Appareils et connexions > Fonctionnalités à distance activées ; mode d'alimentation « Veille ».

---

## Étape 4 — Le stream natif (LE test décisif)

- Ouvrir un stream de l'**accueil de la console** dans l'app, en WebRTC natif, d'après xbox-xcloud-player.
- Envoyer les entrées de la manette (étape 1) vers le stream.
- Garder l'écran allumé pendant le stream (`expo-keep-awake`).
- Réserver la combinaison **View + Menu** pour l'app : elle ne doit pas être transmise au jeu.

**Réussi si :** l'accueil de la Xbox s'affiche sur l'iPhone, en Wi-Fi à la maison, et Elhadji navigue dedans avec la manette, avec un délai acceptable.
**Si ça échoue :** c'est le moment de décider avec Elhadji (réessayer, ou revenir à l'option A : lecteur web).

---

## Étape 5 — Jeux installés et lancement

- Lister les jeux installés sur la console, avec leurs visuels.
- Lancer un jeu précis à distance, puis ouvrir le stream.

**Réussi si :** choisir A Plague Tale: Requiem dans l'app le lance sur la Xbox et l'affiche en stream.
**Si le lancement à distance échoue :** le stream s'ouvre sur l'accueil de la console, et on choisit le jeu à la manette. L'app reste utilisable.

---

## Étape 6 — Réveil et mise en veille

- Réveiller la console avant un lancement si elle est en veille.
- « Put Xbox to sleep » depuis le menu du stream et le menu rapide.

**Réussi si :** la console s'allume et s'éteint depuis l'iPhone.

---

## Après le prototype : construire les écrans

Seulement quand les étapes 1 à 5 marchent. Ordre conseillé :

1. Système de navigation au focus (manette) commun à tous les écrans
2. Home → Launch → Stream (le cœur de l'usage)
3. Menu rapide → Settings → Test des boutons
4. All games → Edit tile
5. Premier lancement : Splash → Welcome → Sign in → Choose console
6. États d'erreur : No controller, Launch problem (No Wi-Fi, Console offline, Signed out, Stream dropped)
7. Temps de jeu, vérifications avant lancement, alerte batterie à 20 %, carillon « jeu prêt »

Référence de chaque écran : `docs/ECRANS.md`.
