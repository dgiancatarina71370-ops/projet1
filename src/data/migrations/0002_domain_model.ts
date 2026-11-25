import type { Migration } from '../migrate.ts';

// Schéma 2 (lot M1, décisions D16 à D21) : le modèle de domaine commun.
// Migration ADDITIVE : elle n'ajoute que des tables et des index, elle ne touche à aucune donnée existante.
//
// « items » porte ce que tous les éléments d'un projet partagent (partie prenante, besoin, exigence, décision, risque, user story, test).
// Les champs propres à un type (probabilité d'un risque, étapes d'un test…) auront leur table au lot du type (M3 à M5), par migration additive.
// Les types, statuts et types de liens ne sont PAS contraints ici : ils sont validés par la couche domain (décision D17, dette assumée).
//
// « links » relie deux éléments d'un MÊME projet. Cette garantie est portée par la base elle-même : la clé étrangère composée
// (from_id, project_id) vers items(id, project_id) refuse un lien dont une extrémité appartient à un autre projet. Aucun déclencheur n'est nécessaire.
const migration: Migration = {
  version: 2,
  name: 'domain_model',
  statements: [
    `CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  number INTEGER NOT NULL CHECK (number >= 1),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  source_document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  source_excerpt TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (project_id, code),
  UNIQUE (project_id, kind, number),
  UNIQUE (id, project_id)
)`,
    'CREATE INDEX idx_items_project_kind ON items(project_id, kind)',
    'CREATE INDEX idx_items_source ON items(source_document_id)',
    `CREATE TABLE links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (from_id <> to_id),
  UNIQUE (link_type, from_id, to_id),
  FOREIGN KEY (from_id, project_id) REFERENCES items(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY (to_id, project_id) REFERENCES items(id, project_id) ON DELETE CASCADE
)`,
    'CREATE INDEX idx_links_from ON links(from_id)',
    'CREATE INDEX idx_links_to ON links(to_id)',
    'CREATE INDEX idx_links_project ON links(project_id)',
  ],
};

export default migration;
