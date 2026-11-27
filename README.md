# BA-Mentor Portable Ultimate Edition — lot F5 (documents versionnés et figés)

Tauri v2 + React + TypeScript + Tailwind + SQLite. Données dans `BAMentorData/` à côté de l'exécutable.

## Vérifier et compiler (sans rien installer)
1. Déposer ce dossier dans votre dépôt GitHub privé.
2. Onglet **Actions → Build BA-Mentor → Run workflow**.
3. Quatre jobs : `verify` (versions, architecture, tests automatiques), `types` (contrôle des types TypeScript, **bloquant**), `rust-tests` (tests du noyau Rust, **bloquants**) et `build` (produit `ba-mentor.exe`, artefact `ba-mentor-exe`). Le lot ne se valide que si les quatre sont verts. `types` est séparé pour que l'exécutable soit produit même si les types échouent.
4. Protocole de test sur votre clé : `TESTS-F5.md` (lot en cours). **F5 modifie le schéma de la base (migration 8) : joue la recette sur une copie de `BAMentorData`, jamais d'abord sur ton dossier d'origine.**.

## En local (Node 22+)
`npm install` puis `npm run verify` (ou `npm test`). Application : `npm run tauri dev` / `npm run tauri build`.

## Règles
Voir `DECISIONS.md`. Version : unique source `src-tauri/tauri.conf.json`.
