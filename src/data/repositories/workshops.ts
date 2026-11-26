// Dépôt des ateliers (lot M7, décisions D80 et D81) : l'élément commun (table items) et ses champs propres (workshop_details).
// Même mécanique que les parties prenantes : il ne lit que par query() et n'écrit que par mutate() ; les règles viennent de la couche domain.
import { query, queryOne } from '../db.ts';
import type { Row } from '../db.ts';
import { mutate } from '../mutate.ts';
import type { WriteOp } from '../mutate.ts';
import { sequenceName } from '../../domain/codes.ts';
import { changedWorkshopFields, normalizeWorkshopFields } from '../../domain/workshops.ts';
import type { WorkshopFields } from '../../domain/workshops.ts';
import { createItem, normalizeDescription, normalizeTitle } from './items.ts';

export interface Workshop extends Row {
  id: number;
  project_id: number;
  number: number;
  code: string;
  title: string;
  description: string;
  status: string;
  held_on: string;
  place: string;
  objective: string;
  notes: string;
  follow_up: string;
  created_at: string;
  updated_at: string;
}

const SELECT = `SELECT i.id, i.project_id, i.number, i.code, i.title, i.description, i.status, i.created_at, i.updated_at,
  d.held_on, d.place, d.objective, d.notes, d.follow_up
FROM items i JOIN workshop_details d ON d.item_id = i.id`;

const nowIso = (): string => new Date().toISOString();

export interface NewWorkshop extends Partial<WorkshopFields> {
  projectId: number;
  title: string;
  description?: string;
}

export async function getWorkshop(id: number): Promise<Workshop | null> {
  return queryOne<Workshop>(`${SELECT} WHERE i.id = ? AND i.kind = 'workshop'`, [id]);
}

export async function listWorkshops(projectId: number, status?: string): Promise<Workshop[]> {
  if (status !== undefined) {
    return query<Workshop>(`${SELECT} WHERE i.project_id = ? AND i.kind = 'workshop' AND i.status = ? ORDER BY i.number`, [projectId, status]);
  }
  return query<Workshop>(`${SELECT} WHERE i.project_id = ? AND i.kind = 'workshop' ORDER BY i.number`, [projectId]);
}

/** Crée l'élément (code ATL-001…) et ses champs dans une seule transaction : un atelier n'existe jamais sans sa ligne de détails. */
export async function createWorkshop(input: NewWorkshop): Promise<{ id: number; code: string }> {
  const fields = normalizeWorkshopFields(input);
  const seq = sequenceName(input.projectId, 'workshop');
  const detailsOp: WriteOp = {
    // L'élément qui vient d'être créé est celui dont le numéro est la valeur courante du compteur (même transaction).
    sql: `INSERT INTO workshop_details (item_id, held_on, place, objective, notes, follow_up)
SELECT id, ?, ?, ?, ?, ? FROM items WHERE project_id = ? AND kind = 'workshop' AND number = (SELECT value FROM sequences WHERE name = ?)`,
    params: [fields.heldOn, fields.place, fields.objective, fields.notes, fields.followUp, input.projectId, seq],
    extension: true,
  };
  return createItem({ projectId: input.projectId, kind: 'workshop', title: input.title, description: input.description, extensionOps: [detailsOp] });
}

export interface WorkshopChanges {
  title?: string;
  description?: string;
  fields?: Partial<WorkshopFields>;
}

/**
 * Modifie le titre, la description et les champs propres. Une seule ligne de journal (« updated »), qui ne nomme que les champs modifiés, jamais leur contenu.
 * Retourne false, sans rien écrire, si rien ne change.
 */
export async function updateWorkshop(id: number, changes: WorkshopChanges): Promise<boolean> {
  const cur = await getWorkshop(id);
  if (!cur) throw new Error('L\'atelier n\'existe pas.');
  const title = changes.title !== undefined ? normalizeTitle(changes.title) : cur.title;
  const description = changes.description !== undefined ? normalizeDescription(changes.description) : cur.description;
  const before = normalizeWorkshopFields({ heldOn: cur.held_on, place: cur.place, objective: cur.objective, notes: cur.notes, followUp: cur.follow_up });
  const after = normalizeWorkshopFields({ ...before, ...(changes.fields ?? {}) });

  const names: string[] = [];
  if (title !== cur.title) names.push('title');
  if (description !== cur.description) names.push('description');
  const detailNames = changedWorkshopFields(before, after);
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
      sql: 'UPDATE workshop_details SET held_on = ?, place = ?, objective = ?, notes = ?, follow_up = ? WHERE item_id = ?',
      params: [after.heldOn, after.place, after.objective, after.notes, after.followUp, id],
      extension: true,
    });
  }
  await mutate(ops);
  return true;
}
