# Recette M8b — pilote Ateliers + Risques (version 0.10.1, schéma 7)

**Objet** : refonte INTERNE de deux écrans. **Rien ne doit changer** pour vous : si vous constatez la moindre différence de texte, de bouton, d'ordre ou de comportement par rapport à la 0.10.0, c'est un défaut à me signaler.

**Précaution** : copiez votre dossier de travail (exécutable et `BAMentorData`, schéma 7) dans **deux** dossiers : `Test-avant` (exécutable **0.10.0**) et `Test-M8b` (exécutable **0.10.1**). Jouez chaque test dans les DEUX versions et comparez. Utilisez un projet contenant au moins : un atelier relié à des éléments, un risque relié à une exigence, un second projet.

**Non vérifiable de mon côté** : le rendu réel, les clics et la saisie. Mes tests couvrent les transitions d'état (liste, fiche, formulaire, abandon, suppression) et la structure du code ; seule cette recette valide le comportement à l'écran.

| # | Action (à faire sur **Ateliers**, puis refaire sur **Risques**) | Résultat attendu (identique à la 0.10.0) |
|---|---|---|
| 1 | Lancer la 0.10.1. | Démarrage sans alerte. Pied de page / À propos : **version 0.10.1, schéma 7**. Aucune ligne pre-migration nouvelle. |
| 2 | Ouvrir l'écran avec le projet actif. | Titre de carte « Ateliers » / « Risques », liste, filtre de statut, bouton de création, mêmes libellés qu'avant. |
| 3 | Sans projet actif (désactiver/ne pas en choisir) ouvrir l'écran. | Message « Aucun projet actif… Les ateliers / Les risques appartiennent à un projet » avec le bouton vers Projets. |
| 4 | Filtrer par statut, revenir à « Tous ». | Même filtrage, même message de liste vide selon le cas. |
| 5 | **Nouveau** : valider le formulaire vide. | Erreurs affichées à côté des champs ; rien n'est créé. Titre du formulaire : « Nouvel atelier » / « Nouveau risque ». |
| 6 | Créer avec un titre valide. | La fiche s'ouvre sur l'élément créé (code attribué). Il apparaît dans la liste. |
| 7 | **Modifier** : titre du formulaire « Modifier l'atelier » / « Modifier le risque », valeurs préremplies. Changer un champ, enregistrer. | Retour sur la fiche avec la valeur modifiée. |
| 8 | Modifier, ne rien changer, **Annuler**. | Retour direct à la fiche, sans question. |
| 9 | Modifier, changer un champ, **Annuler**. | Question d'abandon. « Continuer la saisie » : on reste, la saisie est conservée. Annuler de nouveau puis confirmer l'abandon : retour à la fiche, valeur d'origine. |
| 10 | Nouveau, saisir un titre, Annuler, confirmer l'abandon. | Retour à la **liste** (pas à une fiche). |
| 11 | Changer le statut depuis la fiche (actif ↔ archivé…). | Statut mis à jour, visible dans la liste ; message d'erreur éventuel identique. |
| 12 | **Supprimer** un élément relié : lire le message. | Demande de confirmation mentionnant le code, le titre et le nombre de liens. « Annuler » la fait disparaître sans supprimer. |
| 13 | Confirmer la suppression. | Retour à la liste, élément disparu, liens supprimés (vérifier dans Traçabilité). |
| 14 | Depuis **Traçabilité**, cliquer sur un atelier / un risque. | L'écran s'ouvre directement sur la fiche demandée ; aucune réouverture au clic suivant du menu. |
| 15 | Ouvrir une fiche puis **changer de projet actif**. | Retour à la liste du nouveau projet ; pas de fiche de l'ancien projet. |
| 16 | Fiche : emplacement des **liens** en bas de fiche. | Présent et fonctionnel (ajouter/retirer un lien) comme avant. |
| 17 | **Ateliers seulement** : bouton « Exporter le compte rendu » sur la fiche. | Présent ; mène à Livrables avec le modèle et l'atelier présélectionnés (D92). Pas de bouton équivalent sur Risques. |
| 18 | Saisir un texte hostile (`<b>x</b> & "q" \| #`) dans titre et description, enregistrer, rouvrir. | Affiché tel quel, sans mise en forme, sans plantage. |
| 19 | Parcourir les **six autres** écrans de registre (Besoins, Exigences, Décisions, Stories, Tests, Parties prenantes). | Inchangés (non touchés par le pilote). |
| 20 | Fermer, relancer, vérifier les données. | Tout est conservé ; aucun message d'erreur. |

**Si tout est identique** : dites « pilote M8b validé » ; je généralise ensuite aux six autres écrans (version 0.10.2) avec une recette réduite. **Sinon** : indiquez le numéro du test et la différence.
