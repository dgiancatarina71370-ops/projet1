# BA-Mentor Portable Ultimate Edition — lot V2.1 (socle)

Tauri v2 + React + TypeScript + Tailwind + SQLite. Données dans `BAMentorData/` à côté de l'exécutable.

## Vérifier et compiler (sans rien installer)
1. Déposer ce dossier dans votre dépôt GitHub privé.
2. Onglet **Actions → Build BA-Mentor → Run workflow**.
3. Le job `verify` exécute versions, règles d'architecture et tests (E8 migrations, E10 journal, E13 architecture). Le job `build` produit `ba-mentor.exe` (artefact `ba-mentor-exe`).

## En local (Node 22+)
`npm install` puis `npm run verify` (ou `npm test`). Application : `npm run tauri dev` / `npm run tauri build`.

## Règles
Voir `DECISIONS.md`. Version : unique source `src-tauri/tauri.conf.json`.
