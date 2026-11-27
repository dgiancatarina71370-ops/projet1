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

**M5 VALIDÉE par David le 25/11/2026.** CI verte sur les trois jobs ; recette `TESTS-M5.md` : tests 1 à 29 OK sur clé USB, avec deux constats traités pendant la recette (ligne `migrated_6_at` de `meta`, attendue ; accord des libellés de liens, voir écart 6). La revérification explicite de l'accord après correctif n'a pas été rapportée séparément : la validation globale la couvre. Plan présenté le 25/11/2026 ; D61 à D69 validées le même jour (D63 avec la préférence « Rejetée » plutôt que « Abandonnée »), option B pour D67, « Go M5 » donné. Réserves maintenues : test 12 de V2.3b et C13 (optionnel).

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
6. **Accord des libellés de liens (écart constaté en recette M5, test 18)** : le libellé inverse s'accorde désormais avec l'élément courant (« concernée par » sur une user story, une exigence ou une décision ; « raffinée par », « remplacée par », « implémentée par », « vérifiée par », « menacée par », « atténuée par » de même). Cela modifie aussi l'affichage de fiches validées en M3b et M4 (ex. « raffiné par » devient « raffinée par » sur une exigence). L'accord est vérifié par les tests sur les listes d'options ; le branchement dans l'écran des liens existants (`LinksSection`) n'a pas de test automatique, il se vérifie à la recette.
7. La ligne `migrated_6_at` de la table `meta` s'ajoute à chaque migration : attendu, le protocole l'excepte.
8. Aucun code Rust modifié. Version 0.7.0 (trois manifestes alignés).

### Limites connues
- **Les clics et saisies ne sont pas testés automatiquement** : seuls la logique pure et le rendu statique le sont. Le sélecteur de date et l'aspect du menu regroupé (retour à la ligne en fenêtre étroite) ne sont vérifiés que par la recette.
- Pas d'historique des exécutions de test (D65), pas de calcul de couverture ni d'éléments orphelins : prévus au lot suivant (traçabilité calculée).
- Un test se relie à une user story ou à une exigence ; rien n'oblige à relier quoi que ce soit.
- Non vérifié ici : build Windows (votre CI), comportement sur votre base réelle.

## Lot M6 : traçabilité calculée (schéma 6 inchangé, version 0.8.0)

**M6 VALIDÉE par David le 26/11/2026.** CI verte ; recette `TESTS-M6.md` : tests 1 à 23 OK sur clé USB, dont l'ouverture de fiche sur les sept types, la lecture seule et le retour arrière vers la 0.7.0. Plan présenté le 26/11/2026 ; D70 à D78 validées le même jour (D74 avec le tri MoSCoW conseillé, appliqué par défaut ; D76 option B), « Go M6 » donné. Réserves maintenues : test 12 de V2.3b et C13 (optionnel).

