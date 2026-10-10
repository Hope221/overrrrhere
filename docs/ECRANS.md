# Les écrans

Chaque écran correspond à un fichier dans `design/ecrans/`. Ces fichiers sont des maquettes HTML : ils ne s'exécutent pas seuls, mais leur code contient toutes les mesures, couleurs et textes exacts. Les images y sont référencées par des adresses `/_blob/…` : voir la correspondance dans `design/LISEZMOI.md`.

Taille : 852 × 393 pt (paysage). Toute l'app se navigue à la manette ; le toucher fonctionne aussi.

---

## 0. Démarrage

### Splash — `Splash.dc.html`
Icône orange + mot-symbole centrés sur `#0A0A0C`. Les yeux de la mascotte regardent sur le côté puis reviennent ; les « r » pulsent. Respecter « Reduce motion ».

### Welcome — `Welcome.dc.html`
Gauche : logo, titre « Your games, over here. » (« here » en orange), texte « Play your Xbox games and your retro games on your iPhone, with your controller. », bouton « Get started » (glyphe A noir), et à côté « Xbox Series X|S · Xbox One · Your own ROMs ». Droite : panneau orange, photo de la manette (`assets/images/manette.png`) qui flotte doucement, avec l'image d'un jeu dans l'écran du téléphone.
**Manette :** A → Before you start (déjà connecté : Choose your console).

## 1. Premier lancement

