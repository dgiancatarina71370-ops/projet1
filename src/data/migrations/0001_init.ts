import type { Migration } from '../migrate.ts';

// Schéma 1 : quinze tables, tout ce que la V1 stockait plus modèles, journal d'activité et séquences (spécification, section 5).
const migration: Migration = {
  version: 1,
  name: 'init',
  statements: [
    'CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    `CREATE TABLE flags (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  custom INTEGER NOT NULL DEFAULT 0 CHECK (custom IN (0,1)),
  label TEXT, description TEXT, group_name TEXT
)`,
    `CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('project','folder','archive')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
)`,
    `CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  previous_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','validated','archived')),
  content TEXT NOT NULL DEFAULT '',
  template_ref TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  validated_at TEXT, archived_at TEXT
)`,
    'CREATE INDEX idx_documents_project ON documents(project_id)',
    `CREATE TABLE document_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  recipients TEXT NOT NULL, sent_at TEXT NOT NULL
)`,
    'CREATE TABLE contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE)',
    'CREATE TABLE dod_items (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, position INTEGER NOT NULL)',
    "CREATE TABLE workspace_notes (id INTEGER PRIMARY KEY CHECK (id = 1), title TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)",
    'CREATE TABLE pspo_progress (step_id TEXT PRIMARY KEY, done INTEGER NOT NULL CHECK (done IN (0,1)), updated_at TEXT NOT NULL)',
    `CREATE TABLE templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  origin TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (kind, name)
)`,
    'CREATE TABLE template_defaults (kind TEXT PRIMARY KEY, ref TEXT NOT NULL)',
    `CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id INTEGER,
  action TEXT NOT NULL CHECK (action IN ('created','deleted','status_changed','imported')),
  project_id INTEGER, detail TEXT
)`,
    'CREATE INDEX idx_activity_type_at ON activity_log(object_type, at)',
    'CREATE TABLE sequences (name TEXT PRIMARY KEY, value INTEGER NOT NULL)',
    `CREATE TABLE backups_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('manual','auto','pre-migration','pre-restore')),
  file TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
  ok INTEGER NOT NULL CHECK (ok IN (0,1))
)`,
  ],
};

export default migration;
