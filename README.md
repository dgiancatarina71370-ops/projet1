# BA-Mentor Portable Ultimate Edition — lot M7 (ateliers)

Tauri v2 + React + TypeScript + Tailwind + SQLite. Données dans `BAMentorData/` à côté de l'exécutable.

## Vérifier et compiler (sans rien installer)
1. Déposer ce dossier dans votre dépôt GitHub privé.
2. Onglet **Actions → Build BA-Mentor → Run workflow**.
3. Trois jobs : `verify` (versions, architecture, tests E4/E8/E10/E13), `rust-tests` (tests du noyau Rust, **bloquants**) et `build` (produit `ba-mentor.exe`, artefact `ba-mentor-exe`). Le lot ne se valide que si les trois sont verts.
4. Protocole de test sur votre clé : `TESTS-M7.md`.

## En local (Node 22+)
`npm install` puis `npm run verify` (ou `npm test`). Application : `npm run tauri dev` / `npm run tauri build`.

## Règles
Voir `DECISIONS.md`. Version : unique source `src-tauri/tauri.conf.json`.
