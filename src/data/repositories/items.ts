// Dépôt des éléments du projet (lot M1) : parties prenantes, besoins, exigences, décisions, risques, user stories, tests.
// Il ne lit que par query() et n'écrit que par mutate(). Les règles (types, statuts, codes) viennent de la couche domain.
import { query, queryOne } from '../db.ts';
import type { Row } from '../db.ts';
import { mutate } from '../mutate.ts';
import type { WriteOp } from '../mutate.ts';
import { initialStatus, isKind, isValidStatus, kindInfo } from '../../domain/kinds.ts';
import type { ItemKind } from '../../domain/kinds.ts';
import { sequenceName } from '../../domain/codes.ts';

export interface Item extends Row {
  id: number;
  project_id: number;
  kind: ItemKind;
  number: number;
  code: string;
  title: string;
  description: string;
  status: string;
  source_document_id: number | null;
  source_excerpt: string | null;
  created_at: string;
  updated_at: string;
}

export const MAX_TITLE_LENGTH = 200;
export const MAX_EXCERPT_LENGTH = 2000;

const COLUMNS =
  'id, project_id, kind, number, code, title, description, status, source_document_id, source_excerpt, created_at, updated_at';

const nowIso = (): string => new Date().toISOString();

export interface NewItem {
  projectId: number;
  kind: ItemKind;
  title: string;
  description?: string;
  /** Statut de création ; par défaut le premier statut du type. */
  status?: string;
  /** Document d'où vient l'élément (filiation de la source, décision D20) : il doit appartenir au même projet. */
  sourceDocumentId?: number | null;
  /** Passage du document qui a fait naître l'élément. */
  sourceExcerpt?: string | null;
}

export async function getItem(id: number): Promise<Item | null> {
  return queryOne<Item>(`SELECT ${COLUMNS} FROM items WHERE id = ?`, [id]);
}

export async function getItemByCode(projectId: number, code: string): Promise<Item | null> {
  return queryOne<Item>(`SELECT ${COLUMNS} FROM items WHERE project_id = ? AND code = ?`, [projectId, code]);
}

export async function listItems(projectId: number, kind?: ItemKind): Promise<Item[]> {
  if (kind !== undefined) {
    return query<Item>(`SELECT ${COLUMNS} FROM items WHERE project_id = ? AND kind = ? ORDER BY number`, [projectId, kind]);
  }
  return query<Item>(`SELECT ${COLUMNS} FROM items WHERE project_id = ? ORDER BY kind, number`, [projectId]);
}

/**
 * Crée un élément et lui attribue son code (EX-001…). Le compteur et l'élément sont écrits dans la MÊME transaction :
 * un échec ne consomme aucun numéro, et un numéro attribué n'est jamais réutilisé, même après suppression (décision D18).
 */
export async function createItem(input: NewItem): Promise<{ id: number; code: string }> {
  if (!isKind(input.kind)) throw new Error(`Type d'élément inconnu : ${String(input.kind)}.`);
  const title = input.title.trim();
  if (title === '') throw new Error('Le titre est obligatoire.');
  if (title.length > MAX_TITLE_LENGTH) throw new Error(`Le titre est limité à ${MAX_TITLE_LENGTH} caractères.`);
  const status = input.status ?? initialStatus(input.kind);
  if (!isValidStatus(input.kind, status)) throw new Error(`Statut « ${status} » inconnu pour le type « ${kindInfo(input.kind).label} ».`);
  const excerpt = input.sourceExcerpt ?? null;
  if (excerpt !== null && excerpt.length > MAX_EXCERPT_LENGTH) throw new Error(`L'extrait de la source est limité à ${MAX_EXCERPT_LENGTH} caractères.`);

  const project = await queryOne<{ kind: string }>('SELECT kind FROM projects WHERE id = ?', [input.projectId]);
  if (!project) throw new Error('Le projet n\'existe pas.');
  if (project.kind !== 'project') throw new Error('Un élément se crée dans un projet, pas dans un dossier ni une archive.');

  const sourceId = input.sourceDocumentId ?? null;
  if (sourceId !== null) {
    const doc = await queryOne<{ project_id: number }>('SELECT project_id FROM documents WHERE id = ?', [sourceId]);
    if (!doc) throw new Error('Le document source n\'existe pas.');
    if (doc.project_id !== input.projectId) throw new Error('Le document source doit appartenir au même projet que l\'élément.');
  }

  const seq = sequenceName(input.projectId, input.kind);
  const t = nowIso();
  const [, created] = await mutate([
    // Compteur : table technique, sans ligne de journal (décision D24).
    { sql: 'INSERT INTO sequences (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1', params: [seq] },
    {
      // Le numéro est lu dans le compteur que l'instruction précédente vient d'incrémenter, dans la même transaction.
      sql: `INSERT INTO items (project_id, kind, number, code, title, description, status, source_document_id, source_excerpt, created_at, updated_at)
SELECT ?, ?, value, ? || printf('%03d', value), ?, ?, ?, ?, ?, ?, ? FROM sequences WHERE name = ?`,
      params: [
        input.projectId, input.kind, `${kindInfo(input.kind).prefix}-`, title, input.description ?? '', status, sourceId, excerpt, t, t, seq,
      ],
      activity: { objectType: 'item', action: 'created', objectId: 'inserted', projectId: input.projectId, detail: input.kind },
    },
  ]);
  const item = await getItem(created.lastInsertRowid);
  if (!item) throw new Error('L\'élément créé est introuvable.');
  return { id: item.id, code: item.code };
}

/**
 * Change le statut d'un élément. Seul le statut se modifie dans ce lot : le journal d'activité n'a pas encore d'action « modifié »,
 * l'édition du titre et de la description arrive avec le premier lot qui en a besoin (M3) et tranchera la journalisation.
 */
export async function changeItemStatus(id: number, status: string): Promise<void> {
  const item = await getItem(id);
  if (!item) throw new Error('L\'élément n\'existe pas.');
  if (!isValidStatus(item.kind, status)) throw new Error(`Statut « ${status} » inconnu pour le type « ${kindInfo(item.kind).label} ».`);
  if (item.status === status) return;
  await mutate([
    {
      sql: 'UPDATE items SET status = ?, updated_at = ? WHERE id = ?',
      params: [status, nowIso(), id],
      activity: { objectType: 'item', action: 'status_changed', objectId: id, projectId: item.project_id, detail: `${item.status}>${status}` },
    },
  ]);
}

/**
 * Supprime un élément et les liens qui le touchent. La base supprimerait les liens seule, sans trace :
 * le dépôt les écrit un à un dans le journal, dans la même transaction.
 */
export async function deleteItem(id: number): Promise<void> {
  const item = await getItem(id);
  if (!item) return;
  const links = await query<{ id: number; link_type: string }>('SELECT id, link_type FROM links WHERE from_id = ? OR to_id = ? ORDER BY id', [id, id]);
  const ops: WriteOp[] = links.map((l) => ({
    sql: 'DELETE FROM links WHERE id = ?',
    params: [l.id],
    activity: { objectType: 'link', action: 'deleted', objectId: l.id, projectId: item.project_id, detail: l.link_type },
  }));
  ops.push({
    sql: 'DELETE FROM items WHERE id = ?',
    params: [id],
    activity: { objectType: 'item', action: 'deleted', objectId: id, projectId: item.project_id, detail: item.kind },
  });
  await mutate(ops);
}
