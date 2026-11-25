// Dépôt des décisions (lot M4, décisions D53 et D54) : l'élément commun (table items) et ses champs propres (decision_details).
// Même mécanique que les parties prenantes : il ne lit que par query() et n'écrit que par mutate() ; les règles viennent de la couche domain.
import { query, queryOne } from '../db.ts';
import type { Row } from '../db.ts';
import { mutate } from '../mutate.ts';
import type { WriteOp } from '../mutate.ts';
import { sequenceName } from '../../domain/codes.ts';
import { changedDecisionFields, normalizeDecisionFields } from '../../domain/decisions.ts';
import type { DecisionFields } from '../../domain/decisions.ts';
import { createItem, normalizeDescription, normalizeTitle } from './items.ts';

export interface Decision extends Row {
  id: number;
  project_id: number;
  number: number;
  code: string;
  title: string;
  description: string;
  status: string;
  decided_on: string;
  decider: string;
  alternatives: string;
  rationale: string;
  created_at: string;
  updated_at: string;
}

const SELECT = `SELECT i.id, i.project_id, i.number, i.code, i.title, i.description, i.status, i.created_at, i.updated_at,
  d.decided_on, d.decider, d.alternatives, d.rationale
FROM items i JOIN decision_details d ON d.item_id = i.id`;

const nowIso = (): string => new Date().toISOString();

export interface NewDecision extends Partial<DecisionFields> {
  projectId: number;
  title: string;
  description?: string;
}

export async function getDecision(id: number): Promise<Decision | null> {
  return queryOne<Decision>(`${SELECT} WHERE i.id = ? AND i.kind = 'decision'`, [id]);
}

export async function listDecisions(projectId: number, status?: string): Promise<Decision[]> {
  if (status !== undefined) {
    return query<Decision>(`${SELECT} WHERE i.project_id = ? AND i.kind = 'decision' AND i.status = ? ORDER BY i.number`, [projectId, status]);
  }
  return query<Decision>(`${SELECT} WHERE i.project_id = ? AND i.kind = 'decision' ORDER BY i.number`, [projectId]);
}

/** Crée l'élément (code DEC-001…) et ses champs dans une seule transaction : une décision n'existe jamais sans sa ligne de détails. */
export async function createDecision(input: NewDecision): Promise<{ id: number; code: string }> {
  const fields = normalizeDecisionFields(input);
  const seq = sequenceName(input.projectId, 'decision');
  const detailsOp: WriteOp = {
    // L'élément qui vient d'être créé est celui dont le numéro est la valeur courante du compteur (même transaction).
    sql: `INSERT INTO decision_details (item_id, decided_on, decider, alternatives, rationale)
SELECT id, ?, ?, ?, ? FROM items WHERE project_id = ? AND kind = 'decision' AND number = (SELECT value FROM sequences WHERE name = ?)`,
    params: [fields.decidedOn, fields.decider, fields.alternatives, fields.rationale, input.projectId, seq],
    extension: true,
  };
  return createItem({ projectId: input.projectId, kind: 'decision', title: input.title, description: input.description, extensionOps: [detailsOp] });
}

export interface DecisionChanges {
  title?: string;
  description?: string;
  fields?: Partial<DecisionFields>;
}

/**
 * Modifie le titre, la description et les champs propres. Une seule ligne de journal (« updated »), qui ne nomme que les champs modifiés, jamais leur contenu.
 * Retourne false, sans rien écrire, si rien ne change.
 */
export async function updateDecision(id: number, changes: DecisionChanges): Promise<boolean> {
  const cur = await getDecision(id);
  if (!cur) throw new Error('La décision n\'existe pas.');
  const title = changes.title !== undefined ? normalizeTitle(changes.title) : cur.title;
  const description = changes.description !== undefined ? normalizeDescription(changes.description) : cur.description;
  const before = normalizeDecisionFields({ decidedOn: cur.decided_on, decider: cur.decider, alternatives: cur.alternatives, rationale: cur.rationale });
  const after = normalizeDecisionFields({ ...before, ...(changes.fields ?? {}) });

  const names: string[] = [];
  if (title !== cur.title) names.push('title');
  if (description !== cur.description) names.push('description');
  const detailNames = changedDecisionFields(before, after);
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
      sql: 'UPDATE decision_details SET decided_on = ?, decider = ?, alternatives = ?, rationale = ? WHERE item_id = ?',
      params: [after.decidedOn, after.decider, after.alternatives, after.rationale, id],
      extension: true,
    });
  }
  await mutate(ops);
  return true;
}
