# Recette M8b — généralisation aux six autres écrans (version 0.10.2, schéma 7)

**Objet** : Besoins, Exigences, Décisions, User stories, Tests et Parties prenantes passent au composant générique. **Aucun changement visible attendu.** Recette **réduite** (D102) : le pilote ayant validé la mécanique, on rejoue un scénario court sur chaque écran. Comparez à `Test-avant` (0.10.1) si un doute apparaît.

**Précaution** : copie de votre dossier de travail dans `Test-M8b2` (exécutable **0.10.2**), projet avec au moins un élément de chaque type, relié à d'autres, et un second projet.

**Non vérifiable de mon côté** : rendu réel, clics, saisie (mes tests couvrent les transitions d'état et la structure).

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Lancer la 0.10.2. | Pas d'alerte. Pied de page / À propos : **version 0.10.2, schéma 7**. |
| 2 | Pour **chacun des six écrans** : ouvrir, lire le titre et la liste. | Titre de carte, filtre, bouton de création et libellés identiques à avant. |
| 3 | Pour chacun : **Nouveau**, valider vide. | Erreurs par champ ; rien créé. Titre : « Nouveau besoin », « Nouvelle exigence », « Nouvelle décision », « Nouvelle user story », « Nouveau test », « Nouvelle partie prenante ». |
| 4 | Pour chacun : créer avec un titre valide, puis **Modifier** un champ propre au type (priorité, rôle, étapes…), enregistrer. | Fiche ouverte sur l'élément ; titre « Modifier le/la … » ; valeur modifiée visible. |
| 5 | Pour chacun : Modifier, changer un champ, **Annuler**. | Question d'abandon ; « continuer » conserve la saisie ; confirmer ramène à la fiche. Nouveau + saisie + Annuler + abandon : retour à la liste. |
| 6 | Pour chacun sauf Parties prenantes : changer le **statut** depuis la fiche. | Statut mis à jour dans la fiche et la liste. |
| 7 | **Parties prenantes** : bouton Archiver / Réactiver ; filtre « Tous / Actif / Archivé ». | Le bouton bascule bien entre les deux ; le filtre n'a que trois valeurs (comme avant). |
| 8 | Pour chacun : **Supprimer** un élément relié, lire le message, annuler, puis confirmer. | Message avec code, titre, nombre de liens ; annuler ne supprime rien ; confirmer ramène à la liste. |
| 9 | Depuis **Traçabilité**, cliquer un élément de chaque type. | Le bon écran s'ouvre sur la bonne fiche. |
| 10 | Fiche ouverte puis changement de projet actif. | Retour à la liste du nouveau projet. |
| 11 | Liens en bas de fiche (ajout, retrait) sur au moins deux types. | Fonctionnels comme avant. |
| 12 | Sans projet actif : ouvrir chacun des six écrans. | « Aucun projet actif. Les besoins / les exigences / … appartiennent à un projet… » + bouton Projets. |
| 13 | Rouvrir Ateliers et Risques (pilote). | Toujours conformes. |
| 14 | Fermer, relancer. | Données conservées. |

Si tout est identique : dites « M8b validée ». Sinon : numéro du test et différence.
