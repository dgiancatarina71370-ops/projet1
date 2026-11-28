# BA-Mentor Portable Ultimate Edition — lot F8 (diffusion manuelle)

Tauri v2 + React + TypeScript + Tailwind + SQLite. Données dans `BAMentorData/` à côté de l'exécutable.

## Vérifier et compiler (sans rien installer)
1. Déposer ce dossier dans votre dépôt GitHub privé.
2. Onglet **Actions → Build BA-Mentor → Run workflow**.
3. Quatre jobs : `verify` (versions, architecture, tests automatiques), `types` (contrôle des types TypeScript, **bloquant**), `rust-tests` (tests du noyau Rust, **bloquants**) et `build` (produit `ba-mentor.exe`, artefact `ba-mentor-exe`). Le lot ne se valide que si les quatre sont verts. `types` est séparé pour que l'exécutable soit produit même si les types échouent.
4. Protocole de test sur votre clé : `TESTS-F8.md` (lot en cours). **F8 contient la migration 9** (schéma 9, ajouts seuls : colonne e-mail des parties prenantes et deux tables de diffusion). Une version 0.17.0 ou plus ancienne refuse d'ouvrir une base passée en schéma 9. Joue la recette sur une **copie de `BAMentorData`**.

## En local (Node 22+)
`npm install` puis `npm run verify` (ou `npm test`). Application : `npm run tauri dev` / `npm run tauri build`.

## Règles
Voir `DECISIONS.md`. Version : unique source `src-tauri/tauri.conf.json`.
