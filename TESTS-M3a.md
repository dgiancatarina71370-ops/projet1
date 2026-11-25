# Protocole de test M3a (navigation, projets, parties prenantes), sur votre clé USB

Prérequis : GitHub Actions vert sur les trois jobs (`verify` avec **158 tests**, `rust-tests`, `build`). Le lot passe le schéma de la base de 2 à 3 : **la migration du journal d'activité est le point le plus sensible** (tests 1 à 6). Notez OK / ÉCHEC et une capture en cas d'échec.

**Précaution** : ne testez jamais sur l'original. Copiez votre dossier de travail (exécutable et `BAMentorData`, déjà au schéma 2 si vous avez lancé la 0.3.0 dessus) dans **deux** dossiers neufs : `Test-avant` (avec l'exécutable **0.3.0**) et `Test-M3a` (avec l'exécutable **0.4.0**). Si votre base est encore au schéma 1, c'est normal : la 0.4.0 la migrera en une fois (adaptez le « schéma 2 » du test 3 en « schéma 1 »).

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Dans `Test-avant`, lancer **0.3.0**. Relever dans la page : le nombre de lignes de chaque table (carte « Tables »), en particulier `activity_log`, `projects`, `items`, `documents`, et les **12 derniers** du journal d'activité (capture). Fermer. | Chiffres et capture notés. |
| 2 | Dans `Test-M3a`, lancer **0.4.0** | Démarrage sans alerte. Menu à gauche : **Projets, Parties prenantes, Technique** (pas de Besoins ni d'Exigences). Sélecteur « Projet actif » en haut. Pied de page : version **0.4.0**. |
| 3 | Écran **Technique**, carte « Base de données » et « Centre de sauvegarde » | Schéma **version 3** (« migrations appliquées : 3 ; ancienne version 2 »). Une ligne **pre-migration** au **schéma 2**, datée de ce lancement ; les anciennes lignes sont intactes. |
| 4 | **Journal d'activité** : comparer avec le test 1 | `activity_log` a **exactement le même nombre de lignes** ; les 12 dernières lignes sont **identiques** (action, type, numéro, date). `projects`, `items`, `documents` inchangés. Nouvelle table `stakeholder_details` à 0 ligne ; une table de plus qu'au test 1. |
| 5 | Cliquer **Vérifier** sur la ligne pre-migration | « Intégrité correcte, schéma 2 ». |
| 6 | Fermer, relancer 0.4.0 | Aucune nouvelle ligne pre-migration, mêmes chiffres. |
| 7 | Écran **Projets** | Vos projets, dossiers et archives de la V1 sont listés avec leur type. Le sélecteur du haut ne propose **que** les vrais projets. |
| 8 | Créer le projet « Projet recette M3a » | Il apparaît, devient actif. Puis le **renommer** en « Projet recette M3a (renommé) ». Sur l'écran Technique, le journal montre `created` puis **`updated`** pour ce projet (c'est la preuve que le journal reconstruit accepte la nouvelle action sur votre base). |
| 9 | Créer un projet sans nom ; renommer avec un nom vide ; saisir 201 caractères | Chaque cas affiche son message en rouge à sa place ; rien n'est créé ni modifié. |
| 10 | **Parties prenantes** (projet de recette) : créer « Responsable CRP », organisation « La Poste », rôle « Sponsor », influence Élevé, intérêt Élevé | Fiche **PP-001** avec ces valeurs. Créer une seconde avec seulement un nom : **PP-002**, niveaux « Moyen ». Nom vide : message « Le nom est obligatoire. », rien d'enregistré. |
| 11 | Modifier PP-001 (rôle et description), enregistrer. Puis rouvrir Modifier et enregistrer **sans rien changer**. Dans Technique, regarder le journal | Une seule ligne `updated` pour la première modification ; **aucune** ligne pour la seconde. Aucun texte saisi dans le journal. |
| 12 | Modifier, taper quelque chose, cliquer **Annuler** | Confirmation dans l'écran « Abandonner la saisie en cours ? ». « Continuer à saisir » garde la saisie ; « Abandonner » revient à la fiche sans rien enregistrer. |
| 13 | **Archiver** PP-002 ; essayer les filtres Tous / Actif / Archivé ; **Réactiver** | Statut et filtres cohérents ; messages de liste vide corrects (ex. filtre Archivé sans archivée). |
| 14 | **Supprimer** PP-002 : Annuler d'abord, puis confirmer. Créer une nouvelle partie prenante | Annuler ne supprime rien ; confirmer supprime. La nouvelle est **PP-003** (PP-002 n'est jamais réattribué). |
| 15 | Créer un second projet, y créer une partie prenante ; basculer entre les deux projets avec le sélecteur | Numérotation indépendante (**PP-001** dans le second) ; chaque projet affiche sa propre liste. |
| 16 | Choisir le second projet, fermer l'application, relancer | L'application s'ouvre **sur le second projet**, écran Parties prenantes. |
| 17 | **Supprimer** le projet actif (écran Projets) | La confirmation annonce le nombre d'éléments supprimés. Après confirmation, un autre projet devient actif (ou, s'il n'y en a plus, l'écran Parties prenantes affiche « Aucun projet actif » avec un bouton vers les projets). |
| 18 | **Texte hostile** : créer une partie prenante nommée `<script>alert(1)</script> & "x"` | Le nom s'affiche tel quel, comme du texte : aucune fenêtre, aucun comportement étrange. Un nom de 200 caractères passe, 201 est refusé. |
| 19 | Sauvegarde manuelle (projet de recette avec PP-001), supprimer PP-001, **restaurer** cette sauvegarde | PP-001 est de retour avec ses valeurs ; aucune alerte. |
| 20 | **Restaurer** la ligne pre-migration (schéma 2) | Restauration terminée, rechargement. Schéma de nouveau **3** (la base restaurée est migrée), nouvelle ligne pre-migration, plus de parties prenantes, vos projets de la V1 présents. |
| 21 | **Retour arrière** : copier la base migrée dans un dossier avec l'exécutable **0.3.0**, lancer | L'ancienne version **refuse** de démarrer (base au schéma 3, plus récente que la sienne). Rien n'est modifié ni perdu. |
| 22 | Écran Technique : import V1 (fichier de test), export Word d'un livrable, À propos | Comme avant : import sans erreur, Word sans alerte, À propos « version 0.4.0, schéma 3 ». |
| 23 | **Protection V2.2c** : vider `BAMentorData\ba-mentor.db` dans le Bloc-notes, relancer | Écran rouge « La base de données est vide » ; la restauration de la plus récente ramène vos données. |

Couvert par les tests automatiques (pas par cette grille) : migration 2 vers 3 avec 40 lignes de journal dont des trous (colonne par colonne, identifiants, index, sauvegarde pre-migration au schéma 2) ; création atomique (un échec des détails annule aussi l'élément et le compteur) ; une seule ligne de journal par création ou modification, jamais de contenu ; aucune écriture sans changement ; garde des tables d'extension (refus seule, sur une autre table, ou avec `activity`) ; suppression en cascade ; projet actif mémorisé sans journal et revérifié ; renommage ; contrôle d'intégrité (trois anomalies) ; sauvegarde et restauration ; logique des écrans (filtre, validation, messages, choix du projet actif) ; rendu statique de chaque écran (texte échappé, états vides, confirmations, un seul projet actif, menu sans entrée Besoins ou Exigences). Douze casses volontaires du code ont été détectées par ces tests.

**Non couvert automatiquement** : les clics, les saisies et l'enchaînement des écrans. C'est l'objet des tests 8 à 18.
