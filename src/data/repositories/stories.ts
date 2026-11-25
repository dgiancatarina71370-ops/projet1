// Dépôt des user stories (lot M5, décision D62) : l'élément commun (table items) et ses champs propres (story_details).
// Même mécanique que les parties prenantes : il ne lit que par query() et n'écrit que par mutate() ; les règles viennent de la couche domain.
import { query, queryOne } from '../db.ts';
import type { Row } from '../db.ts';
import { mutate } from '../mutate.ts';
import type { WriteOp } from '../mutate.ts';
import { sequenceName } from '../../domain/codes.ts';
import { changedStoryFields, normalizeStoryFields } from '../../domain/stories.ts';
import type { StoryFields } from '../../domain/stories.ts';
import { createItem, normalizeDescription, normalizeTitle } from './items.ts';

export interface Story extends Row {
  id: number;
  project_id: number;
  number: number;
  code: string;
  title: string;
  description: string;
  status: string;
  role: string;
  goal: string;
  benefit: string;
  criteria: string;
  created_at: string;
  updated_at: string;
}

const SELECT = `SELECT i.id, i.project_id, i.number, i.code, i.title, i.description, i.status, i.created_at, i.updated_at,
  d.role, d.goal, d.benefit, d.criteria
FROM items i JOIN story_details d ON d.item_id = i.id`;

const nowIso = (): string => new Date().toISOString();

export interface NewStory extends Partial<StoryFields> {
  projectId: number;
  title: string;
  description?: string;
}

export async function getStory(id: number): Promise<Story | null> {
  return queryOne<Story>(`${SELECT} WHERE i.id = ? AND i.kind = 'story'`, [id]);
}

export async function listStories(projectId: number, status?: string): Promise<Story[]> {
  if (status !== undefined) {
    return query<Story>(`${SELECT} WHERE i.project_id = ? AND i.kind = 'story' AND i.status = ? ORDER BY i.number`, [projectId, status]);
  }
  return query<Story>(`${SELECT} WHERE i.project_id = ? AND i.kind = 'story' ORDER BY i.number`, [projectId]);
}

/** Crée l'élément (code US-001…) et ses champs dans une seule transaction : une user story n'existe jamais sans sa ligne de détails. */
export async function createStory(input: NewStory): Promise<{ id: number; code: string }> {
  const fields = normalizeStoryFields(input);
  const seq = sequenceName(input.projectId, 'story');
  const detailsOp: WriteOp = {
    // L'élément qui vient d'être créé est celui dont le numéro est la valeur courante du compteur (même transaction).
    sql: `INSERT INTO story_details (item_id, role, goal, benefit, criteria)
SELECT id, ?, ?, ?, ? FROM items WHERE project_id = ? AND kind = 'story' AND number = (SELECT value FROM sequences WHERE name = ?)`,
    params: [fields.role, fields.goal, fields.benefit, fields.criteria, input.projectId, seq],
    extension: true,
  };
  return createItem({ projectId: input.projectId, kind: 'story', title: input.title, description: input.description, extensionOps: [detailsOp] });
}

export interface StoryChanges {
  title?: string;
  description?: string;
  fields?: Partial<StoryFields>;
}

/**
 * Modifie le titre, la description et les champs propres. Une seule ligne de journal (« updated »), qui ne nomme que les champs modifiés, jamais leur contenu.
 * Retourne false, sans rien écrire, si rien ne change.
 */
export async function updateStory(id: number, changes: StoryChanges): Promise<boolean> {
  const cur = await getStory(id);
  if (!cur) throw new Error('La user story n\'existe pas.');
  const title = changes.title !== undefined ? normalizeTitle(changes.title) : cur.title;
  const description = changes.description !== undefined ? normalizeDescription(changes.description) : cur.description;
  const before = normalizeStoryFields({ role: cur.role, goal: cur.goal, benefit: cur.benefit, criteria: cur.criteria });
  const after = normalizeStoryFields({ ...before, ...(changes.fields ?? {}) });

  const names: string[] = [];
  if (title !== cur.title) names.push('title');
  if (description !== cur.description) names.push('description');
  const detailNames = changedStoryFields(before, after);
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
      sql: 'UPDATE story_details SET role = ?, goal = ?, benefit = ?, criteria = ? WHERE item_id = ?',
      params: [after.role, after.goal, after.benefit, after.criteria, id],
      extension: true,
    });
  }
  await mutate(ops);
  return true;
}
