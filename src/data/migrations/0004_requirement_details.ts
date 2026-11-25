import type { Migration } from '../migrate.ts';

// Schéma 4 (lot M3b, décisions D36 et D46) : champs propres à une exigence (nature, priorité MoSCoW, critères d'acceptation).
// Migration ADDITIVE : une table d'extension de plus (décision D16), aucune donnée existante touchée.
// Elle disparaît avec son élément (suppression en cascade). Les valeurs sont validées par la couche domain (décision D17).
// Les besoins n'ont pas de table de détails (décision D45). Les statuts de besoin et d'exigence s'étendent dans la couche domain : aucune migration pour cela.
const migration: Migration = {
  version: 4,
  name: 'requirement_details',
  statements: [
    `CREATE TABLE requirement_details (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  nature TEXT NOT NULL DEFAULT 'functional',
  priority TEXT NOT NULL DEFAULT 'should',
  criteria TEXT NOT NULL DEFAULT ''
)`,
  ],
};

export default migration;
