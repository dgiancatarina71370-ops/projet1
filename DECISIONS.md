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

## État des validations (21/11/2026)
- **V2.3a VALIDÉE** par David (tests 1 à 14 OK sur clé USB). Reste non vérifié en CI : voir « Limites connues » du lot.
- **Campagne complémentaire V2.2a** : C1 à C8, C11, C12 OK ; C9 corrigé (texte dans la base) OK ; C10 OK (refait le 21/11/2026) ; C13 facultatif non fait. Test 12 (import V1 enrichi) reporté : à faire quand des livrables réels auront été créés.
- **Défaut D-A (constaté le 21/11/2026, test C9 d'origine)** : un fichier `ba-mentor.db` de 0 octet est une base SQLite valide ; l'application la migre à neuf et démarre sans alerte sur une liste vide, alors que des sauvegardes existent. Cause confirmée dans le code : `boot.ts` ne contrôle que `dbError` puis `migrate`. Hypothèse initiale fausse : la liste des sauvegardes vient du dossier (`backup_list`), pas de la base. Aggravant : `startMaintenance` lance ensuite des sauvegardes automatiques de la base vide, soumises à la rotation (10 automatiques conservées). Correction : lot V2.2c (livré en 0.2.5 ; **V2.2c VALIDÉE** le 21/11/2026, tests 1 à 13 OK).

## Lot V2.2c : protection contre le démarrage silencieux sur une base vide (défaut D-A)

### Décisions validées par David
- Principe : une base neuve alors que des sauvegardes existent n'est jamais ouverte en silence (plan validé, « Go V2.2c »).
- Le choix **« Continuer avec une base vide »** est conservé, présenté comme exceptionnel, avec un avertissement puis une confirmation séparée.
- Les sauvegardes existantes sont **protégées automatiquement** quand l'utilisateur choisit de continuer, jusqu'à ce que la situation soit résolue (restauration) ou assumée (levée explicite de la protection).
- V2.2c passe avant V2.3b (une perte apparente de données est plus grave qu'un retard sur Word et PDF).

### Choix de conception
1. **Critère** (`src/data/startup-check.ts`, avant la migration) : schéma 0 (aucune migration appliquée) **et** au moins une sauvegarde exploitable (schéma lisible ≥ 1) dans `backups\`. Une base migrée mais sans projet n'est jamais suspecte ; une première utilisation (aucune sauvegarde) démarre normalement ; un fichier illisible portant un nom de sauvegarde ne compte pas. Aucune modification du noyau Rust.
2. **Nouvel état de démarrage** `empty-db` (`boot.ts`) : rien n'est migré, la maintenance automatique n'est pas lancée, aucune écriture. L'écran propose la restauration (liste lue sur le disque), « Restaurer depuis un fichier », et « Continuer avec une base vide… » (avertissement puis confirmation). Pas de création ni de suppression de sauvegarde dans cet état.
3. **Restauration depuis cet état** : `currentBaseEmpty` supprime la copie « avant restauration » (une copie de base vide est inutile et la rotation de ce type, limitée à 5, pourrait écarter une vraie copie).
4. **Protection** : repère `rotation_protected_until` = « AAAAMMJJ-HHMMSS|n » de la sauvegarde la plus récente au moment du choix, stocké dans `meta` (table technique). La rotation ignore toute sauvegarde dont (date, numéro) est ≤ au repère : elle n'est ni supprimée ni comptée dans la conservation. Le repère est posé juste après la migration, avant la maintenance ; si la pose échoue, le démarrage est refusé (jamais de base neuve non protégée). Le Centre de sauvegarde affiche « Protégée » sur ces lignes et un bouton « Lever la protection… » (confirmation). Restaurer une sauvegarde remplace `meta` : la protection disparaît d'elle-même (situation résolue). La suppression volontaire d'une sauvegarde reste possible.
5. Valable aussi pour le dossier secondaire (même repère).

### Limites connues
- Un échec de la pose du repère après une migration réussie laisse une base neuve sans protection au lancement suivant (le critère « schéma 0 » n'est plus vrai). Très improbable (une écriture sur la clé juste après une migration réussie) ; le démarrage est alors refusé avec un message.
- La protection est liée à la base : si l'utilisateur supprime lui-même le fichier de base après « Continuer », la situation redevient « base vide avec sauvegardes » et l'écran revient.
- Non vérifié ici : compilation Rust (inchangée dans ce lot) ; comportement réel d'un fichier vidé par le Bloc-notes sur Windows (test manuel 1).

## Lot V2.3b : export Word (.docx) signé

**V2.3b VALIDÉE** par David le 21/11/2026 : tests 1 à 15 OK sur clé USB et dans Microsoft Word (dont le jeu piégé). Propriétés personnalisées : contrôle secondaire.

### Décisions validées par David
- **D12** : V2.3 est découpé en V2.3b (Word) puis V2.3c (PDF avec pdfmake), pour isoler le risque lié à pdfmake.
- **D13** : signature complète dans le document Word, plus les métadonnées du document.
- **D14** : (pour V2.3c) signature complète dans le PDF et pied de page court sur chaque page.
- **D15** : le HTML brut est affiché comme texte ; seuls les liens sûrs sont conservés ; les images sont remplacées par un texte descriptif.

### Choix de conception
1. **Même modèle que Markdown et HTML** : `parseMarkdown` → blocs → `renderDocx` (bibliothèque `docx`). Aucun code Rust modifié : le noyau acceptait déjà l'extension `docx`.
2. **Pipeline asynchrone** : `exportDocument` retourne une promesse (le PDF le sera aussi). `ExportResult.text` vaut `null` pour un format binaire.
3. **Signature contrôlée sur le fichier réel** (`docx-check.ts`) : le `.docx` produit est rouvert (archive ZIP) et on y relit les 4 lignes de signature (une par paragraphe, en fin de document), l'auteur logiciel et la description dans `docProps/core.xml`. Un fichier dont un élément manque est refusé (`ExportSignatureError`).
4. **Métadonnées** : auteur et dernier auteur = « BA-Mentor Portable Ultimate Edition » ; description = « Développé par David Giancatarina — Version : x — Date de génération : … » ; titre = titre du livrable ; propriétés personnalisées `BAMentorGenerator`, `BAMentorVersion`, `BAMentorGeneratedAt` (ISO). Pied de page : « BA-Mentor Portable Ultimate Edition — Version : x — Page n / N ».
5. **Contenu** : titres 1 à 6 (styles Word natifs), paragraphes (gras, italique, barré, code), listes à puces et numérotées (numéro de départ conservé, imbrication), cases à cocher (☑ ☐), tableaux (en-tête répétée, alignements), citations, blocs de code (Consolas), règles. A4, marges 2 cm, langue fr-FR.
6. **Sécurité (D15)** : texte saisi jamais interprété ; liens Word seulement pour http, https et mailto (les ancres et chemins relatifs n'ont pas de cible dans Word : texte conservé, sans lien) ; aucune image ni objet intégré, aucune macro ; caractères interdits en XML 1.0 (contrôles, demi-paires) retirés pour ne pas déclencher la « réparation » de Word ; tabulations converties en espaces.
7. **Dépendances ajoutées** : `docx` ^9.8.1 et `jszip` ^3.10.1. Le programme grossit d'environ 1 Mo côté interface.

### Limites connues
- Vérifié ici : structure, contenu et signature du `.docx` (tests automatiques, python-docx), mise en page par conversion LibreOffice, génération dans un navigateur. **Non vérifié** : l'ouverture dans Microsoft Word lui-même (absence de message de réparation, rendu exact) ; la build Vite/Tauri de Windows (CI).
- Les polices Calibri, Consolas et Segoe UI Symbol sont référencées, pas embarquées : sur un poste qui ne les a pas, Word choisit une police voisine.
- Pas de table des matières, d'images ni de commentaires dans le document Word.

## Cadrage produit du 25/11/2026 (phase de découverte)

Document de référence : « BA-Mentor — Vision, backlog et roadmap du Workbench BA » (document Claude Docs du 25/11/2026). Les onze décisions de cadrage de David sont validées ; elles guident tous les lots à venir.

### Décisions de cadrage
1. **Vision** : BA-Mentor est le Workbench du Business Analyst et du Product Owner (structurer, analyser, tracer, contrôler, valoriser), avec ou sans IA. Ce n'est ni un mini Jira, ni un mini Azure DevOps, ni un clone de Notion, ni un assistant IA.
2. **IA accélérateur** : fonctionnement complet sans IA ; fournisseur interchangeable (Ollama, Azure OpenAI, Copilot à confirmer techniquement, futurs). Aucune fonction critique ne dépend d'un moteur d'IA.
3. **Priorité au socle métier** : exigences, décisions, risques, traçabilité, tests, référentiels, avant le confort et la présentation.
4. **Modèle de domaine commun** : parties prenantes, besoins, exigences, décisions, risques, user stories, tests et traçabilité ne sont pas des modules indépendants ; ils reposent sur un même modèle de données projet (lot M1).
5. **Quality Framework conservé, sans score unique arbitraire** : critères visibles, explicables, vérifiables (INVEST, SMART, Gherkin). L'IA commente, elle ne calcule pas.
6. **Scénario de référence** : atelier, analyse, exigences, décisions, user stories, tests, traçabilité, livrables. Il sert aux démonstrations, aux entretiens, aux recettes et au futur projet d'exemple.
7. **Adoption pragmatique** : à court terme, projet d'exemple, mémo créateur, guide de démonstration. Reportés : centre documentaire complet, parcours d'apprentissage, aide contextuelle exhaustive, onboarding sophistiqué.
8. **Mode opératoire du créateur** requis : architecture, organisation des données, sauvegarde, restauration, migration, recette, livraison.
9. **Repoussés** : cartographie graphique AS-IS / TO-BE, portfolio BA automatique, packs entreprise, SAFe, Kanban avancé, multi-utilisateur complexe.
10. **Différenciants** : gestion des exigences, registre des décisions, registre des risques, référentiel métier, traçabilité, Quality Framework, génération de backlog, centre UAT. Réserve de l'analyse : pris isolément, plusieurs existent ailleurs ; la valeur est dans la combinaison (traçabilité calculée, filiation de la source, sans IA, portable). Aucune étude de marché n'a été faite.
11. **Public** : utilisateur principal David ; démonstration professionnelle ; utilisateurs externes éventuels dans un second temps.

### Backlog réorganisé (validé le 25/11/2026)
- **MVP, jalon A (registres)** : M1 modèle de domaine commun, ~~M2 registre de modules minimal (ex V2.5)~~ **différé le 25/11/2026 (voir « Lot M2 » ci-dessous)**, M3 parties prenantes, besoins, exigences, M4 décisions et risques. La numérotation des lots suivants est conservée (pas de M2 avant M3).
- **MVP, jalon B (traçabilité)** : M5 user stories et tests, M6 traçabilité calculée (matrice, couverture, orphelins).
- **MVP, jalon C (démonstration)** : M7 atelier léger, M8 livrables depuis les données avec modèles (ex V2.6), M9 projet d'exemple, guide de démonstration, mémo créateur.
- **V2** : Q1 Quality Framework, K1 référentiel métier, A2 atelier avancé, V2.7 reprise des vues V1 (une vue par lot), V2.3c export PDF.
- **V3** : V2.4 fournisseur IA (Ollama puis Azure OpenAI ; test de faisabilité Copilot), IA-1 usages de l'IA, B1 générateur de backlog, U1 centre UAT.
- **V4** : à reconsidérer, aucun lot ouvert.
- **Validations de David** : (1) découpage du MVP en trois jalons ; (2) V2.3c (PDF) et V2.7 repoussés après le MVP ; (3) plusieurs projets dans une même base (déjà vrai : table `projects`).

### Hypothèses prises par défaut (non contredites)
Capacité de recette d'environ un lot toutes les deux semaines ; données de démonstration fictives (aucune donnée de mission réelle dans l'outil) ; référentiels qualité figés au départ, extensibles plus tard ; test de faisabilité Copilot avant V2.4. La réserve du test 12 (import d'un export V1 enrichi) reste ouverte.

## Lot M1 : modèle de domaine commun (schéma 2, version 0.3.0)

**M1 VALIDÉE par David le 25/11/2026.** CI verte sur les trois jobs (typecheck propre après correction de `tests/export.test.ts`), recette `TESTS-M1.md` : tests 1 à 12 OK sur clé USB, dont le refus d'une base au schéma 2 par l'ancienne version 0.2.6. Réserves maintenues : test 12 de V2.3b (import d'un export V1 enrichi) et C13 (optionnel).

Lot d'architecture, sans écran métier.

### Décisions validées par David
- **D16** : modèle hybride. Table commune `items` (projet, type, numéro, code, titre, description, statut, source, dates) ; les champs propres à un type auront leur table au lot du type.
- **D17** : types, statuts et types de liens validés par la couche domain, sans contrainte SQLite. **Dette technique assumée**, à réévaluer si le produit devient multi-utilisateur.
- **D18** : codes lisibles par projet et par type (PP-001, BES-001, EX-001, DEC-001, RIS-001, US-001, TEST-001), jamais réattribués.
- **D19** : matrice de huit types de liens (exprime, dérive, raffine, implémente, vérifie, concerne, menace, atténue) ; elle reste une donnée extensible (par exemple Décision vers Décision, Risque vers Risque) sans refonte du modèle ni migration.
- **D20** : filiation de la source (document et extrait) portée par chaque élément dès M1, alimentée par M7.
- **D21** : migration additive (aucune donnée existante touchée).
- **D22** : couche `src/domain` pure (règle R9 du vérificateur d'architecture).
- **D23** : version 0.3.0.
- **D24** (ajoutée à l'implémentation) : la table `sequences` devient une table technique de `mutate()` (écriture sans ligne de journal), car le compteur d'un code s'incrémente dans la même transaction que l'élément créé, lui journalisé.

### Écarts par rapport au plan présenté (à connaître)
1. **Pas de déclencheur SQLite** : le garde-fou « un lien relie deux éléments du même projet » est porté par deux clés étrangères composées `(from_id, project_id)` et `(to_id, project_id)` vers `items(id, project_id)`. Même garantie, sans instruction à plusieurs `;` qui aurait exigé d'assouplir le garde SQL.
2. **Pas de tables d'extension par type dans M1** : leurs champs sont définis par l'écran de chaque type ; elles arrivent par migrations additives (M3 à M5), pour ne pas figer des champs sans usage.
3. **Pas de ligne ajoutée à l'écran À propos** : il affichait déjà « Schéma de la base » ; il indique désormais 2. Le texte d'introduction de l'écran d'accueil est mis à jour.
4. **Statut seul modifiable** : le journal d'activité n'accepte que `created`, `deleted`, `status_changed`, `imported`. L'édition du titre et de la description attend le premier lot qui en a besoin (M3), qui tranchera la journalisation.

### Choix de conception
1. `items` (UNIQUE projet + code, UNIQUE projet + type + numéro, UNIQUE id + projet pour la clé composée) ; `links` (UNIQUE type + origine + cible, origine différente de la cible).
2. Les compteurs vivent dans `sequences` (`item:<projet>:<type>`), incrémentés dans la transaction de création ; un échec n'en consomme aucun, un numéro attribué n'est jamais rendu.
3. Suppression : liens d'abord, puis éléments, chacun dans le journal (la cascade de la base n'écrirait aucune trace). La suppression d'un projet fait de même. Supprimer le document source d'un élément efface la référence (`SET NULL`) mais garde l'extrait.
4. `checkModelIntegrity()` relit tout et signale type inconnu, statut invalide, code incohérent, source d'un autre projet, compteur en retard, type de lien inconnu, lien non autorisé, lien hors projet. Il n'écrit rien. Contrepartie de D17.
5. Aucun code Rust modifié (le noyau ne connaît pas les tables).

### Limites connues
- Aucune interface ne crée encore d'élément : le modèle n'est exercé que par les tests automatiques et par la migration sur votre base réelle.
- Statuts provisoires : tous les types partagent brouillon, validé, archivé jusqu'aux lots de chaque type.
- Non vérifié ici : build Windows (CI), exécution sur clé. Le Rust est inchangé.
- Tests de type vérifiés ici sur domain, data et les nouveaux tests ; `tests/export.test.ts` signale des erreurs de typage dans mon environnement, sans lien avec M1 et absentes de votre CI jusqu'ici.

## Lot M2 : registre de modules minimal — DIFFÉRÉ (décision du 25/11/2026)

**Aucun développement.** David a retiré M2 du chemin critique avant M3. Raison : M2 n'est pas un prérequis technique de M3 (M3 s'appuie sur le modèle de domaine de M1 ; le registre n'ajoute qu'un confort de masquage), et il n'apporte pas de valeur visible à ce stade (catalogue initial de trois entrées dont une seule, l'export, a un effet). Le registre sera réévalué **lorsqu'il existera suffisamment de modules métier pour justifier son existence** (à partir de M7 à M9, ou dès qu'un module supplémentaire rend l'interrupteur utile).

### Décisions D25 à D31 : validées mais différées
Elles gardent leur validité comme **orientation future** du registre ; aucune n'est implémentée.
- **D25** : l'état d'un module est stocké dans la table `flags` existante (clés préfixées `module.`), sans migration.
- **D26** : catalogue des modules dans le code, une entrée ajoutée par lot.
- **D27** : dépendances déclarées ; désactivation refusée si un module actif en dépend ; pas de cascade.
- **D28** : désactivation = interface masquée **et** actions refusées côté code ; les données restent intactes, lisibles et sauvegardées.
- **D29** : changement d'état journalisé via l'action `status_changed` (type d'objet `module`, clé dans le détail) ; ajustement de `mutate()` pour un objet sans identifiant numérique ; pas de reconstruction de `activity_log`.
- **D30** : **refusée** pour M2 (pas de navigation dans ce lot). La navigation est réévaluée au plan M3.
- **D31** : interrupteurs hérités de la V1 conservés en base, ignorés par l'application, jamais modifiés ; test de non-collision de clés à prévoir.

### Engagements pris pour ne pas renchérir le report
- Chaque registre métier (M3 et suivants) reste derrière **un point d'entrée unique** (un composant d'écran par registre), pour qu'un contrôle d'activation puisse s'y brancher plus tard sans réécrire l'écran.
- La clé de module `export` annoncée plus haut reste non créée ; `exportDocument` ne vérifie toujours aucun drapeau (sans conséquence).
- Versionnement : le prochain lot livré est M3 ; la version n'est pas « réservée » pour M2.

## Lot M3a : navigation, projets, parties prenantes (schéma 3, version 0.4.0)

**M3a VALIDÉE par David le 25/11/2026, D43 incluse.** CI verte sur les trois jobs ; recette `TESTS-M3a.md` : tests 1 à 23 OK sur clé USB, dont la migration du journal sur la base réelle (tests 1 à 6) et l'action `updated` acceptée par la base reconstruite (test 8). Réserves maintenues : test 12 de V2.3b (import d'un export V1 enrichi) et C13 (optionnel).

Premier lot avec des écrans métier. Plan validé le 25/11/2026, « Go M3a » donné le même jour. M3a est la première moitié de M3 ; M3b (besoins, exigences, liens dans les fiches) aura son propre plan.

### Décisions validées par David (25/11/2026)
- **D32** : M3 est découpé en M3a puis M3b, chacun avec son cycle complet.
- **D33** : navigation à gauche. M3a : Projets, Parties prenantes, Technique ; Besoins et Exigences apparaîtront en M3b (pas d'écran vide).
- **D34** : le dernier projet actif est mémorisé dans la table technique `meta` (clé `ui_last_project`), sans ligne de journal. Il est revérifié à chaque lecture : projet supprimé, dossier ou valeur illisible conduisent à un repli sur le premier projet, ou sur aucun.
- **D35** : l'action `updated` est ajoutée au journal. La contrainte CHECK de `activity_log` ne se modifie pas sur place : la table est reconstruite par la migration 3 (copie avec identifiants conservés, suppression, renommage, index recréé). Le détail du journal ne nomme que les champs modifiés, jamais leur contenu.
- **D36** : champs propres à une partie prenante dans `stakeholder_details` (organisation, rôle, influence, intérêt) ; aucune extension pour les besoins ; exigences (nature, priorité MoSCoW, critères) en M3b.
- **D37** : statuts. Parties prenantes : actif, archivé (le premier est celui de création). Besoins et exigences : brouillon, validé, rejeté, archivé, mis en œuvre en M3b ; les autres types gardent les trois statuts provisoires de M1.
- **D38** : seuls trois types de liens seront exposés dans l'interface (exprime, dérive, raffine), en M3b.
- **D39** : filiation de la source non alimentée dans l'interface avant M7.
- **D40** : suppression autorisée avec confirmation, y compris d'un élément lié ; l'archivage est présenté comme la voie normale.
- **D41** : renommage de projet inclus (action `updated`, détail `name`).
- **D42** : pas de grille influence/intérêt calculée (trois niveaux ne se rangent pas dans une grille 2×2 sans seuil arbitraire).

### Décision ajoutée à l'implémentation : D43 (validée par David le 25/11/2026)
Une table d'extension (`stakeholder_details`) ne peut pas porter de ligne de journal propre sans produire deux lignes pour une seule création ou modification. `mutate()` accepte donc une écriture marquée `extension: true`, **uniquement** sur les tables listées dans `EXTENSION_TABLES` (`sql-guard.ts`) et **uniquement** dans un lot qui contient au moins une écriture journalisée de l'élément. Écriture seule, sur une autre table, ou combinée à `activity` : refus. Une création ou une modification reste une seule ligne de journal. Contrairement à D24 (table technique, écritable sans journal), l'extension n'est jamais écrite seule. Alternative écartée : ajouter la table à la liste des tables techniques (garde plus faible). Chaque lot qui crée une table d'extension l'ajoute à `EXTENSION_TABLES`.

### Écarts par rapport au plan présenté (à connaître)
1. **D43** (ci-dessus), non prévue dans le plan.
2. **Limites ajoutées** : nom de projet limité à 200 caractères (création et renommage) ; description d'un élément limitée à 10 000 caractères (création et modification, M1 n'avait pas de limite). Aucune donnée existante n'est concernée (aucun écran ne créait d'élément avant M3a).
3. **Abandon d'une saisie** : confirmation affichée dans l'écran, pas par une fenêtre du navigateur (elle peut ne pas bloquer dans l'application).
4. **En-tête** : le titre « BA-Mentor — état technique » devient « BA-Mentor ». La carte « Tables (15 attendues) » devient « Tables (n) », le nombre réel.
5. **Écran de démarrage** : les projets tant qu'aucun projet n'est actif, sinon les parties prenantes.
6. **Contacts de la V1** : non convertis en parties prenantes (ils servent aux envois de documents).

### Choix de conception
1. Journal : création = une ligne `created` (détail `stakeholder`) ; modification = une ligne `updated` (détail : `title,description,organisation,role,influence,interest` selon ce qui change) ; sans changement réel, aucune écriture ni ligne ; statut = `status_changed` ; suppression = `deleted`, liens d'abord.
2. Création : élément, compteur et détails dans une seule transaction ; le numéro est retrouvé par la valeur courante du compteur.
3. Écrans : chaque registre a un composant d'entrée unique (`src/modules/<registre>/…Screen.tsx`) ; l'affichage est séparé du conteneur (`…View.tsx`, purement par propriétés) ; la logique (filtres, validation, messages) est dans `logic.ts`, testée sans interface.
4. Contrôle d'intégrité : trois anomalies ajoutées (détails manquants, détails d'un autre type, niveau invalide).
5. Aucun code Rust modifié.

### Limites connues
- **Les clics et saisies ne sont pas testés automatiquement** : seuls le rendu statique des écrans et la logique pure le sont. Le comportement interactif repose sur la recette sur clé.
- Le rendu des écrans en test passe par esbuild (présent avec Vite) ; s'il est introuvable, ces tests sont signalés « ignorés » et non « réussis ».
- Date de modification d'un élément : mise à jour à chaque modification (titre, description ou champs).
- La migration 3 reconstruit `activity_log` ; la numérotation continue après le plus grand identifiant. Si des lignes de fin de journal avaient été supprimées auparavant, la numérotation pourrait légèrement reculer (aucun code ne supprime de ligne du journal).
- Non vérifié ici : build Windows (votre CI), comportement sur votre base réelle.

## Lot M3b : besoins, exigences, liens (schéma 4, version 0.5.0)

**M3b VALIDÉE par David le 25/11/2026.** CI verte sur les trois jobs ; recette `TESTS-M3b.md` : tests 1 à 28 OK sur clé USB, dont la migration 3 vers 4 sur la base réelle, le rejeu du parcours M3a et les liens. Réserves maintenues : test 12 de V2.3b et C13 (optionnel). Plan validé le 25/11/2026 : D44 à D51 validées, libellés MoSCoW validés, rejeu des tests de M3a validé, « Go M3b » donné le même jour. La chaîne métier Partie prenante → Besoin → Exigence est celle de la vision produit validée en phase de découverte.

### Décisions validées par David (25/11/2026)
- **D44** : les composants et la logique communs aux registres (filtre par statut, saisie non enregistrée, barres de confirmation, champs de formulaire, messages) sont extraits dans `src/shared/` et réutilisés par les trois registres. L'écran des parties prenantes de M3a est donc modifié : **tous les tests de M3a sont rejoués** pour couvrir ce risque.
- **D45** : un besoin n'a pas de table de détails (titre, description, statut suffisent).
- **D46** : une exigence a une table d'extension `requirement_details` (migration 4) : nature (fonctionnelle, non fonctionnelle, contrainte), priorité MoSCoW (indispensable / Must, important / Should, souhaitable / Could, hors périmètre / Won't), critères d'acceptation (texte libre, 10 000 caractères au plus).
- **D47** : statuts d'un besoin et d'une exigence : brouillon (création), validé, rejeté, archivé. Les transitions sont libres : aucun workflow imposé. Le statut se change en un clic.
- **D48** : trois types de liens exposés dans l'interface : exprime (partie prenante → besoin), dérive (besoin → exigence), raffine (exigence → exigence). Les cinq autres types existent dans la matrice mais ne sont pas proposés. En exposer un de plus = l'ajouter à `EXPOSED_LINK_TYPES`, sans migration.
- **D49** : un lien se crée depuis l'une ou l'autre de ses extrémités, avec le libellé lu dans le bon sens (« dérive en » / « dérive de »). Une section « Liens » figure dans chaque fiche, parties prenantes comprises.
- **D50** : un type de lien qui peut relier deux éléments du même type (aujourd'hui « raffine ») ne peut pas former de boucle : refus à la création, avec le chemin en cause, et contrôle d'intégrité pour une base modifiée hors de l'application.
- **D51** : un élément archivé ou rejeté reste liable et lié.

### Écarts et décisions d'implémentation (à connaître)
1. **La section « Liens » vit dans `src/app/`** (`LinksSection.tsx`), pas dans un module : la règle R1 interdit aux modules de s'importer entre eux, et une fiche de besoin doit proposer des exigences. L'application l'assemble et la transmet aux écrans par la propriété `renderLinks`. L'affichage pur (`LinksView`) est dans `src/shared/`.
2. **`createItem` refuse désormais les types qui ont une table de détails** (`KINDS_WITH_DETAILS` : partie prenante, exigence) : leur création passe par leur dépôt, qui écrit l'élément et ses détails dans une seule transaction. Un tel élément sans détails ne peut plus être créé par accident. Les tests de M1 qui créaient des exigences par `createItem` ont été adaptés.
3. **Valeurs par défaut d'une exigence** : fonctionnelle, importante (Should), critères vides. C'est un choix de ma part, non discuté dans le plan ; il se change dans une seule constante.
4. **Contrôle d'intégrité** : quatre anomalies ajoutées (détails d'exigence manquants, détails sur un autre type, valeur de nature ou de priorité invalide, boucle de liens).
5. **Journal** : création = une ligne `created` ; modification = une ligne `updated` qui nomme les champs modifiés (`title,description,nature,priority,criteria`), jamais leur contenu ; rien n'est écrit si rien ne change ; un lien créé ou retiré = une ligne `link`.
6. **D43 réutilisée** : `requirement_details` est ajoutée à `EXTENSION_TABLES`. Aucune modification du garde-fou au-delà.
7. Aucun code Rust modifié.

### Limites connues
- **Les clics et saisies ne sont pas testés automatiquement** (comme en M3a) : seuls la logique pure et le rendu statique le sont. L'ajout et le retrait de liens depuis la fiche, le changement de statut en un clic et l'enchaînement des écrans reposent sur la recette sur clé.
- Les compteurs de numérotation (`sequences`) d'un projet supprimé restent dans la base : les identifiants de projet ne sont jamais réutilisés, ils sont sans effet. Comportement antérieur à M3b, non modifié.
- Les types de liens non exposés (vérifie, concerne, menace, atténue, implémente) ne peuvent pas être créés depuis l'interface avant les lots qui les concernent.
- Un lien « raffine » dans les deux sens entre deux exigences est refusé comme boucle, volontairement.
- Non vérifié ici : build Windows (votre CI), comportement sur votre base réelle.

## Lot M4 : décisions, risques (schéma 5, version 0.6.0)

**M4 VALIDÉE par David le 25/11/2026.** CI verte sur les trois jobs ; recette `TESTS-M4.md` : tests 1 à 30 OK sur clé USB, dont la migration 4 vers 5 sur la base réelle, le rejeu des parcours Besoins et Exigences, le sélecteur de date et les liens étendus. Réserves maintenues : test 12 de V2.3b et C13 (optionnel). Plan présenté le 25/11/2026 ; D52 à D60 validées le même jour (D58 avec l'ajout du lien « remplace »), « Go M4 » donné.

### Décisions validées par David (25/11/2026)
- **D52** : un seul lot M4 (pas de M4a/M4b), car aucun écran validé n'est refondu et les composants communs existent depuis D44.
- **D53** : une décision a une table d'extension `decision_details` : date (jour seul AAAA-MM-JJ, facultative, chaîne vide si absente), décideur (texte libre, 200 caractères), alternatives envisagées et justification (textes libres, 10 000 caractères). La description commune sert de contexte. Le décideur n'est pas un lien vers une partie prenante.
- **D54** : statuts d'une décision : Proposée (création), Prise, Remplacée, Annulée, Archivée. Transitions libres.
- **D55** : un risque a une table d'extension `risk_details` : probabilité et impact (Faible, Moyen, Élevé), plan de traitement (10 000 caractères), responsable (200 caractères). **Aucun score ni matrice calculés**, par cohérence avec D42.
- **D56** : statuts d'un risque : Identifié (création), En traitement, Accepté, Clos, Archivé. Transitions libres.
- **D57** : trois types de liens ajoutés à l'interface : « concerne » (décision vers besoin, exigence ou risque), « menace » (risque vers besoin ou exigence), « atténue » (exigence ou décision vers risque). « Implémente » et « vérifie » attendent M5.
- **D58** (avec l'ajout demandé par David) : lien « remplace » entre deux décisions, avec son sens inverse « remplacé par ». Une ligne dans la matrice des liens, aucune migration. Les boucles sont refusées par le mécanisme de D50, sans nouveau code de contrôle.
- **D59** : le cadre de fiche (en-tête, statut, actions, confirmation de suppression), l'en-tête de liste et l'écran « sans projet » sont extraits dans `src/shared/ui.tsx`. L'écran Besoins/Exigences de M3b les utilise désormais : ses tests de rendu, inchangés, passent.
- **D60** : journal et intégrité comme en M3b (une ligne `created` ou `updated` par opération qui nomme les champs sans contenu ; tables ajoutées à `EXTENSION_TABLES` (D43) ; `createItem` refuse décisions et risques sans détails) ; le contrôle d'intégrité gagne six anomalies et la boucle de « remplace ».

### Écarts et décisions d'implémentation (à connaître)
1. **Libellés accordés selon le type** : `statusLabel(statut, type)` accepte désormais le type pour l'accord (« Archivée » pour une décision, « Archivé » pour un risque, un besoin ou une exigence). Sans type, le libellé reste celui d'avant. Les listes de liens passent le type de l'élément lié.
2. **Liste « Ajouter un lien »** : elle n'annonce que les types qui ont un écran (`KINDS_WITH_SCREEN`, `navigation.ts`). Une décision propose donc « concerne (Besoin ou Exigence ou Risque) », sans « User story » avant M5. La liste des candidats, elle, ne change pas.
3. **Fonctions communes de plus** : le message d'erreur de titre (`titleProblem`) passe dans `register-logic.ts` ; `emptyListText` accepte un libellé de « tout » (« Toutes » pour les décisions, féminin) ; `TextField` accepte `type="date"`.
4. **Date de décision** : champ de type date du navigateur ; stockée en texte AAAA-MM-JJ. La couche domain refuse les jours inexistants (30 février, 29 février d'une année non bissextile) ; le contrôle d'intégrité signale une date illisible en base.
5. **Nouvelles options de liens dans des fiches déjà validées** : Besoin (« concerné par », « menacé par »), Exigence (« concerné par », « menacé par », « atténue »). Les tests qui figeaient leurs listes d'options ont été mis à jour ; la recette reteste ces fiches.
6. **Navigation à sept entrées** : toujours lisible ; à réévaluer avant M5 (D30 de M3).
7. Aucun code Rust modifié.

### Limites connues
- **Les clics et saisies ne sont pas testés automatiquement** : seuls la logique pure et le rendu statique le sont. Le champ date (sélecteur du navigateur de l'application) n'est vérifié que par la recette.
- « Remplacée » n'est pas déduite du lien « remplace » (ni l'inverse) : les deux se renseignent séparément, par choix (transitions libres, D54).
- Le lien « concerne » vers une user story existe dans la matrice mais ne sera créable qu'avec M5.
- Non vérifié ici : build Windows (votre CI), comportement sur votre base réelle.

## Lot M5 : user stories, tests (schéma 6, version 0.7.0)

**M5 en attente de recette.** Plan présenté le 25/11/2026 ; D61 à D69 validées le même jour (D63 avec la préférence « Rejetée » plutôt que « Abandonnée »), option B pour D67, « Go M5 » donné. Recette : `TESTS-M5.md`. Réserves maintenues : test 12 de V2.3b et C13 (optionnel).

### Décisions validées par David (25/11/2026)
Les intitulés ci-dessous décrivent ce qui a été **implémenté** pour chaque numéro ; en cas de différence avec le plan validé, le plan fait foi et l'écart est à signaler.
- **D61** : un seul lot M5 pour les user stories et les tests (deux types, un schéma 6, une migration).
- **D62** : une user story a une table d'extension `story_details` : rôle (« En tant que », 200 caractères), « Je veux » et « Afin de » (2 000 caractères chacun), critères d'acceptation (texte libre, 10 000 caractères). La description commune reste disponible. Code `US-001`.
- **D63** : statuts d'une user story : Brouillon (création), Prête, Réalisée, **Rejetée** (préférence de David), Archivée. Transitions libres. Libellés accordés au féminin.
- **D64** : un test a une table d'extension `test_details` : type (Unitaire, Intégration, Recette (UAT) ; Recette par défaut), préconditions, étapes et résultat attendu (textes libres, 10 000 caractères), date de dernière exécution (jour seul AAAA-MM-JJ, facultative). Code `TEST-001`.
- **D65** : statuts d'un test = dernier résultat connu : À exécuter (création), Réussi, Échoué, Bloqué, Archivé. Transitions libres. **Aucun historique d'exécutions** : modifier le statut ou la date écrase l'information précédente (le journal garde seulement les noms de champs modifiés).
- **D66** : les liens « implémente » (user story vers exigence) et « vérifie » (test vers user story ou exigence) deviennent créables ; les neuf types de la matrice sont désormais tous exposés. « Concerne » vers une user story devient aussi créable depuis une décision.
- **D67 (option B)** : menu regroupé en sections nommées, sans repli : Projets ; **Analyse** (Parties prenantes, Besoins, Exigences) ; **Pilotage** (Décisions, Risques) ; **Réalisation** (User stories, Tests) ; Technique. Neuf écrans.
- **D68** : les écrans conteneurs (`StoriesScreen`, `TestsScreen`) sont écrits sur le modèle de `DecisionsScreen` et `RisksScreen`. La duplication entre écrans conteneurs est **une dette documentée** : à traiter par une extraction commune quand un lot la justifiera (et non dans M5, pour ne pas toucher aux écrans validés).
- **D69** : journal et intégrité comme en M3b et M4 (une ligne `created` ou `updated` par opération, noms des champs sans contenu ; `story_details` et `test_details` ajoutées à `EXTENSION_TABLES` ; `createItem` refuse story et test sans détails) ; le contrôle d'intégrité gagne six anomalies (détails manquants, détails sur un mauvais type, type de test inconnu, date d'exécution illisible).

### Écarts et décisions d'implémentation (à connaître)
1. **Statuts « commun » supprimés** : la liste de statuts commune à story et test (M1) disparaît ; chaque type a la sienne. Les éléments existants de ces types (aucun en pratique avant M5, aucun écran ne permettait d'en créer) ne seraient pas migrés ; le contrôle d'intégrité les signalerait.
2. **Libellés** : `statusLabel(statut, type)` gagne les formes de la user story (Rejetée, Archivée).
3. **Fonction d'affichage de date** : `decisionDateLabel` est renommée `dayLabel` (elle sert maintenant aux décisions et aux tests).
4. **Liste « Ajouter un lien »** : tous les types ont un écran, la liste annonce donc aussi User story et Test (ex. « concerne (Besoin ou Exigence ou Risque ou User story) »). Les tests qui figeaient ces listes ont été mis à jour ; la recette reteste les fiches déjà validées.
5. **Navigation** : `NAV_SECTIONS` remplace la liste plate ; `SCREENS` en est déduite. Les intitulés de section ne sont pas cliquables.
6. Aucun code Rust modifié. Version 0.7.0 (trois manifestes alignés).

### Limites connues
- **Les clics et saisies ne sont pas testés automatiquement** : seuls la logique pure et le rendu statique le sont. Le sélecteur de date et l'aspect du menu regroupé (retour à la ligne en fenêtre étroite) ne sont vérifiés que par la recette.
- Pas d'historique des exécutions de test (D65), pas de calcul de couverture ni d'éléments orphelins : prévus au lot suivant (traçabilité calculée).
- Un test se relie à une user story ou à une exigence ; rien n'oblige à relier quoi que ce soit.
- Non vérifié ici : build Windows (votre CI), comportement sur votre base réelle.

## Non vérifié lors de l'écriture (à valider via GitHub Actions)
- Compilation et tests de `backup.rs` et `main.rs` (dépendent de `rusqlite` et de Tauri, inaccessibles ici), dont la commande `import_pick_file` et la boîte de dialogue Windows. `files.rs` (std seule) a été compilé et testé ici : 15 tests. Pour V2.3a : la commande `export_save` et l'utilisation de `set_file_name` / `set_directory` / `blocking_save_file` du plugin de dialogue.
- Build Vite + Tailwind, rendu final, `tauri build`, exécution réelle.
