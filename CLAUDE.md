# overrrrhere — brief du projet

## Qui tu aides

Elhadji, **débutant complet** en développement mobile. Il travaille sur **Windows** avec un **iPhone**. Il a déjà publié une app iOS avec **Expo** (builds iOS dans le cloud avec EAS, puisqu'il n'a pas de Mac).

Règles de collaboration :
- Réponds **en français**, simplement, sans jargon non expliqué.
- Avance **une étape à la fois**. Explique ce que tu vas faire et pourquoi **avant** de le faire.
- Demande la permission avant d'installer un paquet, de lancer un build EAS ou de supprimer quoi que ce soit.
- À la fin de chaque étape, dis-lui exactement quoi tester sur son iPhone et à quoi ressemble « ça marche ».
- N'ajoute **aucune fonctionnalité** absente du design (`design/ecrans/`). Si une idée te semble utile, propose-la d'abord.

## L'app

**overrrrhere** transforme l'iPhone clipsé dans une manette mobile en console Xbox portable. On choisit un jeu installé sur **sa propre Xbox**, on appuie sur A : l'app lance le jeu sur la console et affiche le stream **dans l'app**, sans navigateur. Toute l'interface se navigue à la manette.

Depuis le 25 septembre 2026, l'app fait aussi :
- **Émulation rétro** : Elhadji importe ses propres fichiers ROM depuis l'app Fichiers et y joue dans l'app. Depuis le 27 septembre 2026, il peut aussi choisir une fois un **dossier iCloud Drive** (Settings › Retro › ROM folder) : tous ses jeux y apparaissent, chacun téléchargé seulement pour y jouer.
- **Contrôles tactiles** : quand aucune manette n'est connectée, des boutons à l'écran remplacent la manette, pour le stream Xbox comme pour le rétro.

- **L'app est construite et fonctionne sur l'iPhone d'Elhadji.** Les nouveautés s'ajoutent au code existant, sans tout refaire.

- **Publication sur l'App Store, gratuite** (décision d'Elhadji, 08/10/2026), Xbox compris. Pas de vente, pas d'achat intégré, pas de publicité. Les dons (Buy me a coffee) se font uniquement sur le site de l'app, sans bouton ni lien de paiement dans l'app. En attendant la publication, Elhadji continue d'installer l'app sur son iPhone avec ses builds EAS.
- Le design est **terminé et approuvé**. Il fait foi.

## Décisions verrouillées

