# Décisions et écarts par rapport à la spécification V2

## Lot V2.1 (accepté)
1. **Migrations en TypeScript** (tableaux d'instructions) au lieu de fichiers `.sql` + `migrations.rs` : chaque migration s'exécute dans une transaction unique via `db_transaction`, et reste testable en Node sur un vrai SQLite. Schéma des 15 tables conforme à la section 5.
2. **Suppressions en cascade** : SQLite ne laisse aucune trace ; les dépôts (`deleteProject`) journalisent explicitement chaque élément supprimé.
3. **Démarrage unique** : `boot()` est mémoïsé (le mode strict de React exécute les effets deux fois ; sans cela, deux migrations concurrentes échouaient).

## Lot V2.2a : sauvegarde, restauration, instance unique

### Décisions validées par David
- **Tables techniques** : `backups_log` et `meta` s'écrivent sans ligne `activity_log`. Toute autre table exige le champ `activity` de `mutate()` : la règle est appliquée par le code (`assertTechnicalWrite`) et testée, pas seulement déclarée.
- **Plugin officiel de dialogue Tauri** (`tauri-plugin-dialog`), appelé côté Rust uniquement : aucune permission JavaScript à ouvrir.

### Choix de conception
1. **Répartition** : le noyau Rust exécute des primitives (créer, lister, vérifier, restaurer, supprimer, verrouiller). La politique (rotation, déclenchements, contrôles avant restauration) est en TypeScript (`backup-policy.ts`, `backup-service.ts`), donc testée en Node.
2. **SHA-256 écrit dans `files.rs`** sans dépendance supplémentaire ; vérifié contre `hashlib` (vecteurs connus, longueurs autour des frontières de bloc, lecture par morceaux).
3. **Dossier secondaire** : enregistré dans `meta` (clé `backup_secondary_dir`), donc dans la base. Il n'y a pas de ligne de journal pertinente pour un réglage ; à reconsidérer au module Configuration, où `settings` pourra être ajoutée aux tables techniques sur validation. Sa rotation est appliquée comme dans le dossier principal. Un échec de copie secondaire est un avertissement, pas une erreur.
4. **Dernière sauvegarde « utile »** (déclenchement au lancement, 24 h) : seules les sauvegardes manuelles et automatiques comptent, pas les sauvegardes de sécurité (`pre-*`).
5. **Déclenchement à la fermeture et toutes les 30 minutes** : « des données ont changé » se mesure par le plus grand `activity_log.id` comparé à la valeur mémorisée dans `meta` (`last_backup_activity_id`). Cela s'appuie sur l'invariant E10 ; une écriture sur une table technique ne déclenche rien.
6. **Fermeture** : le noyau suspend la fermeture, prévient l'interface (événement DOM `bamentor-close` injecté par `eval`, sans permission Tauri), qui sauvegarde si nécessaire puis demande `app_exit`. Filet : fermeture forcée après 15 s ; un second clic sur la croix ferme immédiatement.
7. **Verrou d'instance** : verrou exclusif sur `BAMentorData/BAMentor.lock` (`File::try_lock` de la bibliothèque standard, Rust ≥ 1.89), libéré par le système même en cas de plantage. Une instance refusée n'ouvre pas la base et ne peut ni sauvegarder, ni restaurer, ni supprimer (refus côté noyau). Si le système de fichiers ne sait pas verrouiller, l'application fonctionne avec un avertissement visible.
8. **Restauration** : contrôle du fichier (intégrité, schéma présent, schéma non plus récent), sauvegarde `pre-restore`, copie voisine puis renommage atomique, suppression des fichiers annexes SQLite, réouverture et `integrity_check`, migration éventuelle ; en cas d'échec à une étape, retour à la sauvegarde `pre-restore`.
9. **Base illisible au démarrage** : l'écran d'erreur propose la restauration (sans `pre-restore`, impossible) ; l'ancien fichier est conservé sous `ba-mentor.damaged-<date>.db`.
10. **`pre-migration` et `backups_log`** : les sauvegardes `pre-migration` sont faites par le moteur de migration avant que le service existe ; elles n'ont pas de ligne d'historique. Le dossier reste la source de vérité (spécification, section 5).
11. **Restes d'une interruption** : un fichier `.restoring` laissé par une clé retirée est supprimé au démarrage (seulement par l'instance qui tient le verrou). Une sauvegarde incomplète apparaîtrait dans la liste ; « Vérifier » la signale.

### Limites connues
- Le pilote de test (`tests/helpers/node-driver.ts`) reproduit le comportement du noyau ; il ne le remplace pas. Le noyau a ses propres tests (`cargo test`).
- Pas de sauvegarde à heure fixe application fermée (spécification : hors V2).

## Non vérifié lors de l'écriture (à valider via GitHub Actions)
- Compilation et tests de `backup.rs` et `main.rs` (dépendent de `rusqlite` et de Tauri, inaccessibles ici). `files.rs` (std seule) a été compilé et testé ici : 10 tests.
- Build Vite + Tailwind, rendu final, `tauri build`, exécution réelle.
