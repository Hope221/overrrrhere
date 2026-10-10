# Fiche App Store — brouillon (09/10/2026)

Brouillon de l'étape 5, à relire avec Elhadji. Les textes destinés à Apple et aux utilisateurs sont en anglais, comme l'app. Rien n'est encore envoyé.

## Identité

Validée par Elhadji le 09/10/2026 (sous-titre « for Xbox », comme le veut CLAUDE.md).

| Champ | Proposition | Limite |
|---|---|---|
| Nom | overrrrhere | 30 caractères |
| Sous-titre | Remote play for Xbox + retro | 30 caractères (28) |
| Catégorie principale | Entertainment (comme Delta) | |
| Catégorie secondaire | Games | |
| Prix | Gratuit, sans achat intégré, sans publicité | |
| Âge | 4+ probable (l'app ne contient aucun jeu ; à confirmer au questionnaire) | |

## Texte promotionnel (170 caractères, modifiable sans nouvelle version)

Validé le 09/10/2026.

> Clip your iPhone into a mobile controller and play: games installed on your own Xbox, and your own retro games. Free, open source, no ads.

## Description

Validée par Elhadji le 09/10/2026.

> overrrrhere turns your iPhone and a mobile controller into a handheld console.
>
> REMOTE PLAY FOR XBOX
> Pick a game installed on your own Xbox, press A, and it streams inside the app, at home on your Wi-Fi.
>
> YOUR RETRO GAMES
> Play your own ROM files: NES, Super Nintendo, Game Boy, Game Boy Color, Game Boy Advance, Mega Drive, Nintendo 64, PSP and Nintendo DS. Nintendo 3DS, GameCube and Wii run best on recent iPhones. Add games from the Files app, or choose one iCloud Drive folder and every game shows up by itself. Covers are found automatically.
>
> BUILT FOR THE CONTROLLER
> Every screen works with the controller. No controller? Touch controls appear by themselves.
>
> FREE AND OPEN SOURCE
> No ads, no tracking, no sign-up. Xbox uses your own Microsoft account. The source code is public under the GPL v3.
>
> No games are included. overrrrhere is not affiliated with, endorsed or sponsored by Microsoft, Nintendo, Sega or Sony. All trademarks belong to their respective owners.
>
> Screenshots show free homebrew games: Super Tilt Bro. by Sylvain Gadrat (with Pepper by David Revoy, CC BY 4.0), Tobu Tobu Girl by Tangram Games (CC BY 4.0) and µCity by Antonio Niño Díaz (CC BY-SA 4.0).

Ligne de crédits ajoutée le 09/10/2026 (obligatoire : licences CC BY des jeux montrés dans les captures).

## Mots-clés (100 caractères, séparés par des virgules, sans espace)

> controller,gamepad,emulator,rom,handheld,stream,console,classic,8bit,16bit,portable,launcher,saves

Validés le 09/10/2026 (98 caractères). Les mots du nom et du sous-titre (remote, play, Xbox, retro) sont déjà pris en compte par Apple : ne pas les répéter.

Pas de marques (Xbox, Nintendo, Backbone, Kishi…) dans les mots-clés : la règle 2.3.7 d'Apple l'interdit.

## Adresses (site GitHub Pages, en ligne depuis le 09/10/2026)

- Site (Marketing URL) : https://hope221.github.io/overrrrhere/
- Support : https://hope221.github.io/overrrrhere/#support
- Politique de confidentialité : https://hope221.github.io/overrrrhere/#privacy
- Code source : https://github.com/Hope221/overrrrhere

## Confidentialité (« étiquette » de l'App Store)

Réponse validée le 09/10/2026 : **Data Not Collected** (aucune donnée collectée). Vérifié dans le code : aucun outil de statistiques ni de rapport de plantage ; l'app ne contacte que Microsoft (connexion, Xbox Live, catalogue) et thumbnails.libretro.com.
- Pas de serveur overrrrhere, pas d'analytics, pas de publicité.
- La connexion Microsoft va directement de l'iPhone à Microsoft ; le jeton reste dans le trousseau de l'iPhone.
- La recherche de jaquettes envoie le nom du jeu à thumbnails.libretro.com, sans identifiant de l'utilisateur.

## Chiffrement (export)

Décision du 10/10/2026 : **la France est exclue au début**. La clé `ITSAppUsesNonExemptEncryption` avait été retirée de app.json, mais EAS l'a remise à `false` au lancement du build de production (question d'EAS sur le chiffrement) : c'est exact hors de France (aucun document exigé), donc gardée. Conséquence : App Store Connect ne pose pas les questions ci-dessous ; pour ajouter la France, il faudra un nouveau build (clé retirée, ou code de conformité d'Apple). L'app n'utilise pas que le chiffrement d'iOS : le stream passe par WebRTC, qui embarque son propre chiffrement standard (DTLS-SRTP). D'après le tableau d'Apple, un algorithme standard non fourni par iOS ne demande aucun document hors de France ; en France, il faut la déclaration de chiffrement française (ANSSI).