### Décisions validées par David (26/11/2026)
- **D70** : un écran « Traçabilité » en lecture seule, dans une nouvelle section « Contrôle » du menu (dix écrans). Un bandeau de couverture toujours visible, puis deux onglets : Matrice et Orphelins.
- **D71** : chaîne de référence : Partie prenante —exprime→ Besoin —dérive en→ Exigence ←implémente— User story ←vérifie— Test, un Test pouvant aussi vérifier une Exigence directement. Les liens de décisions et de risques sont hors chaîne.
- **D72** : couverture en « x sur y », sans score : parties prenantes avec un besoin ; besoins avec une exigence ; exigences avec une story ; exigences **testées** (test direct ou via une story qui l'implémente) ; exigences dont le résultat est Réussi ; exigences Must testées. Résultat d'une exigence = le pire de ses tests (Échoué, Bloqué, À exécuter, Réussi ; « Aucun test »).
- **D73** : les éléments archivés ou rejetés sont exclus du calcul (ni couvrants, ni à couvrir) ; le bandeau indique leur nombre.
- **D74** : matrice, une ligne par exigence (besoins, stories, tests directs, tests via story, résultat), filtre « Indispensable (Must) seulement ». **Tri : MoSCoW (Must, Should, Could, Won't, priorité inconnue) puis code**, selon ton conseil.
- **D75** : sept listes d'orphelins (parties prenantes sans besoin ; besoins sans exigence ; exigences sans story ; exigences sans test ; stories sans exigence ; stories sans test ; tests qui ne vérifient rien). Décisions et risques isolés : non listés.
- **D76 (option B)** : un clic sur un code ouvre la fiche de l'élément dans son écran de registre.
- **D77** : calcul = fonction pure `computeTraceability` (`src/domain/traceability.ts`) ; lecteur en lecture seule (`src/data/repositories/traceability.ts`) ; aucune écriture, aucun journal, aucune migration.
- **D78** : hors périmètre : export (M8), seuils ou couleurs « bon ou mauvais », analyse d'impact, correction automatique.

### Écarts et décisions d'implémentation (à connaître)
1. **Statut de test inattendu** : un test dont le statut n'est pas l'un des quatre connus rend le résultat de l'exigence « À exécuter », jamais « Réussi ». (Un premier jet le laissait passer ; attrapé par un test avant livraison.)
2. **Éléments ignorés** : le compteur ne porte que sur les types de la chaîne (parties prenantes, besoins, exigences, stories, tests), pas sur les décisions ni les risques.
3. **Test qui ne vérifie plus qu'un élément archivé ou rejeté** : il devient « test qui ne vérifie rien » (sa cible n'est plus active).
4. **Doublon** : un test qui vérifie à la fois l'exigence et une de ses stories est compté **direct** (pas deux fois).
5. **Dernière exécution** : la matrice affiche la date la plus récente parmi les tests de l'exigence, à titre d'information ; aucun jugement de fraîcheur (D65 : pas d'historique).
6. **Ouverture de fiche (D76)** : chacun des sept écrans de registre accepte une demande « ouvrir tel élément » et ouvre la fiche dès que sa liste est chargée ; la demande est effacée une fois traitée **et** à toute navigation par le menu, pour qu'elle ne reste jamais en attente. Le crochet React est dans `shared/use-open-request.ts` ; la règle (`shouldOpen`) est dans `shared/open-request.ts`, sans React, pour rester testable.
7. **Nouveau composant** : `TabBar` (onglets) dans `shared/ui.tsx`.
8. Aucun code Rust modifié ; aucune migration ; version 0.8.0 (trois manifestes alignés). La 0.7.0 doit pouvoir rouvrir une base utilisée par la 0.8.0 (schéma identique) : vérifié par la recette.

### Limites connues
- **Les clics ne sont pas testés automatiquement** : ouverture de fiche, changement d'onglet et filtre ne se vérifient qu'à la recette. Le branchement de l'ouverture dans les sept écrans est contrôlé par un test qui lit le texte des sources (il vérifie la présence du crochet et du passage de la demande, pas son exécution).
- Performance sur une très grosse base : non mesurée (le projet est chargé en mémoire).
- La matrice est parlante seulement avec des données : le projet d'exemple (M9) y remédiera.
- Non vérifié ici : build Windows (votre CI), comportement sur votre base réelle.

## Lot M7 : ateliers (schéma 7, version 0.9.0)

**M7 VALIDÉE par David le 26/11/2026.** Plan présenté le 26/11/2026 ; D79 à D87 validées le même jour (D86 option A), « Go M7 » donné. Recette `TESTS-M7.md` : tests 1 à 25 OK sur clé USB. Réserves maintenues : test 12 de V2.3b et C13 (optionnel).

### Décisions validées par David (26/11/2026)
- **D79** : un seul lot M7 (schéma 7, version 0.9.0, une migration : `workshop_details`).
- **D80** : un atelier (code **ATL-001**) a une table d'extension : date (jour seul AAAA-MM-JJ, facultative), lieu ou format (200 caractères), objectif (2 000), notes (10 000), points ouverts et actions (10 000). Les participants sont des liens (D82), pas un champ texte.
- **D81** : statuts : Planifié (création), Tenu, Archivé. Transitions libres.
- **D82** : deux types de liens (onze au total) : « participe à » (partie prenante vers atelier, inverse « réunit ») et « provient de » (besoin, exigence, décision ou risque vers atelier, inverse « est à l'origine de »). Libellés neutres en genre.
- **D83** : « Ateliers » ouvre la section Analyse (onze écrans).
- **D84** : la traçabilité calculée de M6 ne change pas (la chaîne reste celle de D71). Aucun ratio « avec un atelier source ».
- **D85** : hors périmètre : canevas d'animation, minuteur, saisie en direct, pièces jointes, export du compte rendu (M8), IA. Les points ouverts et actions sont du texte libre non suivi.
- **D86 (option A)** : l'écran Ateliers est copié sur le modèle des autres écrans de registre. **La dette de duplication de D68 grandit** : huit écrans de registre sur le même modèle ; à traiter avant ou pendant M8, avec une recette dédiée (aucune extraction dans M7).
- **D87** : ouverture de fiche (D76) prévue pour le nouveau type ; journal sans contenu ; trois anomalies d'intégrité de plus ; listes « Ajouter un lien » des fiches Partie prenante, Besoin, Exigence, Décision, Risque enrichies.

### Écarts et décisions d'implémentation (à connaître)
1. **Ouverture de fiche d'un atelier** : le mécanisme est branché (l'écran Ateliers l'accepte, l'application lui passe la demande), mais **aucun écran ne la déclenche encore** pour un atelier : l'écran Traçabilité ne contient pas les ateliers (D84), et les codes des listes de liens ne sont pas cliquables. Elle servira avec M8 ou M9. Un test vérifie le branchement par lecture des sources ; la correspondance type vers écran est testée.
2. **Date d'atelier** : la fonction d'affichage `dayLabel` et la validation de date restent celles des décisions (`domain/decisions.ts`), partagées par les tests et les ateliers.
3. **Listes d'options de liens** : de nouvelles options apparaissent à la fin des listes des cinq types concernés (ex. « provient de (Atelier) »). Les tests qui figeaient ces listes ont été mis à jour.
4. **Aucun changement de calcul pour M6** : un test vérifie qu'ajouter un atelier, ses liens, puis l'archiver ne modifie ni couverture, ni orphelins, ni éléments ignorés.
5. Aucun code Rust modifié. Version 0.9.0 (trois manifestes alignés).

### Limites connues
- **Les clics et saisies ne sont pas testés automatiquement** : seuls la logique pure et le rendu statique le sont. Le sélecteur de date ne se vérifie qu'à la recette.
- La liste des ateliers est triée par code (ordre de création), pas par date.
- Les colonnes de source du modèle (document source et extrait cité, présentes depuis M1) restent inutilisées : la filiation passe par les liens.
- Sans M8, un atelier n'est qu'une fiche : rien ne s'exporte encore.
- Non vérifié ici : build Windows (votre CI), comportement sur votre base réelle.

## Lot M8 : livrables générés depuis les données (schéma 7 inchangé, version 0.10.0)

**M8 VALIDÉE par David le 26/11/2026** (recette `TESTS-M8.md` OK après le correctif : barres verticales supprimées, pluriel de la matrice corrigé). Plan présenté le 26/11/2026 ; D88 à D97 validées le même jour, « Go M8 » donné. Retour de recette partiel du 26/11/2026 : matrice Word lisible et sans message de réparation ; barres verticales du compte rendu refusées (option A) et pluriel de la phrase de périmètre de la matrice, corrigés dans cette livraison. Recette : `TESTS-M8.md`. Réserves maintenues : test 12 de V2.3b et C13 (optionnel).

### Décisions validées par David (26/11/2026)
- **D88** : un seul lot, sans migration (schéma 7, version 0.10.0, aucun code Rust modifié). La 0.9.0 peut rouvrir une base utilisée par la 0.10.0.
- **D89 (option A)** : le livrable est généré à la volée, jamais enregistré dans la table `documents`.
- **D90** : sept modèles fixes (pas de modèles modifiables par l'utilisateur) : compte rendu d'atelier, registre des exigences, registre des décisions, registre des risques, backlog des user stories, cahier de recette, matrice de traçabilité.
- **D91** : écran « Livrables » (douzième écran, fin de la section Pilotage) : modèle, atelier (compte rendu), case « inclure les éléments archivés ou rejetés » (décochée), « Enregistrer sous… », aperçu texte, export Markdown, HTML ou Word.
- **D92 (option A)** : bouton « Exporter le compte rendu » sur la fiche d'un atelier ; il ouvre l'écran Livrables avec le modèle et l'atelier présélectionnés.
- **D93** : le texte saisi n'est jamais interprété comme du Markdown (échappement des caractères, début de ligne neutralisé). **Corrigé après recette (26/11/2026, option A de David)** : le texte libre n'est plus mis en citation (barre verticale à gauche, jugée peu lisible dans le compte rendu) ; il s'affiche en paragraphes ordinaires sous un intitulé en gras, dans les sept modèles. La sécurité vient de l'échappement, pas de la citation.
- **D94** : en-tête (projet, périmètre, synthèse), dates JJ/MM/AAAA, « Aucun… » pour une section vide, tri fixe (code ; priorité MoSCoW puis code pour les exigences ; ordre de M6 pour la traçabilité), signature ajoutée une fois par le pipeline.
- **D95 (option A)** : la dette de duplication des écrans de registre (D68) n'est **pas** traitée dans M8 ; elle fait l'objet d'un lot dédié **M8b**, avant M9. **Changement de position assumé** par rapport à M7 (« avant ou pendant M8 ») : M8 est du code neuf, le mêler à une refonte de huit écrans validés aurait rendu un défaut de recette inattribuable.
- **D96** : un export ne modifie aucune donnée et ne laisse aucune ligne au journal (comme depuis V2.3a).
- **D97** : hors périmètre : PDF (V2.3c), modèles modifiables, graphiques ou images, enregistrement dans `documents`, envoi par messagerie, IA, lien cliquable depuis un code vers sa fiche.
- **Séquencement validé** : M8 (livrables), M8b (dette D68), M9 (projet d'exemple, guide, mémo), puis « UX+ » (améliorations ergonomiques après stabilisation).

### Choix de conception
1. **Couches** : `src/export/deliverables/models.ts` (sept générateurs purs : données du projet vers Markdown) et `text.ts` (neutralisation du texte) ; `src/data/repositories/project-export.ts` (lecteur en lecture seule : éléments, champs des tables d'extension, liens d'un seul projet) ; `exportGeneratedToFile` dans `src/export/service.ts`, qui réutilise le pipeline existant (signature, Markdown, HTML, Word) sans le modifier. Le type `ProjectData` vit dans `src/domain/project-data.ts` pour que la couche data et la couche export le partagent sans dépendre l'une de l'autre (règle R3).
2. **Périmètre** : les éléments archivés ou rejetés (mêmes statuts que D73 de M6) sont exclus par défaut et le document le dit (« 2 éléments archivés ou rejetés exclus »). La matrice de traçabilité les ignore toujours (calcul de M6, inchangé) ; la case est alors inactive et expliquée.
3. **Mise en forme** : une table de synthèse (colonnes courtes), puis des fiches « Détail » seulement pour les éléments qui ont du texte long renseigné. Les champs vides ne sont pas listés dans les fiches ; le compte rendu écrit « Non renseigné » pour ses champs fixes.
4. **Atelier** : tous les ateliers sont proposés, archivés compris (on choisit celui dont on veut le compte rendu). Participants = liens « participe à », éléments issus = liens « provient de » (besoins, exigences, décisions, risques).
5. **Libellés de la matrice** : copiés de l'écran Traçabilité ; un test vérifie qu'ils sont identiques (une divergence ferait dire deux choses différentes à l'écran et au document).
6. **Nom de fichier et titre** : « <modèle> <projet> » assaini par la règle existante (100 octets au plus) ; un compte rendu s'appelle « Compte rendu atelier ATL-001 <titre> ».

### Écarts et points à connaître
1. **Barres obliques inverses visibles** : pour neutraliser le texte, le Markdown généré contient des « \ » devant les caractères spéciaux (« Gestion\_des\_données », « a \| b »). Elles sont visibles dans l'**aperçu** et dans le fichier **.md** brut ; elles ne le sont pas dans le HTML ni dans le Word (le rendu les interprète). C'est le prix de D93.
2. **Adresse web saisie telle quelle** : une adresse commençant par `http://` ou `https://` écrite dans un texte devient un lien cliquable dans le HTML et le Word (comportement existant du moteur d'export, adresses sûres seulement). Un lien « déguisé » `[texte](adresse)` saisi par l'utilisateur est neutralisé ; un test le vérifie.
3. **Ouverture de fiche d'atelier** (écart de M7) : toujours aucun écran ne la déclenche ; le bouton de D92 va vers Livrables, pas vers la fiche.
4. **Aucun plafond de taille** : l'aperçu affiche tout le texte généré ; un projet très volumineux pourrait ralentir l'écran. Un test génère et exporte en Word 200 exigences ; le comportement de l'écran sur un très gros projet n'est pas vérifié.
5. **Tests existants mis à jour** : douze écrans (au lieu de onze) dans quatre fichiers de test.
6. Aucune migration, aucun code Rust. Version 0.10.0 (trois manifestes alignés).

### Limites connues
- **Non vérifié ici** : l'ouverture des fichiers Word dans Microsoft Word lui-même (absence de message de réparation, largeur des colonnes). **La matrice de traçabilité (six colonnes, titres longs) en portrait A4 est le point le plus risqué** ; c'est le premier à regarder à la recette. Compilation Windows (CI), boîte « Enregistrer sous… », clics, aperçu à l'écran, performances.
- Pas de PDF (V2.3c), pas de table des matières ni de page de garde, pas de modèle modifiable.
- Le contenu d'un document dépend uniquement de l'état de la base au moment de l'export ; rien n'est figé ni versionné.
- Les sections de détail reprennent le texte libre en paragraphes ordinaires ; la mise en forme saisie par l'utilisateur (gras, listes) est volontairement perdue.

## Lot M8b : dette de duplication des écrans de registre (D68), pilote Ateliers et Risques (version 0.10.1)

**M8b en cours (pilote).** Plan présenté le 26/11/2026 ; D98 à D104 validées, « Go M8b » donné avec sept conditions de recette : (1) inventaire préalable des écarts dans ce fichier, (2) respect strict de R4, (3) aucun changement visible, (4) pilote limité à Ateliers et Risques, (5) `TESTS-M8b.md` livré, (6) toute divergence découverte documentée et non corrigée par défaut, (7) un écran qui ne rentre pas proprement dans le modèle générique reste hors refactoring et est signalé. Séquencement validé : M8 (livrables), M8b (dette D68), M9 (projet d'exemple, guide, mémo), puis « UX+ ».

### Décisions validées par David (26/11/2026)
- **D98** : seuls les huit conteneurs « Screen » sont concernés ; vues, `logic.ts`, dépôts et domaine ne changent pas ; aucun changement visible.
- **D99 (option A)** : composant générique `RegisterScreen` piloté par une configuration ; les accès aux données sont **injectés** par chaque écran (règle R4 : `shared/` n'importe pas `data/`).
- **D100 (oui)** : les transitions d'état des écrans deviennent des fonctions pures testées (première couverture automatique de ce comportement).
- **D101 (option B)** : pilote sur **Ateliers et Risques** (version 0.10.1), puis les six autres écrans après recette.
- **D102** : recette par rejeu d'un script unique, complet sur le pilote, réduit ensuite.
- **D103** : hors périmètre : vues et `logic.ts`, changements ergonomiques (UX+), nouvelles fonctions, écrans Projets, Traçabilité et Livrables.
- **D104** : toute incohérence entre écrans est **conservée** par configuration et listée ; tout défaut existant est signalé et corrigé seulement sur demande.

### Inventaire des écarts entre les huit écrans (condition 1)
Méthode : comparaison des huit fichiers `*Screen.tsx` après remplacement des mots propres à chaque type, puis lecture des écarts restants. Les écrans lus intégralement : Ateliers, Parties prenantes ; les six autres comparés par différence avec Ateliers.

**Identique dans les huit écrans** (donc candidat à l'extraction) : les trois modes liste, fiche et formulaire ; le rechargement de la liste et l'affichage d'une erreur de chargement ; le retour à la liste au changement de projet (sans réinitialiser le filtre ni la confirmation d'abandon) ; l'ouverture de fiche demandée par la traçabilité (D76) ; l'exécution d'une action (occupé, erreur, rechargement, signal de changement à l'application) ; la confirmation de suppression avec le nombre de liens ; l'abandon d'un formulaire modifié ; la création puis l'ouverture de la fiche créée ; le message « n'existe plus » avec retour à la liste ; le cadre de la fiche et l'emplacement des liens sous la fiche.

**Ce qui change d'un écran à l'autre** (à porter par la configuration) :
| Écran | Titre, sujet « sans projet » | Message « n'existe plus » | Titre du formulaire (création / modification) | Source des données |
|---|---|---|---|---|
| Parties prenantes | « Parties prenantes », aucun sujet (voir écart 1) | Cette partie prenante | Nouvelle / Modifier la partie prenante | dépôt `stakeholders` |
| Besoins | « Besoins », « Les besoins » | Ce besoin | Nouveau / Modifier le besoin | dépôt générique `items` (pas de table d'extension) |
| Exigences | « Exigences », « Les exigences » | Cette exigence | Nouvelle / Modifier l'exigence | dépôt `requirements` |
| Décisions | « Décisions », « Les décisions » | Cette décision | Nouvelle / Modifier la décision | dépôt `decisions` |
| Risques | « Risques », « Les risques » | Ce risque | Nouveau / Modifier le risque | dépôt `risks` |
| User stories | « User stories », « Les user stories » | Cette user story | Nouvelle / Modifier la user story | dépôt `stories` |
| Tests | « Tests », « Les tests » | Ce test | Nouveau / Modifier le test | dépôt `testcases` |
| Ateliers | « Ateliers », « Les ateliers » | Cet atelier | Nouvel / Modifier l'atelier | dépôt `workshops` |

Écarts propres à certains écrans :
1. **Parties prenantes** (écran le plus ancien, M3a) : son « sans projet » est un composant local sans sujet (le texte n'est pas construit comme les autres) ; sa fiche reçoit `onToggleArchive` (archiver ou réactiver, seulement deux statuts actifs ou archivé) et non `onChangeStatus` ; son filtre et sa logique (`StatusFilter`, `formFrom`, `validateForm`, `emptyListMessage`) sont dans son propre `logic.ts`. **Il entre dans le modèle seulement avec un adaptateur de fiche ; il est traité à la généralisation, pas dans le pilote, et reste hors refactoring si l'adaptateur n'est pas propre (condition 7).**
2. **Besoins** : pas de table d'extension : création et mise à jour par le dépôt générique `items` ; formulaire réduit au titre et à la description.
3. **Ateliers** : la fiche porte un bouton supplémentaire « Exporter le compte rendu » (D92), alimenté par une propriété de l'écran.
4. **Élisions** : Exigences et Ateliers écrivent « Modifier l'exigence » et « Modifier l'atelier » (article élidé) ; les autres écrans écrivent « le » ou « la » ; Ateliers écrit aussi « Nouvel atelier ». Simple différence de texte, reprise telle quelle.
5. **Accents et pluriels** : aucun écart de comportement, seulement de texte (accords au genre) : tous les libellés ci-dessus sont repris à l'identique dans la configuration.

**Divergences découvertes** (documentées, non corrigées, condition 6) :
- Parties prenantes : « sans projet » sans sujet (écart 1) ; archivage par bascule au lieu du changement de statut libre des autres écrans (choix d'origine de M3a, antérieur à D47).
- La confirmation d'abandon (`askAbandon`) n'est pas remise à zéro quand on change de projet ; elle l'est à l'ouverture suivante d'un formulaire (comportement identique dans les huit écrans, conservé).

### M8b, pilote Ateliers + Risques (version 0.10.1) : état de livraison

- Fichiers : `src/shared/register-state.ts` (transitions pures), `src/shared/register-screen.tsx` (composant générique, aucune importation de `data/` : R4), `src/data/repositories/register-ops.ts` (statut, suppression, comptage de liens, partagés), `WorkshopsScreen.tsx` et `RisksScreen.tsx` réduits à une configuration. Vues, `logic.ts`, dépôts et domaine inchangés.
- Écart relevé et conservé (D104) : l'état du formulaire et la question d'abandon ne sont pas remis à zéro au changement de projet (identique dans les huit écrans d'origine).
- Tests : `tests/m8b.test.ts` (transitions et structure). Trois tests de lecture de code source (ui-m6, ui-m7, ui-m8) ont été adaptés : ils vérifient désormais le crochet d'ouverture dans le composant générique et la délégation des écrans pilotes.
- Non vérifié ici : rendu et comportement réels à l'écran (recette `TESTS-M8b.md`), compilation Rust et build Tauri (GitHub Actions). Le contrôle de types local s'appuie sur des déclarations React simplifiées : le `tsc` du dépôt (types React réels) reste à confirmer par `verify` dans Actions.

### M8b, généralisation (version 0.10.2) : état de livraison

- Pilote Ateliers + Risques validé le 26/11/2026. Les six autres écrans (Besoins, Exigences, Décisions, User stories, Tests, Parties prenantes) délèguent à `RegisterScreen`. Aucun écran ne reste hors du modèle (condition 7).
- Parties prenantes : deux adaptateurs locaux (`ListAdapter`, `DetailAdapter`) absorbent les écarts documentés (bouton Archiver/Réactiver au lieu du changement de statut libre ; filtre à trois valeurs). Vues et `logic.ts` non modifiés. Texte du message « aucun projet » identique à celui de l'ancienne vue locale.
- Écart conservé (D104) : la question d'abandon et le formulaire ne sont pas remis à zéro au changement de projet (identique dans les huit écrans d'origine).
- Recette : `TESTS-M8b-generalisation.md` (réduite). Non vérifié ici : rendu et comportement réels, compilation Rust, `tsc` avec les vrais types React (Actions).

### M8b VALIDÉE (26/11/2026)

- Pilote (0.10.1) puis généralisation (0.10.2) validés par recette manuelle sur clé. Dette D68 soldée pour les huit écrans de registre. Aucune réserve nouvelle. Réserves ouvertes héritées : test 12 de V2.3b et C13 (optionnels).
- Séquencement : M9 (projet d'exemple + guide + mémo), puis UX+, puis V2 (Q1, K1, A2, V2.7, V2.3c PDF), puis V3 (IA). Aucun développement de M9 avant plan validé et « Go ».

## Lot M9 : projet d'exemple, guide de démonstration, mémo créateur (version cible 0.11.0, schéma 7 inchangé)

**M9 en cours.** Plan présenté le 26/11/2026, « Go M9 » donné le même jour. D105 à D114 validées (D112 : Markdown et Word).

- **D105** : périmètre = générateur du projet d'exemple, guide, mémo. Ni nouvel écran, ni aide contextuelle, ni parcours d'apprentissage.
- **D106** : domaine fictif et neutre : « Portail de réservation de salles » d'une commune inventée (Val-des-Sources), fonctions seulement, aucune personne.
- **D107** : création à la demande par un bouton de l'écran Projets, jamais automatique ; nom « [Exemple] Portail de réservation de salles » ; doublon refusé ; suppression par la suppression de projet habituelle.
- **D108** : création par les dépôts existants (codes, journal, validations) ; données pures dans `src/domain/sample-project.ts` ; écriture dans `src/data/` ; nettoyage en cas d'échec.
- **D109** : manques volontaires : EX-006, EX-007 et EX-008 sans story ; EX-008 sans test ; US-006 sans exigence ni test ; TEST-003 en échec ; TEST-005 bloqué ; RIS-004 archivé (démonstration du filtre « inclure les archivés »).
- **D110** : guide de démonstration hors application, sans captures d'écran produites par Claude.
- **D111** : mémo créateur hors application, pour non-développeur, avec un passage « ce qui n'est pas vérifié ».
- **D112** : documents en Markdown (dépôt, `docs/`) et en Word.
- **D113** : hors périmètre : plusieurs jeux d'exemple, export ou import de l'exemple, changements d'écrans. Les défauts d'UX relevés vont à UX+.
- **D114** : version 0.11.0, aucune migration.

**Étape 1 (contenu) validée le 26/11/2026** : 38 éléments (5 parties prenantes, 4 besoins, 8 exigences, 3 décisions, 4 risques, 6 stories, 7 tests, 1 atelier) et 52 liens.

**Écarts relevés à l'étape 2 (corrigés dans le contenu, signalés à David)** :
1. Les codes réels ont trois chiffres (PP-001, EX-001…), pas PP-1 : l'étape 1 les écrivait en abrégé.
2. Le tableau des orphelins de l'étape 1 était faux : avec TEST-002 ne vérifiant que EX-002, la story US-002 restait sans test. Correction : TEST-002 vérifie aussi US-002 (liens : 51 → 52). Le tableau des orphelins validé est ainsi respecté tel quel.

**Étape 3 (générateur en base) livrée le 26/11/2026.** `src/data/repositories/sample-project.ts` : `findSampleProject()` et `createSampleProject()` ; création par les dépôts existants, doublon refusé, nettoyage du projet partiel en cas d'échec, contrôle que chaque code attribué est celui des données. Vérifié : le lien « remplace » ne change PAS le statut de la décision remplacée (aucun code ne le fait) : DEC-001 est donc passée explicitement à « Remplacée » par le générateur, comme les autres statuts. Le bouton de l'écran Projets reste à brancher (étape 4).

**Étape 4 (bouton) livrée le 26/11/2026, version 0.11.0.** Bloc « Projet d'exemple » dans l'écran Projets (`ProjectsView`, `ProjectsScreen`, `logic.ts`) : bouton, message de réussite, bouton inactif et explication si un projet de même nom existe (détection par le nom, projets seulement, pas dossiers ni archives). Le projet créé devient le projet actif. Rien n'est créé au démarrage (testé : ni `App.tsx` ni `main.tsx` n'appellent le générateur). Écart connu et assumé : un projet ordinaire portant exactement le nom de l'exemple bloque le bouton (D107). Recette : `TESTS-M9.md`. Reste : guide de démonstration (étape 5), mémo créateur (étape 6).

**Étape 4 VALIDÉE (26/11/2026)** : recette `TESTS-M9.md` jouée par David, tests conformes.

**Étape 5 (guide de démonstration) livrée le 26/11/2026** : `docs/guide-demonstration.md` et `docs/guide-demonstration.docx` (généré par pandoc depuis le Markdown, 6 pages, relu en rendu PDF). Déroulé en 10 étapes (10 à 12 minutes) et version courte de 5 minutes, manques volontaires présentés comme argument, questions probables, plan B. Libellés et nombres relus dans le code (bandeau de couverture : 5/5, 4/4, 5 sur 8, 7 sur 8, 4 sur 8, 4 sur 4 ; onglet « Orphelins (6) »). Limites : pas de captures d'écran (D110) ; durées estimées, non chronométrées ; l'affirmation « aucun appel réseau » est vérifiée par lecture du code et de la politique de sécurité, pas par mesure.

**Étape 5 VALIDÉE (26/11/2026)** après une retouche de David : la conclusion orale du guide parle du lien conservé entre ce que le BA entend, formalise, fait développer et fait tester (le message métier d'abord, pas la comparaison avec Jira).

**Étape 6 (mémo créateur) livrée le 26/11/2026** : `docs/memo-createur.md` et `.docx` (9 pages, relues en rendu PDF) : application en une page, emplacement des données, architecture en images et règles contrôlées, sauvegarde et restauration, migrations (schéma 7), cycle de livraison, version, méthode de recette, procédures courtes, limites et « non vérifié », fichiers du dépôt, glossaire. Faits relus dans le code (`backup-policy.ts`, `main.rs`, `build.yml`, `check-architecture.mjs`, migrations). Point important consigné : dans `build.yml`, la vérification des types est **non bloquante** (`continue-on-error: true`) ; Claude ne la fait tourner qu'avec des types React simplifiés. Recette : tests 19 à 25 ajoutés à `TESTS-M9.md`.

**M9 VALIDÉE par David le 27/11/2026** (décision notée « D44 » dans son relevé ; **le numéro D44 existe déjà** pour les composants communs de M3b, la validation est donc consignée sans numéro). Constat : tests fonctionnels et audit produit confirment un socle cohérent et les objectifs de M9 atteints. M9 est clôturée et intégrée au périmètre de référence. Observations **non bloquantes**, à réaliser avant la release 1.0 : accueil projet, recherche et tri, écran Documents, historisation lisible, registre de diffusion, finalisation UX. Ce sont des évolutions de produit, pas des réserves sur M9. **Aucun lot n'est ouvert et aucun développement n'est autorisé** : le découpage détaillé reste à valider (audit produit du 27/11/2026) avant tout « Go ».

## Roadmap d'orientation R-001 à R-012 (27/11/2026) : vision cible, AUCUN lot, AUCUN développement

**Statut : orientation stratégique, pas un ordre de développement.** Numérotation R-xxx pour ne pas entrer en collision avec D1…D114. Elle ne remplace pas la séquence décidée, qui reste la référence de réalisation : **M9 → UX+ → V2 (Q1, K1, A2, V2.7, V2.3c) → V3**. Aucun développement, aucun lot, aucune modification de planification. Chaque item sera réévalué après validation de M9, UX+ et V2. Les évolutions ci-dessous ne sont PAS livrées : le CV et les démonstrations s'appuient uniquement sur ce qui existe (8 types d'éléments, 11 types de liens, 7 livrables, traçabilité, projet d'exemple).

- **R-001** : BA-Mentor reste centré sur analyse métier, AMOA, exigences, traçabilité, gouvernance métier et livrables. Écartés : outil de développement, IDE, moteur SQL avancé, clone Jira, outil RH / employabilité, gamification.
- **R-002** : priorité aux usages quotidiens : formalisation des besoins, règles de gestion, analyse d'impact, gestion des changements, recette, production documentaire.
- **R-003** : analyse d'impact (P1) : exploiter le graphe de liens (« si je modifie cet élément, qu’est-ce qui est concerné ? »). Première évolution stratégique identifiée, mais **pas le prochain lot** (voir séquence ci-dessus).
- **R-004** : règles de gestion et glossaire (P1). Nouveau type RG : code, description, source, propriétaire, exemples. **Pas de champ « version »** dans le premier lot (la baseline gère les versions globales ; réévaluation si besoin réel). **Premier lot limité à RG → Exigence et RG → Cas de test** ; RG → Processus et RG → Données reportées après l'introduction de ces objets. Principe : réutiliser les types de liens existants avant d'en créer.
- **R-005** : contrôle qualité des exigences sans IA (P1) : non testable, vocabulaire vague, critères d'acceptation absents, ambiguïtés, formulations interdites. **Aide pédagogique, ni certification ni preuve de conformité** ; le produit affichera : « Les alertes sont heuristiques et doivent être interprétées par l'analyste. » Liste initiale par défaut, personnalisable au niveau du projet.
- **R-006** : exports Word / PDF / Excel (P2), extension du chantier V2.3c. **Premier périmètre : exigences, règles de gestion, matrice de traçabilité, registres.** Campagnes de recette exclues tant que le module de recette avancée n'existe pas.
- **R-007** : Discovery léger : problème métier, objectifs, hypothèses, contraintes, critères de succès, questions ouvertes. Ni framework produit, ni Business Model Canvas, ni dérive Product Management. **Questions ouvertes et hypothèses : un seul type « Point ouvert »**, avec sous-types éventuels Question, Hypothèse, Risque d'information.
- **R-008** : BPMN simplifié : processus structuré, diagramme généré automatiquement, liens vers exigences et règles de gestion. Pas d'éditeur BPMN complet.
- **R-009** : UML non priorisé ; réévaluable sur besoin concret.
- **R-010** : SQL = compétence du BA, pas fonction centrale. Éventuel futur périmètre : import CSV, contrôle qualité, profilage léger, vérifications liées aux règles métier. Jamais un IDE SQL.
- **R-011** : baselines et gestion des changements (priorité élevée, structurante) : figer un état, comparer deux versions, analyser les écarts, piloter les demandes de changement.
- **R-012** : IA maintenue en V3, uniquement après règles de gestion, qualité des exigences, traçabilité et analyse d'impact. Elle exploite une connaissance métier fiable et ne compense pas son absence.

**Backlog d'orientation (non planifié)** : court terme : analyse d'impact, règles de gestion et glossaire, contrôle qualité, exports ; moyen terme : baselines et changements, points ouverts, Discovery léger, BPMN simplifié, recette avancée ; long terme : cartographie fonctionnelle, IA V3, mode revue / partage, analyse de données légère.

**À vérifier dans le code avant toute planification d'un item** (non audité lors de la rédaction) : présence des critères d'acceptation, de la priorisation et de la grille de parties prenantes.

## Plan de développement vers la version 1.0 (27/11/2026) : décisions V1-D01 à V1-D14

**Statut : plan validé comme document de référence** (documents Claude Docs « Audit produit BA-Mentor — vers la V1.0 » et « Plan de développement BA-Mentor — vers la V1.0 », 27/11/2026). Numérotation V1-Dxx, distincte de D1 à D114 et de R-001 à R-012. **Aucun lot n'est ouvert.** Le plan détaillé de F1 est à valider avant tout « Go ».

Validées le 27/11/2026 : V1-D01 à V1-D05, V1-D07 à V1-D09, V1-D11 à V1-D14 ; le découpage des lots F1 à F10 ; les critères de sortie de la 1.0.

- **V1-D01** : l'audit du 27/11 est le cadre de référence ; tout ce qui en sort exige une validation explicite ; une nécessité technique est signalée dans le lot.
- **V1-D02** : on parle de versions produit (0.12.0 … 1.0.0, 1.1) et de lots F1 à F10 ; « V2 » ne désigne plus une release.
- **V1-D03** : la 1.0 finalise l'existant ; qualité (Q1), règles de gestion (K1), analyse d'impact, PDF et atelier avancé passent en 1.1.
- **V1-D04** : un document est un instantané daté d'un modèle de livrable (contenu Markdown figé, options, liste figée des éléments) ; les exports partent de l'instantané.
- **V1-D05** : trois statuts de document (brouillon, validé, archivé) ; « remplacé » porté par un lien vers la version suivante ; un document validé n'est plus modifiable, toute correction crée une nouvelle version.
- **V1-D06** (validée **sur le principe**) : workflow documentaire unique **Livrables → Documents → Validation → Export**. L'export direct depuis l'écran Livrables est supprimé au profit de l'écran Documents. À préciser au plan de F5 : un document en brouillon peut-il être exporté, ou seulement un document validé ? (non tranché ; ne pas l'assumer).
- **V1-D07** : journal : cinq actions existantes avec un texte de détail, table non reconstruite, pas de valeurs avant/après en 1.0.
- **V1-D08** : `documents` réutilisée ; `contacts`, `document_sends`, `templates`, `template_defaults`, `dod_items`, `workspace_notes`, `pspo_progress` conservées inchangées (l'import V1 y écrit), documentées comme inutilisées ; aucune suppression en 1.0.
- **V1-D09** : diffusion 1.0 = registre manuel ; ni envoi, ni `.eml`, ni relance automatique, ni changement Rust ; l'e-mail est un champ de la fiche partie prenante.
- **V1-D10** (**décision de David, qui remplace l'alternative proposée**) : la 1.0 n'utilise que des adresses **fictives** dans les démonstrations et les recettes. L'usage de données réelles est **hors périmètre de la 1.0**. La précondition de F8 est donc levée ; le message d'avertissement « données réelles » n'est plus à concevoir pour la 1.0. Conséquence : les recettes ne peuvent pas s'appuyer sur un export V1 contenant de vrais contacts.
- **V1-D11** : la vérification des types devient bloquante en CI dès F1 ; un lot avec les types rouges n'est pas validé.
- **V1-D12** : les réserves « test 12 de V2.3b » et C13 sont tranchées par écrit en F1 (closes ou abandonnées).
- **V1-D13** : cycle de chaque lot inchangé (plan, validation, « Go », livraison en delta, recette `TESTS-Fn.md`, « Fn validé ») ; un seul lot ouvert à la fois.
- **V1-D14** : liste fermée des éléments reportés en 1.1 (Q1, K1, analyse d'impact, PDF, `.eml`/relances/validation multi-destinataires, valeurs avant/après, points ouverts et A2, confort) ; toute demande nouvelle va au backlog.

**Lots (validés)** : F1 clôture technique (0.11.1) ; F2 recherche, tri, compteurs (0.12.0) ; F3 accueil du projet (0.13.0) ; F4 Technique scindé et journal consultable (0.14.0) ; F5 Documents A, schéma 8 (0.15.0) ; F6 Documents B (0.16.0) ; F7 historique par fiche (0.17.0) ; F8 diffusion manuelle, schéma 9 (0.18.0) ; F9 finalisation UX (0.19.0) ; F10 release 1.0.0.

**Arbitrages du 27/11/2026 après relecture du plan détaillé de F1** :

- **V1-D15** : contrôle de types en **job CI séparé** `types`, bloquant pour la validation du lot (un job `types` rouge = lot non validé), mais ni `build` ni `rust-tests` n'en dépendent : l'exécutable reste produit même si le contrôle échoue. Le contrôle quitte le job `verify`. Quatre jobs à vérifier verts.
- **V1-D16** : la réserve « test 12 de V2.3b » est **clôturée sur la base du fichier fictif** `tests/fixtures/v1-export-synthetic-rich.json` : import sur une copie de la base, contrôle à l'écran (test 5 de `TESTS-F1.md`, obligatoire) ; la réserve se ferme à sa réussite. **Libellé corrigé** : cette réserve est l'import d'un export V1 enrichi ; le test 12 de `TESTS-V2.3b.md` porte sur les noms de fichiers d'export, un autre sujet. Les mentions historiques ne sont pas réécrites.
- **V1-D17** : la réserve **C13** (retirer la clé en pleine sauvegarde manuelle) est déplacée dans la recette **facultative** de F10 ; elle ne bloque pas la 1.0.
- **V1-D18** (préférence pour F5 et F8, non développée) : un document **Brouillon peut être exporté** ; un document **Validé peut être diffusé officiellement** ; **l'état du document est toujours visible dans l'export**. L'export est une action de travail, la validation une action de gouvernance. À préciser aux plans de F5 et de F8 : la forme de la mention d'état dans le fichier exporté, et la possibilité de diffuser un brouillon de façon non officielle. Précise V1-D06.
- **Plan F1 figé** (document « Plan détaillé du lot F1 — Clôture technique (0.11.1) ») : en attente du résultat de l'étape E0 (ligne « Vérification des types » du dernier run CI, relevée par David) et de sa validation finale. **Aucun développement avant le « Go » explicite.**

**E0 faite le 27/11/2026 (relevé par David)** : le run #46 du workflow « Build BA-Mentor » est entièrement vert (`verify`, `rust-tests`, `build`) ; l'étape « Vérification des types (non bloquante au premier lot) » est verte et le journal affiche `tsc --noEmit` sur `ba-mentor@0.11.0` sans erreur TypeScript. **L'étape E1 de F1 (corrections de types) est supprimée** ; F1 se réduit à E2-E6 (job `types` séparé, test de garde, réserves, documentation, version 0.11.1, recette). Plan F1 figé, en attente de la validation finale de David et du « Go ».

**Lot F1 : développement livré le 27/11/2026 après « Go » de David (version 0.11.1, schéma inchangé 7).** Plan figé validé par David le 27/11/2026 (job `types` séparé et bloquant, test de garde, réserve V2.3b test 12 clôturée selon la méthode proposée, C13 déplacée en F10). Aucune modification de `src/`.
- **E2** : `.github/workflows/build.yml` : le contrôle des types quitte `verify` (plus de `continue-on-error`) et devient le job `types` (information sur les versions de TypeScript et de `@types/*`, puis `npm run typecheck`). `build` et `rust-tests` dépendent toujours de `verify` seul (V1-D15).
- **E3** : `tests/ci-policy.test.ts` (3 tests) : aucune étape `continue-on-error` ; job `types` présent avec `npm run typecheck` et absent de `verify` ; `build` et `rust-tests` ne dépendent que de `verify`. Total : 413 + 3 = **416 tests**, tous verts ici. Preuve négative faite ici : le test échoue quand on remet `continue-on-error`, et quand `build` dépend de `types`.
- **E4** : V1-D16 et V1-D17 appliquées dans le mémo (réserves) ; la réserve « import V1 enrichi » **n'est close qu'à la réussite du test 5 de `TESTS-F1.md`** ; C13 est dans la recette facultative de F10.
- **E5** : version 0.11.1 (`package.json`, `tauri.conf.json`, `Cargo.toml`), `README.md`, `docs/memo-createur.md` et `.docx` (section 8 : quatre contrôles, piège refermé ; sections 9 et 12), `docs/guide-demonstration.md` et `.docx` (version citée 0.11.0 → 0.11.1, **ajout au périmètre prévu**, car le guide demande de comparer la version au pied de page), `TESTS-F1.md`.
- **Non vérifié ici** : le contrôle réel des types (job `types`, pas de registre npm), la compilation Rust, l'exécutable, la recette. Le test 5 de la recette (import du jeu fictif riche) ferme la réserve V2.3b.
- **En attente** : CI de la 0.11.1 (lignes 1 à 8 du tableau de contrôle), recette `TESTS-F1.md`, puis « F1 validé » de David.

**F1 VALIDÉ par David le 27/11/2026 (version 0.11.1, schéma 7).** CI : quatre jobs verts (`verify`, `types`, `rust-tests`, `build`) ; 416 tests ; job `types` vert avec TypeScript 5.9.3, `@types/react` 18.3.32, `@types/react-dom` 18.3.7, `@types/node` 22.20.7 (référence en cas de dérive future, aucun `package-lock.json` confirmé dans le dépôt). Recette `TESTS-F1.md` : tests 1 à 6 OK sur clé (À propos 0.11.1 schéma 7, écrans identiques, exemple 38/52, sauvegarde manuelle vérifiée, import du jeu fictif, relance). CI-9 (preuve négative en CI) facultative, non jouée ; la preuve négative a été faite sur le test de garde en local.
- **Incident de livraison** : à la première exécution (n° 47), `verify` était rouge (2 tests de garde en échec sur 416) car `.github/workflows/build.yml` n'avait pas été mis à jour dans le dépôt (dossier `.github` ignoré au dépôt de fichiers). Le test de garde a fait son travail ; corrigé en remplaçant le contenu du fichier à la main. **Leçon pour les lots suivants** : vérifier que `.github/workflows/build.yml` est bien à jour avant de lire la CI.
- **Erreur de ma recette corrigée** : les totaux attendus au test 5 valaient pour une base vide ; sur une base qui contient déjà des données, l'application conserve sans écraser (0 critère, 0 note, 2 étapes PSPO, 0 réglage à importer). `TESTS-F1.md` corrigé.
- **V1-D16 appliquée** : la réserve « import d'un export V1 enrichi » (ancien « test 12 de V2.3b ») est **CLOSE** (test 5 OK sur le jeu fictif, avec ses 5 avertissements). **V1-D17 appliquée** : C13 est dans la recette facultative de F10.
- **Observation hors F1, non traitée** : la sauvegarde de sécurité d'un import V1 porte « pre-migration » dans son nom alors qu'aucune migration n'a lieu ; non comparé à la 0.11.0. À reprendre éventuellement dans un lot ultérieur.
- **Prochain lot** : F2 (recherche, tri, compteurs, 0.12.0). Plan détaillé à produire ; **aucun développement avant sa validation et le « Go »**.

## Lot F2 : recherche, tri et compteurs des registres (version 0.12.0, schéma 7)

**Plan validé par David le 27/11/2026** (décisions F2-D01 à F2-D09 sans modification, dont F2-D03 et F2-D05 ; étapes E1 à E6, fichiers, tests, recette TESTS-F2, contrôles CI), **« Go » donné le même jour.** Document : « Plan détaillé du lot F2 — Recherche, tri et compteurs (0.12.0) ».

- **F2-D01** : recherche sur le code, le titre et la description, dans le registre affiché et le projet actif ; insensible aux majuscules, aux accents et aux apostrophes typographiques ; plusieurs mots = tous requis ; pas de jokers ni d'expressions régulières. La recherche dans les champs propres au type est reportée au backlog.
- **F2-D02** : quatre tris (Code croissant par défaut, identique à l'ordre historique ; Code décroissant ; Titre de A à Z ; Modifié récemment) ; tri par code suivant le numéro ; égalité départagée par le code. Tris propres au type (priorité, probabilité, date d'atelier) et tri par en-têtes de colonnes : backlog.
- **F2-D03** : les compteurs des boutons de statut suivent la recherche ; « Tous » inclut les archivés ; un statut à zéro reste affiché.
- **F2-D04** : trois messages de liste vide (registre vide et filtre sans élément inchangés ; recherche sans résultat nouveau, avec bouton « Effacer »).
- **F2-D05** : recherche, tri et filtre survivent à l'ouverture d'une fiche, se perdent au changement d'écran ; **la recherche est vidée au changement de projet actif**, le tri et le filtre gardent leur valeur.
- **F2-D06** : pas de pagination ; le critère « plus de 50 éléments » est vérifié par un test automatique sur 120 lignes, pas à la main.
- **F2-D07** : logique pure dans `src/shared/register-logic.ts`, composants `ListControls` et `EmptyListNotice` dans `src/shared/ui.tsx`, état dans `register-screen.tsx` ; sept fichiers de vue (huit listes) ; aucun fichier de `src/data/`, de `src-tauri/src/` ni de `build.yml` modifié.
- **F2-D08** : version 0.12.0, schéma 7 inchangé. **F2-D09** : liste fermée des exclusions (recherche entre registres, surlignage, filtres multiples, champs propres, tris propres au type, mémorisation des réglages).

**Développement livré le 27/11/2026.** Traitement dans l'écran : recherche, compteurs sur son résultat, filtre de statut, tri. La date de modification (`updated_at`) était déjà lue par les sept dépôts : propriété optionnelle ajoutée à `RegisterRow` (les types de vue des écrans n'ont pas à la porter).
- **Tests** : 416 → **443** (27 nouveaux) : `tests/f2-register.test.ts` (21 : recherche, tri, compteurs, messages, projet d'exemple chiffré comme la recette, 120 lignes, structure R4 et branchement) et `tests/ui-f2.test.ts` (6 : rendu statique des huit listes). Sept anciens tests de rendu ont vu leurs attentes mises à jour : les boutons de filtre portent maintenant leur compteur (« Tous (2) » au lieu de « Tous »), conséquence directe de F2-D03.
- **Contrôles par mutation** (8, toutes détectées) : ET remplacé par OU, accents non retirés, tri de code alphabétique, compteurs sur le registre entier, recherche non vidée au changement de projet, tri par défaut modifié, message de recherche supprimé, archivés exclus de « Tous ».
- **Contrôle de types avec types React simplifiés** : propre, sauf limites connues du dispositif (`main.tsx`, `react-dom`). Il a révélé une erreur de typage dans mon propre test (propriété d'un objet réduit par `assert.deepEqual`), corrigée ; c'est le genre d'erreur que le job `types` bloquerait.
- **Corrigé en cours de plan** : mon constat initial « aucun test ne rend les listes » était faux (banc `tests/helpers/ui-entry.tsx`) ; les expectations « creneau » de la recette ont été calculées par script (EX-003 **et** EX-005).
- **Non vérifié ici** : le contrôle réel des types (job `types`), le comportement réel (saisie, tri, clics), le rendu dans l'application de bureau, le comparateur de texte français du navigateur intégré (WebView2), l'exécutable. Performance sur plus de 50 éléments : test automatique seulement.
- **En attente** : CI de la 0.12.0 (lignes CI-1 à CI-7 de `TESTS-F2.md`), recette `TESTS-F2.md` (17 tests), puis « F2 validé » de David.

## Non vérifié lors de l'écriture (à valider via GitHub Actions)
- Compilation et tests de `backup.rs` et `main.rs` (dépendent de `rusqlite` et de Tauri, inaccessibles ici), dont la commande `import_pick_file` et la boîte de dialogue Windows. `files.rs` (std seule) a été compilé et testé ici : 15 tests. Pour V2.3a : la commande `export_save` et l'utilisation de `set_file_name` / `set_directory` / `blocking_save_file` du plugin de dialogue.
- Build Vite + Tailwind, rendu final, `tauri build`, exécution réelle.