Fond des écrans après Welcome (Before you start, Sign in, Consoles, Add your games) : `assets/images/onboarding-fond.jpg`, scène du matin floutée et claire, voile plus sombre en haut et en bas ; cartes en panneaux sombres translucides (maquette « Premiers pas : Xbox et jeux » du 08/10/2026 : https://claude.ai/artifact/BVFefyUSmVjGcX4GWrYapy).

### Before you start — `BeforeYouStartScreen.tsx` (maquette « Premiers pas : Xbox et jeux » du 08/10/2026 : https://claude.ai/artifact/BVFefyUSmVjGcX4GWrYapy)
Titre « Before you start », « On your Xbox ». Trois cartes numérotées : Remote features on (Settings › Devices & connections), Power mode: Sleep (Settings › General › Power options), Same Wi-Fi (Your Xbox and this iPhone).
**Manette :** A Continue → Sign in ; B Back → Welcome.

### Sign in — `SignIn.dc.html`
« Connect your Xbox », bouton « Sign in with Microsoft ». Deux notes : la connexion reste sur l'iPhone ; la page Microsoft se fait au toucher.
**Manette :** A → ouvre la connexion Microsoft.

### Choose your console — `Consoles.dc.html`
Carte de la console (nom, état « Ready · Asleep »), aide si la console n'apparaît pas (activer les fonctionnalités à distance).
**Manette :** A Continue → Add your games ; B Back → Sign in.

### Add your games — `AddGamesScreen.tsx` (maquette « Premiers pas : Xbox et jeux » du 08/10/2026 : https://claude.ai/artifact/BVFefyUSmVjGcX4GWrYapy)
Dernière étape, avec ou sans Xbox (« Continue without Xbox » y mène aussi). « Add your games », « Your own ROMs · No games included ». Deux grandes tuiles : ROM folder (iCloud Drive · All your games) et ROM files (Files app). Sautée s'il y a déjà des jeux.
**Manette :** gauche / droite = choix ; A ouvre le dossier iCloud ou Fichiers ; B Later → Home.

## 2. Usage principal

### Home — `Main.dc.html`
- Barre du haut : logo, photo de profil + gamertag, puce console (point vert + nom), icône manette, batterie, heure.
- Fond plein écran : l'image du jeu sélectionné, assombrie à gauche et en bas.
- Rangée de tuiles alignée à gauche, qui **défile** pour garder la tuile sélectionnée visible : jeux épinglés (Xbox et rétro, les rétro avec l'étiquette du système), puis « Console home » (stream sans lancer de jeu), « Retro » (bibliothèque rétro), « All games ».
- Sous la rangée : titre, ligne d'infos (« Last played yesterday · 14 h played »), bouton Play (« Continue » pour un jeu rétro avec sauvegarde auto) et, sur un jeu, bouton secondaire « Details » avec le glyphe View.
- Dégradé du haut renforcé pour la lisibilité sur les images claires.
- Premier lancement uniquement : notice « Your home is ready » (jeux récents épinglés automatiquement).
**Manette :** gauche / droite = tuile ; A = Play / Continue / Stream / Open ; View = Details ; Menu = menu rapide.

### Game details — `GameDetails.dc.html`
Image du jeu plein écran assombrie à gauche, petite tuile, titre, « éditeur · genre · Installed on your Xbox », description courte, Last played, Played here, Achievements (X of Y, gamerscore, barre). Chaque bloc est masqué si la donnée manque.
**Manette :** A Play ; Y Pin / Unpin from home ; X Edit tile ; B Back.

### Launch — `Launch.dc.html`
Image du jeu plein écran. En haut à droite : vérifications (Wi-Fi, batterie, manette). En bas à gauche : titre, « Starting on Xbox Series X », trois étapes (Console awake → Launching the game on your console → Connecting the stream).
**Manette :** B Cancel → Home.

### Stream (menu ouvert) — `Stream.dc.html`
Le jeu en plein écran. Panneau à gauche : titre, « Xbox Series X · 42 min · Battery 64% », puis Resume, Switch game, Touch controls (Auto / On / Off), Back to launcher, Put Xbox to sleep. Note : « Game keeps running » (rétro : « Game paused »).
Variante : pilule « Battery at 20% · Plug in to keep playing » en haut à droite.
**Manette :** View + Menu = ouvrir ; haut / bas + A ; B = reprendre.

## 3. Problèmes

### Launch problem — `LaunchIssue.dc.html` (4 variantes)
- **No Wi-Fi** : A Go back ; X Play anyway
- **Console offline** : A Try again ; B Go back
- **Signed out** : A Sign in with Microsoft
- **Stream dropped** : A Reconnect ; B Back to launcher

### No controller — `NoController.dc.html`
Illustration téléphone + manette, point vert qui pulse, « Connect your controller », lien « Play with touch controls ».

## 4. Menus

### Quick menu — `Menu.dc.html`
Panneau à gauche sur l'accueil flouté : Home, Manage tiles, Settings, Controller, Put Xbox to sleep.
**Manette :** haut / bas ; A ; B Close.

### Settings — `Settings.dc.html` (7 sections)
- **Controller** : nom et état de la manette, Phone vibration, Touch controls (Auto / Always / Off), Touch controls opacity (Low / Medium / High), Test buttons
- **Xbox & Remote Play** : console + Change, Check Wi-Fi before playing, Put Xbox to sleep when I quit, Sign out of Microsoft
- **Retro** : pilule « Manage ROMs » à droite du titre (maquette du 29/09) ; Auto-save when I quit, Screen (Sharp / Smooth / CRT), Picture size (Original / Fill screen), Internal resolution (1× / 2× / 3×, sous-titre « Wii, GameCube, 3DS up to 2× · Uses more battery » ; la liste défile pour suivre la ligne choisie), DS screen layout (Side by side / Stacked / Focus : disposition avec la manette, DS et 3DS ; avec les contrôles tactiles, toujours Stacked), ROM folder
- **Appearance** : Focus color (blanc / vert / orange), Game art in the background, Reduce motion, 24-hour clock
- **Tiles** : Auto-pin recently played games, Show play time on home, Show the Console home tile, Manage pinned games
- **Sound** : Interface sounds, Chime when your game is ready, Volume (Low / Medium / High)
- **About** : logo, « Version 1.0 · Free and open source », Show the welcome again, Open-source licenses, Privacy & support (lien vers le site, affiché dès qu'il existe), Reset overrrrhere (« Erases everything on this iPhone » ; confirmation, Cancel par défaut ; efface réglages, épinglages, temps joué, connexion Microsoft, jeux rétro et leurs sauvegardes, lien du dossier iCloud — jamais le dossier lui-même —, puis retour au Welcome, décision du 09/10/2026) ; en bas : « Not affiliated with Microsoft. Xbox is a trademark of Microsoft. No games included. » (maquette « About et licences » du 08/10/2026 : https://claude.ai/artifact/PEGFGPpidWvLebc1J3wa5g)

### Open-source licenses — `LicensesScreen.tsx` (maquette « About et licences »)
Liste groupée à gauche (This app, Emulators, Components) ; à droite : nom, système ou rôle, pastille de licence, adresse du code, bouton « Read the full license ». A ouvre le texte complet (haut / bas ou stick droit pour défiler) ; B revient à la liste, puis à Settings › About. Textes dans `src/licenseTexts.ts` (généré).
**Manette :** colonne de gauche = sections ; droite = réglages ; A = activer ; B = retour.

### Test buttons — `ControllerTest.dc.html`
Schéma de la manette ; chaque bouton pressé s'allume ; « Last pressed ». Maintenir B pour sortir.

## 5. Bibliothèque

### All games — `Library.dc.html`
Grille 4 colonnes des jeux installés, coche blanche sur les jeux épinglés. Sous la grille : nom + « Pinned to home · Position 1 ».
**Manette :** A Play ; Y Pin / Unpin ; X Edit tile ; B Back.

### Edit tile — `TileEditor.dc.html`
Fenêtre : aperçu de la tuile et du fond ; Tile image, Background image (depuis Photos), Position on home, Reset to Xbox art.
**Manette :** A Save ; B Cancel.

## 6. Rétro

### Retro library — `RetroLibrary.dc.html`
Grille comme All games, jaquettes pixel avec étiquette du système. Filtres par système (seulement ceux présents) avec LB / RB. Tuile « Add a ROM ». Fond : jaquette du jeu sélectionné, floutée. **Vide** (maquette « Premiers pas : Xbox et jeux » du 08/10/2026 : https://claude.ai/artifact/BVFefyUSmVjGcX4GWrYapy) : fond anthracite #141418 avec lumière douce du haut, « No games yet », les deux tuiles ROM folder / ROM files d'Add your games, pas de pilule « Add a ROM ».
**Manette :** A Play / Continue ; View Details ; Y Pin ; X Edit tile ; B Back. Sur « Add a ROM » : A Open Files ; B Back.

### Add a ROM — `RomImport.dc.html` (3 versions)
- **Un fichier** : jaquette trouvée automatiquement, fichier + taille, système détecté (vert), nom (« Edit with touch »), jaquette modifiable depuis Photos. A Add to library ; B Cancel.
- **Plusieurs fichiers** : « 12 files imported · 11 ready · 1 not supported », liste, A « Add 11 games » ; B Cancel.
- **Non pris en charge** : « This file isn't supported » + extensions acceptées. A Choose another file ; B Cancel.

### Dossier iCloud — `DossierICloud.html` (validée le 27/09/2026)
- **Settings › Retro › ROM folder** : choisir une fois un dossier d'iCloud Drive (valeur = nom du dossier + nuage + chevron), résumé « N games · M on this iPhone · taille ».
- **Retro library** : sous-titre « N games · M on this iPhone », note nuage + nom du dossier. Les jeux pas encore sur l'iPhone ont un petit nuage sur leur tuile (décalé à gauche de la coche si épinglé).
- **Lancer un jeu du nuage** (Library, Details ou Home) : voile « Downloading » avec barre, puis le jeu démarre tout seul. B Cancel.
- **Retro game details** : sous-titre iCloud ; « Remove download » (contour `rgba(255,255,255,0.35)`, sans confirmation) remplace Delete : le jeu reste dans le dossier, seule la copie sur l'iPhone part.
- Sauvegardes : sur l'iPhone **et** copiées dans le sous-dossier « overrrrhere saves » du dossier choisi.

### Retro game details — `RetroDetails.dc.html`
Système, taille, Last played, Played here, sauvegardes en vignettes (Auto-save, Slot 1, Slot 2). Bouton principal « Continue » ou « Load Slot N ». Delete avec confirmation.
**Manette :** A ; Y Pin / Unpin ; X Edit tile ; B Back.

### Retro in-game menu — `RetroPlay.dc.html`
Jeu en 4:3 au centre, **en pause**. Panneau : Resume, Save state (prochain emplacement), Load state (liste dans le panneau), Fast forward, Touch controls, Back to launcher. Emplacements pleins : « All slots are full · Choose a slot to replace », Cancel par défaut. Notice « Saved to Slot 3 » / « Loaded Slot 1 ».
**Manette :** View + Menu = ouvrir ; B = reprendre / retour.

### Nintendo DS — `DSSideBySide.dc.html`, `DSStacked.dc.html`, `DSFocus.dc.html`
Deux écrans 4:3 sur fond `#050507`, coins arrondis, ombre. L'écran tactile (celui du bas de la DS) a un fin contour `rgba(255,255,255,0.35)` et une étiquette « Touch » en haut à droite (sauf en empilés) ; il reçoit le doigt directement.
- **Côte à côte** (par défaut avec la manette) : 364 × 273 à y = 60, en x = 56 et x = 432, écran tactile à droite. Rappels sous les écrans : « View + Menu · Game menu », « Right stick click · Swap screens ».
- **Empilés** (par défaut sans manette) : 248 × 186 centrés (x = 302), à y = 8 et y = 200, contrôles tactiles sur les bandes latérales (L, R, croix, X Y A B, Select, Start), pastille du menu à gauche, à côté de L.
- **Focus** (au choix dans le menu) : grand écran 480 × 360 (x = 56, y = 16), petit écran 240 × 180 (x = 556, y = 16), bouton « Swap screens » (RS) en dessous.
- Boutons : logique Nintendo (A à droite, B en bas, X en haut, Y à gauche), la manette physique suit la position.
- Brancher ou débrancher la manette revient à la disposition par défaut. Vignettes de sauvegarde : écran du haut seulement.
**Manette :** RS (clic du stick droit) = échanger les écrans ; View + Menu = menu du jeu.

### DS options — `DSMenu.dc.html`
Ligne « DS options › » dans le menu du jeu DS (entre Load state et Fast forward), qui ouvre : Screen layout (Side by side / Stacked / Focus), Swap screens (« Right stick click »), Blow into the microphone (« For games that ask you to blow. Hold A here. » : le jeu reprend tant que A est tenu, avec un son de souffle intégré), Close the lid (interrupteur).
**Manette :** haut / bas ; A Select ; B Back.

### Nintendo 3DS — `3DS.html`
Même logique que la DS, mais les deux écrans n'ont pas la même largeur : haut 400 × 240, bas 320 × 240 (écran tactile, contour et étiquette « Touch » comme en DS).
- **Côte à côte** (par défaut avec la manette) : taille réelle, haut en x = 60, bas en x = 472, à y = 64 ; échangés : bas en x = 60, haut en x = 392. Rappels sous les écrans comme en DS.
- **Empilés** (par défaut sans manette) : haut 310 × 186 (x = 271, y = 8) au-dessus du bas 248 × 186 (x = 302, y = 200). Contrôles tactiles : à gauche L, ZL, Circle Pad, croix, Select ; à droite R, ZR, A B X Y en losange, stick C (petit, en bas à droite), Start. Pastille du menu à gauche, comme en DS.
- **Focus** (au choix dans le menu) : grand écran 540 × 324 (x = 56, y = 16), petit écran à droite (x = 608), bouton « Swap screens » (RS) en dessous.
- **Focus avec les contrôles tactiles** — `ThreeDSFocus.dc.html` (appliqué le 06/10/2026) : grand écran 430 × 258 en haut au centre (x = 211, y = 10), petit écran 120 × 90 dessous (x = 366, y = 278) avec contour clair et pastille « Enlarge » : le toucher l'agrandit (écran tactile en grand : 344 × 258, x = 254 ; haut en petit : 150 × 90, x = 351). Pas de bouton Swap. L'écran tactile ne reçoit le doigt que lorsqu'il est le grand. Boutons autour : L, ZL, Circle Pad, croix, Select à gauche ; R, ZR, A B X Y, petit stick C, Start à droite ; pastille du menu en bas à gauche.
- Boutons : position Nintendo comme en DS ; LT / RT = ZL / ZR, stick gauche = Circle Pad, stick droit = stick C.
- Vignettes de sauvegarde : écran du haut seulement.
**Manette :** RS = échanger les écrans ; View + Menu = menu du jeu.

### 3DS options — `3DS.html` (section 4)
Ligne « 3DS options › » dans le menu du jeu 3DS (même place que « DS options »), qui ouvre seulement Screen layout (Side by side / Stacked / Focus) et Swap screens. Pas de micro ni de couvercle (décision du 26/09/2026 : très peu de jeux 3DS s'en servent). Depuis le 06/10/2026 : ligne **Resolution** (1× / 2× seulement : Super Street Fighter IV trop lent en 3×), « Applies next time you start the game », notification « Resolution 2× from the next start ».
**Manette :** haut / bas ; A Select ; B Back.

### GameCube — `GameCube.html`
Une seule image (Dolphin garde lui-même le format du jeu, bandes noires sur les côtés). Avec la manette et Settings › Retro › Picture size sur **Fill screen** (depuis le 06/10/2026, GameCube et Wii) : l'image remplit tout l'écran grâce au « widescreen hack » de Dolphin (la scène 3D est élargie, pas déformée ; les menus 2D du jeu restent étirés). Menu du jeu identique aux autres consoles, **sans Fast forward** (sans JIT, la GameCube tient tout juste sa vitesse normale). Vignettes des sauvegardes : l'image du jeu au moment où le menu s'ouvre (pas pour la sauvegarde auto faite en quittant l'app).
- **Resolution** (maquette du 06/10/2026, GameCube et Wii) : ligne du menu principal, « 1× · Default » tant que le jeu suit Settings › Retro, A = suivante (1× → 2× → 3×), changement **immédiat**, gardé pour ce jeu ; phrase en bas du panneau quand la ligne est choisie. Dès 2×, l'image est lissée (même en Sharp). Essais du 06/10 en 3× : jeux Wii et Harry Potter à 60 images/s.
- Boutons par la **lettre** (A = A, B = B, X = X, Y = Y), RB = Z, LT / RT = L / R analogiques, stick droit = stick C, Menu = Start.
- **Contrôles tactiles** : image 480 × 360 à 16 pt du haut (comme la SNES). À gauche L, stick principal (104 pt), petite croix (84 pt) ; à droite R, Z sous R, A plus grand (54 pt) avec Y au-dessus, X à droite, B en bas à gauche, stick C (56 pt) sous les boutons, Start. Pastille au centre en haut. L et R au doigt = enfoncés à fond.
**Manette :** View + Menu = menu du jeu.

### Wii — `WiiPlay.dc.html`, `WiiMenu.dc.html`, `WiiControls.dc.html` (mise à jour du 05/10/2026)
Même moteur que la GameCube, sans JIT, sans Fast forward. Le curseur est **dessiné par le jeu**, pas par l'app.
- **Profils de commandes** : Remote + Nunchuk (défaut), Sideways Remote, Classic Controller, GameCube Controller. Choisi automatiquement d'après l'identifiant du jeu (petite liste faite à la main, `src/retro/wii.ts`), puis gardé **par jeu** s'il est changé.
- **Pointeur** (profils Nunchuk et Sideways) : Right stick (Slow / Medium / Fast, avec accélération), Gyro + right stick, Touch. Clic du stick droit = recentrer.
- **Notices en jeu** (disparaissent seules) : First launch, Controls chosen, Pointer mode shown, Pointer off screen (barre lumineuse sur le bord), Recentered (cercle qui pulse au centre).
- **Wii options** : ligne « Wii options › » du menu du jeu (même place que « DS options ») ; panneau de 340 pt : Controller (« · Auto » tant que rien n'est changé), Pointer (« Not used » pour Classic et GameCube), Pointer speed, Recenter pointer, See all controls ; phrase d'explication en bas.
- **Wii controls** : plein écran, image du jeu floue derrière, 4 onglets (Nunchuk, Sideways, Classic, GameCube).
- **Contrôles tactiles** : maquette « Wii · contrôles tactiles » validée le 06/10/2026 (canevas https://claude.ai/artifact/6n2WZMsXumTDvSk88TgtUa) : une disposition par profil, image 480 × 270 au centre, pas de bouton Home. Remote + Nunchuk : Z, C, stick Nunchuk, croix à gauche ; B, SHAKE, A, − +, 1, 2 à droite. Sideways : grande croix à gauche ; SHAKE, 1, 2, − + à droite. Classic : L, ZL, croix, stick gauche, − à gauche ; R, ZR, x y a b, stick droit, + à droite. GameCube : comme la GameCube. Profils à pointeur : **toucher l'image vise**, quel que soit le réglage Pointer.
**Manette :** Wii options : haut / bas, A Change, croix gauche / droite sur Pointer speed, B Back. Wii controls : LB / RB changent d'onglet, B Back.

## 7. Contrôles tactiles (sans manette)

### Stream — `TouchStream.dc.html`
Disposition Xbox complète sur le stream : stick gauche et croix à gauche, A B X Y et stick droit à droite, LB LT / RB RT en haut, View et Menu en bas au centre. Pastille avec le logo en haut au centre = menu de l'app. Opacité 50 / 80 / 100 %.

### Rétro — `TouchRetro.dc.html`
Disposition SNES (croix, A B X Y, L R, Select, Start) sur les bandes latérales ; l'image du jeu rétrécit un peu pour ne pas être couverte. Les autres systèmes n'affichent que leurs boutons. PSP : `TouchPSP.dc.html` ; DS : `DSStacked.dc.html` (voir Nintendo DS) ; 3DS : voir Nintendo 3DS ; GameCube : `GameCube.html`.

## 8. Marque — `Brand.dc.html`
Icône, variantes, tailles, mot-symbole, couleurs. Référence visuelle uniquement.
