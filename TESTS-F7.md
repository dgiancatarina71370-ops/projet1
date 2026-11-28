# Recette F7 — Historique par fiche (version 0.17.0, schéma 8 inchangé)

**Ce que F7 change** : sous la zone « Liens » de la fiche de chacun des huit registres (parties prenantes, besoins, exigences, décisions, risques, user stories, tests, ateliers), une section **Historique** relit le journal pour l'élément ouvert : création, changements de statut (« Brouillon → Validé »), modifications (noms des champs, **pas** les valeurs), liens ajoutés et retirés, du plus récent au plus ancien, **10 lignes à la fois**. **Seul changement d'écriture** : à partir de la 0.17.0, le détail d'une ligne de journal pour un lien s'écrit « type:identifiant de l'origine>identifiant de la cible » (identifiants seulement). Sans cela, un lien retiré ne pouvait être rattaché à aucune fiche.

**Limite à connaître avant de jouer la recette** : les liens retirés **avant** la 0.17.0 n'apparaissent dans aucune fiche, et la création d'un lien retiré depuis n'y apparaît pas non plus. Une phrase le dit sous chaque historique. Le Journal du projet les garde.

**Précaution** : pas de migration, mais joue la recette sur une **copie de `BAMentorData`**, avec l'exécutable **0.17.0**. Les chiffres valent pour le **projet d'exemple neuf**, avec les tests 2 à 9 joués **dans l'ordre**.

**Non vérifiable de mon côté** : le rendu réel de la section (espacements, longueur de la liste), les clics (bouton « Afficher les suivantes »), le rafraîchissement automatique après une écriture (lu dans le code, non essayé), la vitesse sur un gros projet (aucun index sur le journal), le contrôle réel des types React, le Rust, l'exécutable.

## A. Contrôles à relever dans GitHub Actions

Quatre jobs attendus verts. `build.yml` n'est pas modifié. **Aucun fichier à supprimer à la main.** Vérifie que les nouveaux fichiers sont dans le commit : `src/domain/link-detail.ts`, `src/app/history-logic.ts`, `src/app/HistorySection.tsx`, `src/shared/history-ui.tsx`, `tests/f7-history.test.ts`, `tests/ui-f7.test.ts`.

| # | Où regarder | Résultat attendu |
|---|---|---|
| CI-1 | Le commit de l'exécution | C'est le commit qui contient les fichiers F7. |
| CI-2 | `verify`, « Versions alignées » | Vert, **0.17.0**. |
| CI-3 | `verify`, « Règles d'architecture » | Vert. |
| CI-4 | `verify`, « Tests » | `fail 0` ; **562 tests** annoncés (545 avant). Si le nombre diffère, note-le : un fichier manque. |
| CI-5 | Job `types` | **Vert, sans ligne `error TS`.** F7 ajoute `HistorySection.tsx` et `history-ui.tsx` et touche `register-screen.tsx`, `App.tsx` et les huit écrans. Relève les quatre versions (TypeScript 5.9.3, `@types/react` 18.3.32, `@types/react-dom` 18.3.7, `@types/node` 22.20.7). Si rouge : colle-moi les lignes `error TS`. |
| CI-6 | `rust-tests` | Vert (aucun changement Rust). |
| CI-7 | `build` | Vert ; l'artefact `ba-mentor-exe` affiche 0.17.0 à l'écran À propos. |

## B. Recette sur clé (exécutable 0.17.0, copie de `BAMentorData`)

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Lancer la 0.17.0 sur la copie. Ouvrir **À propos**, puis **Technique**, carte « Base de données ». | Démarrage **sans erreur**. Version **0.17.0**, schéma **8** ; aucune nouvelle ligne « Sauvegarde avant migration ». |
| 2 | Créer le projet d'exemple neuf, l'activer. **Exigences**, ouvrir **EX-003**. | Sous la zone Liens, une section **Historique** : « N entrées », au moins la ligne **Créé** en bas ; les lignes ont une date et une heure ; la phrase « Les liens retirés avant la version 0.17.0… » est visible sous la liste. |
| 3 | Dans la fiche EX-003, **Passer à** un autre statut, sans quitter la fiche. | Une ligne **Statut : … → …** apparaît en haut de l'historique **sans rouvrir la fiche**. Si elle n'apparaît qu'après avoir quitté puis rouvert la fiche, note-le : c'est le rafraîchissement (F7-D08). |
| 4 | **Modifier** EX-003 (changer le titre et la priorité), enregistrer. | Ligne **Modifié · Champs : Titre, Priorité**. Les nouvelles valeurs ne sont **pas** écrites dans l'historique. |
| 5 | Dans la zone Liens de EX-003, **ajouter** un lien avec un élément de ton choix. | Ligne **Lien ajouté : <libellé> <code de l'autre élément>**. Ouvre la fiche de l'autre élément : une ligne **Lien ajouté** avec le **libellé inverse** et le code de EX-003. |
| 6 | **Retirer** ce lien depuis EX-003. | Ligne **Lien retiré : …** dans les **deux** fiches. |
| 7 | Créer un lien entre deux éléments, puis **supprimer l'un des deux éléments**. Ouvrir la fiche de l'autre. | Lignes **Lien ajouté** et **Lien retiré : vers un élément supprimé depuis** (sans code, sans titre). |
| 8 | Sur un élément, enchaîner **plus de 10 événements** (changer le statut 12 fois par exemple). | **10 lignes** affichées, « N entrées » exact, bouton **Afficher les 10 suivantes** (puis **Afficher la suivante** ou **Afficher les N suivantes** pour une dernière tranche partielle) ; le bouton disparaît quand tout est affiché ; aucune ligne en double. |
| 9 | Ouvrir une fiche dans **chacun des huit registres**. | La section Historique est présente dans les huit. Aucune fiche ne montre une ligne qui concerne un autre élément (vérifie sur deux fiches voisines). |
| 10 | **Journal**, filtre « Liens ». | Les lignes de lien créées ou retirées pendant la recette affichent le **type** (« dérive en », « implémente »…) comme avant, **sans** « type inconnu ». Rien d'autre ne change à l'écran. |
| 11 | Sur une copie de ta **base réelle**, ouvrir la fiche d'un élément ancien. | Elle s'ouvre sans erreur ; l'historique montre les lignes anciennes (création, statuts) ; les liens retirés avant la 0.17.0 n'y figurent pas, et la phrase de limite l'annonce. |
| 12 | Non-régression : sauvegarde manuelle puis restauration ; Accueil (dernières modifications) ; documents. | Comme en F6. |
| 13 | **Facultatif**, sur une copie utilisée en 0.17.0 : rouvrir avec l'exécutable **0.16.0**. | Elle s'ouvre (même schéma 8). Dans le Journal de la 0.16.0, les lignes de lien écrites par la 0.17.0 affichent « type inconnu (…) » : c'est attendu, sans danger. |

## C. Si un test échoue

Donne le **numéro du test**, ce que tu as vu et, pour le test 1, le **texte exact** d'une éventuelle erreur. Ne valide pas F7 tant qu'un test échoue ou qu'un contrôle CI est rouge.
