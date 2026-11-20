// Jeu de données de test couvrant CHAQUE table du schéma (exigence E4).
// Une table sans ligne de test fait échouer seedAllTables() : toute future migration doit fournir ses lignes ici.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

const T = '2026-11-20T10:00:00.000Z';

export const FIXTURES: Record<string, string[]> = {
  meta: [], // rempli par les migrations
  settings: ["INSERT INTO settings (key, value) VALUES ('theme', 'dark')"],
  flags: ["INSERT INTO flags (key, enabled, custom, label) VALUES ('stats', 1, 0, 'Statistiques')"],
  projects: [`INSERT INTO projects (id, kind, name, created_at, updated_at) VALUES (1, 'project', 'Projet de test', '${T}', '${T}')`],
  documents: [`INSERT INTO documents (id, project_id, kind, name, status, content, created_at, updated_at) VALUES (1, 1, 'cr', 'Compte-rendu', 'draft', 'Contenu éé « test »', '${T}', '${T}')`],
  document_sends: [`INSERT INTO document_sends (document_id, recipients, sent_at) VALUES (1, 'a@b.fr', '${T}')`],
  contacts: ["INSERT INTO contacts (name, email) VALUES ('Alice', 'alice@example.fr')"],
  dod_items: ["INSERT INTO dod_items (text, enabled, position) VALUES ('Critères validés', 1, 1)"],
  workspace_notes: [`INSERT INTO workspace_notes (id, title, text, updated_at) VALUES (1, 'Notes', 'Texte', '${T}')`],
  pspo_progress: [`INSERT INTO pspo_progress (step_id, done, updated_at) VALUES ('etape-1', 1, '${T}')`],
  templates: [`INSERT INTO templates (kind, name, description, body, created_at, updated_at) VALUES ('cr', 'Modèle', '', '# {{titre}}', '${T}', '${T}')`],
  template_defaults: ["INSERT INTO template_defaults (kind, ref) VALUES ('cr', 'builtin:cr')"],
  activity_log: [`INSERT INTO activity_log (at, object_type, object_id, action, project_id) VALUES ('${T}', 'project', 1, 'created', 1)`],
  sequences: ["INSERT INTO sequences (name, value) VALUES ('exigence', 7)"],
  backups_log: [`INSERT INTO backups_log (at, kind, file, size_bytes, sha256, ok) VALUES ('${T}', 'manual', 'x.db', 1, 'abc', 1)`],
};

// Ordre d'insertion compatible avec les clés étrangères.
const ORDER = ['settings', 'flags', 'projects', 'documents', 'document_sends', 'contacts', 'dod_items', 'workspace_notes', 'pspo_progress', 'templates', 'template_defaults', 'activity_log', 'sequences', 'backups_log'];

export function listTables(db: DatabaseSync): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
}

/** Tables du schéma pour lesquelles aucune ligne de test n'est prévue. */
export function uncoveredTables(db: DatabaseSync, fixtures: Record<string, string[]> = FIXTURES): string[] {
  return listTables(db).filter((t) => !(t in fixtures));
}

export function seedAllTables(db: DatabaseSync): void {
  const missing = uncoveredTables(db);
  if (missing.length > 0) throw new Error(`Tables sans ligne de test : ${missing.join(', ')}`);
  for (const t of [...ORDER, ...Object.keys(FIXTURES).filter((k) => !ORDER.includes(k))]) for (const sql of FIXTURES[t]) db.exec(sql);
  const empty = listTables(db).filter((t) => (db.prepare(`SELECT count(*) AS n FROM "${t}"`).get() as { n: number }).n === 0);
  if (empty.length > 0) throw new Error(`Tables restées vides après le jeu de test : ${empty.join(', ')}`);
}

export interface TableSnapshot {
  count: number;
  hash: string;
}

/** Nombre de lignes et somme de contrôle du contenu, table par table. */
export function snapshot(db: DatabaseSync): Record<string, TableSnapshot> {
  const out: Record<string, TableSnapshot> = {};
  for (const t of listTables(db)) {
    const rows = db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all();
    out[t] = { count: rows.length, hash: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
  }
  return out;
}

export function snapshotFile(file: string): Record<string, TableSnapshot> {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return snapshot(db);
  } finally {
    db.close();
  }
}
