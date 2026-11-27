// Lecture du journal d'activité d'un projet (lot F4, décisions F4-D03, F4-D06, F4-D09). Lecture seule : ni mutate(), ni écriture, ni journal.
// Le journal ne garde jamais de titre : le libellé vient d'une jointure sur la table de l'objet, tant qu'il existe.
import { query } from '../db.ts';
import type { Row } from '../db.ts';
import { objectGroupTypes } from '../../domain/activity-labels.ts';

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
  d.name AS document_name, p.name AS project_name
FROM activity_log a
LEFT JOIN items i ON a.object_type = 'item' AND a.action <> 'deleted' AND i.id = a.object_id
LEFT JOIN links l ON a.object_type = 'link' AND a.action <> 'deleted' AND l.id = a.object_id
LEFT JOIN items fi ON fi.id = l.from_id
LEFT JOIN items ti ON ti.id = l.to_id
LEFT JOIN documents d ON a.object_type = 'document' AND a.action <> 'deleted' AND d.id = a.object_id
LEFT JOIN projects p ON a.object_type IN ('project', 'folder') AND a.action <> 'deleted' AND p.id = a.object_id
WHERE ${w.sql}
ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    [...w.params, pageSize, offset],
  );
}
