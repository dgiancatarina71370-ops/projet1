# Protocole de test M1 (modèle de domaine commun), sur votre clé USB

Prérequis : GitHub Actions vert sur les trois jobs (`verify` avec **130 tests**, `rust-tests`, `build`). Ce lot ne change que le schéma de la base (version 1 vers 2) : il n'y a **aucun écran métier** à tester, tout se vérifie sur vos données réelles. Notez OK / ÉCHEC et une capture en cas d'échec.

**Précaution** : ne testez jamais sur l'original. Copiez d'abord votre dossier de travail actuel (l'exécutable 0.2.6 et son `BAMentorData`) dans **deux** dossiers neufs : `Test-ancien` (inchangé, pour le test 1 et le test 11) et `Test-M1` (avec le nouvel exécutable 0.3.0 à la place de l'ancien, et la copie de `BAMentorData`).

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Dans `Test-ancien`, lancer **0.2.6**. Relever : la liste des livrables (carte « Exporter un livrable »), le nombre de lignes du Centre de sauvegarde. Fermer. | Notes prises. Rien à vérifier d'autre. |
| 2 | Dans `Test-M1`, lancer **0.3.0** | Démarrage sans alerte. Intro « Lot M1 ». Écran À propos : version **0.3.0**, schéma de la base **version 2**. |
| 3 | Centre de sauvegarde | Une ligne **pre-migration**, schéma **1**, datée de ce lancement. Toutes les anciennes lignes sont intactes. |
| 4 | Cliquer **Vérifier** sur cette ligne pre-migration | « Intégrité correcte, schéma 1 ». |
| 5 | Comparer la carte « Exporter un livrable » avec vos notes du test 1 | **Exactement les mêmes livrables** (noms, nombre). Exporter l'un d'eux en **Word** : s'ouvre sans réparation ; la signature indique « Version : 0.3.0 ». |
| 6 | Fermer, relancer 0.3.0 | Aucune nouvelle ligne pre-migration (la migration ne se refait pas). Schéma toujours 2. |
| 7 | **Restaurer** la ligne pre-migration (schéma 1), confirmer | « Restauration terminée », rechargement. À propos : schéma **2** (la base restaurée a été migrée). Livrables identiques au test 1. Centre : une ligne « Avant restauration » **et** une nouvelle ligne pre-migration. |
| 8 | **Base neuve** : dossier vide, copier seulement 0.3.0, lancer | Démarrage normal, schéma 2, **pas** d'écran « base vide », aucune ligne pre-migration (rien à protéger). |
| 9 | **Protection V2.2c** : dans `Test-M1`, vider `BAMentorData\ba-mentor.db` dans le Bloc-notes (supprimer tout), relancer | Écran rouge « La base de données est vide » avec vos sauvegardes. **Restaurer** la plus récente : vos livrables reviennent. |
| 10 | Importer `tests\fixtures\v1-export-synthetic-trap.json` (ou votre export réel), exporter un livrable en Word | Comme au lot V2.3b : importé sans erreur, Word sans alerte de sécurité, texte hostile affiché comme texte. |
| 11 | **Retour arrière** : copier la base migrée de `Test-M1` dans un dossier avec l'**ancien** exécutable 0.2.6, lancer | L'ancienne version **refuse** de démarrer avec un message indiquant que la base est au schéma 2, plus récent que le sien. Rien n'est modifié ni perdu. |
| 12 | Comparer la version dans À propos et la signature du Word du test 5 | « 0.3.0 » partout. |

Pas de test d'élément ni de lien à la main : aucune interface ne les crée encore (M3 et suivants).

Couvert par les tests automatiques (pas par cette grille) : les sept types et leurs préfixes ; les codes (trois chiffres minimum, jamais réattribués, numérotation par projet, atomicité) ; chaque couple de la matrice des liens, autorisé et interdit (14 couples autorisés, tous les autres refusés) ; un lien entre deux projets refusé par le dépôt **et** par la base elle-même ; doublons, lien vers soi-même, élément absent ; suppression d'un élément, d'un projet et d'un document source avec journal ; contrôle d'intégrité sur sept anomalies volontaires ; migration 1 vers 2 avec données et sauvegarde pre-migration ; sauvegarde et restauration des nouvelles tables ; règle d'architecture R9. Six casses volontaires du code (clé composée retirée, journal de suppression de projet retiré, compteur figé, matrice élargie, contrôle des compteurs retiré, journal des liens retiré) ont chacune été détectées par ces tests.
