# Recette F8 — Diffusion manuelle (version 0.18.0, **schéma 9**)

**Ce que F8 change** : une fiche partie prenante gagne un champ **E-mail** (facultatif). Dans le détail d'un document **brouillon ou validé et non remplacé**, une section **Diffusion** prépare l'envoi (destinataires, rôle « À valider » ou « Pour information », échéance, objet et message proposés, boutons de copie), puis tient le registre : **Marquer comme envoyé** (date déclarée), réponses saisies à la main, statuts calculés. **BA-Mentor n'envoie aucun message.**

**Première migration depuis F5** : la **migration 9** ajoute une colonne et deux tables, sans réécrire aucune ligne. Une sauvegarde « avant migration » est faite automatiquement. **Conséquence à accepter** : après le premier lancement de la 0.18.0, la **0.17.0 et les versions plus anciennes refusent d'ouvrir la base** ; pour revenir en arrière, il faut restaurer une sauvegarde faite avant (ou ta copie complète).

**Précaution obligatoire** : joue **toute** la recette sur une **copie complète** de ton dossier (exécutable et `BAMentorData`). Utilise **uniquement des adresses fictives** (`@exemple.test`) : une adresse saisie reste dans la base, dans les sauvegardes et dans toute copie de la clé.

**Non vérifiable de mon côté** : la migration d'une vraie base, la copie dans le presse-papiers, le séparateur « ; » dans ta messagerie, le rendu réel et les clics, la suppression en cascade sur le vrai moteur, deux fenêtres ouvertes en même temps, le statut « Sans réponse » avec une horloge de poste fausse, le job `types` (je n'ai pas les vrais types React ici).

## A. Contrôles à relever dans GitHub Actions

Quatre jobs attendus verts. `build.yml` n'est pas modifié. **Aucun fichier à supprimer à la main.** Vérifie que les nouveaux fichiers sont dans le commit : `src/data/migrations/0009_distribution.ts`, `src/domain/distribution.ts`, `src/data/repositories/distributions.ts`, `src/modules/documents/DiffusionView.tsx`, `DiffusionSection.tsx`, `diffusion-logic.ts`, `tests/f8-distribution.test.ts`, `tests/ui-f8.test.ts`.

| # | Où regarder | Résultat attendu |
|---|---|---|
| CI-1 | Le commit de l'exécution | C'est le commit qui contient les fichiers F8. |
| CI-2 | `verify`, « Versions alignées » | Vert, **0.18.0**. |
| CI-3 | `verify`, « Règles d'architecture » | Vert. |
| CI-4 | `verify`, « Tests » | `fail 0` ; **586 tests** annoncés (562 avant). Si le nombre diffère, note-le : un fichier manque. |
| CI-5 | Job `types` | **Vert, sans ligne `error TS`.** F8 ajoute trois fichiers dans `modules/documents` et touche `StakeholdersView.tsx`, `logic.ts` des parties prenantes et `ui-entry.tsx`. Relève les quatre versions (TypeScript 5.9.3, `@types/react` 18.3.32, `@types/react-dom` 18.3.7, Node 22.20.7). |
| CI-6 | `rust-tests` | Vert (aucun changement Rust). |
| CI-7 | `build` | Vert ; l'artefact `ba-mentor-exe` affiche 0.18.0 à l'écran À propos. |

