# Campagne complémentaire V2.2a (risques restés ouverts)

Objectif : fermer les 5 risques conservés à la validation V2.2a. Ces tests reprennent les tests 8, 9, 10, 12, 13, 14 et 15 de `TESTS-V2.2a.md`, avec des prérequis précis et une grille de résultats. À faire sur **la clé USB**, avec la version courante (0.2.4).

**Prérequis communs**
- Faire d'abord une copie du dossier `BAMentorData` (clic droit → Copier) vers un endroit sûr : le test 5 abîme volontairement la base.
- Avoir au moins 2 projets créés, une sauvegarde manuelle existante.
- Un dossier du disque du PC, ex. `C:\Users\<vous>\Documents\sauvegardes-ba`.

| Risque | # | Étapes | Résultat attendu | Résultat (OK / ÉCHEC) | Capture / remarque |
|---|---|---|---|---|---|
| 1. Dossier secondaire | C1 | Centre de sauvegarde → **Dossier secondaire → Choisir…** → dossier du PC → **Créer une sauvegarde manuelle** | Message « Copie secondaire : … » ; le fichier `.db` est dans le dossier choisi ; sa taille égale celle du fichier principal | | |
| | C2 | Renommer le dossier secondaire dans l'Explorateur, refaire une sauvegarde manuelle | Sauvegarde principale créée **et** avertissement jaune « Copie secondaire non effectuée » ; aucune erreur bloquante | | |
| | C3 | Retirer le dossier secondaire dans l'application, refaire une sauvegarde | Plus de copie secondaire, aucun avertissement | | |
| 2. Ouverture multiple | C4 | Application ouverte, relancer le même exe (double-clic) | Seconde fenêtre : « BA-Mentor est déjà ouvert sur ces données », **sans** panneau de restauration ni bouton d'écriture | | |
| | C5 | Fermer la seconde fenêtre ; vérifier la première (créer un projet) | La première fonctionne normalement | | |
| | C6 | Fermer la première, relancer | Démarrage normal (pas de verrou orphelin) | | |
| 3. Fermeture avec sauvegarde | C7 | Créer un projet, fermer par la croix, chronométrer | Fermeture en 1 à 3 s ; au relancement, une sauvegarde « Automatique » supplémentaire datée de la fermeture | | |
| | C8 | Relancer, ne rien modifier, fermer, relancer | **Pas** de nouvelle sauvegarde automatique | | |
| 4. Base illisible | C9 | **Copie de sécurité faite** (voir prérequis). Fermer l'application, ouvrir `BAMentorData\ba-mentor.db` avec le Bloc-notes, supprimer tout le contenu, enregistrer, relancer | « Démarrage impossible » et panneau « Restaurer une sauvegarde », **sans** bouton de création ni de suppression | | |
| | C10 | Restaurer la dernière sauvegarde depuis ce panneau | Restauration réussie, projets de nouveau présents | | |
| 5. Restauration depuis un fichier externe | C11 | Copier une sauvegarde `.db` sur le Bureau, **Restaurer depuis un fichier…**, la choisir | Boîte de dialogue Windows, confirmation avec contrôle du fichier, restauration réussie, ligne « Avant restauration » créée | | |
| | C12 | Même chose avec un fichier qui n'est pas une base (renommer un `.txt` en `.db`) | Refus clair, **aucune** modification des données | | |
| Facultatif | C13 | Lancer une sauvegarde manuelle et retirer la clé aussitôt, la remettre, relancer | L'application s'ouvre ; « Vérifier » signale au besoin une sauvegarde incomplète ; la base est intacte | | |

**Lecture des résultats** : tout ÉCHEC est à décrire avec capture et heure approximative. Rien n'est marqué « fermé » sans votre accord explicite. Le test 12 (export V1 enrichi) reste une réserve distincte.
