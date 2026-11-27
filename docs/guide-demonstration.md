---
title: "BA-Mentor — Guide de démonstration"
subtitle: "Version 0.15.0 · Projet d'exemple « Portail de réservation de salles »"
lang: fr-FR
---

# 1. À quoi sert ce guide

Il te permet de présenter BA-Mentor en **10 à 12 minutes**, devant un Business Manager, un recruteur ou un client, en suivant un fil unique : **du besoin exprimé en atelier jusqu'aux livrables, avec la traçabilité qui relie le tout.**

Ce guide décrit uniquement ce que l'application fait aujourd'hui (version 0.15.0). Il ne contient **pas de captures d'écran** : ajoute les tiennes si tu veux un support imprimé.

**Avant chaque démonstration, vérifie** que la version affichée en pied de page est bien celle du guide (0.15.0). Si l'application a évolué, certains libellés ou nombres ci-dessous peuvent ne plus correspondre : rejoue la démonstration une fois en entier la veille.

# 2. Le message à faire passer

> BA-Mentor est l'atelier du Business Analyst : on y structure ce qu'on a entendu, on le relie, on contrôle ce qui manque, et on en sort des livrables. Tout fonctionne hors ligne, sur une clé USB, sans IA.

Trois idées à garder en tête, pas plus :

1. **Tout est relié.** Une exigence sait de quel besoin elle vient, quelle story la porte, quel test la vérifie.
2. **Les trous se voient.** L'outil calcule ce qui n'est pas couvert, il ne le laisse pas deviner.
3. **Les documents sortent des données.** Pas de copier-coller : les livrables sont générés depuis le projet.

# 3. Préparation (5 minutes, la veille ou le matin)

| À faire | Pourquoi |
|---|---|
| Lancer l'exécutable depuis ta clé, vérifier la version en pied de page. | Éviter de découvrir une autre version en direct. |
| Écran **Projets** : si « [Exemple] Portail de réservation de salles » n'existe pas, cliquer sur **Créer le projet d'exemple**. | C'est ton jeu de démonstration, identique à chaque fois. |
| S'il existe déjà mais que tu l'as modifié : le supprimer (**Supprimer…**), puis le recréer. | Repartir des mêmes données que ce guide : 38 éléments, 52 liens. |
| Vérifier que le projet d'exemple est **actif** (étiquette « actif » dans la liste, nom dans le sélecteur du haut de l'écran). | La création l'active automatiquement ; un autre projet actif fausserait la démonstration. |
| Avoir **Word** ouvrable sur la machine de démonstration. | Pour montrer le compte rendu d'atelier à la fin. |
| Se placer sur l'écran **Projets**. | Point de départ du déroulé. |

> **Ne montre pas tes vrais projets** pendant une démonstration. Utilise uniquement le projet d'exemple : il est fictif et sans aucune donnée réelle.

# 4. Le déroulé

Les durées sont indicatives. L'application s'ouvre sur **Accueil** dès qu'un projet est actif : couverture de traçabilité, orphelins, brouillons et dix dernières modifications du projet actif (avec le projet d'exemple : 5 sur 8 exigences avec une user story, 6 orphelins, 2 exigences et 2 user stories en brouillon). Le menu de gauche commence par **Accueil** et **Projets**, puis des sections : **Analyse** (Ateliers, Parties prenantes, Besoins, Exigences), **Pilotage** (Décisions, Risques, Livrables, Documents), **Réalisation** (User stories, Tests), **Contrôle** (Traçabilité, Journal), puis **Technique** (sauvegarde, import) et **À propos**. L'écran **Journal** liste, pour le projet actif, ce qui a été créé, modifié ou supprimé, avec filtres et pages de 25 entrées ; il est facultatif dans une démonstration.

## Étape 1 — Planter le décor (1 min) · écran Projets

**À montrer** : la liste des projets, le projet d'exemple actif, le bloc « Projet d'exemple ».

**À dire** : « Voici un projet fictif : un portail de réservation de salles pour une commune. J'ai pris le scénario classique d'un BA : un atelier de cadrage, puis tout ce qui en découle. »

## Étape 2 — L'atelier, point de départ (1 min) · Ateliers

**À montrer** : ouvrir **Atelier de cadrage du portail de réservation** (ATL-001).

**Ce que l'écran affiche** : date (10/02/2026), lieu, objectif, notes, points ouverts, et en bas la zone **Liens**.

**À dire** : « Tout part d'ici. L'atelier a des participants, et des éléments qui en proviennent : besoins, décision, risque. » Montrer dans la zone Liens les parties prenantes qui participent et les éléments dont il est l'origine.

**Piège** : ne pas lire tout le texte des notes, une phrase suffit.

## Étape 3 — Parties prenantes et besoins (1 min 30) · Parties prenantes, puis Besoins

