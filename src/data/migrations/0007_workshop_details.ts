import type { Migration } from '../migrate.ts';

// Schéma 7 (lot M7, décision D80) : champs propres à un atelier.
// Migration ADDITIVE : une table d'extension de plus (décision D16), aucune donnée existante touchée.
// Elle disparaît avec son élément (suppression en cascade). Les valeurs sont validées par la couche domain (décision D17).
// La date est un texte AAAA-MM-JJ (chaîne vide = non renseignée), sans fuseau.
const migration: Migration = {
  version: 7,
  name: 'workshop_details',
  statements: [
    `CREATE TABLE workshop_details (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  held_on TEXT NOT NULL DEFAULT '',
  place TEXT NOT NULL DEFAULT '',
  objective TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  follow_up TEXT NOT NULL DEFAULT ''
)`,
  ],
};

export default migration;
