// Lecture du journal d'activité d'un projet (lot F4, décisions F4-D03, F4-D06, F4-D09). Lecture seule : ni mutate(), ni écriture, ni journal.
// Le journal ne garde jamais de titre : le libellé vient d'une jointure sur la table de l'objet, tant qu'il existe.
import { query } from '../db.ts';
import type { Row } from '../db.ts';
import { objectGroupTypes } from '../../domain/activity-labels.ts';
import { linkDetailPatterns, parseLinkDetail } from '../../domain/link-detail.ts';

/** Entrées par page (F4-D09). */
export const JOURNAL_PAGE_SIZE = 25;

export interface JournalFilter {
  /** Groupe de types d'objet : all, item, link, document, project (voir OBJECT_GROUPS). */
  group: string;
  /** Action du journal, ou « all ». */
  action: string;
}

export interface JournalEntry extends Row {
  id: number;
  at: string;
  object_type: string;
  object_id: number | null;
  action: string;
  detail: string | null;
  /** Éléments : renseignés tant que l'élément existe. */
  item_kind: string | null;
  item_code: string | null;
  item_title: string | null;
  /** Liens : type et codes des deux extrémités, tant que le lien existe. */
  link_type: string | null;
  from_code: string | null;
  to_code: string | null;
  /** Documents et projets : nom, tant que l'objet existe. */
  document_name: string | null;
  project_name: string | null;
}

interface Where {
  sql: string;
  params: Array<string | number>;
}

// Une entrée du journal appartient au projet par « project_id » : les entrées sans projet (imports V1 de contacts, réglages…) ne sont lues par aucun projet (F4-D03).
function whereOf(projectId: number, filter: JournalFilter): Where {
  const parts = ['a.project_id = ?'];
  const params: Array<string | number> = [projectId];
  const types = objectGroupTypes(filter.group);
  if (types.length > 0) {
    parts.push(`a.object_type IN (${types.map(() => '?').join(', ')})`);
    params.push(...types);
  }
  if (filter.action !== 'all' && filter.action !== '') {
    parts.push('a.action = ?');
    params.push(filter.action);
  }
  return { sql: parts.join(' AND '), params };
}

/** Nombre d'entrées du projet qui répondent aux filtres. */
export async function countJournal(projectId: number, filter: JournalFilter): Promise<number> {
  const w = whereOf(projectId, filter);
  const [r] = await query<{ n: number }>(`SELECT count(*) AS n FROM activity_log a WHERE ${w.sql}`, w.params);
  return Number(r.n);
}

