# Protocole de test V2.2c (base vide avec sauvegardes présentes), sur votre clé USB

Prérequis : GitHub Actions vert sur les trois jobs (`verify` avec **98 tests**, `rust-tests`, `build`). Copiez `ba-mentor.exe` (version **0.2.5**) dans un dossier neuf. **Faites une copie de sécurité de `BAMentorData`** avant le test 3. Notez OK / ÉCHEC et une capture en cas d'échec.

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Lancer l'exécutable (première fois), créer 2 projets, faire 2 sauvegardes manuelles, fermer | Démarrage normal ; aucune alerte ; version 0.2.5 ; intro « Lot V2.2c ». |
| 2 | Relancer : démarrage normal avec des projets et des sauvegardes | **Pas** d'écran « base vide » (une base saine n'est jamais suspecte). |
| 3 | **Cas C9 d'origine** : fermer, ouvrir `BAMentorData\ba-mentor.db` dans le Bloc-notes, **supprimer tout le contenu**, enregistrer, relancer | Écran rouge « La base de données est vide » avec le nombre de sauvegardes et la date de la plus récente. **Aucun** bouton de création de projet ni de sauvegarde, **pas** de Centre de sauvegarde normal. Trois blocs : message, « Restaurer une sauvegarde » (liste), « Exceptionnel : continuer avec une base vide ». |
| 4 | Dans `BAMentorData\backups\`, vérifier les fichiers | Rien n'a été ajouté ni supprimé depuis le test 1. |
| 5 | **Restaurer** la sauvegarde la plus récente, confirmer | « Restauration terminée », rechargement, **vos projets sont de retour**. Aucun nouveau fichier « Avant restauration » (la base vide n'est pas copiée). |
| 6 | Refaire le test 3 (vider la base). Cliquer **Continuer avec une base vide…** puis **Annuler** | Message d'avertissement affiché puis refermé ; toujours l'écran « base vide » ; rien n'a changé. |
| 7 | Cliquer **Continuer avec une base vide…** puis **Confirmer** | L'application s'ouvre sur une base **sans projet**. Dans le Centre de sauvegarde : toutes les anciennes sauvegardes portent « Protégée » ; bandeau jaune expliquant la protection avec le bouton « Lever la protection… ». |
| 8 | Créer 2 projets, faire plusieurs sauvegardes manuelles et fermer/rouvrir plusieurs fois | Les lignes « Protégée » restent présentes. |
| 9 | **Restaurer** une sauvegarde « Protégée » | Projets d'origine de retour ; plus de bandeau ni de « Protégée » (situation résolue). |
| 10 | Vider de nouveau la base, **Continuer**, puis **Lever la protection…** → Confirmer | Les marques « Protégée » et le bandeau disparaissent ; les fichiers existent toujours. |
| 11 | **Cas sain 1** : supprimer le dossier `BAMentorData` entier, relancer | Première utilisation : démarrage normal, **pas** d'écran « base vide » (aucune sauvegarde). |
| 12 | **Cas sain 2** : application saine, supprimer tous les projets, fermer, rouvrir | Démarrage normal (une base sans projet n'est pas suspecte). |
| 13 | Corruption réelle (texte `fichier corrompu` dans la base) | Toujours « Démarrage impossible » + panneau de restauration (comportement V2.2a inchangé). |

Couvert par les tests automatiques : détection (4 cas), restauration depuis la base vide sans copie inutile, restauration normale avec copie, protection face à 12 sauvegardes automatiques, levée de la protection, comportement normal inchangé sans protection, règles pures du repère. Quatre casses volontaires du code ont été détectées par ces tests.
