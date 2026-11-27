# Recette F4 — Technique scindé et journal consultable (version 0.14.0, schéma 7)

**Ce que F4 change** : l'écran **Technique** est scindé en trois. **Technique** garde la sauvegarde, l'import V1, l'export d'un livrable (jusqu'à F5), les informations de base et la liste des tables. **À propos** reçoit la fiche d'identité de l'application. Le nouvel écran **Journal**, dans la section Contrôle après Traçabilité, liste les entrées du journal du **projet actif** : 25 par page, filtre par type d'objet (Éléments, Liens, Documents, Projet), filtre par action (Créé, Modifié, Statut changé, Supprimé, Importé), libellés lisibles (code et titre quand l'élément existe, mention « supprimé » sinon). Le bloc global « Journal d'activité (12 derniers) » disparaît ; les entrées sans projet (imports V1) ne sont plus affichées (décision du 27/11/2026). Lecture seule, aucune migration : le schéma reste 7.

**Précaution** : deux dossiers, `Test-avant` (exécutable **0.13.0**) et `Test-F4` (exécutable **0.14.0**), chacun avec une copie de ton `BAMentorData`. Les tests 1 à 14 se jouent sur une copie où le **projet d'exemple vient d'être créé et n'a pas été modifié** (en créer un neuf dans une copie vide si besoin) ; les chiffres ne valent que dans ce cas.

**Non vérifiable de mon côté** : le rendu réel, les clics (pagination, filtres, code cliquable), l'heure locale du navigateur intégré, le contrôle réel des types React, le Rust, l'exécutable, la performance sur un très gros journal.

## A. Contrôles à relever dans GitHub Actions

Quatre jobs attendus verts. `build.yml` n'est pas modifié par F4 : vérifie quand même que le fichier du dépôt est à jour. **Vérifie que les nouveaux fichiers sont déposés** : `src/modules/journal/` (trois fichiers), `src/data/repositories/journal.ts`, `src/domain/activity-labels.ts`.

| # | Où regarder | Résultat attendu |
|---|---|---|
| CI-1 | Le commit de l'exécution | C'est le commit qui contient les fichiers F4. |
| CI-2 | `verify`, « Versions alignées » | Vert, **0.14.0**. |
| CI-3 | `verify`, « Règles d'architecture » | Vert. |
| CI-4 | `verify`, « Tests » | `fail 0` ; **475 tests** annoncés. Si le nombre diffère, note-le : un fichier manque. |
| CI-5 | Job `types` | **Vert, sans ligne `error TS`.** F4 ajoute trois composants React et réorganise `App.tsx` : seul ce job vérifie les vrais types. Si rouge : colle-moi les lignes `error TS`. Relève aussi les versions (TypeScript 5.9.3, `@types/react` 18.3.32). |
| CI-6 | `rust-tests` | Vert (aucun changement Rust). |
| CI-7 | `build` | Vert ; l'artefact `ba-mentor-exe` affiche 0.14.0 à l'écran À propos. |

## B. Recette sur clé (exécutable 0.14.0)

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Lancer la 0.14.0, projet d'exemple actif. | Ouverture sur **Accueil**. Menu : Accueil, Projets, sections Analyse, Pilotage, Réalisation, puis **Contrôle** avec **Traçabilité et Journal**, puis **Technique** et **À propos** en fin de menu. |
| 2 | Ouvrir **Technique**. | Cartes : Base de données, Centre de sauvegarde, Importer les données de la V1, Exporter un livrable, Tables. **Plus** de carte À propos ni de carte Journal d'activité. |
| 3 | Ouvrir **À propos**. | Nom, auteur, version **0.14.0**, date de génération, compilation, schéma **7**, dossier de données : comme l'ancienne carte. |
| 4 | Ouvrir **Journal**, sans filtre. | **118 entrées**, « Page 1 sur 5 », 25 lignes, la plus récente en haut : le lien **RIS-002 → ATL-001**, détail « provient de ». Date et heure locales (jj/mm/aaaa hh:mm:ss). Précédent désactivé. |
| 5 | Cliquer Suivant jusqu'à la page 5. | Page 5 : **18 lignes**, la dernière est la création du projet d'exemple ; Suivant désactivé ; Précédent ramène à la page 4. |
| 6 | Type d'objet **Éléments**, puis **Liens**, puis **Projet**, puis **Documents**. | Éléments : **65 entrées**, 3 pages (dernière : 15 lignes). Liens : **52**, 3 pages (dernière : 2 lignes). Projet : **1** ligne. Documents : « Aucune entrée pour ces filtres (118 au total dans ce projet). » |
| 7 | Type **Tous**, action **Statut changé**, puis **Créé**. | Statut changé : **27** entrées, 2 pages ; première ligne **ATL-001**, objet Atelier, détail « Planifié → Tenu ». Créé : **91** entrées, 4 pages. |
| 8 | Type **Liens** + action **Statut changé**. | Aucun résultat, message avec « 118 au total ». « Page 1 sur 1 · 0 entrée ». |
| 9 | Type Éléments, aller à la page 3, puis changer l'action. | Retour **page 1** dès le changement de filtre. |
| 10 | Cliquer le code d'un élément dans une ligne ; essayer sur une ligne de lien. | L'élément s'ouvre dans son registre. Sur un lien, le texte « RIS-002 → ATL-001 » n'est pas cliquable. |
| 11 | Créer une exigence « Test F4 », la passer à **Validé**, puis modifier son titre **et** sa priorité en **une seule** sauvegarde. Revenir sur Journal. | Trois nouvelles lignes, la plus récente en haut : **EX-009** « Modifié », détail « Champs : Titre, Priorité » ; « Statut changé », « Brouillon → Validé » ; « Créé ». Total **121**. |
| 12 | Supprimer EX-009, revenir sur Journal. | Ligne en tête « Supprimé » **Exigence supprimée**, sans code ni clic ; les trois lignes précédentes d'EX-009 portent « (élément supprimé depuis) ». Total **122**, action Supprimé : **1**. |
| 13 | Créer un second projet vide, l'activer, ouvrir Journal. | **1 entrée** (la création du projet), rien du projet d'exemple ; filtres remis à Tous. Reprendre le projet d'exemple : **122**. |
| 14 | Visiter Journal trois fois, filtrer, paginer, puis rouvrir. | Total toujours **122** : consulter le journal n'écrit rien. |
| 15 | Fermer, relancer ; puis, sur une copie avec **tes vrais projets**, ouvrir Journal sur chacun ; dans Technique, créer une sauvegarde manuelle et regarder l'écran d'import. | Ouverture sur Accueil. Chaque projet a son propre journal ; un projet importé de la V1 n'a que les entrées faites depuis. Sauvegarde et import fonctionnent comme en 0.13.0. |

Les totaux des tests 11 à 14 supposent que l'exigence créée n'a aucun lien et que la modification du test 11 se fait en **une** sauvegarde (une seule ligne « Modifié »).

**Ce que cette recette ne couvre pas** : la performance sur un très grand journal (lecture sans index, non mesurée), les entrées sans projet de l'import V1 (volontairement invisibles) et le journal d'un projet supprimé (ses lignes restent dans la base, sans être visibles).

**Si tout est conforme** : dis « F4 validé » avec la ligne CI-5 (versions de TypeScript et des `@types`) et le nombre de tests de CI-4. **Sinon** : numéro du test ou de la ligne CI, et la différence.
