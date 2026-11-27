# Recette F1 — clôture technique (version 0.11.1, schéma 7)

**Ce que F1 change** : la CI (le contrôle des types devient un job `types` séparé et bloquant), un test automatique de garde, la documentation et le numéro de version. **Aucun fichier de l'application (`src/`) n'est modifié** : à l'écran, la 0.11.1 doit se comporter exactement comme la 0.11.0.

**Précaution** : travaille sur des **copies**. `Test-avant` = exécutable **0.11.0**, `Test-F1` = exécutable **0.11.1**, chacun avec une copie de ton `BAMentorData` (schéma 7). Le test 5 se joue sur une copie **jetable** de la base.

**Non vérifiable de mon côté** : le contrôle réel des types (je n'ai pas les vrais types React ici), la compilation Rust, l'exécutable, le rendu à l'écran. Les tests automatiques (416, dont 3 nouveaux) sont verts ici.

## A. Contrôles à relever dans GitHub Actions

Onglet **Actions → Build BA-Mentor**, dernière exécution lancée avec les fichiers F1. Il y a **quatre** jobs : `verify`, `types`, `rust-tests`, `build`.

| # | Où regarder | Résultat attendu |
|---|---|---|
| CI-1 | Le commit de l'exécution | C'est bien le commit qui contient les fichiers F1 (pas un commit antérieur). |
| CI-2 | Job `verify`, étape « Versions alignées » | Verte ; le journal parle de **0.11.1**. |
| CI-3 | Job `verify`, étape « Règles d'architecture » | Verte. |
| CI-4 | Job `verify`, étape « Tests » | `fail 0` ; **416 tests** annoncés (413 + 3). Si le nombre diffère, note-le. |
| CI-5 | Job **`types`** (nouveau) | **Vert**. Étape « Vérification des types (bloquante) » : aucune ligne `error TS`. L'étape « Versions utilisées (information) » liste TypeScript et les `@types/*` : **recopie-moi ces versions**. |
| CI-6 | Fichier `.github/workflows/build.yml` dans ton dépôt | Le mot `continue-on-error` n'y figure plus. |
| CI-7 | Job `rust-tests` | Vert. |
| CI-8 | Job `build` | Vert ; artefact `ba-mentor-exe` disponible. |
| CI-9 | **Facultatif** : preuve négative | Sur une branche d'essai (jamais `main`), introduire volontairement une erreur de type : le job `types` doit devenir rouge **et** `build` rester vert. Dis-moi si tu veux la procédure. |

## B. Recette sur clé (exécutable 0.11.1)

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Lancer la 0.11.1 sur une copie de ta base réelle. Écran **Technique → À propos**. | **Version 0.11.1, schéma 7.** Aucune alerte. Aucune migration, donc **pas** de nouvelle sauvegarde « avant migration ». |
| 2 | Parcourir rapidement tes écrans habituels (Projets, Parties prenantes, Exigences, Traçabilité). | Identiques à la 0.11.0 : mêmes nombres, mêmes libellés. |
| 3 | Sur une copie **vide** : **Projets → Créer le projet d'exemple**. | « Projet d'exemple créé : **38 éléments et 52 liens**. » Comme en 0.11.0. |
| 4 | **Technique → Centre de sauvegarde** : faire une sauvegarde manuelle, puis cliquer **Vérifier** sur cette ligne. | La sauvegarde manuelle apparaît ; la vérification se termine sans message d'erreur. |
| 5 | **Import V1 enrichi (ferme la réserve V2.3b « test 12 », V1-D16).** Sur une copie **jetable** de la base : **Technique → Importer les données de la V1 → Choisir un export V1 (.json)…**, choisir `tests/fixtures/v1-export-synthetic-rich.json` (fichier **fictif** du dépôt). Lire l'aperçu **avant** de cliquer sur Importer, puis importer. | **Aperçu** : pas de bandeau jaune « données d'exemple uniquement » ; avertissements listés pour : un livrable sans dossier valide, un statut « en cours » inconnu, une date de modification absente ou illisible, un contact en doublon ignoré, un contact sans adresse e-mail. **Après import** : message vert « Import terminé : les totaux écrits correspondent à l'aperçu » ; tableau des totaux : **Projets et dossiers 6 ; Livrables 5 ; Envois consignés 2 ; Contacts (parties prenantes) 2 ; Critères de « terminé » 3 ; Bloc-notes 1 ; Étapes du parcours PSPO 3 ; Réglages 2 ; Interrupteurs de fonctions 4** (même chiffre dans la colonne « aperçu » et dans la colonne « écrit »). Une ligne « Sauvegarde de sécurité : … » est affichée. |
| 6 | Fermer puis relancer sur la copie du test 5. | La base s'ouvre normalement ; une sauvegarde automatique de fermeture est apparue dans le Centre de sauvegarde. |

**Remarques sur le test 5** : les libellés du tableau des totaux ont été relus dans le code ; si un nom diffère à l'écran, c'est le nombre qui compte. Ce jeu ne contient que des adresses fictives (`…@exemple.test`) : c'est cohérent avec la décision V1-D10. **Réserve C13** (retirer la clé pendant une sauvegarde manuelle) : **non jouée ici**, déplacée dans la recette facultative de F10 (V1-D17).

**Si tout est conforme** : dis « F1 validé » avec la ligne CI-5 (versions de TypeScript et des `@types`). **Sinon** : numéro du test ou de la ligne CI, et la différence.
