# Recette M9 — projet d'exemple (version 0.11.0, schéma 7)

**Précaution** : copiez votre dossier de travail (exécutable et `BAMentorData`, schéma 7) dans **deux** dossiers : `Test-avant` (exécutable **0.10.2**) et `Test-M9` (exécutable **0.11.0**). Les tests 1 à 14 se jouent d'abord sur une copie **vide** (aucun projet), puis le test 15 sur une copie contenant vos vrais projets.

**Non vérifiable de mon côté** : le rendu réel, les clics, le contenu des fichiers Word ouverts dans Word. Mes tests couvrent la création en base, les nombres, la traçabilité et la génération des livrables.

**Cette recette couvre le projet d'exemple (étape 4).** Le guide de démonstration et le mémo créateur sont livrés aux étapes suivantes ; leur relecture sera ajoutée ici.

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Lancer la 0.11.0 (copie vide). | Pas d'alerte. Pied de page / À propos : **version 0.11.0, schéma 7**. Aucun projet n'est créé tout seul. |
| 2 | Écran **Projets**. | Sous « Nouveau projet », un bloc « Projet d'exemple » avec sa description et le bouton **Créer le projet d'exemple** (actif). |
| 3 | Cliquer sur le bouton. | Message vert : « Projet d'exemple créé : 38 éléments et 52 liens. Il est maintenant le projet actif. » Le projet « [Exemple] Portail de réservation de salles » apparaît, marqué **actif**. |
| 4 | Revenir sur le bloc d'exemple. | Bouton **inactif** et phrase « Le projet d'exemple existe déjà : activez-le dans la liste ci-dessous, ou supprimez-le pour le recréer. » |
| 5 | **Parties prenantes**, **Besoins**, **Exigences**, **Décisions**, **Risques**, **User stories**, **Tests**, **Ateliers**. | Nombres : 5, 4, 8, 3, **4 dont 1 archivé (RIS-004)** avec le filtre « Tous », 6, 7, 1. Codes à trois chiffres (PP-001, EX-001…). Textes en français, sans caractères étranges. |
| 6 | Ouvrir **EX-003** (blocage d'un créneau déjà réservé). | Priorité indispensable, critères d'acceptation rédigés ; liens : dérivée de BES-002, implémentée par US-003, vérifiée par TEST-003. |
| 7 | Ouvrir **DEC-001** et **DEC-002**. | DEC-001 : statut « Remplacée » ; DEC-002 : « Décidée », « remplace » DEC-001, avec alternatives et justification. |
| 8 | Écran **Traçabilité**. | Matrice : EX-001, EX-002, EX-005, EX-007 « Réussi » ; **EX-003 « Échoué »** ; EX-004 « À exécuter » ; **EX-006 « Bloqué »** ; EX-008 sans test. |
| 9 | Même écran, section des éléments sans lien. | Exigences sans story : **EX-006, EX-007, EX-008**. Exigence sans test : **EX-008**. Story sans exigence : **US-006**. Story sans test : **US-006**. Rien pour les parties prenantes, les besoins et les tests. |
| 10 | **Livrables** : générer, pour le projet d'exemple, **les 7 modèles** (Markdown suffit pour 6 d'entre eux). | Aucun message d'erreur ; aperçu non vide ; le registre des risques **ne contient pas RIS-004** par défaut. |
| 11 | Livrables, registre des risques : cocher « inclure les archivés ». | **RIS-004** (messagerie) apparaît. La matrice de traçabilité ignore cette option, c'est normal. |
| 12 | **Compte rendu d'atelier** (atelier de cadrage) en **Word** ; l'ouvrir dans Word. | Date 10/02/2026, lieu, objectif, participants (5), éléments qui en proviennent (BES-001, BES-002, BES-003, DEC-001, RIS-002), notes, points ouverts. Pas de message à l'ouverture. |
| 13 | **Supprimer** le projet d'exemple (Supprimer…, lire le message, confirmer). | Le message annonce 38 éléments et 52 liens. Après confirmation, le projet disparaît ; le bouton de création redevient actif. |
| 14 | Recréer l'exemple. | Même résultat qu'au test 3 ; mêmes codes (PP-001, EX-001…). |
| 15 | Sur la copie contenant **vos vrais projets** : créer l'exemple. | Vos projets, leurs éléments et leurs codes sont **inchangés**. L'exemple a ses propres codes (PP-001…). Le projet d'exemple devient actif ; vous pouvez revenir à un de vos projets avec le sélecteur. |
| 16 | Fermer l'application puis la relancer. | Le projet d'exemple et son contenu sont toujours là. |
| 17 | Créer un projet à la main nommé exactement « [Exemple] Portail de réservation de salles » alors que l'exemple n'existe pas. | La création du projet marche (c'est un projet ordinaire) ; le bouton d'exemple devient ensuite inactif : c'est le comportement prévu (reconnaissance par le nom). |
| 18 | Vérifier que rien d'autre n'a changé : écrans Ateliers, Risques, Besoins, etc. sur vos vrais projets. | Identiques à la 0.10.2. |

**Si tout est conforme** : dites « étape 4 validée » ; je passe au guide de démonstration. **Sinon** : numéro du test et différence.
