# Protocole de test V2.2a (sur votre clé USB)

Prérequis : GitHub Actions vert sur les trois jobs (`verify`, `rust-tests`, `build`). Copiez `ba-mentor.exe` dans un dossier neuf de la clé (par exemple `D:\ba-mentor-v22a\`). Notez pour chaque test : **OK / ÉCHEC** et, en cas d'échec, une capture d'écran.

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Lancer l'exécutable (première fois) | Écran « état technique », version **0.2.2**. Une bannière « Sauvegarde automatique effectuée (aucune sauvegarde existante) ». Une ligne « Automatique » dans le Centre de sauvegarde. |
| 2 | Cliquer **Créer une sauvegarde manuelle** | Message avec chemin, taille et début du SHA-256. Nouvelle ligne « Manuelle ». Le fichier existe dans `BAMentorData\backups\`. |
| 3 | **Vérifier** sur la ligne manuelle | « intégrité correcte, schéma 1 ». |
| 4 | **Créer un projet** (1), faire une sauvegarde manuelle, puis **Créer un projet** (2) | 2 projets à l'écran. |
| 5 | **Restaurer** la sauvegarde manuelle, puis **Annuler** | Rien ne change (confirmation demandée). |
| 6 | **Restaurer** puis **Confirmer la restauration** | Message « Restauration terminée », rechargement automatique, **1 seul projet**. Une ligne « Avant restauration » est apparue. |
| 7 | **Restaurer** la ligne « Avant restauration » | Les **2 projets** reviennent (rien n'a été perdu). |
| 8 | **Dossier secondaire → Choisir…**, sélectionner un dossier du disque du PC (ex. `C:\Users\vous\Documents\sauvegardes-ba`), puis une sauvegarde manuelle | Message « Copie secondaire : … » ; le fichier est dans ce dossier. |
| 9 | Retirer le dossier secondaire, ou le choisir sur la clé puis le renommer et refaire une sauvegarde | Sauvegarde principale créée, avec un **avertissement** jaune « Copie secondaire non effectuée ». |
| 10 | **Ouverture multiple** : l'application étant ouverte, relancer le même exe | La seconde fenêtre affiche « BA-Mentor est déjà ouvert sur ces données », **sans** panneau de restauration. La fermer ; la première continue normalement. |
| 11 | Fermer la première, relancer | Démarre normalement (pas de verrou orphelin). |
| 12 | **Fermeture avec modification** : créer un projet, fermer par la croix | La fenêtre se ferme en 1 à 3 secondes ; au relancement, une sauvegarde « Automatique » supplémentaire datée de la fermeture. |
| 13 | **Fermeture sans modification** : relancer, ne rien faire, fermer | Fermeture sans nouvelle sauvegarde automatique. |
| 14 | **Restauration depuis un fichier** : copier une sauvegarde sur le Bureau, **Restaurer depuis un fichier…**, la choisir | Boîte de dialogue Windows, confirmation avec contrôle du fichier, restauration réussie. |
| 15 | **Base illisible** : fermer l'application, ouvrir `BAMentorData\ba-mentor.db` avec le Bloc-notes, supprimer le contenu, enregistrer ; relancer | « Démarrage impossible » + panneau « Restaurer une sauvegarde » (sans bouton de création ni de suppression). Restaurer une sauvegarde : l'application redémarre sur les données sauvegardées. Un fichier `ba-mentor.damaged-….db` est conservé dans `BAMentorData`. |
| 16 | **Facultatif, risqué** : lancer une sauvegarde manuelle et retirer la clé aussitôt, la remettre, relancer | L'application s'ouvre ; au besoin « Vérifier » signale une sauvegarde incomplète ; la base elle-même est intacte. |

Non testable à la main (couvert par les tests automatiques) : rotation (10 automatiques, 5 avant migration, 5 avant restauration), refus d'un schéma plus récent, retour arrière après échec de migration.
