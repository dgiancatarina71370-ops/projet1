import type { Migration } from '../migrate.ts';

// Schéma 3 (lot M3a, décisions D35 et D36).
//
// 1. Le journal d'activité accepte une nouvelle action, « updated » (modification d'un texte ou d'un champ). Sa contrainte CHECK
//    ne peut pas être modifiée sur place en SQLite : la table est donc reconstruite (création, copie, suppression, renommage).
//    Les lignes sont copiées une à une AVEC leurs identifiants : la décision de sauvegarde automatique compare le dernier identifiant du journal.
//    Aucune autre table ne référence activity_log. Toute la migration se fait dans une seule transaction, après la sauvegarde pre-migration.
// 2. « stakeholder_details » porte les champs propres à une partie prenante (décision D16 : une table d'extension par type, ajoutée au lot du type).
//    Elle disparaît avec son élément (suppression en cascade). Niveaux et libellés sont validés par la couche domain (décision D17).
const migration: Migration = {
  version: 3,
  name: 'stakeholders_and_updates',
  statements: [
    `CREATE TABLE activity_log_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id INTEGER,
  action TEXT NOT NULL CHECK (action IN ('created','deleted','status_changed','imported','updated')),
  project_id INTEGER, detail TEXT
)`,
    'INSERT INTO activity_log_new (id, at, object_type, object_id, action, project_id, detail) SELECT id, at, object_type, object_id, action, project_id, detail FROM activity_log ORDER BY id',
    'DROP TABLE activity_log',
    'ALTER TABLE activity_log_new RENAME TO activity_log',
    'CREATE INDEX idx_activity_type_at ON activity_log(object_type, at)',
    `CREATE TABLE stakeholder_details (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  organisation TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  influence TEXT NOT NULL DEFAULT 'medium',
  interest TEXT NOT NULL DEFAULT 'medium'
)`,
  ],
};

export default migration;
