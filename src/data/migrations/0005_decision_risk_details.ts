import type { Migration } from '../migrate.ts';

// Schéma 5 (lot M4, décisions D53 et D55) : champs propres à une décision et à un risque.
// Migration ADDITIVE : deux tables d'extension de plus (décision D16), aucune donnée existante touchée.
// Chacune disparaît avec son élément (suppression en cascade). Les valeurs sont validées par la couche domain (décision D17).
// La date de décision est un texte AAAA-MM-JJ (chaîne vide = non renseignée) : pas de fuseau, donc pas de décalage possible à l'affichage.
const migration: Migration = {
  version: 5,
  name: 'decision_risk_details',
  statements: [
    `CREATE TABLE decision_details (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  decided_on TEXT NOT NULL DEFAULT '',
  decider TEXT NOT NULL DEFAULT '',
  alternatives TEXT NOT NULL DEFAULT '',
  rationale TEXT NOT NULL DEFAULT ''
)`,
    `CREATE TABLE risk_details (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  probability TEXT NOT NULL DEFAULT 'medium',
  impact TEXT NOT NULL DEFAULT 'medium',
  mitigation TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT ''
)`,
  ],
};

export default migration;
