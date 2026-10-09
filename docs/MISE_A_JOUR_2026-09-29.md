# Mise à jour du 29 septembre 2026

Améliorations (pas des bugs) repérées par Elhadji en utilisant l'app. Maquettes à jour dans `design/ecrans/`. Applique **un lot à la fois**, avec un test sur l'iPhone à la fin de tous les lots parce qu'il ne reste qu'un build et cela sera un build autonome.

**Règles à ajouter dans CLAUDE.md** (section design system) :
- **Ne jamais afficher un message d'erreur technique** (ex. « fetch failed: UnexpectedException… »). Toujours le traduire en message humain. Garder le détail technique uniquement dans les logs.
- **L'app doit fonctionner sans internet.** Seules les fonctions Xbox en ont besoin ; le rétro marche hors ligne.
- **Logo** : la manette est **blanche** (#FFFFFF) sur le fond orange (#FF5A1F), les yeux restent des découpes orange.

---

## Lot 1 — Hors ligne

1. **Sign in** (`SignIn.dc.html`, Tweak « offline ») :
   - Lien **« Continue without Xbox »** à côté de « Sign in with Microsoft », toujours visible. Il mène à l'accueil sans compte Microsoft.
   - Sans internet : remplacer l'erreur rouge par une carte « **You're offline** · Signing in to Xbox needs internet. Your retro games work without it. » Bouton principal A « Continue without Xbox », bouton secondaire X « Try again ».
2. **Accueil hors ligne** (`Main.dc.html`, Tweak « offline ») :
   - Pastille console : point gris + « **Offline** ».
   - Tuiles qui ont besoin de la Xbox (jeux Xbox, Console home, All games) : opacité 45 % quand elles ne sont pas sélectionnées. Les tuiles rétro restent normales.
   - Ligne d'infos d'une tuile Xbox : « Needs internet · Your retro games still work ». Play ouvre l'écran de problème « No internet ».
3. **Écran de problème** (`LaunchIssue.dc.html`) : nouvelle version « **No internet** » : « You're offline », « Xbox games need internet. Your retro games work without it. », A Go to Retro, B Go back.

## Lot 2 — Bibliothèque Retro (`RetroLibrary.dc.html`)

Problème corrigé : les jaquettes passaient **par-dessus** le titre, les filtres et la barre du bas au défilement.

4. **Trois zones qui ne se chevauchent jamais :**
   - **En-tête fixe** (0 à 112 pt) : fond `rgba(10,10,12,0.94)` + flou, fondu de 16 pt en dessous. Contient titre, compteur, chemin iCloud, bouton « Add a ROM », filtres.
   - **Grille** qui défile entre les deux ; les jaquettes passent **sous** l'en-tête et la barre. Défilement aligné par rangée ; la tuile sélectionnée est toujours entièrement visible (marges de défilement : 124 pt en haut, 84 pt en bas).
   - **Barre du bas fixe** : dégradé de transparent à `rgba(10,10,12,0.95)` à partir de 305 pt, contenu à 330 pt. Titre et infos coupés avec « … » s'ils sont trop longs.
5. **Grille pleine largeur** : 5 colonnes de 138 × 78 pt, espacement 12 pt (au lieu de 4 colonnes avec une bande vide à droite).
6. **Filtres** : LB et RB fixés aux extrémités ; les puces défilent horizontalement entre les deux, avec les bords en fondu. Seulement les systèmes présents. La puce sélectionnée reste visible.
7. **Jeux sans jaquette** : tuile sombre avec le titre **nettoyé** (2 lignes max) et une petite icône de cartouche. **Jamais le nom de fichier brut.**
8. **Nettoyage des titres** (partout où un titre s'affiche) :
   - retirer la numérotation en tête (« 3DS0033 - », « 1270 - », « 0565 - ») ;
   - « Legend of Zelda, The » → « The Legend of Zelda » ;
   - « Titre - Sous-titre » → « Titre: Sous-titre ».
   Exemple : « Legend of Zelda, The - Ocarina of Time » → « The Legend of Zelda: Ocarina of Time ».
9. **Icône nuage** : seulement sur les jeux **pas encore téléchargés** (nuage + flèche vers le bas), plus sur tous. Infos : « Nintendo 64 · 32 MB · Downloads when you play ».
10. **« Add a ROM »** passe de la fin de la grille à l'en-tête (petit bouton à côté du chemin iCloud).
11. **État vide** : « No games yet · Put your ROM files in iCloud Drive › Retro Games. They show up here by themselves. »

## Lot 3 — Logo

12. Manette du logo **blanche** sur fond orange partout : icône de l'app, splash, Welcome, barre du haut de l'accueil, Settings > About, pastille de menu des écrans tactiles (Xbox, rétro, PSP, DS, 3DS).
13. Remplacer les fichiers de `assets/brand/` par ceux de ce paquet : `icon-app-ios-1024.png` (carré plein, sans transparence), `splash-icone-1024.png`, `logo-icone.svg`. Refaire un build pour voir la nouvelle icône sur l'écran d'accueil.
14. Icône **plate**, sans dégradé : iOS 26 ajoute lui-même ses reflets.

Note : `DSStacked.dc.html` n'a changé que pour le logo de sa pastille. Si la disposition « Empilés » n'a pas été construite, l'ignorer.