| Sujet | Décision |
|---|---|
| Framework | Expo (React Native), **development build** — pas Expo Go (code natif requis) |
| Plateforme | iOS uniquement, **paysage uniquement** |
| Publication | App Store, gratuite (décision du 08/10/2026). Apps comparables déjà acceptées par Apple : OneCast et XBPlay pour la Xbox, Delta pour l'émulation (règle 4.7). La fiche dit « for Xbox » et « Not affiliated with Microsoft ». Le code est publié en open source, ce qu'exige la licence GPL de plusieurs cœurs ; le code d'Elhadji est sous **GPL v3** (décision du 08/10/2026). **Sécurité d'abord** : rien de ce qui est publié sur GitHub (code, historique, réglages des dépôts) ne doit pouvoir exposer les utilisateurs ou Elhadji (aucun secret, jeton ou donnée personnelle) ; vérifier avant chaque publication. Il faut une politique de confidentialité et une page d'aide sur le site. |
| Streaming | **Option B : stream natif** (WebRTC), en s'inspirant de Greenlight / xbox-xcloud-player. **Pas** le lecteur web xbox.com caché dans une WebView. |
| Manette | Module natif Swift maison (Expo Modules API + framework `GameController` d'Apple) |
| Données | Tout reste sur le téléphone. Jetons Microsoft dans le stockage sécurisé (`expo-secure-store`). Pas de backend. Seule exception : les sauvegardes des jeux du dossier iCloud sont aussi copiées dans ce dossier (sous-dossier « overrrrhere saves »), qui appartient à Elhadji. |
| Émulation rétro | Cores **libretro** intégrés en natif. L'app ne fournit et ne télécharge **jamais** de ROM venue d'ailleurs : l'utilisateur importe ses propres fichiers depuis Fichiers, ou les laisse dans **son** dossier iCloud Drive, d'où l'app les télécharge à la demande (maquette « Dossier iCloud », validée le 27/09/2026). Vérifier la **licence** de chaque core avant de l'utiliser (certains interdisent l'usage commercial : acceptable tant que l'app reste gratuite ; à signaler si ça change). |
| Systèmes rétro | Faits : NES, SNES, Game Boy / Color, GBA, Mega Drive, N64, PSP, DS, 3DS, GameCube et Wii (sans JIT). PS1 : abandonnée (décision d'Elhadji, 06/10/2026). GameCube : expérimental, **sans JIT uniquement**, cœur Dolphin d'iCube compilé sur un Mac dans le cloud. Vitesse sur iPhone 16 Pro Max (build 26, 27/09/2026) : Harry Potter et la Chambre des secrets 60 images/s, Batman Begins ~30 images/s, Le Retour du Roi fluide en jeu mais **cinématiques encore ralenties** (jugé correct pour l'instant, autres essais plus tard). Réglages retenus : double cœur + GPU synchronisé, raccourcis EFB, horloge automatique du processeur simulé (plancher 50 %). Wii (mise à jour du 05/10/2026, terminée le 06/10) : même cœur Dolphin, Super Mario Galaxy et Rayman Origins à 60 images/s ; profils Nunchuk / Sideways / Classic / GameCube choisis automatiquement, pointeur au stick, au gyroscope ou au toucher. Jamais : PS2 (JIT requis, interdit sur iOS). |
| Wii et GameCube : sans JIT | **100 % sans JIT.** Moteur Cached Interpreter uniquement (approche d'iCube). **Aucune option** pour activer le JIT, pas de StikDebug, pas de débogueur. (Ajouté le 05/10/2026.) |
| Jeux Wii | **Uniquement les disques d'Elhadji**, copiés par lui-même. L'app ne fournit ni ne télécharge aucun jeu. (Ajouté le 05/10/2026.) |
| Licence Dolphin | Dolphin est sous **GPL v2+**, comme PPSSPP, Azahar et melonDS. L'app étant publiée, son code doit être public et les licences affichées dans l'app. (Ajouté le 05/10/2026, mis à jour le 08/10/2026.) |
| Jaquettes rétro | Trouvées automatiquement dans la bibliothèque publique de libretro (libretro-thumbnails), ou choisies dans Photos. |
| Contrôles tactiles | Affichés automatiquement sans manette, masqués dès qu'une manette se connecte. Mêmes signaux que la manette physique. |

## Hors périmètre (retiré volontairement, ne pas réintroduire)

- Statistiques de connexion (latence, fps) et réglage de qualité du stream
- « Someone is playing on your Xbox »
- Inverser A et B
- Éditeur de disposition des contrôles tactiles (déplacer les boutons) : peut-être plus tard
- JIT via StikDebug (il faudrait le relancer à chaque ouverture de l'app) : l'émulation reste toujours sans JIT
- Écran « choisir sa plateforme » et lanceur de jeux iPhone : non retenus (l'app Apple Games le fait déjà)

## Risques connus (à garder en tête)

- Les connexions Xbox utilisées (connexion Microsoft, liste des consoles, lancement de jeu, stream) sont **non officielles**. Microsoft peut les changer. Toujours vérifier contre les projets de référence récents, et citer la source.
- **Jouer hors de la maison** risque de mal fonctionner (Microsoft utilise Teredo, que les projets open source n'implémentent pas). Cible v1 : Wi-Fi à la maison.
- **Vérification d'Apple** : le vérificateur n'aura ni Xbox ni ROM. Il faudra lui expliquer comment tester, sinon l'app risque d'être refusée. Microsoft peut aussi couper les connexions Xbox après la publication : le rétro doit rester utile tout seul.
- Si une étape risquée échoue, **arrête-toi et explique** avant de contourner.

## Références techniques

- Greenlight : https://github.com/unknownskl/greenlight (client open source xCloud / Remote Play)
- xbox-xcloud-player : https://github.com/unknownskl/xbox-xcloud-player (la librairie de stream utilisée par Greenlight)
- OpenXbox : https://github.com/OpenXbox (xbox-webapi-python, xbox-smartglass-core-python : allumer, éteindre, lancer un titre)

Ces projets ne tournent pas sur iPhone : ils servent de **documentation** du fonctionnement réel, pas de code à copier tel quel. Vérifie que les URL et les protocoles sont toujours d'actualité.

## Design system

Le design complet est dans `design/ecrans/` (un fichier par écran, voir `docs/ECRANS.md`). Taille de référence : **852 × 393 points** (iPhone en paysage). Marges latérales : **56 pt** (encoche).

**Règles (ajoutées le 29/09/2026)**
- **Ne jamais afficher un message d'erreur technique** (ex. « fetch failed: UnexpectedException… »). Toujours le traduire en message humain. Garder le détail technique uniquement dans les logs.
- **L'app doit fonctionner sans internet.** Seules les fonctions Xbox en ont besoin ; le rétro marche hors ligne.
- **Logo** : la manette est **blanche** (#FFFFFF) sur le fond orange (#FF5A1F), les yeux restent des découpes orange.

**Couleurs**
- Encre (fond) `#0A0A0C`
- Blanc `#FFFFFF` ; texte secondaire `rgba(255,255,255,0.74)`
- Orange marque `#FF5A1F` (logo, bouton A de la manette, accents rares)
- Vert « prêt » `#7CE3A6` (uniquement pour les états prêts / connectés)
- Rouge destructif `#FF8A73` (Se déconnecter, Réinitialiser)
- Panneaux translucides `rgba(22,22,26,0.82–0.88)` avec flou

**Typographies**
- Interface : **Figtree** (400, 500, 600, 700, 800) — `@expo-google-fonts/figtree`
- Logo et titres de marque : **Bricolage Grotesque** ExtraBold 800 — `@expo-google-fonts/bricolage-grotesque`
- Le mot-symbole « overrrrhere » : les quatre « r » sont en orange avec une opacité décroissante (1 / 0.75 / 0.5 / 0.3).

**Composants récurrents**
- Tuile de jeu : 128 × 72 (normale), **160 × 90** (sélectionnée), coins 10, image seule.
- Focus : anneau `0 0 0 2px #0A0A0C, 0 0 0 4px <couleur focus>` + ombre. Couleur focus par défaut : blanc (réglable : blanc, vert, orange).
- Bouton principal : pilule blanche, hauteur 44, glyphe rond « A » à gauche.
- Bouton secondaire : pilule contour `rgba(255,255,255,0.35)`.
- Rappels de boutons : cercle 18 pt avec la lettre (A, B, X, Y) + libellé 12 pt.
- Ligne de réglage : hauteur 46, interrupteur 40 × 24.
- Sélecteur segmenté (ex. Auto / Always / Off) : pilule `rgba(255,255,255,0.1)`, option active blanche à texte sombre, boutons de 28 pt.
- **Carte de boutons de la manette, identique partout** : A = action principale ; B = retour / annuler ; **View (⧉) = Details** ; **Y = épingler / désépingler** ; X = modifier la tuile ; LB / RB = filtres ; View + Menu ensemble = menu du jeu en cours.
- **Fenêtre de confirmation** (Reset, Delete) : titre qui nomme l'action (« Delete this game? »), une phrase de conséquence, bouton **Cancel sélectionné par défaut** (blanc), action destructive en contour rouge `#FF8A73`.
- Étiquette de système sur les tuiles rétro : 10 pt, gras, fond `rgba(10,10,12,0.78)`, texte en entier (« SNES », « GAME BOY », « MEGA DRIVE »).
- Images rétro : toujours `image-rendering: pixelated` (pas de flou en agrandissant).
- Contrôles tactiles : cercles translucides `rgba(255,255,255,0.14)`, contour `rgba(255,255,255,0.55)`, ombre légère ; bouton pressé blanc à texte sombre. Opacité réglable (50 / 80 / 100 %). Le bouton qui ouvre le menu de l'app est une pastille en haut au centre **avec le logo** (pas ≡, pour ne pas confondre avec le bouton Menu de la Xbox).

## Ressources

- `assets/brand/icon-app-ios-1024.png` — icône iOS (carré plein, sans transparence, iOS arrondit lui-même)
- `assets/brand/splash-icone-1024.png` — icône de l'écran de démarrage (fond du splash : `#0A0A0C`)
- `assets/brand/logo-icone.svg` — logo arrondi pour l'interface
- `assets/images/manette.png` — manette détourée (écran Welcome ; l'écran du téléphone occupe x 22,98 %, y 14,56 %, largeur 54,05 %, hauteur 72,80 % de l'image)
- `assets/images/welcome-fond.jpg` — scène de jeu générée par Elhadji (Google Flow, 08/10/2026) : écran du téléphone sur Welcome et fond flou (Backdrop). Remplace les visuels d'A Plague Tale, protégés par le droit d'auteur (dans l'app réelle, les visuels des jeux viennent du catalogue Xbox ou des Photos de l'utilisateur)
- `assets/images/retro/*.png` — **dessins pixel art de remplacement** pour les maquettes rétro. Ne pas les livrer dans l'app : les vraies jaquettes viennent de libretro-thumbnails ou des Photos.

## Ordre de travail

Le prototype et l'app de base sont terminés. Pour les nouveautés, suivre **`docs/MISE_A_JOUR_2026-09-25.md`** : d'abord vérifier ce qui est déjà fait dans le code, puis appliquer le reste dans l'ordre indiqué. Pour l'émulation rétro, valider d'abord un seul système (SNES) avant tout écran.
