---
title: "BA-Mentor — Mémo du créateur"
subtitle: "Version 0.15.0 · schéma de base 8 · pour David, sans prérequis de développeur"
lang: fr-FR
---

# 1. À quoi sert ce mémo

C'est ton mode opératoire : comprendre comment BA-Mentor est construit, où vivent tes données, comment les protéger, comment faire évoluer l'outil et comment valider une version. Il est écrit pour quelqu'un qui n'est pas développeur.

**Comment le lire.** Chaque affirmation est soit **vérifiée** (lue dans le code, couverte par un test, ou constatée à ta recette sur clé), soit signalée **« non vérifié »**. La section 12 les rassemble. Une partie du fonctionnement (compilation de l'exécutable, comportement exact de Windows et de ta clé USB) ne peut être confirmée que par GitHub Actions et par toi : je ne peux pas l'exécuter de mon côté.

# 2. L'application en une page

| Question | Réponse |
|---|---|
| Qu'est-ce que c'est ? | Un exécutable Windows unique, `ba-mentor.exe`, qui s'ouvre comme une application. Il n'y a pas d'installation. |
| De quoi est-il fait ? | Une interface web (React, TypeScript, Tailwind) enveloppée par Tauri v2, avec un noyau en Rust et une base SQLite. |
| Où sont les données ? | Dans un dossier `BAMentorData` créé **à côté de l'exécutable**. |
| Faut-il Internet ? | Non : l'application est conçue pour fonctionner hors ligne. Le code ne contient aucun appel réseau et sa politique de sécurité n'autorise que la communication interne (vérifié par lecture du code, pas par mesure sur un pare-feu). |
| Comment ça se déplace ? | En copiant l'exécutable **et** le dossier `BAMentorData` ensemble, par exemple sur une clé USB. |
| Combien d'utilisateurs ? | Un seul à la fois : un verrou empêche d'ouvrir l'application deux fois sur les mêmes données. |
| Y a-t-il de l'IA ? | Non. Aucune fonction ne dépend d'un moteur d'IA. |

# 3. Où sont tes données

Tout ce qui compte se trouve dans `BAMentorData`, à côté de `ba-mentor.exe`.

| Élément | Rôle |
|---|---|
| `ba-mentor.db` | **La base de données** : tous tes projets, éléments et liens. C'est le fichier à protéger avant tout. |
| `backups/` | Les sauvegardes (section 5). |
| `exports/` | Les fichiers générés depuis l'écran Documents (Markdown, HTML, Word) quand tu n'as pas choisi un autre emplacement. L'application n'écrase jamais un fichier existant : elle numérote (nom-2, nom-3…). |
| `BAMentor.lock` | Le verrou d'instance : il empêche deux fenêtres d'écrire en même temps. Il est libéré par Windows même si l'application plante. |
| `webview/` et `webview-secondaire/` | Les données internes de l'affichage de l'application. Sans intérêt pour toi. |
| `ba-mentor.damaged-<date>.db` | N'apparaît que si la base était illisible au démarrage : l'ancien fichier est conservé sous ce nom (section 6). |
| `ba-mentor.db.restoring` | Reste d'une restauration interrompue (clé retirée par exemple) ; supprimé automatiquement au démarrage suivant. |

**Règle d'or** : ne copie jamais l'exécutable sans son dossier `BAMentorData` si tu veux retrouver tes données, et ne copie jamais seulement `BAMentorData` vers une application plus **ancienne** (section 7).

# 4. Comment c'est construit (l'architecture en images)

Imagine un immeuble à étages où chaque étage n'a le droit de parler qu'à certains autres.

| Couche | Rôle | Image |
|---|---|---|
| `domain` | Les règles du métier : types d'éléments, liens autorisés, calcul de la traçabilité, projet d'exemple. Pur calcul, aucune base ni écran. | Le règlement. |
| `data` | Tout ce qui lit et écrit la base. **Seule** couche autorisée à écrire. | Le magasinier. |
| `shared` | Briques d'écran communes (boutons, formulaires, écran de registre générique). | La boîte à outils. |
| `modules` | Un module par écran métier (Ateliers, Exigences, Risques…). | Les pièces. |
| `app` | Assemble tout : menu, navigation, écrans Technique et À propos. | Le hall d'entrée. |

Les règles que le code **contrôle automatiquement** (script `check-architecture`) à chaque livraison :

- Un module ne parle jamais à un autre module (R1) : ils passent par `shared` ou `data`.
- Un module ne dépend pas de `app` (R2) ; `data` ne dépend d'aucune couche supérieure (R3) ; `shared` ne dépend que de `shared` (R4) ; `domain` est pur (R9).
- Seul un fichier précis parle à Tauri (R7) ; aucune écriture en base hors de `data` (R8) ; l'accès brut au moteur est réservé à `data` (R6).

**Pourquoi c'est utile pour toi** : ces règles empêchent qu'un changement dans un écran casse la base. Un contrôle rouge à la livraison veut dire « ne valide pas ».

**Deux principes de la base** :

- **Le journal d'activité** : toute écriture sur les données de tes projets laisse une ligne au journal (qui a créé, modifié, supprimé quoi). Seules quelques tables purement techniques n'en ont pas (les compteurs de codes, les réglages internes, l'historique des sauvegardes).
- **Les codes** (EX-001, DEC-002…) sont attribués par un compteur propre à chaque projet et à chaque type. Un code supprimé n'est jamais réutilisé dans un projet.

# 5. La sauvegarde

Elle est automatique et pensée pour qu'une clé USB retirée trop tôt ne te coûte pas tes données. Tout se pilote depuis l'écran **Technique**, carte « Centre de sauvegarde ».

| Type | Quand elle est faite | Combien sont conservées |
|---|---|---|
| **Manuelle** | Quand tu cliques. | **Toutes**, jamais supprimées automatiquement. |
| **Automatique** | Au lancement si la dernière a plus de 24 h (ou s'il n'y en a aucune) ; toutes les 30 minutes si des données ont changé ; à la fermeture si des données ont changé. | Les 10 dernières. |
| **Avant migration** | Juste avant qu'une nouvelle version modifie la structure de la base. Aussi avant un import de la V1. | Les 5 dernières. |
| **Avant restauration** | Juste avant une restauration (pour pouvoir revenir en arrière). | Les 5 dernières. |

Points à connaître :

- **La fermeture attend la sauvegarde** : à la fermeture, l'application sauvegarde si nécessaire. Si elle tarde, la fermeture est forcée au bout de 15 secondes ; un second clic sur la croix ferme immédiatement.
- **Un dossier secondaire** peut être choisi pour recevoir une copie de chaque sauvegarde (par exemple un second disque). Un échec de cette copie est un avertissement, pas une erreur.
- **« Vérifier »** contrôle une sauvegarde (intégrité, schéma) et signale une sauvegarde incomplète.
- **Protection** : si tu choisis de continuer avec une base vide alors que des sauvegardes existent, celles-ci sont protégées de la suppression automatique tant que tu n'as pas levé la protection.
- Une sauvegarde à heure fixe, application fermée, n'existe pas : tout se déclenche pendant que l'application tourne.

**Conseil** : fais une sauvegarde **manuelle** avant toute mise à jour de l'exécutable et avant toute démonstration importante.

# 6. La restauration

**Cas normal** : écran Technique, « Centre de sauvegarde », bouton **Restaurer** en face de la sauvegarde voulue, ou « Restaurer depuis un fichier… ». L'application te prévient : *restaurer remplace toutes les données actuelles*.

Ce que fait l'application, dans l'ordre :

1. Contrôle le fichier : intégrité, schéma présent, schéma **pas plus récent** que l'application.
2. Fait une sauvegarde « avant restauration » de l'état actuel.
3. Copie le fichier à côté, puis le renomme (une opération « tout ou rien »).
4. Rouvre la base et la contrôle ; migre si nécessaire.
5. Si une étape échoue, **revient à la sauvegarde « avant restauration »**.

**Base illisible au démarrage** : un écran « Démarrage impossible » propose la restauration. L'ancienne base n'est pas détruite : elle est conservée sous `ba-mentor.damaged-<date>.db`. Dans ce cas particulier, il n'y a pas de sauvegarde « avant restauration » (il n'y a rien à protéger).

**Non vérifié** : je n'ai pas testé et ne documente pas de procédure de restauration « à la main » par copie de fichiers hors de l'application. Utilise l'écran.

# 7. Les migrations (les changements de structure de la base)

La base a un numéro de **schéma**, aujourd'hui **7**. Il augmente quand une nouvelle version a besoin d'une nouvelle table ou colonne.

| Schéma | Apporte |
|---|---|
| 1 | Base initiale |
| 2 | Modèle de domaine commun (éléments, liens) |
| 3 | Parties prenantes |
| 4 | Détails des exigences |
| 5 | Détails des décisions et des risques |
| 6 | Détails des user stories et des tests |
| 7 | Détails des ateliers |

Ce qu'il faut retenir :

- **Une migration se fait toute seule** au premier lancement d'une version qui en contient une, après une sauvegarde « avant migration », en une seule opération « tout ou rien ».
- **Elle ne se défait pas.** Une version plus ancienne **refuse** d'ouvrir une base plus récente, avec un message te demandant d'utiliser une version plus récente.
- **Les lots M8, M8b, M9, F1, F2, F3 et F4 n'ont aucune migration** : le schéma restait 7. **Le lot F5 (0.15.0) ajoute la migration 8** : au premier démarrage, la base passe au schéma 8, après une sauvegarde automatique nommée `pre-migration`. Une application 0.14.0 ou plus ancienne **refuse** ensuite d'ouvrir cette base ; pour revenir en arrière, il faut restaurer une sauvegarde faite avant la migration (écran Technique). Tu lis le schéma dans l'écran À propos ou dans l'écran Technique, carte « Base de données ».
- Avant une version qui change le schéma, **fais une copie complète de ton dossier** (exécutable et `BAMentorData`), c'est ton filet de sécurité absolu.

# 8. Comment une version naît (le cycle de livraison)

| Étape | Qui | Ce qui se passe |
|---|---|---|
| 1. Plan | Claude | Un plan détaillé avec des décisions numérotées (D105, D106…). |
| 2. Validation | Toi | Tu valides ou corriges chaque décision, puis tu donnes un « Go » explicite. **Rien n'est développé avant.** |
| 3. Développement | Claude | Code, tests automatiques, vérification d'architecture, enregistrement dans `DECISIONS.md`. |
| 4. Livraison | Claude | Un zip des **seuls fichiers modifiés ou nouveaux** (pas tout le projet), pour rester sous les limites d'envoi de GitHub. |
| 5. Dépôt | Toi | Tu déposes les fichiers dans ton dépôt GitHub privé. |
| 6. Construction | GitHub Actions | Trois contrôles puis la fabrication de l'exécutable (voir ci-dessous). |
| 7. Recette | Toi | Tu récupères l'exécutable, le copies sur ta clé et joues le fichier `TESTS-<lot>.md`. |
| 8. Validation du lot | Toi | Tu écris « <lot> validée » ; sinon tu donnes le numéro du test et la différence. |

**Les quatre contrôles de GitHub Actions** (onglet Actions, « Build BA-Mentor », bouton Run workflow ; il se lance aussi à chaque envoi sur la branche `main`) :

1. **verify** : versions alignées, architecture, tests automatiques. Les trois sont **bloquants**.
2. **types** : contrôle des types TypeScript (`typecheck`). **Bloquant** : un job rouge ici = ne valide pas le lot. Il est séparé de `verify` : l'exécutable est quand même produit s'il échoue, ce qui permet de diagnostiquer.
3. **rust-tests** : tests du noyau Rust. **Bloquants** : un job rouge ici = ne valide pas le lot, même si l'exécutable a été produit.
4. **build** : fabrique `ba-mentor.exe`, à télécharger dans l'artefact « ba-mentor-exe ».

> **Le piège connu est refermé en 0.11.1.** Jusqu'à la 0.11.0, la vérification des types était « non bloquante » dans le job `verify` : elle pouvait échouer sans rendre le job rouge. Elle est désormais un job à part, `types`, sans exception d'échec, et un test automatique (`tests/ci-policy.test.ts`) échoue si ce réglage revient. Au relevé du 27/11/2026 (exécution n° 46), elle était verte sur la 0.11.0. De mon côté, je ne la fais toujours tourner qu'avec des types simplifiés, jamais avec les vrais types React : seul le job `types` de GitHub Actions les contrôle vraiment.

**Ce que Claude ne peut pas faire de son côté** : compiler le Rust, fabriquer l'exécutable, cliquer dans l'application, ouvrir un fichier dans Word, tester la clé USB. Tout cela passe par GitHub Actions et par ta recette.

# 9. La numérotation des versions

- Une version, par exemple **0.15.0**, doit être écrite à **trois endroits identiques** : `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`. Le contrôle « versions alignées » échoue si l'un diffère.
- C'est `tauri.conf.json` qui fait foi pour l'écran **À propos**, le pied de page et la signature des fichiers exportés.
- Convention suivie jusqu'ici (une habitude, pas une règle contrôlée) : un lot qui ajoute une fonction visible augmente le deuxième chiffre (0.10 → 0.11 → 0.12) ; une refonte interne ou un correctif augmente le troisième (0.10.1, 0.10.2, 0.11.1).

# 10. La recette sur clé : la méthode

1. **Deux dossiers** : `Test-avant` (l'exécutable de la version précédente) et `Test-<lot>` (la nouvelle). Copie dans chacun ton `BAMentorData` de travail, ou une copie.
2. **Ne teste jamais sur ton unique exemplaire.** Travaille sur des copies.
3. Joue le fichier `TESTS-<lot>.md` ligne par ligne ; compare à `Test-avant` au moindre doute.
4. Note le **numéro du test** et ce que tu observes en cas de différence.
5. N'écris « <lot> validée » que si tout est conforme.

Les fichiers `TESTS-*.md` du dépôt sont l'historique de toutes tes recettes : ils servent aussi de liste de non-régression.

# 11. Procédures courtes

**Avant de mettre à jour l'exécutable de ta clé de travail**

1. Sauvegarde **manuelle** depuis l'écran Technique.
2. Copie le dossier entier (exécutable + `BAMentorData`) ailleurs.
3. Remplace l'exécutable ; lance ; vérifie la version et le schéma en pied de page.
4. Si le schéma a augmenté, une sauvegarde « Avant migration » doit apparaître dans la liste.

**Avant une démonstration**

1. Contrôle la version (pied de page) et rejoue le guide de démonstration une fois en entier.
2. Sauvegarde manuelle.
3. Utilise le projet d'exemple, jamais tes vrais projets.

**Si l'application refuse de démarrer**

1. Lis le message : « Application requise », « Démarrage impossible » ou un message de schéma trop récent disent des choses différentes.
2. « Démarrage impossible » : utilise la restauration proposée.
3. Schéma trop récent : lance une version plus récente de l'application.
4. Si l'application est déjà ouverte ailleurs sur les mêmes données, une seconde instance est refusée : ferme la première.

**Si tu as supprimé un projet par erreur**

1. Ne fais **rien d'autre** dans l'application.
2. Restaure la sauvegarde la plus récente d'avant l'erreur (écran Technique). Les sauvegardes automatiques ont lieu toutes les 30 minutes si des données changent : tu perdras au plus ce qui a été saisi depuis.

# 12. Limites connues et ce qui n'est pas vérifié

**Limites de conception** (connues, assumées)

- Outil monoposte, sans partage ni synchronisation.
- Pas de sauvegarde à heure fixe application fermée.
- Pas d'IA, pas de PDF (prévu plus tard), pas de gestion de sprint ni de tableau Kanban.
- La performance sur une très grosse base n'a pas été mesurée : le projet est chargé en mémoire.
- **Recherche des registres (0.12.0)** : elle porte sur le code, le titre et la description, dans le registre affiché et le projet actif ; pas sur les champs propres à un type (critères, plan de traitement, notes d'atelier), pas de tolérance aux fautes de frappe, pas de recherche entre registres. Sur plus de 50 éléments, seul un test automatique la couvre, pas ta recette.
- **Accueil du projet (0.13.0)** : lecture seule. Les brouillons ne comptent que les besoins, les exigences et les user stories (seuls types avec un statut Brouillon) ; un clic ouvre le registre, sans filtre préappliqué. Les dix dernières modifications viennent du journal et ne portent que sur les éléments (pas les liens ni les documents) ; un élément supprimé s'affiche sans code ni titre, car le journal n'en garde pas. Un projet importé de la V1 n'y montre rien tant que ses éléments n'ont pas été touchés.
- **Journal (0.14.0)** : l'écran Journal ne montre que les entrées du **projet actif**. Les entrées sans projet, écrites par l'import de la V1 (contacts, réglages, indicateurs, étapes PSPO, notes), restent dans la base mais ne sont plus affichées nulle part (décision du 27/11/2026). Un lien supprimé n'indique plus quels éléments il reliait (le journal ne garde que son type) ; les noms des champs modifiés sont affichés, pas leurs valeurs. Les entrées d'un projet supprimé restent dans la base, sans être visibles. La lecture n'est pas indexée : non mesurée sur une très grosse base.
- **Documents (0.15.0)** : un livrable s'enregistre comme document (écran Livrables), l'export se fait depuis l'écran Documents ; il n'existe plus d'export direct. Un document ne se modifie ni ne se supprime en 0.15.0 : un document créé par erreur reste jusqu'à la suppression du projet (l'archivage arrive avec le lot F6). Seule la **dernière** version d'une série est comparée pour détecter un contenu identique : si le contenu d'une ancienne version revient, c'est une nouvelle version. Les documents importés de la V1 n'appartiennent à aucune série : régénérer un livrable ne les remplace pas. La liste figée d'une matrice de traçabilité est celle des éléments actifs de la chaîne ; sa correspondance exacte avec le texte n'est pas garantie. Chaque version stocke le texte complet : volume non mesuré. Le fichier exporté d'un document généré porte, sous le titre, une ligne « Document : version N, statut » et la version dans son nom.
- L'import des données de la V1 n'a été vu qu'avec les données d'exemple de la V1 ; un export plus riche (livrable validé, archivé, envoi, contact) n'a été passé que sous forme de jeu **fictif** (test 5 de `TESTS-F1.md`, réussi à ta recette du 27/11/2026). La 1.0 n'utilise que des données fictives ; une vraie migration de tes données V1 est hors périmètre.

**Non vérifié par moi (à confirmer par GitHub Actions ou par toi)**

- La compilation du Rust et de Tauri, la fabrication de l'exécutable, les boîtes de dialogue Windows : seul GitHub Actions le fait.
- La **vérification des types avec les vrais types React** : je ne peux pas la lancer ici (registre npm refusé). Elle est verte sur la 0.14.0 (F4 validé le 27/11/2026) ; pour la 0.15.0, c'est le job `types` qui fait foi (section 8). Le lot F5 ajoute trois composants React, un écran et modifie l'écran Livrables.
- Le rendu réel et le comportement à l'écran de chaque lot : ta recette.
- L'ouverture des fichiers Word dans Word, l'impression, l'aspect final.
- La compatibilité d'un autre poste Windows que le tien (composant d'affichage WebView2, droits d'écriture sur la clé, antivirus ou avertissement SmartScreen sur un exécutable non signé). Ta clé fonctionne sur ta machine ; je n'ai aucune preuve pour une autre.
- L'absence réelle de trafic réseau (lue dans le code, non mesurée).
- Les durées indiquées dans le guide de démonstration (estimées, non chronométrées).

**Réserves de l'historique (tranchées le 27/11/2026, V1-D16 et V1-D17)** : l'import d'un export V1 enrichi (ancien « test 12 de V2.3b ») se ferme à la réussite du test 5 de `TESTS-F1.md` ; le point C13 (retirer la clé pendant une sauvegarde manuelle) passe dans la recette facultative de F10.

# 13. Les fichiers à connaître dans le dépôt

| Fichier | Contenu |
|---|---|
| `DECISIONS.md` | **La mémoire du projet** : chaque décision numérotée, ses raisons, ses limites, ce qui n'a pas été vérifié. À lire en premier avant de reprendre un chantier. |
| `TESTS-*.md` | Les protocoles de recette de chaque lot. |
| `docs/guide-demonstration.*` | Le guide de démonstration (Markdown et Word). |
| `docs/memo-createur.*` | Ce mémo. |
| `README.md` | Comment vérifier et compiler. |
| `.github/workflows/build.yml` | La recette de fabrication automatique. |
| `scripts/` | Les contrôles d'architecture et de versions. |
| `src/domain/sample-project.ts` | Les données du projet d'exemple. |
| `tests/` | Les tests automatiques (plus de 400). |

# 14. Mini-glossaire

| Mot | Ce que ça veut dire |
|---|---|
| **Schéma** | La structure de la base (quelles tables, quelles colonnes). Son numéro augmente à chaque migration. |
| **Migration** | La mise à jour de cette structure, faite automatiquement par une nouvelle version. |
| **Transaction** | Un groupe d'écritures « tout ou rien » : si une échoue, aucune n'est gardée. |
| **Dépôt (repository)** | Le code qui lit et écrit un type de données. Seul endroit autorisé à écrire. |
| **Document** | Depuis F5, une photographie datée d'un livrable : son contenu ne change plus. Régénérer un livrable dont le contenu a changé crée la version suivante ; l’ancienne s’affiche « Remplacé ». |
| **Journal d'activité** | La trace de qui a fait quoi : créer, modifier, supprimer, changer de statut. |
| **CI / GitHub Actions** | Le serveur qui contrôle et fabrique l'application à chaque envoi. |
| **Artefact** | Le fichier produit par la CI (ici l'exécutable). |
| **Instance** | Une fenêtre ouverte de l'application. Une seule à la fois par jeu de données. |
| **Recette** | Ta validation manuelle, test par test, sur ta clé. |
| **Régression** | Quelque chose qui marchait avant et ne marche plus. |
