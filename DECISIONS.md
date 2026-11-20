# Décisions et écarts par rapport à la spécification V2 (lot V2.1)

1. **Migrations en TypeScript** (tableaux d'instructions) au lieu de fichiers `.sql` + `migrations.rs` : chaque migration s'exécute dans une transaction unique via `db_transaction`, et reste testable en Node sur un vrai SQLite. Le schéma des 15 tables est strictement celui de la spécification (section 5).
2. **Sauvegarde** : `db_backup` (API de sauvegarde en ligne SQLite + `integrity_check`) est fournie. SHA-256, rotation, restauration, déclencheurs automatiques et dossier secondaire sont reportés au lot V2.2.
3. **Verrou d'instance unique** : reporté (lot V2.2).
4. **Suppressions en cascade** : SQLite ne laisse aucune trace ; les dépôts (`deleteProject`) journalisent explicitement chaque élément supprimé.
5. **Démarrage unique** : `boot()` est mémoïsé (le mode strict de React exécute les effets deux fois ; sans cela, deux migrations concurrentes échouaient).
6. **Vérification de types** : le job CI `typecheck` est non bloquant pour ce premier lot (React/@types non vérifiables hors CI lors de l'écriture).

## Non vérifié lors de l'écriture (à valider via GitHub Actions)
- Compilation Rust (`src-tauri`) et tests `cargo test`.
- Build Vite + Tailwind compilé localement.
- `tauri build` et exécution réelle de l'exécutable.
