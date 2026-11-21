# Protocole de test V2.3a (export signé, sur votre clé USB)

Prérequis : GitHub Actions vert sur les trois jobs (`verify` avec **88 tests**, `rust-tests`, `build`). Copiez `ba-mentor.exe` dans un dossier neuf. Gardez à portée votre export réel V1 et le fichier `tests\\fixtures\\v1-export-synthetic-trap.json` (jeu synthétique piégé). Notez **OK / ÉCHEC** et une capture en cas d'échec.

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Lancer l'exécutable | Texte d'introduction « Lot V2.3a ». Cartes « Exporter un livrable (Markdown, HTML) » et « À propos ». La carte d'export dit « Aucun livrable dans la base ». |
| 2 | Regarder la carte **À propos** | Quatre lignes : « BA-Mentor Portable Ultimate Edition », « Développé par David Giancatarina », « Version : 0.2.4 », « Date de génération : JJ/MM/AAAA HH:MM » (l'heure de votre PC, à la minute). En dessous : date de compilation, schéma 1, dossier de données `BAMentorData`. |
| 3 | **Importer** votre export réel V1 (carte d'import) | La carte d'export liste « #1 · CR atelier — fusion des fiches (exemple) », projet, type `cr`, statut brouillon. |
| 4 | Cliquer **Markdown** | Message vert « Export Markdown créé : CR atelier — fusion des fiches (exemple)-AAAAMMJJ-HHMMSS.md (… Ko). Emplacement : …\\BAMentorData\\exports\\… ». Le fichier existe à cet emplacement. |
| 5 | Ouvrir ce `.md` avec le Bloc-notes | Première ligne `<!-- generator: BA-Mentor Portable Ultimate Edition — Développé par David Giancatarina — Version : 0.2.4 — generated: … -->`. Contenu du compte rendu. Puis une ligne `---` et les **quatre lignes de signature** identiques à celles de la carte À propos (même version). |
| 6 | Cliquer **HTML**, ouvrir le fichier dans votre navigateur | Page lisible : titre, section « Décisions » avec **une case cochée et une case vide** (sans « [x] » ni « [ ] » écrits), tableau « Actions », pied de page avec les **quatre lignes de signature**. |
| 7 | Cliquer **HTML** deux fois de suite | Deux fichiers distincts dans `exports\\`, aucun écrasé. |
| 8 | Cocher **Choisir l'emplacement**, cliquer **Markdown**, **Annuler** la boîte | Aucun fichier créé, aucun message d'erreur. |
| 9 | Même chose, choisir le Bureau et enregistrer | Fichier créé sur le Bureau, message avec son chemin. Refaire avec le même nom : Windows demande de confirmer le remplacement ; accepter remplace le fichier. |
| 10 | **Jeu piégé** : importer `v1-export-synthetic-trap.json`, exporter les deux livrables en HTML, ouvrir dans le navigateur | **Aucune fenêtre d'alerte**, aucune redirection, aucune image externe. Le texte hostile (`<script>…`, `<img …>`, `[js](javascript:…)`) s'affiche **comme texte**. Le lien « javascript » n'est pas cliquable ; les liens `https` et `mailto` le sont. L'image espion est remplacée par « [image : pixel espion] ». |
| 11 | Regarder les noms des fichiers du test 10 | Le titre hostile est assaini (plus de `< > : / * ?`). Le livrable nommé « CON » donne un fichier commençant par `_CON-`. |
| 12 | Créer une sauvegarde manuelle, puis **Restaurer** une sauvegarde | Les fichiers de `exports\\` sont toujours là (les exports ne font pas partie des sauvegardes). |
| 13 | Vérifier le journal d'activité et la table `activity_log` avant et après un export | Aucune ligne ajoutée : un export ne modifie pas les données. |
| 14 | Version : comparer « Version : 0.2.4 » dans À propos, le pied de page de l'écran, le `.md` et le `.html` | Identique partout. |

Couvert par les tests automatiques (pas par cette grille) : refus d'un export sans signature, refus d'une version inconnue, liens dangereux, noms de fichiers hostiles ou réservés, création exclusive sans écrasement (Rust et TypeScript), accord « 1 étape PSPO déjà présente ».
