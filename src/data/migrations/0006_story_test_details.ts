import type { Migration } from '../migrate.ts';

// Schéma 6 (lot M5, décisions D62 et D64) : champs propres à une user story et à un test.
// Migration ADDITIVE : deux tables d'extension de plus (décision D16), aucune donnée existante touchée.
// Chacune disparaît avec son élément (suppression en cascade). Les valeurs sont validées par la couche domain (décision D17).
// La date de dernière exécution d'un test est un texte AAAA-MM-JJ (chaîne vide = jamais exécuté), sans fuseau.
const migration: Migration = {
  version: 6,
  name: 'story_test_details',
  statements: [
    `CREATE TABLE story_details (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  benefit TEXT NOT NULL DEFAULT '',
  criteria TEXT NOT NULL DEFAULT ''
)`,
    `CREATE TABLE test_details (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  test_type TEXT NOT NULL DEFAULT 'acceptance',
  preconditions TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '',
  expected TEXT NOT NULL DEFAULT '',
  last_run_on TEXT NOT NULL DEFAULT ''
)`,
  ],
};

export default migration;
