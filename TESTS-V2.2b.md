# Protocole de test V2.2b (import V1, sur votre clé USB)

Prérequis : GitHub Actions vert sur les trois jobs (`verify`, `rust-tests`, `build`). Copiez `ba-mentor.exe` dans un dossier neuf de la clé. Gardez votre export réel `ba-mentor-v1-export-….json` sur le PC. Notez **OK / ÉCHEC** et une capture d'écran en cas d'échec.

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Lancer l'exécutable | Version **0.2.3**. Carte « Importer les données de la V1 ». |
| 2 | **Choisir un export V1 (.json)…** puis **annuler** la boîte de dialogue | Rien ne s'affiche, aucune erreur. |
| 3 | **Choisir** votre export réel | Aperçu : projets et dossiers **6**, livrables **1**, critères de « terminé » **7**, bloc-notes **1**, étapes PSPO **1**, réglages **2**, le reste **0**. Bandeau jaune « uniquement les données d'exemple ». Aucun avertissement de correction. Empreinte SHA-256 `e22bccd5…`. |
| 4 | **Annuler** | L'aperçu disparaît. Table « Tables » : toujours 0 projet. |
| 5 | Rechoisir le fichier, **Importer** | « Import terminé : les totaux écrits correspondent à l'aperçu (18 lignes au journal d'activité) ». Colonnes Annoncé et Écrit identiques, en vert. |
| 6 | Regarder la page | 6 projets dans la liste, la table `activity_log` des compteurs gagne **18 lignes** (les lignes « imported » sont visibles dans le journal des 12 dernières), une ligne **Avant migration** dans le Centre de sauvegarde. |
| 7 | Rechoisir le même fichier | Encadré rouge « déjà été importé ». **Importer** grisé tant que la case de confirmation n'est pas cochée. **Annuler**. Aucune donnée ajoutée. |
| 8 | **Restaurer** la ligne « Avant migration » | La base revient **vide** (0 projet) : l'import est entièrement annulé. |
| 9 | Réimporter, fermer l'application, la relancer | Les 6 projets sont toujours là. |
| 10 | Choisir un fichier JSON quelconque qui n'est pas un export V1 | Message rouge « pas un export de BA-Mentor V1 ». Rien d'écrit. |
| 11 | Choisir un fichier non JSON (par exemple un `.txt` renommé en `.json`) | Message « n'est pas un JSON valide ». |
| 12 | Ouvrir votre export dans le Bloc-notes, **Enregistrer sous… → UTF-8 avec BOM**, l'importer | Aperçu identique au test 3 (la marque d'ordre des octets est gérée). Empreinte différente. |
| 13 | **Enregistrer sous… → ANSI**, l'importer | Message « pas un texte UTF-8 valide ». |
| 14 | **Facultatif, recommandé avant la vraie migration** : dans la V1, créez un livrable validé, un archivé, un envoi consigné, un contact, un flag personnalisé ; réexportez et importez ce fichier sur une copie de test | Totaux annoncés = totaux écrits ; contenus visibles identiques à la V1. |

Couvert par les tests automatiques (pas par cette grille) : retour arrière complet sur panne, échec de la sauvegarde de sécurité, non-écrasement des réglages existants, identifiants jamais réutilisés, refus d'un format plus récent, boucle d'arborescence.
