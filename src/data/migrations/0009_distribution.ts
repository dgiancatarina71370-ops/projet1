import type { Migration } from '../migrate.ts';

// Schéma 9 (lot F8, décision F8-D13) : diffusion manuelle d'un document. Migration ADDITIVE : aucune ligne existante n'est réécrite.
// - « stakeholder_details.email » : adresse de la partie prenante, vide par défaut.
// - « distributions » : une préparation d'envoi pour un document (objet, message, échéance, date d'envoi DÉCLARÉE par le BA ; vide = préparée).
// - « distribution_recipients » : un destinataire par ligne, avec nom et adresse RECOPIÉS (F8-D10) pour que l'historique survive à la suppression
//   ou à la correction de la partie prenante. Le statut d'un destinataire n'est pas stocké : il se calcule (F8-D07).
// BA-Mentor n'envoie aucun message : « sent_on » est une déclaration, pas la preuve d'un envoi.
const migration: Migration = {
  version: 9,
  name: 'distribution',
  statements: [
    "ALTER TABLE stakeholder_details ADD COLUMN email TEXT NOT NULL DEFAULT ''",
    `CREATE TABLE distributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  due_on TEXT,
  prepared_on TEXT NOT NULL,
  sent_on TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
    'CREATE INDEX idx_distributions_document ON distributions(document_id)',
    `CREATE TABLE distribution_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  distribution_id INTEGER NOT NULL REFERENCES distributions(id) ON DELETE CASCADE,
  stakeholder_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('validate','inform')),
  verdict TEXT CHECK (verdict IS NULL OR verdict IN ('approved','approved_with_reserves','rejected')),
  replied_on TEXT,
  reply_comment TEXT,
  UNIQUE (distribution_id, stakeholder_id)
)`,
    'CREATE INDEX idx_recipients_distribution ON distribution_recipients(distribution_id)',
  ],
};

export default migration;