Réponses honnêtes si App Store Connect pose un jour les questions (clé absente) :
1. L'app utilise du chiffrement ? **Oui**.
2. Algorithmes propriétaires (non reconnus par les organismes de normes) ? **Non**.
3. Algorithmes standard en plus de ceux d'iOS ? **Oui**.
4. Disponible sur l'App Store en France ? **Non**.

Disponibilité : tous les pays **sauf la France**. Pour ajouter la France plus tard : faire la déclaration ANSSI, la joindre dans App Store Connect, puis un nouveau build. Pas de réponse claire d'Apple sur l'application de cette règle à TestFlight.
Sources : https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance et https://developer.apple.com/help/app-store-connect/reference/export-compliance-documentation-for-encryption

## Notes pour le vérificateur d'Apple (App Review Information)

Validées le 09/10/2026. Case « Sign-in required » : décochée (le rétro marche sans compte).

> overrrrhere is a launcher for mobile controllers with two parts. No account is needed to review the retro part.
>
> 1. RETRO GAMES (no account, no console)
> The app does not include or download any game. To test it, use Tobu Tobu Girl, a free Game Boy game whose authors allow free distribution (code MIT, assets CC BY 4.0):
> a) On the iPhone, open https://tangramgames.itch.io/tobutobugirl in Safari, tap Download, then "No thanks, just take me to the downloads", and download the game.
> b) In the Files app, tap the downloaded .zip file to unzip it.
> c) In overrrrhere: Get started › Continue › Continue without Xbox › Add your games › ROM files, then choose the .gb file.
> d) Select the game and tap it, or press A on a controller. With no controller connected, touch controls appear on screen.
>
> 2. REMOTE PLAY FOR XBOX
> This part streams games from the user's own Xbox console on the same Wi-Fi network, so it cannot be tested without one. A demo video is attached.
>
> The app is free, with no in-app purchases and no ads, and it collects no data. Source code (GPL v3): https://github.com/Hope221/overrrrhere

À préparer par Elhadji avant l'étape 6 :
1. Tester ce chemin exact sur son iPhone (Safari → .zip → Fichiers → ROM files → jeu avec contrôles tactiles). L'app n'importe pas les .zip.
2. Vidéo démo Xbox (enregistrement d'écran : choix du jeu, A, stream, quelques secondes de jeu). Gamertag et nom de console visibles : flouter, ou accord d'Elhadji. Pièce jointe vue seulement par Apple.
3. Coordonnées pour Apple (prénom, nom, téléphone, e-mail) : jamais publiées.

## Captures d'écran

En cours (09/10/2026). Format : paysage, 2868 × 1320 px (iPhone 6,9 pouces), PNG sans transparence. Aperçu (brouillon, écrans simulés du site) : https://claude.ai/artifact/5YDx7uHKJkJfq2V7y5VXij

Mise en scène retenue : image 1 = la manette entière (piste A), images 2 à 6 = gros plan sur l'écran, poignées de chaque côté (piste K). Fond encre, lumière tirée de la capture, légende Bricolage Grotesque blanche, un mot en orange.

| # | Écran (vraie capture d'Elhadji) | Légende |
|---|---|---|
| 1 | Accueil, Super Tilt Bro. sélectionné : 2 jeux Xbox (images Google Flow) + Super Tilt Bro., Tobu Tobu Girl, µCity | Your games, over *here*. |
| 2 | Lancement d'un jeu Xbox (« Console awake… ») | Your Xbox, *any room*. |
| 3 | Super Tilt Bro. en jeu, avec la manette | NES to *Wii*. |
| 4 | Tobu Tobu Girl, contrôles tactiles | No controller? *Touch*. |
| 5 | Tobu Tobu Girl › Details, 3 sauvegardes | Save *anywhere*. |
| 6 | Settings › About | *Free*. No ads. No tracking. |

Règles : aucune image de jeu du commerce (tuiles Xbox remplacées par les images Google Flow d'Elhadji, rétro = jeux homebrew), pas de capture du stream, ni gamertag ni nom de console ni e-mail visibles, interface non retouchée (seuls légende, fond et cadre s'ajoutent). Retouches faites (10/10/2026, accord d'Elhadji) : sur l'accueil, gamertag et photo Xbox remplacés par « Player 1 » et l'avatar par défaut de l'app ; sur le lancement, le titre « EA SPORTS FC™ 26 pour Xbox Series X|S » remplacé par « Valdrenne » (titre inventé, aucun jeu de ce nom trouvé), fond reconstruit d'après l'image Google Flow. « Xbox salon » (nom de la console renvoyé par Microsoft) gardé : ni personnel ni une marque. Images 1 à 5 finies : Bureau › captures-app-store › 3-finales. Image 6 (About) : à refaire avec le build de production.
Kit pour l'iPhone : Bureau › captures-app-store › 1-pour-iphone ; captures à déposer dans 2-captures-iphone.
