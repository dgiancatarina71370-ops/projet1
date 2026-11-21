# Protocole de test V2.3b (export Word, sur votre clé USB et dans Microsoft Word)

Prérequis : GitHub Actions vert sur les trois jobs (`verify` avec **107 tests**, `rust-tests`, `build`). Copiez `ba-mentor.exe` (version **0.2.6**) dans un dossier neuf. Importez votre export réel V1, et gardez à portée `tests\fixtures\v1-export-synthetic-trap.json`. Notez OK / ÉCHEC et une capture en cas d'échec.

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Lancer l'exécutable | Intro « Lot V2.3b », version 0.2.6. Carte « Exporter un livrable (Markdown, HTML, Word) » avec trois boutons par livrable. |
| 2 | Importer l'export réel V1, cliquer **Word** sur « CR atelier — fusion des fiches (exemple) » | Message vert « Export Word créé : …-AAAAMMJJ-HHMMSS.docx » avec chemin sous `BAMentorData\exports\`. Le fichier existe. |
| 3 | Ouvrir ce `.docx` dans **Microsoft Word** | S'ouvre **sans message de réparation ni d'erreur**. Titre, section « Décisions » avec une case cochée et une case vide, tableau « Actions » avec en-tête grisée, format A4. |
| 4 | Aller en bas du document | Les **quatre lignes de signature** : « BA-Mentor Portable Ultimate Edition », « Développé par David Giancatarina », « Version : 0.2.6 », « Date de génération : JJ/MM/AAAA HH:MM ». |
| 5 | Regarder le pied de page | « BA-Mentor Portable Ultimate Edition — Version : 0.2.6 — Page 1 / n ». |
| 6 | Fichier → Informations → Propriétés | Auteur « BA-Mentor Portable Ultimate Edition » ; titre = titre du livrable ; commentaires « Développé par David Giancatarina — Version : 0.2.6 — Date de génération : … ». |
| 7 | Propriétés → Propriétés avancées → onglet Personnalisation | Trois propriétés : `BAMentorGenerator`, `BAMentorVersion` (0.2.6), `BAMentorGeneratedAt`. |
| 8 | Cliquer **Word** deux fois de suite | Deux fichiers distincts (suffixe `-2` si même seconde), aucun écrasé. |
| 9 | Cocher « Choisir l'emplacement », cliquer **Word**, **Annuler** | Aucun fichier, aucun message d'erreur. |
| 10 | Même chose, choisir le Bureau et enregistrer ; refaire sur le même nom | Fichier sur le Bureau ; Windows demande confirmation du remplacement. |
| 11 | **Jeu piégé** : importer `v1-export-synthetic-trap.json`, exporter les deux livrables en Word, ouvrir dans Word | **Aucune alerte de sécurité, aucune macro.** Le texte hostile (`<script>…`, `<img …>`) s'affiche **comme texte**. Le lien `https://exemple.test/p` est le seul lien cliquable ; « javascript », « data », « file », « ancre » et « rel » sont du texte simple. L'image espion est remplacée par « [image : pixel espion] ». |
| 12 | Noms des fichiers du test 11 | Titre hostile assaini (plus de `< > : / * ?`) ; le livrable « CON » donne `_CON-…docx`, qui s'ouvre. |
| 13 | Fichier → Imprimer (aperçu) | Page A4, marges 2 cm, signature et pied de page visibles. |
| 14 | Comparer « Version : 0.2.6 » dans À propos, pied de page Word, bloc de signature et propriétés | Identique partout. |
| 15 | Journal d'activité et table `activity_log` avant/après un export Word | Aucune ligne ajoutée. |

Couvert par les tests automatiques (pas par cette grille) : refus d'une signature altérée (corps, auteur, description), contenu vide, gros document (3 000 paragraphes), XML toujours valide (caractères de contrôle), numérotation démarrant à 3, liens sûrs uniquement, aucune image ni macro, écriture sans écrasement, journal inchangé.
