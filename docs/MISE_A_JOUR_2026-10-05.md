# Mise à jour du 5 octobre 2026 — Émulation Wii (sans JIT)

Maquettes dans `design/ecrans/`. Applique **un lot à la fois**, avec un test sur l'iPhone d'Elhadji à la fin de chacun.

**Règles à ajouter dans CLAUDE.md** (section décisions verrouillées) :
- **Wii et GameCube : 100 % sans JIT.** Moteur Cached Interpreter uniquement (approche d'iCube). **Aucune option** pour activer le JIT, pas de StikDebug, pas de débogueur.
- **Jeux Wii : uniquement les disques d'Elhadji**, copiés par lui-même. L'app ne fournit ni ne télécharge aucun jeu.
- **Licence** : Dolphin est sous GPL v2+. Sans problème pour un usage perso ; à signaler si l'app était un jour publiée.

---

## Lot 1 — Prototype : un jeu Wii qui tourne (risque élevé)

La GameCube fonctionne déjà avec le moteur Dolphin sans JIT. La Wii utilise **le même moteur**.

1. Lancer **un seul jeu Wii** d'Elhadji avec le moteur actuel : image, son, manette (profil Wiimote + Nunchuk, pointeur au stick droit).
2. Vérifier la mémoire : les jeux Wii sont plus lourds. Si l'app se ferme, utiliser l'option d'augmentation de la limite de mémoire disponible avec le compte développeur payant.
3. Résolution **1× par défaut**.
4. **Si c'est trop lent sur l'iPhone 16 Pro Max, s'arrêter et en parler** avant de construire les écrans.

## Lot 2 — Pointeur et commandes

5. **Pointeur, trois modes** (réglage par jeu) :
   - **Right stick** (défaut) : le stick déplace le curseur, avec accélération (lent près du centre, rapide à fond). Vitesse : Slow / Medium / Fast.
   - **Gyro + right stick** : le gyroscope de l'iPhone (CoreMotion) vise, le stick droit corrige finement.
   - **Touch** : toucher l'écran place le pointeur ; A pour valider.
6. **Recentrer le pointeur** : clic du stick droit.
7. **Secouer la Wiimote** : RB.
8. **Quatre profils de commandes** (correspondances exactes dans `WiiControls.dc.html`) :
   - Remote + Nunchuk (défaut) ;
   - Sideways Remote (Wiimote à l'horizontale) ;
   - Classic Controller (pas de pointeur) ;
   - **GameCube Controller** (pas de pointeur, pas de mouvement), pour les jeux Wii qui l'acceptent, comme Super Smash Bros. Brawl ou Mario Kart Wii.
9. **Profil choisi automatiquement** : une petite liste faite à la main associe l'identifiant de jeu Wii au bon profil pour les jeux courants. Sinon : Remote + Nunchuk. Le choix de l'utilisateur est gardé **par jeu**.
10. View + Menu ouvre toujours le menu de l'app.

## Lot 3 — Écrans Wii

11. **En jeu** (`WiiPlay.dc.html`, états dans les Tweaks). Le curseur est **dessiné par le jeu**, pas par l'app. L'app affiche seulement de courtes notices qui disparaissent seules :
    - « First launch » : « It may stutter at first while graphics get ready. It gets smoother as you play. » (premier lancement d'un jeu) ;
    - « Controls chosen » : « Controls: Sideways Remote · Chosen for this game · Change it in the menu » (si le profil auto n'est pas Remote + Nunchuk) ;
    - « Pointer mode shown » : « Pointer · Right stick · Click the right stick to recenter » (début de partie) ;
    - « Pointer off screen » : barre lumineuse sur le bord + « Pointer off screen · Click the right stick to bring it back » ;
    - « Recentered » : petit cercle qui pulse au centre + « Pointer recentered ».
12. **Options Wii** (`WiiMenu.dc.html`, depuis le menu en jeu) : Controller (avec « · Auto » tant que l'utilisateur n'a pas changé), Pointer (« Not used » pour Classic et GameCube), Pointer speed, Recenter pointer, See all controls. Une phrase en bas explique le mode choisi.
13. **Référence des commandes** (`WiiControls.dc.html`) : 4 onglets (Nunchuk, Sideways, Classic, GameCube) changés avec LB / RB.

## Lot 4 — Bibliothèque et import

14. **Bibliothèque Retro** (`RetroLibrary.dc.html`) : la Wii devient un système (étiquette « WII », filtre « Wii »).
15. **Indicateur « Motion controls »** : petite icône en bas à droite des tuiles des jeux qui demandent beaucoup de gestes, et « Uses motion controls » dans la ligne d'infos. **Liste faite à la main** (l'app ne peut pas le détecter seule) ; sans information, pas d'icône.
16. **Import** (`RomImport.dc.html`) : accepter **.iso, .rvz et .wbfs** pour GameCube et Wii. Message « fichier non pris en charge » mis à jour avec tous les systèmes.
17. **À savoir (aucun écran à faire)** : Elhadji peut convertir ses jeux en `.rvz` avec Dolphin sur son PC Windows ; c'est sans perte et beaucoup plus léger pour iCloud.

Note : `RetroLibrary.dc.html` inclut aussi les changements du 29 septembre (en-tête et barre fixes, grille 5 colonnes…). Si la mise à jour du 29 n'est pas encore appliquée, l'appliquer d'abord.
