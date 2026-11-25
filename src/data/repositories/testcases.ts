// Dépôt des tests (lot M5, décisions D64 et D65) : l'élément commun (table items) et ses champs propres (test_details).
// Même mécanique que les parties prenantes : il ne lit que par query() et n'écrit que par mutate() ; les règles viennent de la couche domain.
import { query, queryOne } from '../db.ts';
import type { Row } from '../db.ts';
import { mutate } from '../mutate.ts';
import type { WriteOp } from '../mutate.ts';
import { sequenceName } from '../../domain/codes.ts';
import { changedTestFields, normalizeTestFields } from '../../domain/testcases.ts';
import type { TestFields } from '../../domain/testcases.ts';
import { createItem, normalizeDescription, normalizeTitle } from './items.ts';

export interface TestCase extends Row {
  id: number;
  project_id: number;
  number: number;
  code: string;
  title: string;
  description: string;
  status: string;
  test_type: string;
  preconditions: string;
  steps: string;
  expected: string;
  last_run_on: string;
  created_at: string;
  updated_at: string;
}

const SELECT = `SELECT i.id, i.project_id, i.number, i.code, i.title, i.description, i.status, i.created_at, i.updated_at,
  d.test_type, d.preconditions, d.steps, d.expected, d.last_run_on
FROM items i JOIN test_details d ON d.item_id = i.id`;

const nowIso = (): string => new Date().toISOString();

export interface NewTestCase extends Partial<TestFields> {
  projectId: number;
  title: string;
  description?: string;
}

export async function getTestCase(id: number): Promise<TestCase | null> {
  return queryOne<TestCase>(`${SELECT} WHERE i.id = ? AND i.kind = 'test'`, [id]);
}

export async function listTestCases(projectId: number, status?: string): Promise<TestCase[]> {
  if (status !== undefined) {
    return query<TestCase>(`${SELECT} WHERE i.project_id = ? AND i.kind = 'test' AND i.status = ? ORDER BY i.number`, [projectId, status]);
  }
  return query<TestCase>(`${SELECT} WHERE i.project_id = ? AND i.kind = 'test' ORDER BY i.number`, [projectId]);
}

/** Crée l'élément (code TEST-001…) et ses champs dans une seule transaction : un test n'existe jamais sans sa ligne de détails. */
export async function createTestCase(input: NewTestCase): Promise<{ id: number; code: string }> {
  const fields = normalizeTestFields(input);
  const seq = sequenceName(input.projectId, 'test');
  const detailsOp: WriteOp = {
    // L'élément qui vient d'être créé est celui dont le numéro est la valeur courante du compteur (même transaction).
    sql: `INSERT INTO test_details (item_id, test_type, preconditions, steps, expected, last_run_on)
SELECT id, ?, ?, ?, ?, ? FROM items WHERE project_id = ? AND kind = 'test' AND number = (SELECT value FROM sequences WHERE name = ?)`,
    params: [fields.testType, fields.preconditions, fields.steps, fields.expected, fields.lastRunOn, input.projectId, seq],
    extension: true,
  };
  return createItem({ projectId: input.projectId, kind: 'test', title: input.title, description: input.description, extensionOps: [detailsOp] });
}

export interface TestCaseChanges {
  title?: string;
  description?: string;
  fields?: Partial<TestFields>;
}

/**
 * Modifie le titre, la description et les champs propres. Une seule ligne de journal (« updated »), qui ne nomme que les champs modifiés, jamais leur contenu.
 * Retourne false, sans rien écrire, si rien ne change.
 */
export async function updateTestCase(id: number, changes: TestCaseChanges): Promise<boolean> {
  const cur = await getTestCase(id);
  if (!cur) throw new Error('Le test n\'existe pas.');
  const title = changes.title !== undefined ? normalizeTitle(changes.title) : cur.title;
  const description = changes.description !== undefined ? normalizeDescription(changes.description) : cur.description;
  const before = normalizeTestFields({ testType: cur.test_type as TestFields['testType'], preconditions: cur.preconditions, steps: cur.steps, expected: cur.expected, lastRunOn: cur.last_run_on });
  const after = normalizeTestFields({ ...before, ...(changes.fields ?? {}) });

  const names: string[] = [];
  if (title !== cur.title) names.push('title');
  if (description !== cur.description) names.push('description');
  const detailNames = changedTestFields(before, after);
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
      sql: 'UPDATE test_details SET test_type = ?, preconditions = ?, steps = ?, expected = ?, last_run_on = ? WHERE item_id = ?',
      params: [after.testType, after.preconditions, after.steps, after.expected, after.lastRunOn, id],
      extension: true,
    });
  }
  await mutate(ops);
  return true;
}