## B. Recette sur clé (exécutable 0.18.0, **copie** de `BAMentorData`)

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Lancer la 0.18.0 sur la **copie de ta base réelle**. **À propos**, puis **Technique**, carte « Base de données ». | Démarrage **sans erreur**. Version **0.18.0**, schéma **9**, une ligne « Sauvegarde avant migration » (schéma 8). Tes projets, éléments et documents sont tous là. Note le **texte exact** de toute erreur. |
| 2 | Projet d'exemple neuf (ou le tien). **Parties prenantes**, ouvrir une fiche, **Modifier**. | Champ **E-mail** avec l'aide « La version 1.0 est prévue pour des adresses fictives. » Saisir `pas une adresse` : **« Adresse e-mail non valide. »** et rien d'enregistré. |
| 3 | Saisir `sponsor@exemple.test` sur deux parties prenantes actives, enregistrer. Ouvrir une troisième sans adresse. | Le détail affiche l'adresse (« — » pour celle qui n'en a pas). Au **Journal** (filtre Éléments), la ligne affiche « Champs : E-mail », **jamais l'adresse**. |
| 4 | **Livrables** : enregistrer un livrable. **Documents**, ouvrir ce brouillon. | Section **Diffusion** avec le bandeau « BA-Mentor n'envoie aucun message : copiez, puis envoyez depuis votre messagerie. » et la phrase « Diffusion non officielle : ce document est un brouillon. » Bouton **Préparer une diffusion**, et la phrase sur les parties prenantes **sans adresse** qui ne sont pas proposées. |
| 5 | **Préparer une diffusion** : choisir un destinataire « À valider » et un « Pour information », échéance dans le futur. | Objet et message **proposés** (nom, version, état « brouillon, non validé », échéance, rôle) et modifiables ; l'objet change tant que tu ne l'as pas modifié. **Enregistrer la préparation** : « Diffusion préparée. », statut **À envoyer** pour chacun. |
| 6 | **Copier les adresses**, **Copier l'objet**, **Copier le message**, puis coller dans ta **messagerie**. | Message « … copié dans le presse-papiers ». Les adresses sont séparées par « ; » : **note si ta messagerie les accepte telles quelles**. Si la copie échoue, le message le dit et le texte reste sélectionnable. |
| 7 | **Modifier la préparation** (retirer un destinataire, changer l'objet), enregistrer. Puis **Supprimer cette diffusion** : d'abord **Annuler**, puis refaire et **Confirmer**. | La modification est enregistrée. La suppression demande confirmation ; après confirmation la diffusion disparaît. |
| 8 | Préparer à nouveau, **Marquer comme envoyé** : essayer une date **dans le futur**, puis la date du jour. | Date future : refusée, rien ne change. Date du jour : « Envoi déclaré. BA-Mentor n'a envoyé aucun message. », état « Envoyée le … (date déclarée) », statut **Envoyé**. Plus de bouton Modifier ni Supprimer. |
| 9 | **Annuler l'envoi déclaré**, puis **Marquer comme envoyé** de nouveau. | La diffusion redevient « Préparée » puis « Envoyée ». |
| 10 | **Saisir la réponse** d'un destinataire : « Validé avec réserves », date du jour, commentaire. Essayer ensuite une date **avant l'envoi**. | Réponse affichée (« Validé avec réserves le … — … »), statut **Réponse reçue**, rappel « Une réponse ne change pas l'état du document ». Date avant l'envoi : refusée. Le bouton **Annuler l'envoi déclaré** a **disparu**. Le document est **inchangé** (toujours Brouillon). |
| 11 | **Corriger** la réponse (« Refusé »), puis **Retirer la réponse**. | Réponse modifiée puis retirée ; statut revenu à « Envoyé » ; l'annulation d'envoi redevient possible. |
| 12 | Diffusion envoyée avec une **échéance passée** : dans Windows, avance la date du poste de quelques jours (ou prépare une diffusion avec échéance du jour et reviens le lendemain). | Statut **Sans réponse** pour les destinataires sans réponse et phrase « Échéance dépassée : N destinataire(s) n'ont pas répondu. » **Remets l'horloge à l'heure.** |
| 13 | **Valider** le document, ouvrir sa section Diffusion ; **Archiver** un autre document ; générer une version suivante d'un document diffusé. | Validé : diffusion possible, sans la phrase « brouillon ». Archivé ou remplacé : plus de bouton **Préparer**, phrase « ne reçoit plus de nouvelle diffusion », anciennes diffusions **toujours visibles**. |
| 14 | **Journal**, filtre « Documents ». | Lignes « Diffusion préparée », « Préparée → Envoyée », « Envoi annulé : Envoyée → Préparée », « Réponse : validé avec réserves », « Réponse retirée », « Diffusion supprimée », avec le **nom du document**. **Aucune adresse, aucun objet, aucun message, aucun commentaire.** |
| 15 | Modifier l'adresse d'une partie prenante ayant reçu une diffusion ; supprimer une autre partie prenante destinataire. | La diffusion existante garde **nom et adresse d'origine** ; la fiche supprimée ne casse rien (destinataire conservé, sans lien). |
| 16 | Supprimer un **projet** contenant des diffusions (sur un projet de test). | Suppression sans erreur ; la confirmation ne parle que des documents, comme avant. |
| 17 | Non-régression : sauvegarde manuelle puis restauration ; export Word d'un document ; Accueil ; historique d'une fiche. | Comme en F7. |
| 18 | **Facultatif**, sur une copie déjà passée en 0.18.0 : rouvrir avec l'exécutable **0.17.0**. | La 0.17.0 **refuse** d'ouvrir la base et demande une version plus récente : c'est attendu (F8-D13). |

## C. Si un test échoue

Donne le **numéro du test**, ce que tu as vu et, pour le test 1, le **texte exact** d'une éventuelle erreur. Ne valide pas F8 tant qu'un test échoue ou qu'un contrôle CI est rouge.
