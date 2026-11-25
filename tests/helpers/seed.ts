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
  items: [
    `INSERT INTO items (id, project_id, kind, number, code, title, description, status, source_document_id, source_excerpt, created_at, updated_at) VALUES (1, 1, 'need', 1, 'BES-001', 'Besoin de test', 'Description éé', 'draft', 1, 'Extrait « test »', '${T}', '${T}')`,
    `INSERT INTO items (id, project_id, kind, number, code, title, description, status, created_at, updated_at) VALUES (2, 1, 'requirement', 1, 'EX-001', 'Exigence de test', '', 'draft', '${T}', '${T}')`,
    `INSERT INTO items (id, project_id, kind, number, code, title, description, status, created_at, updated_at) VALUES (3, 1, 'stakeholder', 1, 'PP-001', 'Partie prenante de test', 'Sponsor du projet', 'active', '${T}', '${T}')`,
    `INSERT INTO items (id, project_id, kind, number, code, title, description, status, created_at, updated_at) VALUES (4, 1, 'decision', 1, 'DEC-001', 'Décision de test', '', 'proposed', '${T}', '${T}')`,
    `INSERT INTO items (id, project_id, kind, number, code, title, description, status, created_at, updated_at) VALUES (5, 1, 'risk', 1, 'RIS-001', 'Risque de test', '', 'identified', '${T}', '${T}')`,
  ],
  stakeholder_details: ["INSERT INTO stakeholder_details (item_id, organisation, role, influence, interest) VALUES (3, 'Service Test', 'Sponsor', 'high', 'medium')"],
  requirement_details: ["INSERT INTO requirement_details (item_id, nature, priority, criteria) VALUES (2, 'functional', 'must', 'Critère de test')"],
  decision_details: ["INSERT INTO decision_details (item_id, decided_on, decider, alternatives, rationale) VALUES (4, '2026-11-20', 'Comité', 'Option B', 'Coût')"],
  risk_details: ["INSERT INTO risk_details (item_id, probability, impact, mitigation, owner) VALUES (5, 'high', 'medium', 'Plan de repli', 'Chef de projet')"],
  links: [`INSERT INTO links (project_id, link_type, from_id, to_id, created_at) VALUES (1, 'derives', 1, 2, '${T}')`],
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
const ORDER = ['settings', 'flags', 'projects', 'documents', 'items', 'stakeholder_details', 'requirement_details', 'decision_details', 'risk_details', 'links', 'document_sends', 'contacts', 'dod_items', 'workspace_notes', 'pspo_progress', 'templates', 'template_defaults', 'activity_log', 'sequences', 'backups_log'];

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
