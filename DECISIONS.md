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

## Lot V2.2b : import des données de la V1

### Format vérifié sur un export réel
Un export réel de la V1 a été analysé avant d'écrire le moindre code : il est conforme au format théorique (enveloppe `format`, `formatVersion: 1`, `exportedAt`, `generator`, `state`). Deux faits que la théorie ne donnait pas : (1) le dossier « 99 Archives » est un **enfant** du projet, pas une racine ; le type `archive` s'applique donc à n'importe quel niveau ; (2) les dossiers n'ont aucune date. L'export ne contenait que les données d'exemple de la V1 et peu de réglages : les cas délicats (livrable validé ou archivé, envois, contacts, flags personnalisés) sont couverts par un jeu **synthétique** (`tests/fixtures/`), pas par des données réelles. Le fichier réel n'est pas versionné ; un équivalent anonymisé l'est.

### Décisions validées par David (D1 à D5)
- **D1** : un projet ou dossier est daté du plus ancien livrable qu'il contient (à tous les niveaux), à défaut de la date d'export.
- **D2** : chaque ligne importée reçoit une ligne `imported` au journal, dans la même transaction (18 lignes pour l'export réel). Les projets et livrables sont journalisés à leur date, les autres éléments à l'instant de l'import. Le détail du journal ne contient jamais de titre ni de contenu.
- **D3** : pas d'export réel dans le dépôt ; fixture anonymisé équivalent.
- **D4** : un export qui ne contient que les données d'exemple de la V1 est signalé dans l'aperçu (reconnaissance par noms et empreinte du contenu), sans rien écarter automatiquement.
- **D5** : doublon détecté par l'empreinte SHA-256 du fichier (`meta`, clé `import_v1_<empreinte>`) ; second import = confirmation explicite. Réglages, contacts, notes, étapes PSPO et interrupteurs déjà présents sont conservés sans écrasement ; la définition de « terminé » n'est importée que si la table est vide.

### Choix de conception
1. **Séparation** : `import-v1-parse.ts` (fonction pure : contrôle du format, normalisation, avertissements) ; `import-v1.ts` (plan d'écritures pur `buildPlan`, lecture de l'état de la base, service). Le noyau Rust ne fait que choisir et lire le fichier (`import_pick_file`, limite 50 Mo, UTF-8, empreinte des octets, marque d'ordre des octets retirée).
2. **Identifiants attribués explicitement** (plus haut identifiant jamais attribué + 1, `sqlite_sequence` comprise) plutôt que table de correspondance : `mutate()` envoie des instructions à plat sans relire les résultats. Un identifiant supprimé n'est jamais réutilisé (testé).
3. **Structure refusée, donnée corrigée** : JSON invalide, mauvais `format`, `formatVersion` inconnue ou plus récente, identifiant manquant ou en double, type de nœud inconnu, boucle d'arborescence → refus avec le chemin de la clé fautive. Statut inconnu, date illisible, envoi sans destinataire, contact sans adresse, doublon d'adresse → corrigé et listé en avertissement.
4. **Éléments sans dossier valide** (parent absent) : rattachés à un projet « Import V1 — éléments sans dossier », créé seulement si nécessaire.
5. **Ordre et atomicité** : doublon non confirmé refusé → sauvegarde de sécurité (échec = import annulé, rien d'écrit) → une seule transaction. L'état de la base est lu après la sauvegarde. Un échec en cours d'import annule tout, y compris l'empreinte du fichier (testé avec une panne simulée).
6. **Sauvegarde de sécurité de type `pre-migration`** : la base n'admet pas d'autre type sans migration ; elle apparaît donc sous « Avant migration » (rotation : 5).
7. **Contrôle « avant = après » (E9)** : l'aperçu annonce les totaux ; après import, le nombre de lignes réellement écrites par instruction est comparé ; l'écran affiche les deux colonnes.

### Limites connues
- Seules les données d'exemple de la V1 ont été vues en réel. Un export plus riche (livrable validé, archivé, envoi, contact, flag personnalisé) reste à passer avant la vraie migration.
- Un flag de la V1 absent de `flags` et de `customFlags` n'est pas créé : la V2 appliquera ses valeurs par défaut.
- Les dates d'un livrable : la V1 ne stocke que la dernière modification ; `created_at` reçoit cette date.

## Lot V2.3a : export signé (Markdown, HTML) et écran À propos

### Décisions validées par David (D6 à D11)
- **D6** : V2.3 est découpé en V2.3a (Markdown, HTML, écriture de fichier, À propos) puis V2.3b (Word, PDF).
- **D7** : le HTML brut d'un livrable n'est jamais interprété (échappé).
- **D8** : destination par défaut `BAMentorData/exports/`, option « Enregistrer sous… », jamais d'écrasement dans `exports/`.
- **D9** : PDF avec `pdfmake` au lot V2.3b (non testable ici, vérifié en CI).
- **D10** : carte d'export technique en attendant l'écran Documents (V2.7).
- **D11** : le dossier `exports/` n'est pas dans les sauvegardes (fichiers dérivés, régénérables).

### Choix de conception
1. **Couches** : `src/export/` (pur : modèle, rendus, noms, pipeline, service) au-dessus de `src/data/`. Le service d'export lit le livrable par un dépôt en lecture seule et écrit le fichier par `src/data/export-files.ts` (seul accès au pilote). Un export ne modifie aucune donnée : aucune ligne au journal.
2. **Modèle de blocs** : `marked` n'est utilisé que pour l'analyse (`lexer`) ; aucun HTML n'est produit par la bibliothèque. Le modèle (titre, paragraphe, liste, tableau, code, citation, règle) servira aux rendus Word et PDF (V2.3b).
3. **Sécurité du HTML** : tout texte est échappé ; le HTML brut (bloc ou en ligne) est conservé comme texte ; seuls les liens http, https, mailto, ancres et chemins relatifs sont gardés ; une image n'est jamais chargée (son texte alternatif la remplace, cohérent avec le « hors ligne ») ; le fichier porte une politique CSP `default-src 'none'` en défense supplémentaire. Un test casse volontairement le code (mutation) pour vérifier qu'il détecte chaque défaut.
4. **Signature** : ajoutée une seule fois par le pipeline ; `assertSigned` refuse tout rendu où l'un des quatre éléments manque ; la version vient d'`app_info` (une version inconnue refuse l'export). Markdown : commentaire `<!-- generator: … -->` en tête, bloc final après `---`. HTML : pied de page, `<meta name="generator">` et `<meta name="generated">` (ISO UTC).
5. **Nom de fichier** : `<titre>-AAAAMMJJ-HHMMSS.<ext>` en heure locale ; titre assaini (caractères interdits, noms réservés Windows préfixés par `_`, vide → `export`, 100 octets au plus, coupe entre deux caractères). Le noyau Rust **revalide** le nom (pas de séparateur, pas de nom réservé, extension connue) et crée le fichier en création exclusive (`nom-2`, `nom-3`… si collision).
6. **« Enregistrer sous… »** : l'écrasement d'un fichier existant est décidé par l'utilisateur dans la boîte de dialogue de Windows ; l'écriture est alors atomique (fichier voisin puis remplacement).
7. **Accord en français** (coquille PSPO) : `plural()` (0 et 1 au singulier) et accord en genre (« 1 étape PSPO déjà présente : conservée telle quelle »).

### Limites connues
- Le noyau Rust (`export_save`, boîte « Enregistrer sous ») n'a pas pu être compilé ici : seules les fonctions de `files.rs` l'ont été (15 tests). À confirmer par `rust-tests` et par le test manuel.
- Les composants React (`ExportPanel`, `AboutPanel`) sont vérifiés par compilation et un scénario simulé, pas par le vérificateur de types de React.
- Pas encore de rendu Word ni PDF (V2.3b). La clé de module `export` n'existe pas avant V2.5 : `exportDocument` ne vérifie aucun drapeau pour l'instant.

## Non vérifié lors de l'écriture (à valider via GitHub Actions)
- Compilation et tests de `backup.rs` et `main.rs` (dépendent de `rusqlite` et de Tauri, inaccessibles ici), dont la commande `import_pick_file` et la boîte de dialogue Windows. `files.rs` (std seule) a été compilé et testé ici : 15 tests. Pour V2.3a : la commande `export_save` et l'utilisation de `set_file_name` / `set_directory` / `blocking_save_file` du plugin de dialogue.
- Build Vite + Tailwind, rendu final, `tauri build`, exécution réelle.
