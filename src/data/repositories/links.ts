// Dépôt des liens entre éléments (lot M1). Les couples de types autorisés viennent de la matrice de la couche domain (décision D19).
import { query, queryOne } from '../db.ts';
import type { Row } from '../db.ts';
import { mutate } from '../mutate.ts';
import { assertLinkAllowed, canLoop, findPath, isLinkType, linkRule } from '../../domain/links.ts';
import type { Direction, LinkType } from '../../domain/links.ts';
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
  // Décision D50 : un lien qui peut relier deux éléments du même type (« raffine ») ne doit pas former de boucle.
  if (canLoop(input.type)) {
    const rows = await query<{ from_id: number; to_id: number }>('SELECT from_id, to_id FROM links WHERE link_type = ? AND project_id = ?', [input.type, from.project_id]);
    const path = findPath(rows.map((r) => [r.from_id, r.to_id] as const), input.toId, input.fromId);
    if (path) {
      const loop = [input.fromId, ...path];
      const codes = await query<{ id: number; code: string }>(`SELECT id, code FROM items WHERE id IN (${loop.map(() => '?').join(', ')})`, loop);
      const codeOf = new Map(codes.map((c) => [c.id, c.code]));
      throw new Error(
        `Lien refusé : ${from.code} ${linkRule(input.type).label} ${to.code} créerait une boucle (${loop.map((id) => codeOf.get(id) ?? String(id)).join(' → ')}).`,
      );
    }
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

// ------------------------------------------------------------------ lecture pour l'interface (lot M3b)

/** Un lien vu depuis un élément : l'autre extrémité avec son code, son titre et son statut. */
export interface LinkedItem extends Row {
  link_id: number;
  link_type: LinkType;
  direction: Direction;
  other_id: number;
  other_kind: ItemKind;
  other_code: string;
  other_title: string;
  other_status: string;
}

/** Tous les liens d'un élément, dans les deux sens, triés par type de lien, sens, puis code de l'autre extrémité. */
export async function linkedItems(itemId: number): Promise<LinkedItem[]> {
  return query<LinkedItem>(
    `SELECT l.id AS link_id, l.link_type AS link_type, 'out' AS direction, o.id AS other_id, o.kind AS other_kind, o.code AS other_code, o.title AS other_title, o.status AS other_status
FROM links l JOIN items o ON o.id = l.to_id WHERE l.from_id = ?
UNION ALL
SELECT l.id, l.link_type, 'in', o.id, o.kind, o.code, o.title, o.status
FROM links l JOIN items o ON o.id = l.from_id WHERE l.to_id = ?
ORDER BY link_type, direction, other_code`,
    [itemId, itemId],
  );
}

export interface LinkCandidate extends Row {
  id: number;
  kind: ItemKind;
  code: string;
  title: string;
  status: string;
}

/**
 * Éléments du même projet que l'on peut relier à « itemId » avec ce type de lien et ce sens : du bon type d'élément, pas lui-même,
 * pas déjà reliés de cette façon. Les boucles de « raffine » sont refusées à la création (décision D50), pas ici.
 */
export async function linkCandidates(itemId: number, type: LinkType, direction: Direction): Promise<LinkCandidate[]> {
  if (!isLinkType(type)) throw new Error(`Type de lien inconnu : ${String(type)}.`);
  const item = await queryOne<{ id: number; project_id: number; kind: ItemKind }>('SELECT id, project_id, kind FROM items WHERE id = ?', [itemId]);
  if (!item) throw new Error('L\'élément n\'existe pas.');
  const rule = linkRule(type);
  const mine = direction === 'out' ? rule.from : rule.to;
  const theirs = direction === 'out' ? rule.to : rule.from;
  if (!mine.includes(item.kind)) return [];
  const marks = theirs.map(() => '?').join(', ');
  const exclusion = direction === 'out'
    ? 'NOT EXISTS (SELECT 1 FROM links l WHERE l.link_type = ? AND l.from_id = ? AND l.to_id = c.id)'
    : 'NOT EXISTS (SELECT 1 FROM links l WHERE l.link_type = ? AND l.from_id = c.id AND l.to_id = ?)';
  return query<LinkCandidate>(
    `SELECT c.id, c.kind, c.code, c.title, c.status FROM items c
WHERE c.project_id = ? AND c.id <> ? AND c.kind IN (${marks}) AND ${exclusion} ORDER BY c.kind, c.number`,
    [item.project_id, itemId, ...theirs, type, itemId],
  );
}
