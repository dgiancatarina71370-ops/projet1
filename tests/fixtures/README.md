# Jeux de test d'import V1

- `v1-export-minimal.json` : équivalent anonymisé d'un export réel de la V1 (mêmes clés, même structure, mêmes totaux). Il ne contient que les données d'exemple que la V1 crée au premier lancement ; le nom de l'auteur est remplacé par « Auteur Test ». Aucun contenu personnel.
- `v1-export-synthetic-rich.json` : jeu **synthétique** (inventé, pas un export réel) qui couvre ce que l'export réel ne contient pas : livrable validé, livrable archivé avec ancien dossier, envois, contacts (dont un doublon et un sans adresse), interrupteurs personnalisés, étapes PSPO décochées, livrable sans dossier, statut inconnu, date illisible.

Les fichiers invalides (JSON cassé, format inconnu, boucle d'arborescence…) sont construits dans `tests/import-v1.test.ts`.