/** Une page du journal du projet, la plus récente en premier (ordre décroissant de l'identifiant : un import V1 date ses lignes dans le passé). Page 1 = la première. */
export async function listJournal(projectId: number, filter: JournalFilter, page = 1, pageSize = JOURNAL_PAGE_SIZE): Promise<JournalEntry[]> {
  const w = whereOf(projectId, filter);
  const offset = Math.max(0, Math.floor(page) - 1) * pageSize;
  // Aucune jointure pour un objet supprimé : son identifiant n'existe plus (les identifiants ne sont jamais réutilisés, AUTOINCREMENT).
  return query<JournalEntry>(
    `SELECT a.id, a.at, a.object_type, a.object_id, a.action, a.detail,
  i.kind AS item_kind, i.code AS item_code, i.title AS item_title,
  l.link_type AS link_type, fi.code AS from_code, ti.code AS to_code,
  COALESCE(d.name, dd.name) AS document_name, p.name AS project_name
FROM activity_log a
LEFT JOIN items i ON a.object_type = 'item' AND a.action <> 'deleted' AND i.id = a.object_id
LEFT JOIN links l ON a.object_type = 'link' AND a.action <> 'deleted' AND l.id = a.object_id
LEFT JOIN items fi ON fi.id = l.from_id
LEFT JOIN items ti ON ti.id = l.to_id
LEFT JOIN documents d ON a.object_type = 'document' AND a.action <> 'deleted' AND d.id = a.object_id
LEFT JOIN distributions dx ON a.object_type = 'distribution' AND a.action <> 'deleted' AND dx.id = a.object_id
LEFT JOIN documents dd ON dd.id = dx.document_id
LEFT JOIN projects p ON a.object_type IN ('project', 'folder') AND a.action <> 'deleted' AND p.id = a.object_id
WHERE ${w.sql}
ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    [...w.params, pageSize, offset],
  );
}

// ------------------------------------------------------------------ historique d'un élément (lot F7)

/** Lignes par tranche dans la fiche (F7-D05). */
export const HISTORY_PAGE_SIZE = 10;

export interface HistoryEntry extends Row {
  id: number;
  at: string;
  /** « item » ou « link ». */
  object_type: string;
  action: string;
  detail: string | null;
  /** Lignes de lien : type du lien, sens vu depuis l'élément (« out » = l'élément est l'origine) et code de l'autre extrémité (null si elle n'existe plus). */
  link_type: string | null;
  direction: 'out' | 'in' | null;
  other_code: string | null;
}

interface RawHistory extends Row {
  id: number;
  at: string;
  object_type: string;
  action: string;
  detail: string | null;
  link_type: string | null;
  link_from: number | null;
  link_to: number | null;
}

// Trois sources, une seule condition (F7 conception) : les lignes de l'élément ; les lignes de lien dont le lien existe encore et touche l'élément ;
// les lignes de lien écrites dès la 0.17.0, dont le détail porte les identifiants des deux extrémités (F7-D03). Bornée au projet de l'élément.
// Une ligne de lien supprimé écrite avant la 0.17.0 ne porte aucune extrémité : elle n'est rattachée à aucune fiche (limite annoncée).
function historyWhere(itemId: number): Where {
  const p = linkDetailPatterns(itemId);
  return {
    sql: `a.project_id = (SELECT project_id FROM items WHERE id = ?)
AND ((a.object_type = 'item' AND a.object_id = ?)
  OR (a.object_type = 'link' AND (l.from_id = ? OR l.to_id = ? OR a.detail LIKE ? OR a.detail LIKE ?)))`,
    params: [itemId, itemId, itemId, itemId, p.asFrom, p.asTo],
  };
}

const HISTORY_FROM = `FROM activity_log a
LEFT JOIN links l ON a.object_type = 'link' AND a.action <> 'deleted' AND l.id = a.object_id`;

/** Nombre total de lignes d'historique de l'élément. */
export async function countItemHistory(itemId: number): Promise<number> {
  const w = historyWhere(itemId);
  const [r] = await query<{ n: number }>(`SELECT count(*) AS n ${HISTORY_FROM} WHERE ${w.sql}`, w.params);
  return Number(r.n);
}

/**
 * Une tranche de l'historique de l'élément, la plus récente d'abord (ordre décroissant de l'identifiant, comme le Journal). Lecture seule : rien n'est écrit, pas même au journal.
 * Le code de l'autre extrémité d'un lien se lit dans « items », tant qu'elle existe.
 */
export async function itemHistory(itemId: number, limit = HISTORY_PAGE_SIZE, offset = 0): Promise<HistoryEntry[]> {
  const w = historyWhere(itemId);
  const raw = await query<RawHistory>(
    `SELECT a.id, a.at, a.object_type, a.action, a.detail, l.link_type AS link_type, l.from_id AS link_from, l.to_id AS link_to
${HISTORY_FROM}
WHERE ${w.sql}
ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    [...w.params, limit, Math.max(0, offset)],
  );
  const resolved = raw.map((r) => {
    if (r.object_type !== 'link') return { r, type: null, from: null as number | null, to: null as number | null };
    const parsed = parseLinkDetail(r.detail);
    return { r, type: r.link_type ?? (parsed ? parsed.type : null), from: r.link_from ?? (parsed ? parsed.fromId : null), to: r.link_to ?? (parsed ? parsed.toId : null) };
  });
  const otherIds = new Set<number>();
  for (const x of resolved) {
    if (x.from === null || x.to === null) continue;
    otherIds.add(x.from === itemId ? x.to : x.from);
  }
  const codes = new Map<number, string>();
  if (otherIds.size > 0) {
    const ids = [...otherIds];
    const found = await query<{ id: number; code: string }>(`SELECT id, code FROM items WHERE id IN (${ids.map(() => '?').join(', ')})`, ids);
    for (const f of found) codes.set(f.id, f.code);
  }
  return resolved.map(({ r, type, from, to }) => {
    const hasEnds = from !== null && to !== null;
    const direction = hasEnds ? (from === itemId ? 'out' : 'in') : null;
    const other = hasEnds ? (from === itemId ? to : from) : null;
    return { id: r.id, at: r.at, object_type: r.object_type, action: r.action, detail: r.detail, link_type: type, direction, other_code: other === null ? null : codes.get(other) ?? null };
  });
}
