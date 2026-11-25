// Dépôt des liens entre éléments (lot M1). Les couples de types autorisés viennent de la matrice de la couche domain (décision D19).
import { query, queryOne } from '../db.ts';
import type { Row } from '../db.ts';
import { mutate } from '../mutate.ts';
import { assertLinkAllowed, isLinkType, linkRule } from '../../domain/links.ts';
import type { LinkType } from '../../domain/links.ts';
import { kindInfo } from '../../domain/kinds.ts';
import type { ItemKind } from '../../domain/kinds.ts';

export interface Link extends Row {
  id: number;
  project_id: number;
  link_type: LinkType;
  from_id: number;
  to_id: number;
  created_at: string;
}

const COLUMNS = 'id, project_id, link_type, from_id, to_id, created_at';

export async function getLink(id: number): Promise<Link | null> {
  return queryOne<Link>(`SELECT ${COLUMNS} FROM links WHERE id = ?`, [id]);
}

export async function listLinks(projectId: number, type?: LinkType): Promise<Link[]> {
  if (type !== undefined) return query<Link>(`SELECT ${COLUMNS} FROM links WHERE project_id = ? AND link_type = ? ORDER BY id`, [projectId, type]);
  return query<Link>(`SELECT ${COLUMNS} FROM links WHERE project_id = ? ORDER BY id`, [projectId]);
}

/** Liens qui partent de l'élément ou qui arrivent à lui. */
export async function linksOfItem(itemId: number): Promise<Link[]> {
  return query<Link>(`SELECT ${COLUMNS} FROM links WHERE from_id = ? OR to_id = ? ORDER BY id`, [itemId, itemId]);
}

export async function createLink(input: { type: LinkType; fromId: number; toId: number }): Promise<number> {
  if (!isLinkType(input.type)) throw new Error(`Type de lien inconnu : ${String(input.type)}.`);
  if (input.fromId === input.toId) throw new Error('Un élément ne peut pas être lié à lui-même.');
  const ends = await query<{ id: number; project_id: number; kind: ItemKind; code: string }>(
    'SELECT id, project_id, kind, code FROM items WHERE id IN (?, ?)',
    [input.fromId, input.toId],
  );
  const from = ends.find((e) => e.id === input.fromId);
  const to = ends.find((e) => e.id === input.toId);
  if (!from || !to) throw new Error('Un des deux éléments du lien n\'existe pas.');
  if (from.project_id !== to.project_id) throw new Error('Un lien relie deux éléments d\'un même projet.');
  assertLinkAllowed(input.type, from.kind, to.kind);
  const existing = await queryOne<{ id: number }>('SELECT id FROM links WHERE link_type = ? AND from_id = ? AND to_id = ?', [input.type, input.fromId, input.toId]);
  if (existing) {
    throw new Error(`Ce lien existe déjà : ${from.code} ${linkRule(input.type).label} ${to.code} (${kindInfo(from.kind).label} vers ${kindInfo(to.kind).label}).`);
  }
  const [r] = await mutate([
    {
      // La clé étrangère composée de la table refuse en dernier recours un lien entre deux projets.
      sql: 'INSERT INTO links (project_id, link_type, from_id, to_id, created_at) VALUES (?, ?, ?, ?, ?)',
      params: [from.project_id, input.type, input.fromId, input.toId, new Date().toISOString()],
      activity: { objectType: 'link', action: 'created', objectId: 'inserted', projectId: from.project_id, detail: input.type },
    },
  ]);
  return r.lastInsertRowid;
}

export async function deleteLink(id: number): Promise<void> {
  const link = await getLink(id);
  if (!link) return;
  await mutate([
    {
      sql: 'DELETE FROM links WHERE id = ?',
      params: [id],
      activity: { objectType: 'link', action: 'deleted', objectId: id, projectId: link.project_id, detail: link.link_type },
    },
  ]);
}
