// Dépôt des documents (lots V2.3a puis F5, décisions F5-D02 à F5-D06).
// Un document est un instantané daté d'un livrable : contenu Markdown figé, options utilisées, liste figée des éléments.
// Lecture par query() ; la seule écriture, la création d'un document généré, passe par mutate() et laisse une ligne « created » au journal.
// Un document n'est jamais modifié : régénérer crée la version suivante, qui désigne la précédente (replaces_id).
import { query, queryOne } from '../db.ts';
import type { Row } from '../db.ts';
import { mutate } from '../mutate.ts';
import { GENERATED_KIND } from '../../domain/documents.ts';

export interface DocumentSummary extends Row {
  id: number;
  name: string;
  kind: string;
  status: string;
  version: number;
  series_key: string | null;
  template_ref: string | null;
  replaces_id: number | null;
  /** Document qui remplace celui-ci (sa version suivante), s'il existe. */
  replaced_by_id: number | null;
  replaced_by_version: number | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentDetail extends DocumentSummary {
  project_id: number;
  content: string;
  options_json: string | null;
  items_snapshot: string | null;
  /** Version du document que celui-ci remplace. */
  replaces_version: number | null;
}

const SUMMARY_COLUMNS = `d.id, d.name, d.kind, d.status, d.version, d.series_key, d.template_ref, d.replaces_id, d.created_at, d.updated_at,
  (SELECT r.id FROM documents r WHERE r.replaces_id = d.id ORDER BY r.version DESC LIMIT 1) AS replaced_by_id,
  (SELECT r.version FROM documents r WHERE r.replaces_id = d.id ORDER BY r.version DESC LIMIT 1) AS replaced_by_version`;

const toSummary = (r: DocumentSummary): DocumentSummary => ({
  ...r,
  id: Number(r.id),
  version: Number(r.version),
  replaces_id: r.replaces_id === null ? null : Number(r.replaces_id),
  replaced_by_id: r.replaced_by_id === null ? null : Number(r.replaced_by_id),
  replaced_by_version: r.replaced_by_version === null ? null : Number(r.replaced_by_version),
});

/** Documents d'un projet, le plus récent d'abord. Tous : le filtre des versions remplacées est appliqué par l'écran. */
export async function listProjectDocuments(projectId: number): Promise<DocumentSummary[]> {
  const rows = await query<DocumentSummary>(`SELECT ${SUMMARY_COLUMNS} FROM documents d WHERE d.project_id = ? ORDER BY d.updated_at DESC, d.id DESC`, [projectId]);
  return rows.map(toSummary);
}

export async function getDocument(id: number): Promise<DocumentDetail | null> {
  const r = await queryOne<DocumentDetail>(
    `SELECT ${SUMMARY_COLUMNS}, d.project_id, d.content, d.options_json, d.items_snapshot,
       (SELECT p.version FROM documents p WHERE p.id = d.replaces_id) AS replaces_version
     FROM documents d WHERE d.id = ?`,
    [id],
  );
  if (!r) return null;
  return { ...toSummary(r), project_id: Number(r.project_id), replaces_version: r.replaces_version === null ? null : Number(r.replaces_version) } as DocumentDetail;
}

/** Dernière version d'une série dans un projet. */
export async function latestInSeries(projectId: number, seriesKey: string): Promise<{ id: number; version: number; content: string } | null> {
  const r = await queryOne<{ id: number; version: number; content: string }>(
    'SELECT id, version, content FROM documents WHERE project_id = ? AND series_key = ? ORDER BY version DESC LIMIT 1',
    [projectId, seriesKey],
  );
  return r ? { id: Number(r.id), version: Number(r.version), content: r.content } : null;
}

export interface NewGeneratedDocument {
  projectId: number;
  seriesKey: string;
  /** Identifiant du modèle de livrable (template_ref). */
  modelId: string;
  name: string;
  content: string;
  optionsJson: string;
  itemsSnapshot: string;
}

export type SaveOutcome =
  | { outcome: 'created'; id: number; version: number; replacedVersion: number | null }
  /** Contenu identique à la dernière version de la série (F5-D05) : rien n'est écrit. */
  | { outcome: 'identical'; id: number; version: number };

const nowIso = (): string => new Date().toISOString();

/**
 * Enregistre un livrable comme document en brouillon (F5-D05, F5-D06).
 * Contenu identique à la dernière version de la série : aucune écriture. Sinon : version suivante, qui désigne la précédente.
 * Le numéro de version est calculé ici ; l'index unique de la migration 8 refuse un doublon si deux enregistrements se croisaient.
 */
export async function saveGeneratedDocument(input: NewGeneratedDocument): Promise<SaveOutcome> {
  if (input.name.trim() === '') throw new Error('Un document a un nom.');
  if (input.seriesKey.trim() === '' || input.modelId.trim() === '') throw new Error('Un document généré a une série et un modèle.');
  const project = await queryOne<{ kind: string }>('SELECT kind FROM projects WHERE id = ?', [input.projectId]);
  if (!project) throw new Error('Le projet n\'existe pas.');
  if (project.kind !== 'project') throw new Error('Un document se crée dans un projet, pas dans un dossier ni une archive.');

  const last = await latestInSeries(input.projectId, input.seriesKey);
  if (last !== null && last.content === input.content) return { outcome: 'identical', id: last.id, version: last.version };

  const version = last === null ? 1 : last.version + 1;
  const t = nowIso();
  const [written] = await mutate([
    {
      sql: `INSERT INTO documents (project_id, kind, name, status, content, template_ref, created_at, updated_at, series_key, version, replaces_id, options_json, items_snapshot)
            VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [input.projectId, GENERATED_KIND, input.name, input.content, input.modelId, t, t, input.seriesKey, version, last === null ? null : last.id, input.optionsJson, input.itemsSnapshot],
      activity: { objectType: 'document', action: 'created', objectId: 'inserted', projectId: input.projectId, detail: `v${version}` },
    },
  ]);
  return { outcome: 'created', id: written.lastInsertRowid, version, replacedVersion: last === null ? null : last.version };
}
