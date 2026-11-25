// Dépôt des parties prenantes (lot M3a, décisions D36 et D37) : l'élément commun (table items) et ses champs propres (stakeholder_details).
// Il ne lit que par query() et n'écrit que par mutate(). Les règles viennent de la couche domain.
import { query, queryOne } from '../db.ts';
import type { Row } from '../db.ts';
import { mutate } from '../mutate.ts';
import type { WriteOp } from '../mutate.ts';
import { sequenceName } from '../../domain/codes.ts';
import { changedFields, normalizeFields } from '../../domain/stakeholders.ts';
import type { StakeholderFields } from '../../domain/stakeholders.ts';
import { createItem, normalizeDescription, normalizeTitle } from './items.ts';

export interface Stakeholder extends Row {
  id: number;
  project_id: number;
  number: number;
  code: string;
  title: string;
  description: string;
  status: string;
  organisation: string;
  role: string;
  influence: string;
  interest: string;
  created_at: string;
  updated_at: string;
}

const SELECT = `SELECT i.id, i.project_id, i.number, i.code, i.title, i.description, i.status, i.created_at, i.updated_at,
  d.organisation, d.role, d.influence, d.interest
FROM items i JOIN stakeholder_details d ON d.item_id = i.id`;

const nowIso = (): string => new Date().toISOString();

export interface NewStakeholder extends Partial<StakeholderFields> {
  projectId: number;
  /** Nom de la partie prenante (c'est le titre de l'élément). */
  title: string;
  description?: string;
}

export async function getStakeholder(id: number): Promise<Stakeholder | null> {
  return queryOne<Stakeholder>(`${SELECT} WHERE i.id = ? AND i.kind = 'stakeholder'`, [id]);
}

export async function listStakeholders(projectId: number, status?: string): Promise<Stakeholder[]> {
  if (status !== undefined) {
    return query<Stakeholder>(`${SELECT} WHERE i.project_id = ? AND i.kind = 'stakeholder' AND i.status = ? ORDER BY i.number`, [projectId, status]);
  }
  return query<Stakeholder>(`${SELECT} WHERE i.project_id = ? AND i.kind = 'stakeholder' ORDER BY i.number`, [projectId]);
}

/** Crée l'élément (code PP-001…) et ses champs dans une seule transaction : une partie prenante n'existe jamais sans sa ligne de détails. */
export async function createStakeholder(input: NewStakeholder): Promise<{ id: number; code: string }> {
  const fields = normalizeFields(input);
  const seq = sequenceName(input.projectId, 'stakeholder');
  const detailsOp: WriteOp = {
    // L'élément qui vient d'être créé est celui dont le numéro est la valeur courante du compteur (même transaction).
    sql: `INSERT INTO stakeholder_details (item_id, organisation, role, influence, interest)
SELECT id, ?, ?, ?, ? FROM items WHERE project_id = ? AND kind = 'stakeholder' AND number = (SELECT value FROM sequences WHERE name = ?)`,
    params: [fields.organisation, fields.role, fields.influence, fields.interest, input.projectId, seq],
    extension: true,
  };
  return createItem({
    projectId: input.projectId,
    kind: 'stakeholder',
    title: input.title,
    description: input.description,
    extensionOps: [detailsOp],
  });
}

export interface StakeholderChanges {
  title?: string;
  description?: string;
  fields?: Partial<StakeholderFields>;
}

/**
 * Modifie le nom, la description et les champs propres. Une seule ligne de journal (« updated »), qui ne nomme que les champs modifiés, jamais leur contenu.
 * Retourne false, sans rien écrire, si rien ne change.
 */
export async function updateStakeholder(id: number, changes: StakeholderChanges): Promise<boolean> {
  const cur = await getStakeholder(id);
  if (!cur) throw new Error('La partie prenante n\'existe pas.');
  const title = changes.title !== undefined ? normalizeTitle(changes.title) : cur.title;
  const description = changes.description !== undefined ? normalizeDescription(changes.description) : cur.description;
  const before = normalizeFields({ organisation: cur.organisation, role: cur.role, influence: cur.influence as StakeholderFields['influence'], interest: cur.interest as StakeholderFields['interest'] });
  const after = normalizeFields({ ...before, ...(changes.fields ?? {}) });

  const names: string[] = [];
  if (title !== cur.title) names.push('title');
  if (description !== cur.description) names.push('description');
  const detailNames = changedFields(before, after);
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
      sql: 'UPDATE stakeholder_details SET organisation = ?, role = ?, influence = ?, interest = ? WHERE item_id = ?',
      params: [after.organisation, after.role, after.influence, after.interest, id],
      extension: true,
    });
  }
  await mutate(ops);
  return true;
}
