# Recette F2 — recherche, tri et compteurs (version 0.12.0, schéma 7)

**Ce que F2 change** : sur les huit registres (parties prenantes, besoins, exigences, décisions, risques, user stories, tests, ateliers), une barre au-dessus de la liste : un champ **Rechercher**, un menu **Trier par**, et des **compteurs** sur les boutons de statut. Aucune migration, aucun changement des données, du Rust ni du réseau.

**Précaution** : deux dossiers, `Test-avant` (exécutable **0.11.1**) et `Test-F2` (exécutable **0.12.0**), chacun avec une copie de ton `BAMentorData` (schéma 7). Les tests 2 à 12 se jouent sur une copie **vide** avec le projet d'exemple ; les tests 14 à 16 sur une copie contenant **tes vrais projets**.

**Non vérifiable de mon côté** : le comportement réel (taper dans le champ, changer le tri), le rendu à l'écran, le comparateur de texte du navigateur intégré, le contrôle réel des types. Mes tests automatiques (443) couvrent la logique, le rendu statique des huit listes et le branchement ; les résultats attendus ci-dessous sont calculés sur les données du projet d'exemple.

## A. Contrôles à relever dans GitHub Actions

Quatre jobs attendus verts. `build.yml` n'est pas modifié par F2. **Vérifie que les fichiers de `src/` sont bien déposés** (lot de fichiers dans plusieurs dossiers : `src/shared`, `src/modules`).

| # | Où regarder | Résultat attendu |
|---|---|---|
| CI-1 | Le commit de l'exécution | C'est le commit qui contient les fichiers F2. |
| CI-2 | `verify`, « Versions alignées » | Vert, **0.12.0**. |
| CI-3 | `verify`, « Règles d'architecture » | Vert. |
| CI-4 | `verify`, « Tests » | `fail 0` ; **443 tests** annoncés. Si le nombre diffère, note-le : un fichier manque. |
| CI-5 | Job `types` | **Vert, sans ligne `error TS`.** Premier lot qui modifie des vues React depuis que ce contrôle est bloquant. Si rouge : colle-moi les lignes `error TS`. Relève aussi les versions de TypeScript et des `@types/*` : elles doivent être celles de F1 (TypeScript 5.9.3, `@types/react` 18.3.32). |
| CI-6 | `rust-tests` | Vert (aucun changement Rust). |
| CI-7 | `build` | Vert ; l'artefact `ba-mentor-exe` affiche 0.12.0 au lancement. |

## B. Recette sur clé (exécutable 0.12.0)

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Lancer la 0.12.0 sur une copie de ta base. Technique, bloc « Base de données ». | Version **0.12.0**, schéma 7 « à jour », sauvegarde avant migration : **aucune (non nécessaire)**. |
| 2 | Copie vide : cliquer sur **Créer le projet d'exemple**. | « Projet d'exemple créé : **38 éléments et 52 liens**. », comme en 0.11.1. |
| 3 | **Exigences**, sans rien taper. | 8 exigences dans l'ordre EX-001 à EX-008. Boutons : **Tous (8), Brouillon (2), Validé (6), Rejeté (0), Archivé (0)**. Un champ « Rechercher » et un menu « Trier par » (Code croissant). |
| 4 | Chercher `recherche`. | **EX-001 et EX-006**. Compteurs : Tous (2), Brouillon (0), Validé (2). |
| 5 | Chercher `creneau` (sans accent). | **EX-003 et EX-005** (« créneau » dans le titre de l'un, « créneaux » dans la description de l'autre). Tous (2), Brouillon (1), Validé (1). |
| 6 | Chercher `003`, puis `salle equipement`. | `003` : **EX-003** seule. `salle equipement` : **EX-001** seule (les deux mots doivent être présents). |
| 7 | Chercher `zzz`. | Aucune ligne ; message « Aucun résultat pour « zzz » (8 au total dans ce projet). » Le bouton **Effacer** vide le champ et la liste revient à 8 exigences. |
| 8 | Chercher `creneau`, puis cliquer sur le bouton **Brouillon**. | **EX-005** seule. Cliquer sur **Brouillon** avec `zzz` dans le champ : le message cite « parmi les éléments « Brouillon » ». |
| 9 | Vider la recherche. Tri **Titre de A à Z**, puis **Code décroissant**, puis **Code croissant**. | A à Z : **EX-003, EX-002, EX-008, EX-007, EX-001, EX-006, EX-005, EX-004**. Décroissant : EX-008 à EX-001. Croissant : retour à l'ordre du test 3. |
| 10 | Ouvrir **EX-005**, la passer à **Validé**, revenir à la liste, tri **Modifié récemment**. | EX-005 en premier. Compteurs : Brouillon (1), Validé (7). **Remets ensuite EX-005 à Brouillon.** |
| 11 | **Risques** : sans recherche, puis chercher `service`. | Sans recherche : Tous (4), dont 1 archivé. Avec `service` : **RIS-001 et RIS-004** ; Tous (2), le compteur du statut archivé vaut 1. |
| 12 | **Parties prenantes** : chercher `service`. | **PP-001, PP-002 et PP-005** (la recherche porte sur code, titre et description ; elle ne regarde pas l'organisation ni le rôle). |
| 13 | Dans un registre, chercher quelque chose, ouvrir une fiche, revenir ; changer le tri. Puis aller sur un autre écran du menu et revenir. | Au retour de la fiche : recherche, tri et filtre **conservés**. Après changement d'écran : tout est **réinitialisé** (recherche vide, Code croissant, Tous), comme le filtre en 0.11.1. |
| 14 | Copie contenant **tes vrais projets** : taper une recherche dans un registre, puis changer de projet actif. | La **recherche est vidée** ; le tri et le filtre gardent leur valeur. |
| 15 | Non-régression sur les **huit** registres : créer un élément, le modifier, changer son statut, le supprimer. | Tout fonctionne comme en 0.11.1 ; les compteurs suivent chaque action (créer une exigence : Tous (9), Brouillon (3)). |
| 16 | Copie de ta base réelle : comparer avec `Test-avant` l'ordre par défaut de chaque registre. | Identique à la 0.11.1, ligne à ligne. |
| 17 | Fermer puis relancer. | Ouverture normale ; aucune sauvegarde « avant migration » nouvelle. |

**Ce que cette recette ne couvre pas** : la performance sur plus de 50 éléments (seul un test automatique sur 120 lignes la couvre) et les fautes de frappe (la recherche n'est pas floue : « recherch » trouve, « rechrche » ne trouve pas).

**Si tout est conforme** : dis « F2 validé » avec la ligne CI-5 (versions de TypeScript et des `@types`). **Sinon** : numéro du test ou de la ligne CI, et la différence.
