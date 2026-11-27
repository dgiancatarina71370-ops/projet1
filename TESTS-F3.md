# Recette F3 — Accueil du projet (version 0.13.0, schéma 7)

**Ce que F3 change** : un écran **Accueil**, premier du menu et écran de démarrage quand un projet est actif. Il affiche, pour le projet actif : la **couverture de traçabilité** (les six lignes de l'écran Traçabilité), le **nombre d'orphelins** (avec un bouton qui ouvre Traçabilité sur l'onglet Orphelins), les **brouillons** (besoins, exigences, user stories) et les **dix dernières modifications** d'éléments (lues dans le journal). L'écran est en lecture seule. Le texte d'introduction de l'en-tête ne parle plus du « Lot M8 ». Aucune migration : le schéma reste 7.

**Précaution** : deux dossiers, `Test-avant` (exécutable **0.12.0**) et `Test-F3` (exécutable **0.13.0**), chacun avec une copie de ton `BAMentorData` (schéma 7). Les tests 1 à 13 se jouent sur une copie contenant le **projet d'exemple non modifié** (le créer si besoin depuis l'écran Projets) ; les chiffres ne valent que dans ce cas.

**Non vérifiable de mon côté** : le rendu réel à l'écran, les clics (boutons, codes cliquables), la navigation, l'heure locale affichée par le navigateur intégré, le contrôle réel des types React, le Rust et l'exécutable.

## A. Contrôles à relever dans GitHub Actions

Quatre jobs attendus verts. `build.yml` n'est pas modifié par F3 : vérifie quand même que le fichier du dépôt est la version à jour. **Vérifie que les fichiers de `src/` sont bien déposés**, en particulier les **nouveaux dossiers** `src/modules/home/` et `src/data/repositories/home.ts`, ainsi que `src/domain/trace-labels.ts`.

| # | Où regarder | Résultat attendu |
|---|---|---|
| CI-1 | Le commit de l'exécution | C'est le commit qui contient les fichiers F3. |
| CI-2 | `verify`, « Versions alignées » | Vert, **0.13.0**. |
| CI-3 | `verify`, « Règles d'architecture » | Vert. |
| CI-4 | `verify`, « Tests » | `fail 0` ; **460 tests** annoncés. Si le nombre diffère, note-le : un fichier manque. |
| CI-5 | Job `types` | **Vert, sans ligne `error TS`.** F3 ajoute trois composants React et une propriété d'écran (`initialTab`) : ce job est le seul à vérifier les vrais types. Si rouge : colle-moi les lignes `error TS`. Relève aussi les versions affichées (TypeScript 5.9.3, `@types/react` 18.3.32). |
| CI-6 | `rust-tests` | Vert (aucun changement Rust). |
| CI-7 | `build` | Vert ; l'artefact `ba-mentor-exe` affiche 0.13.0 au lancement. |

## B. Recette sur clé (exécutable 0.13.0)

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Lancer la 0.13.0 avec le projet d'exemple actif. | L'application s'ouvre sur **Accueil**, premier du menu (avant Projets), surligné. Le texte sous « BA-Mentor » ne cite plus « Lot M8 ». |
| 2 | Lire la couverture. | Parties prenantes avec un besoin **5 sur 5** ; Besoins avec une exigence **4 sur 4** ; Exigences avec une user story **5 sur 8** ; Exigences testées **7 sur 8** ; Exigences dont le résultat est Réussi **4 sur 8** ; Exigences Indispensable (Must) testées **4 sur 4**. Aucune phrase sur des éléments ignorés. |
| 3 | Ouvrir **Traçabilité** par le menu et comparer le bandeau. | Les six lignes sont identiques à celles de l'accueil. |
| 4 | Retour sur **Accueil**, lire les orphelins. | **6 orphelins**. Le bouton « Voir les orphelins » ouvre Traçabilité sur l'onglet **Orphelins (6)** : EX-006, EX-007, EX-008 sans user story ; EX-008 sans test ; US-006 sans exigence et sans test. |
| 5 | Depuis Traçabilité (onglet Orphelins), cliquer **Accueil** puis **Traçabilité** dans le menu. | Traçabilité s'ouvre sur **Matrice**, pas sur Orphelins. Le bouton « Voir la traçabilité » de l'accueil ouvre aussi la Matrice. |
| 6 | Lire les brouillons. | Besoins **0**, Exigences **2**, User stories **2**. Une phrase précise que seuls besoins, exigences et user stories sont comptés. |
| 7 | Cliquer **Exigences**, puis le filtre Brouillon. | Le registre Exigences s'ouvre (sans filtre) ; le filtre montre **EX-005 et EX-008**. Idem User stories : **US-005 et US-006**. |
| 8 | Lire les dix dernières modifications du projet d'exemple. | Dix lignes, la plus récente en haut, heure locale (jj/mm/aaaa hh:mm:ss). Calculé sur une base de test : **ATL-001** statut : Planifié → Tenu ; **TEST-007** À exécuter → Réussi ; **TEST-006** À exécuter → Réussi ; **TEST-005** À exécuter → Bloqué ; **TEST-003** À exécuter → Échoué ; **TEST-002** À exécuter → Réussi ; **TEST-001** À exécuter → Réussi ; **US-004** Brouillon → Prête ; **US-003** Brouillon → Prête ; **US-002** Brouillon → Réalisée. Cet ordre suit le chargement du projet d'exemple ; si ton projet a été créé par une version plus ancienne, il peut différer : relève-le sans le compter comme anomalie. |
| 9 | Créer une exigence « Test F3 », revenir sur **Accueil**. | Ligne en tête : **EX-009 · créé**. Exigences avec une user story **5 sur 9**, testées **7 sur 9**, résultat Réussi **4 sur 9** ; Must **4 sur 4**. Orphelins **8**. Brouillons Exigences **3**. |
| 10 | Passer EX-009 à **Validé**, revenir sur Accueil. | Ligne en tête « statut : Brouillon → Validé ». Brouillons Exigences **2**. |
| 11 | Modifier son titre, revenir. | Ligne en tête « modifié » avec le nouveau titre. |
| 12 | Cliquer le code **EX-009** dans une ligne. | La fiche EX-009 s'ouvre dans le registre Exigences. |
| 13 | Supprimer EX-009, revenir sur Accueil. | Ligne en tête « Exigence supprimée », sans code ni titre ni clic ; les anciennes lignes d'EX-009 n'ont plus de code et portent « (élément supprimé depuis) ». Orphelins **6** ; couverture de nouveau 5/8, 7/8, 4/8. |
| 14 | Créer un second projet vide, l'activer, revenir sur Accueil. | Couverture « — » partout, « Aucun orphelin : … » (sans bouton), brouillons **0 / 0 / 0**, « Aucune modification d'élément dans ce projet. » Rien du projet d'exemple. Reprendre le projet d'exemple : les chiffres du test 2 reviennent. |
| 15 | Dans Technique, noter les lignes du journal affichées ; visiter Accueil trois fois ; rouvrir Technique. | Journal identique : consulter l'accueil n'écrit rien. |
| 16 | Fermer l'application, la relancer. | Elle s'ouvre sur Accueil, sur le dernier projet actif. |
| 17 | Copie contenant **tes vrais projets** : ouvrir Accueil sur chacun. | Chaque projet affiche ses propres chiffres ; un projet importé de la V1, jamais modifié depuis, affiche « Aucune modification d'élément » (ce n'est pas une anomalie). Régression rapide : recherche et tri dans Exigences, Livrables, Technique : comportement inchangé. |

**Ce que cette recette ne couvre pas** : la performance de la lecture du journal sur une très grosse base (non mesurée), et le filtre préappliqué à l'arrivée dans un registre (non prévu : cliquer « Exigences » ouvre le registre complet).

**Si tout est conforme** : dis « F3 validé » avec la ligne CI-5 (versions de TypeScript et des `@types`). **Sinon** : numéro du test ou de la ligne CI, et la différence.
