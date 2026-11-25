// Dépôt des exigences (lot M3b, décisions D36 et D46) : l'élément commun (table items) et ses champs propres (requirement_details).
// Même mécanique que les parties prenantes : il ne lit que par query() et n'écrit que par mutate() ; les règles viennent de la couche domain.
import { query, queryOne } from '../db.ts';
import type { Row } from '../db.ts';
import { mutate } from '../mutate.ts';
import type { WriteOp } from '../mutate.ts';
import { sequenceName } from '../../domain/codes.ts';
import { changedRequirementFields, normalizeRequirementFields } from '../../domain/requirements.ts';
import type { RequirementFields } from '../../domain/requirements.ts';
import { createItem, normalizeDescription, normalizeTitle } from './items.ts';

export interface Requirement extends Row {
  id: number;
  project_id: number;
  number: number;
  code: string;
  title: string;
  description: string;
  status: string;
  nature: string;
  priority: string;
  criteria: string;
  created_at: string;
  updated_at: string;
}

const SELECT = `SELECT i.id, i.project_id, i.number, i.code, i.title, i.description, i.status, i.created_at, i.updated_at,
  d.nature, d.priority, d.criteria
FROM items i JOIN requirement_details d ON d.item_id = i.id`;

const nowIso = (): string => new Date().toISOString();

export interface NewRequirement extends Partial<RequirementFields> {
  projectId: number;
  title: string;
  description?: string;
}

export async function getRequirement(id: number): Promise<Requirement | null> {
  return queryOne<Requirement>(`${SELECT} WHERE i.id = ? AND i.kind = 'requirement'`, [id]);
}

export async function listRequirements(projectId: number, status?: string): Promise<Requirement[]> {
  if (status !== undefined) {
    return query<Requirement>(`${SELECT} WHERE i.project_id = ? AND i.kind = 'requirement' AND i.status = ? ORDER BY i.number`, [projectId, status]);
  }
  return query<Requirement>(`${SELECT} WHERE i.project_id = ? AND i.kind = 'requirement' ORDER BY i.number`, [projectId]);
}

/** Crée l'élément (code EX-001…) et ses champs dans une seule transaction : une exigence n'existe jamais sans sa ligne de détails. */
export async function createRequirement(input: NewRequirement): Promise<{ id: number; code: string }> {
  const fields = normalizeRequirementFields(input);
  const seq = sequenceName(input.projectId, 'requirement');
  const detailsOp: WriteOp = {
    // L'élément qui vient d'être créé est celui dont le numéro est la valeur courante du compteur (même transaction).
    sql: `INSERT INTO requirement_details (item_id, nature, priority, criteria)
SELECT id, ?, ?, ? FROM items WHERE project_id = ? AND kind = 'requirement' AND number = (SELECT value FROM sequences WHERE name = ?)`,
    params: [fields.nature, fields.priority, fields.criteria, input.projectId, seq],
    extension: true,
  };
  return createItem({ projectId: input.projectId, kind: 'requirement', title: input.title, description: input.description, extensionOps: [detailsOp] });
}

export interface RequirementChanges {
  title?: string;
  description?: string;
  fields?: Partial<RequirementFields>;
}

/**
 * Modifie le titre, la description et les champs propres. Une seule ligne de journal (« updated »), qui ne nomme que les champs modifiés, jamais leur contenu.
 * Retourne false, sans rien écrire, si rien ne change.
 */
export async function updateRequirement(id: number, changes: RequirementChanges): Promise<boolean> {
  const cur = await getRequirement(id);
  if (!cur) throw new Error('L\'exigence n\'existe pas.');
  const title = changes.title !== undefined ? normalizeTitle(changes.title) : cur.title;
  const description = changes.description !== undefined ? normalizeDescription(changes.description) : cur.description;
  const before = normalizeRequirementFields({ nature: cur.nature as RequirementFields['nature'], priority: cur.priority as RequirementFields['priority'], criteria: cur.criteria });
  const after = normalizeRequirementFields({ ...before, ...(changes.fields ?? {}) });

  const names: string[] = [];
  if (title !== cur.title) names.push('title');
  if (description !== cur.description) names.push('description');
  const detailNames = changedRequirementFields(before, after);
  names.push(...detailNames);
  if (names.length === 0) return false;

  const ops: WriteOp[] = [
    {
      sql: 'UPDATE items SET title = ?, description = ?, updated_at = ? WHERE id = ?',
      params: [title, description, nowIso(), id],
      activity: { objectType: 'item', action: 'updated', objectId: id, projectId: cur.project_id, detail: names.join(',') },
    },
  ];
  if (detailNames.length > 0) {
    ops.push({
      sql: 'UPDATE requirement_details SET nature = ?, priority = ?, criteria = ? WHERE item_id = ?',
      params: [after.nature, after.priority, after.criteria, id],
      extension: true,
    });
  }
  await mutate(ops);
  return true;
}