**À montrer** : la liste des 5 parties prenantes (influence et intérêt visibles), puis les 4 besoins. Ouvrir **BES-001** (réserver une salle sans passer par l'accueil) : dans les liens, qui l'exprime et quelles exigences en découlent.

**À dire** : « Un besoin n'est jamais orphelin : on sait qui l'exprime, et ce qu'on en tire. »

## Étape 4 — Les exigences (1 min 30) · Exigences

**À montrer** : la liste des 8 exigences. Ouvrir **EX-003** (blocage d'un créneau déjà réservé) : priorité indispensable, critères d'acceptation rédigés, et dans les liens le besoin d'origine, la user story qui l'implémente, le test qui la vérifie.

**À dire** : « Chaque exigence a ses critères d'acceptation, une priorité, une nature. Fonctionnelle, non fonctionnelle, contrainte : on le voit dans la liste. »

**Facultatif (15 secondes)** : dans le champ **Rechercher**, taper `creneau` (sans accent) : EX-003 et EX-005 restent affichées, et les boutons de statut montrent leurs compteurs, par exemple « Brouillon (1) ». La recherche porte sur le code, le titre et la description, dans le registre affiché seulement. Le menu **Trier par** propose le code, le titre et la date de modification.

## Étape 5 — Les décisions (1 min) · Décisions

**À montrer** : **DEC-001** (achat d'un progiciel), statut « Remplacée », et **DEC-002** (développement sur mesure) qui la remplace, avec alternatives et justification.

**À dire** : « On garde la trace de ce qu'on a décidé, et de ce qui a été remis en cause. Ici, l'achat d'un progiciel a été abandonné parce que les licences dépassaient le budget et que l'hébergement chez l'éditeur contredisait la contrainte EX-007. »

## Étape 6 — Les risques (1 min) · Risques

**À montrer** : les risques (RIS-001 à RIS-003, et RIS-004 archivé, visible avec le filtre « Tous »). Ouvrir **RIS-002** : traitement, responsable, et les éléments qui l'atténuent (EX-004, DEC-003).

**À dire** : « Un risque est relié à ce qu'il menace et à ce qui l'atténue. »

## Étape 7 — Stories et tests (1 min) · User stories, puis Tests

**À montrer** : la liste des stories, puis celle des tests avec leurs statuts : **TEST-003 échoué**, **TEST-005 bloqué**, **TEST-004 à exécuter**, les autres réussis.

**À dire** : « Mes tests ont des résultats. Le troisième a échoué : la double réservation n'est pas bloquée. Voyons ce que ça donne pour les exigences. » (Cela annonce l'étape suivante.)

## Étape 8 — La traçabilité, le moment fort (2 min 30) · Traçabilité

**À montrer, dans cet ordre** :

1. **Le bandeau de couverture** : « Exigences testées : 7 sur 8 », « Exigences dont le résultat est Réussi : 4 sur 8 », « Exigences Indispensable (Must) testées : 4 sur 4 ». Parties prenantes et besoins sont couverts : 5 sur 5 et 4 sur 4.
2. **L'onglet Matrice** : exigence par exigence, avec ses besoins, ses stories, ses tests directs et ceux qui passent par une story, et le résultat. Montrer **EX-003 « Échoué »**, **EX-006 « Bloqué »**, **EX-004 « À exécuter »** (son test passe par sa user story), **EX-008 « Aucun test »**.
3. **Le filtre « Indispensable (Must) seulement »** : les quatre exigences critiques sont toutes testées, et l'une d'elles est en échec.
4. **L'onglet Orphelins (6)** : les éléments sans lien attendu.
5. **Cliquer sur un code** (par exemple EX-003) : la fiche s'ouvre directement.

**À dire** : « Voici ce que je ne peux pas voir dans un tableur : où sont les trous. Cette exigence indispensable est en échec. Celle-ci n'a aucune story. Cette story n'a aucune exigence derrière elle. L'outil le calcule à chaque fois, je n'ai rien à maintenir à la main. »

## Étape 9 — Les livrables et les documents (2 min 30) · Livrables, Documents

**À montrer** :

1. Choisir le modèle **Compte rendu d'atelier**, puis l'atelier de cadrage : l'aperçu apparaît.
2. Cliquer sur **Enregistrer comme document**, puis **Ouvrir dans Documents** : le document est en **Brouillon**, version 1, avec la liste figée des éléments. Cliquer sur **Exporter en Word** et ouvrir le fichier dans Word : sous le titre, « Document : version 1, brouillon », puis date, lieu, objectif, participants, éléments issus de l'atelier, notes, points ouverts.
3. Changer de modèle : **Registre des risques**, cocher puis décocher **Inclure les éléments archivés ou rejetés** : RIS-004 apparaît et disparaît.
4. Modifier une exigence, revenir dans Livrables et enregistrer à nouveau : une **version 2** apparaît, la version 1 passe à l'état « Remplacé » (case « Afficher les versions remplacées »). Enregistrer sans rien changer : « Contenu identique, aucune nouvelle version ».
5. Citer les sept modèles : compte rendu d'atelier, registre des exigences, registre des décisions, registre des risques, backlog des user stories, cahier de recette, matrice de traçabilité.

**À dire** : « Ces documents ne sont pas tapés : ils sortent des données. Chaque enregistrement fige une photographie datée ; si je change une exigence, je régénère et j'obtiens la version suivante, l'ancienne reste consultable. Chaque fichier est signé du nom de l'application, de la version et de la date. »

**Piège** : la matrice de traçabilité ignore l'option des archivés, c'est normal (l'écran l'explique).

## Étape 10 — Conclure (30 s)

**À dire** : « L'objectif était de démontrer comment un Business Analyst peut conserver le lien entre ce qu'il entend en atelier, ce qu'il formalise, ce qu'il fait développer et ce qu'il fait tester. »

Si on te demande où se situe l'outil par rapport aux autres, utilise les réponses de la section 6 : ne commence pas par ce que l'outil n'est pas.

# 5. Les manques volontaires : un argument, pas un défaut

Le projet d'exemple contient des trous **voulus**. Dis-le d'emblée si on te le demande.

| Constat | Éléments | Ce que ça démontre |
|---|---|---|
| Exigence indispensable en échec | EX-003 (TEST-003 échoué) | L'outil remonte l'échec jusqu'à l'exigence. |
| Exigence bloquée | EX-006 (TEST-005 bloqué) | Un blocage ne passe pas pour un succès. |
| Exigences sans user story | EX-006, EX-007, EX-008 | Des exigences non fonctionnelles ou en brouillon n'ont pas toujours de story : l'outil les signale quand même. |
| Exigence sans test | EX-008 | Seule exigence « Souhaitable » non couverte. |
| User story sans exigence ni test | US-006 | Une idée de terrain pas encore cadrée est repérée. |
| Risque archivé | RIS-004 | Le filtre « Inclure les éléments archivés ou rejetés ». |

# 6. Questions probables, réponses honnêtes

| Question | Réponse |
|---|---|
| « Ça remplace Jira ? » | Non, et ce n'est pas l'objectif. Aucune gestion de sprint, de tableau ou de multi-utilisateur. C'est un atelier d'analyse et de traçabilité. |
| « Où sont les données ? » | Dans un dossier `BAMentorData` à côté de l'exécutable, en local. Le code de l'application ne contient aucun appel réseau et sa politique de sécurité n'autorise que la communication interne (vérifié par lecture du code, pas par mesure sur un pare-feu : ne promets pas plus que « hors ligne par conception »). |
| « Il y a de l'IA ? » | Non. L'outil fonctionne entièrement sans IA ; c'est un choix de conception. Une IA optionnelle est envisagée plus tard, sans que rien en dépende. |
| « Plusieurs utilisateurs ? » | Non, c'est un outil monoposte. |
| « Et si ça plante ? » | Des sauvegardes automatiques sont faites ; l'écran Technique permet d'en créer et de restaurer. |
| « Pourquoi pas un tableur ? » | Un tableur ne calcule pas la couverture et ne génère pas les documents. Ici les liens sont des données, pas des références écrites à la main. |
| « Qu'est-ce qui existe déjà sur le marché ? » | Chaque brique existe ailleurs ; je n'ai fait aucune étude de marché. La valeur est dans la combinaison : traçabilité calculée, sans IA, portable. |
| « C'est utilisé ? » | C'est mon outil personnel de travail et de démonstration. Ne le présente pas comme un produit déployé. |

# 7. Si quelque chose ne va pas

| Problème | Solution |
|---|---|
| Le projet d'exemple a été modifié. | **Supprimer…** puis **Créer le projet d'exemple** : retour aux mêmes données en quelques secondes. |
| Le bouton de création est grisé. | Un projet de même nom existe déjà : l'activer, ou le supprimer pour le recréer. |
| Un message d'erreur apparaît à la création. | La création est annulée proprement (rien ne subsiste). Relancer ; si cela persiste, redémarrer l'application. |
| Word ne s'ouvre pas ou refuse le fichier. | Exporter en **Markdown** ou **HTML**, que n'importe quel navigateur ou éditeur ouvre. |
| Tu t'es perdu dans le déroulé. | Revenir à **Traçabilité** : c'est le moment fort, et il tient seul en deux minutes. |

# 8. Version courte (5 minutes)

Si on t'en laisse peu : étape 2 (atelier, 30 s), étape 4 (EX-003 et ses liens, 1 min), **étape 8 (traçabilité, 2 min)**, étape 9 (un livrable Word, 1 min 30).

# Annexe — Repères du projet d'exemple

| Type | Codes | Nombre |
|---|---|---|
| Parties prenantes | PP-001 à PP-005 | 5 |
| Besoins | BES-001 à BES-004 | 4 |
| Exigences | EX-001 à EX-008 | 8 |
| Décisions | DEC-001 à DEC-003 | 3 |
| Risques | RIS-001 à RIS-004 (RIS-004 archivé) | 4 |
| User stories | US-001 à US-006 | 6 |
| Tests | TEST-001 à TEST-007 | 7 |
| Atelier | ATL-001 | 1 |
| Liens | | 52 |

Résultats de la matrice : EX-001, EX-002, EX-005, EX-007 Réussi · EX-003 Échoué · EX-004 À exécuter · EX-006 Bloqué · EX-008 Aucun test.
