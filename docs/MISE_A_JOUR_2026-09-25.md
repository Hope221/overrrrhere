# Mise à jour du 25 septembre 2026

Tout ce qui a changé dans le design depuis le dossier de départ. Certaines de ces modifications ont peut-être déjà été faites (Elhadji a pu envoyer des messages séparés). **Commence par vérifier le code**, fais la liste de ce qui est déjà fait et de ce qui reste, puis applique le reste dans l'ordre ci-dessous, un lot à la fois, avec un test sur l'iPhone à la fin de chaque lot.

Maquettes à jour : `design/ecrans/`. Référence de chaque écran : `docs/ECRANS.md`.

---

## Lot 1 — Petites corrections (faible risque)

1. **Accueil — ligne d'infos** : retirer « Installed on your Xbox ». Garder « Last played … · … h played ». (La mention reste dans All games et Game details.)
2. **Accueil — dégradé du haut** : 96 pt de haut, de `rgba(8,8,10,0.72)` en haut à `0.42` à 45 %, puis transparent. Pour que la barre du haut reste lisible sur les images claires.
3. **Welcome — texte** :
   - Titre : « Your games, » / « over here. » (« here » en orange `#FF5A1F`)
   - Texte : « Play your Xbox games and your retro games on your iPhone, with your controller. »
   - À côté du bouton (largeur max 200 pt, sur deux lignes) : « Works with Xbox Series X|S, Xbox One and your own ROMs »
   - Glyphe A du bouton « Get started » : noir `#0A0A0C` avec lettre blanche, comme partout.
4. **Settings > About — Reset** : fenêtre de confirmation « Reset overrrrhere? », texte « This erases your pinned games, play time and settings on this iPhone. Your Xbox and your games are not affected. », **Cancel sélectionné par défaut**, Reset en contour rouge.
5. **No controller** : le lien devient « Play with touch controls ».

## Lot 2 — Page Game details (Xbox)

6. **Accueil** : quand une tuile de **jeu** est sélectionnée (pas Console home, Retro ni All games), afficher un bouton secondaire **« Details » avec le glyphe View (⧉)**, à côté de Play. Le bouton **View** de la manette l'ouvre.
7. **Page Game details** (`GameDetails.dc.html`) : image du jeu plein écran assombrie à gauche, petite tuile, titre, « éditeur · genre · Installed on your Xbox », courte description, puis trois infos : Last played, Played here (notre temps suivi), Achievements (X of Y, gamerscore, barre de progression). Boutons : A Play, Y Pin / Unpin from home, X Edit tile, B Back.
   - Description, éditeur, genre et succès viennent des mêmes services Xbox que la liste des jeux. **Si une donnée manque, masquer son bloc** au lieu d'afficher du vide.

## Lot 3 — Contrôles tactiles

8. Afficher les contrôles tactiles **automatiquement** quand aucune manette n'est connectée ; les masquer dès qu'une manette se connecte.
9. **Stream Xbox** (`TouchStream.dc.html`) : disposition Xbox complète (sticks, croix, A B X Y, LB LT RB RT, View, Menu), qui envoie **les mêmes signaux que la manette physique**. Multi-touch, petite vibration à chaque appui.
10. **Pastille avec le logo en haut au centre** : ouvre notre menu du stream / rétro (View + Menu est impossible sans manette).
11. **Menus du stream et du rétro** : ligne « Touch controls » qui alterne Auto / On / Off.
12. **Settings > Controller** : « Touch controls » (Auto / Always / Off) et « Touch controls opacity » (Low 50 % / Medium 80 % / High 100 %).

## Lot 4 — Émulation rétro (risque élevé : commencer par un prototype)

**Étape 4a — Prototype, avant tout écran :** jouer **une seule ROM SNES** dans l'app avec un core libretro : image, son, et notre module manette existant. Écran de test minimal qui ouvre une ROM depuis Fichiers. **Si ça échoue, s'arrêter et expliquer.** Avant de choisir le core, présenter sa licence à Elhadji.

Ensuite seulement :

13. **Import** (`RomImport.dc.html`, 3 versions) :
    - Sélection de **plusieurs fichiers** à la fois. Un fichier : écran de confirmation (jaquette trouvée automatiquement, système détecté, nom « Edit with touch », taille). Plusieurs : résumé « N ready · N not supported », liste, un seul bouton « Add N games ».
    - Fichier non reconnu : écran « This file isn't supported » avec les extensions acceptées (.nes, .sfc, .smc, .gb, .gbc, .gba, .md, .bin).
14. **Bibliothèque Retro** (`RetroLibrary.dc.html`) : grille comme All games ; filtres par système avec LB / RB, **uniquement pour les systèmes présents** ; tuile « Add a ROM » (sur cette tuile, seulement A Open Files et B Back) ; état vide « No games yet ». Sur un jeu : A Play / Continue, View Details, Y Pin, X Edit tile, B Back.
15. **Accueil** : tuile « Retro » (icône cartouche) entre Console home et All games ; les jeux rétro épinglés apparaissent avec l'étiquette du système ; A = « **Continue** » s'il existe une sauvegarde auto, sinon « Play ». La rangée de tuiles **défile** pour garder la tuile sélectionnée visible.
16. **Détails rétro** (`RetroDetails.dc.html`) : système, taille, Last played, Played here, **sauvegardes** en vignettes (Auto-save + 3 emplacements). Le bouton principal devient « Load Slot N » si un emplacement est sélectionné. **Delete** avec confirmation (Cancel par défaut).
17. **Menu en jeu** (`RetroPlay.dc.html`, ouvert avec View + Menu ; **le jeu est en pause**) : Resume, Save state, Load state (**liste dans le panneau**, sans quitter le jeu), Fast forward, Touch controls, Back to launcher. Emplacements pleins : « All slots are full · Choose a slot to replace », Cancel par défaut.
18. **Contrôles tactiles rétro** (`TouchRetro.dc.html`) : disposition selon le système (SNES montré ; NES, GB, GBA, Mega Drive avec moins de boutons). L'image du jeu **rétrécit** pour laisser les bandes latérales aux boutons.
19. **Settings > Retro** : Auto-save when I quit, Screen (Sharp / Smooth / CRT), Picture size (Original / Fill screen), Manage ROMs.
20. Plus tard, une fois tout le reste validé : N64, PS1, PSP, DS.
