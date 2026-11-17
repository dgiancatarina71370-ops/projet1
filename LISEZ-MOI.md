# BA-Mentor V2.0 - kit de validation technique

Objectif : décider, sur preuves, si Tauri + SQLite convient à une application portable sur clé USB.
Ce kit ne contient aucun code métier. **Le code Rust n'a pas pu être compilé dans l'environnement où il a été écrit** (paquets Rust inaccessibles) : la première compilation peut demander une correction mineure. Notez toute erreur.

## 1. Obtenir l'exécutable (au choix)
**A. Sur votre PC (une fois)** : installer Node 22, Rust (https://rustup.rs, chaîne « MSVC ») et « Outils de build Visual Studio » (charge de travail C++). Puis, dans ce dossier :
```
npm install
npx tauri icon app-icon.png
npx tauri build --no-bundle
```
L'exécutable est `src-tauri\target\release\ba-mentor-poc.exe`.

**B. Sans rien installer** : déposer ce dossier dans un dépôt GitHub privé, onglet Actions → « Build POC » → Run workflow → télécharger l'artefact (`.github/workflows/build-poc.yml`).

## 2. Préparer la clé
Copier sur la clé : `ba-mentor-poc.exe` et `scripts\verifier-poste.ps1`. Relever le système de fichiers de la clé (NTFS ou exFAT recommandés).

## 3. Protocole (au moins 2 postes, dont un poste « client » restreint si possible)
| # | Test | Résultat attendu | Poste 1 | Poste 2 |
|---|------|------------------|---------|---------|
| T1 | Lancer `verifier-poste.ps1` | Fichier `poste-<nom>.txt` ; noter WebView2 et vitesse d'écriture | | |
| T2 | Double-clic sur l'exe depuis la clé, sans droits administrateur | La fenêtre s'ouvre, aucune installation demandée | | |
| T3 | Bouton « Tout tester » | `data_dir_writable: true`, dossier `BAMentorData` créé **à côté de l'exe** | | |
| T4 | Même test : chercher `%LOCALAPPDATA%\fr.giancatarina.bamentor.poc` | Dossier **absent** (WebView2 utilise `BAMentorData\webview`) | | |
| T5 | Résultats `db_delete` | `journal_mode_actif: delete`, `integrity_check: ok` ; noter `ms_200_commits` | | |
| T6 | Résultat `sauvegarde` | `lignes_copiees` = `lignes` de `db_delete`, `integrity_check: ok` | | |
| T7 | « Démarrer l'écriture continue », puis **débrancher la clé** (sans « éjecter ») après quelques secondes. Noter le compteur. Rebrancher, relancer l'exe, « Vérifier la base après relance » | `integrity_check: ok` ; `lignes_writer` égal au compteur, à une ou deux lignes près | | |
| T8 | Répéter T7 trois fois | 3 réussites sur 3 | | |
| T9 | Antivirus / règles d'entreprise | L'exe n'est ni bloqué ni mis en quarantaine ; noter le message sinon | | |
| T10 | Taille de l'exe | Noter la taille (attendu : quelques Mo) | | |

« Enregistrer le rapport » écrit `rapport-v20-<date>.json` dans `BAMentorData`. Renvoyez-moi les rapports et les fichiers `poste-*.txt`.

## 4. Critères de décision
- **Go Tauri** : T2, T3, T4, T5, T6 réussis sur tous les postes testés, et T7/T8 sans base corrompue.
- **À corriger** : T4 échoue (profil touché) → ajuster la configuration WebView2 ; T9 bloqué → étudier la signature de code.
- **No-go Tauri** : WebView2 absent et non installable sur les postes cibles, ou T7/T8 corrompent la base. Alternative : sauvegardes plus fréquentes, ou une autre technologie.

## 5. Vérification SQLite sans Tauri
`python sqlite_feasibility.py` (Python 3) rejoue les contrôles du moteur : modes de journal, sauvegarde en ligne, arrêts brutaux, refus d'`ATTACH`, couverture des tables.
