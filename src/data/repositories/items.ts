// Dépôt des éléments du projet (lot M1) : parties prenantes, besoins, exigences, décisions, risques, user stories, tests.
// Il ne lit que par query() et n'écrit que par mutate(). Les règles (types, statuts, codes) viennent de la couche domain.
import { query, queryOne } from '../db.ts';
import type { Row } from '../db.ts';
import { mutate } from '../mutate.ts';
import type { WriteOp } from '../mutate.ts';
import { KINDS_WITH_DETAILS, initialStatus, isKind, isValidStatus, kindInfo } from '../../domain/kinds.ts';
import type { ItemKind } from '../../domain/kinds.ts';
import { sequenceName } from '../../domain/codes.ts';
import { formatLinkDetail } from '../../domain/link-detail.ts';

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
export const MAX_DESCRIPTION_LENGTH = 10000;
export const MAX_EXCERPT_LENGTH = 2000;

/** Titre nettoyé ; refuse un titre vide ou trop long. Partagé par la création et par les modifications. */
export function normalizeTitle(title: string): string {
  const clean = title.trim();
  if (clean === '') throw new Error('Le titre est obligatoire.');
  if (clean.length > MAX_TITLE_LENGTH) throw new Error(`Le titre est limité à ${MAX_TITLE_LENGTH} caractères.`);
  return clean;
}

export function normalizeDescription(description: string): string {
  if (description.length > MAX_DESCRIPTION_LENGTH) throw new Error(`La description est limitée à ${MAX_DESCRIPTION_LENGTH} caractères.`);
  return description;
}

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
  /**
   * Écritures des champs propres au type (table d'extension, décision D16), exécutées dans la MÊME transaction, juste après l'élément.
   * Elles doivent être marquées « extension: true » (décision D43) et retrouver l'élément par sa clé (projet, type, numéro).
   */
  extensionOps?: WriteOp[];
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
  if (KINDS_WITH_DETAILS.includes(input.kind) && (input.extensionOps ?? []).length === 0) {
    throw new Error(`Un élément de type « ${kindInfo(input.kind).label} » se crée par le dépôt de son type : ses champs propres s'écrivent avec lui.`);
  }
  const title = normalizeTitle(input.title);
  const description = normalizeDescription(input.description ?? '');
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
        input.projectId, input.kind, `${kindInfo(input.kind).prefix}-`, title, description, status, sourceId, excerpt, t, t, seq,
      ],
      activity: { objectType: 'item', action: 'created', objectId: 'inserted', projectId: input.projectId, detail: input.kind },
    },
    ...(input.extensionOps ?? []),
  ]);
  const item = await getItem(created.lastInsertRowid);
  if (!item) throw new Error('L\'élément créé est introuvable.');
  return { id: item.id, code: item.code };
}

/**
 * Change le statut d'un élément. Le titre, la description et les champs propres au type se modifient par le dépôt du type
 * (action « updated » du journal, décision D35).
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
 * Modifie le titre et la description d'un élément sans champ propre (le besoin, lot M3b). Une seule ligne de journal « updated »,
 * qui ne nomme que les champs modifiés. Retourne false, sans rien écrire, si rien ne change.
 * Les types qui ont une table de détails (partie prenante, exigence) passent par le dépôt de leur type.
 */
export async function updateItem(id: number, changes: { title?: string; description?: string }): Promise<boolean> {
  const cur = await getItem(id);
  if (!cur) throw new Error('L\'élément n\'existe pas.');
  const title = changes.title !== undefined ? normalizeTitle(changes.title) : cur.title;
  const description = changes.description !== undefined ? normalizeDescription(changes.description) : cur.description;
  const names: string[] = [];
  if (title !== cur.title) names.push('title');
  if (description !== cur.description) names.push('description');
  if (names.length === 0) return false;
  await mutate([
    {
      sql: 'UPDATE items SET title = ?, description = ?, updated_at = ? WHERE id = ?',
      params: [title, description, nowIso(), id],
      activity: { objectType: 'item', action: 'updated', objectId: id, projectId: cur.project_id, detail: names.join(',') },
    },
  ]);
  return true;
}

/**
 * Supprime un élément et les liens qui le touchent. La base supprimerait les liens seule, sans trace :
 * le dépôt les écrit un à un dans le journal, dans la même transaction.
 */
export async function deleteItem(id: number): Promise<void> {
  const item = await getItem(id);
  if (!item) return;
  const links = await query<{ id: number; link_type: string; from_id: number; to_id: number }>('SELECT id, link_type, from_id, to_id FROM links WHERE from_id = ? OR to_id = ? ORDER BY id', [id, id]);
  const ops: WriteOp[] = links.map((l) => ({
    sql: 'DELETE FROM links WHERE id = ?',
    params: [l.id],
    activity: { objectType: 'link', action: 'deleted', objectId: l.id, projectId: item.project_id, detail: formatLinkDetail(l.link_type, l.from_id, l.to_id) },
  }));
  ops.push({
    sql: 'DELETE FROM items WHERE id = ?',
    params: [id],
    activity: { objectType: 'item', action: 'deleted', objectId: id, projectId: item.project_id, detail: item.kind },
  });
  await mutate(ops);
}
