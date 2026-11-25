// Dépôt des risques (lot M4, décisions D55 et D56) : l'élément commun (table items) et ses champs propres (risk_details).
// Même mécanique que les parties prenantes : il ne lit que par query() et n'écrit que par mutate() ; les règles viennent de la couche domain.
import { query, queryOne } from '../db.ts';
import type { Row } from '../db.ts';
import { mutate } from '../mutate.ts';
import type { WriteOp } from '../mutate.ts';
import { sequenceName } from '../../domain/codes.ts';
import { changedRiskFields, normalizeRiskFields } from '../../domain/risks.ts';
import type { RiskFields } from '../../domain/risks.ts';
import { createItem, normalizeDescription, normalizeTitle } from './items.ts';

export interface Risk extends Row {
  id: number;
  project_id: number;
  number: number;
  code: string;
  title: string;
  description: string;
  status: string;
  probability: string;
  impact: string;
  mitigation: string;
  owner: string;
  created_at: string;
  updated_at: string;
}

const SELECT = `SELECT i.id, i.project_id, i.number, i.code, i.title, i.description, i.status, i.created_at, i.updated_at,
  d.probability, d.impact, d.mitigation, d.owner
FROM items i JOIN risk_details d ON d.item_id = i.id`;

const nowIso = (): string => new Date().toISOString();

export interface NewRisk extends Partial<RiskFields> {
  projectId: number;
  title: string;
  description?: string;
}

export async function getRisk(id: number): Promise<Risk | null> {
  return queryOne<Risk>(`${SELECT} WHERE i.id = ? AND i.kind = 'risk'`, [id]);
}

export async function listRisks(projectId: number, status?: string): Promise<Risk[]> {
  if (status !== undefined) {
    return query<Risk>(`${SELECT} WHERE i.project_id = ? AND i.kind = 'risk' AND i.status = ? ORDER BY i.number`, [projectId, status]);
  }
  return query<Risk>(`${SELECT} WHERE i.project_id = ? AND i.kind = 'risk' ORDER BY i.number`, [projectId]);
}

/** Crée l'élément (code RIS-001…) et ses champs dans une seule transaction : un risque n'existe jamais sans sa ligne de détails. */
export async function createRisk(input: NewRisk): Promise<{ id: number; code: string }> {
  const fields = normalizeRiskFields(input);
  const seq = sequenceName(input.projectId, 'risk');
  const detailsOp: WriteOp = {
    // L'élément qui vient d'être créé est celui dont le numéro est la valeur courante du compteur (même transaction).
    sql: `INSERT INTO risk_details (item_id, probability, impact, mitigation, owner)
SELECT id, ?, ?, ?, ? FROM items WHERE project_id = ? AND kind = 'risk' AND number = (SELECT value FROM sequences WHERE name = ?)`,
    params: [fields.probability, fields.impact, fields.mitigation, fields.owner, input.projectId, seq],
    extension: true,
  };
  return createItem({ projectId: input.projectId, kind: 'risk', title: input.title, description: input.description, extensionOps: [detailsOp] });
}

export interface RiskChanges {
  title?: string;
  description?: string;
  fields?: Partial<RiskFields>;
}

/**
 * Modifie le titre, la description et les champs propres. Une seule ligne de journal (« updated »), qui ne nomme que les champs modifiés, jamais leur contenu.
 * Retourne false, sans rien écrire, si rien ne change.
 */
export async function updateRisk(id: number, changes: RiskChanges): Promise<boolean> {
  const cur = await getRisk(id);
  if (!cur) throw new Error('Le risque n\'existe pas.');
  const title = changes.title !== undefined ? normalizeTitle(changes.title) : cur.title;
  const description = changes.description !== undefined ? normalizeDescription(changes.description) : cur.description;
  const before = normalizeRiskFields({ probability: cur.probability as RiskFields['probability'], impact: cur.impact as RiskFields['impact'], mitigation: cur.mitigation, owner: cur.owner });
  const after = normalizeRiskFields({ ...before, ...(changes.fields ?? {}) });

  const names: string[] = [];
  if (title !== cur.title) names.push('title');
  if (description !== cur.description) names.push('description');
  const detailNames = changedRiskFields(before, after);
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
      sql: 'UPDATE risk_details SET probability = ?, impact = ?, mitigation = ?, owner = ? WHERE item_id = ?',
      params: [after.probability, after.impact, after.mitigation, after.owner, id],
      extension: true,
    });
  }
  await mutate(ops);
  return true;
}
