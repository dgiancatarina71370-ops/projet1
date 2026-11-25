// Dépôt des projets : exemple de dépôt conforme. Il ne lit que par query() et n'écrit que par mutate().
import { query, queryOne } from '../db.ts';
import type { Row } from '../db.ts';
import { mutate } from '../mutate.ts';
import type { WriteOp } from '../mutate.ts';

export type ProjectKind = 'project' | 'folder' | 'archive';

export interface Project extends Row {
  id: number;
  parent_id: number | null;
  kind: ProjectKind;
  name: string;
  created_at: string;
  updated_at: string;
}

const nowIso = (): string => new Date().toISOString();

export async function listProjects(): Promise<Project[]> {
  return query<Project>('SELECT id, parent_id, kind, name, created_at, updated_at FROM projects ORDER BY id');
}

export async function getProject(id: number): Promise<Project | null> {
  return queryOne<Project>('SELECT id, parent_id, kind, name, created_at, updated_at FROM projects WHERE id = ?', [id]);
}

export async function createProject(name: string, kind: ProjectKind = 'project', parentId: number | null = null): Promise<number> {
  const clean = name.trim();
  if (clean === '') throw new Error('Le nom du projet est obligatoire.');
  if (clean.length > 200) throw new Error('Le nom du projet est limité à 200 caractères.');
  const t = nowIso();
  const [r] = await mutate([
    {
      sql: 'INSERT INTO projects (parent_id, kind, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      params: [parentId, kind, clean, t, t],
      activity: { objectType: kind === 'project' ? 'project' : 'folder', action: 'created', objectId: 'inserted', projectId: kind === 'project' ? 'inserted' : parentId },
    },
  ]);
  return r.lastInsertRowid;
}

export interface DeletionImpact {
  /** Projets, dossiers et archives supprimés, le projet visé compris. */
  projects: number;
  documents: number;
  items: number;
  links: number;
}

/** Ce que supprimerait deleteProject(id), pour l'annoncer avant la confirmation. Ne lit que. */
export async function projectDeletionImpact(id: number): Promise<DeletionImpact> {
  const tree = await query<{ id: number }>(
    `WITH RECURSIVE tree(id) AS (
       SELECT id FROM projects WHERE id = ?
       UNION ALL
       SELECT p.id FROM projects p JOIN tree t ON p.parent_id = t.id
     ) SELECT id FROM tree`,
    [id],
  );
  if (tree.length === 0) return { projects: 0, documents: 0, items: 0, links: 0 };
  const ids = tree.map((r) => r.id);
  const marks = ids.map(() => '?').join(', ');
  const n = async (table: string): Promise<number> =>
    Number((await query<{ n: number }>(`SELECT count(*) AS n FROM ${table} WHERE project_id IN (${marks})`, ids))[0].n);
  return { projects: ids.length, documents: await n('documents'), items: await n('items'), links: await n('links') };
}

/** Renomme un projet ou un dossier (action « updated » du journal, décision D41). Sans effet si le nom ne change pas. */
export async function renameProject(id: number, name: string): Promise<boolean> {
  const clean = name.trim();
  if (clean === '') throw new Error('Le nom du projet est obligatoire.');
  if (clean.length > 200) throw new Error('Le nom du projet est limité à 200 caractères.');
  const cur = await getProject(id);
  if (!cur) throw new Error('Le projet n\'existe pas.');
  if (cur.name === clean) return false;
  await mutate([
    {
      sql: 'UPDATE projects SET name = ?, updated_at = ? WHERE id = ?',
      params: [clean, nowIso(), id],
      activity: { objectType: cur.kind === 'project' ? 'project' : 'folder', action: 'updated', objectId: id, projectId: cur.kind === 'project' ? id : cur.parent_id, detail: 'name' },
    },
  ]);
  return true;
}

/**
 * Supprime un projet et tout ce qu'il contient. Les suppressions en cascade que SQLite fait seul ne laisseraient pas de trace :
 * le dépôt les écrit donc une à une dans le journal, dans la même transaction.
 */
export async function deleteProject(id: number): Promise<void> {
  const tree = await query<{ id: number }>(
    `WITH RECURSIVE tree(id) AS (
       SELECT id FROM projects WHERE id = ?
       UNION ALL
       SELECT p.id FROM projects p JOIN tree t ON p.parent_id = t.id
     ) SELECT id FROM tree`,
    [id],
  );
  if (tree.length === 0) return;
  const ids = tree.map((r) => r.id);
  const marks = ids.map(() => '?').join(', ');
  const docs = await query<{ id: number; project_id: number }>(`SELECT id, project_id FROM documents WHERE project_id IN (${marks})`, ids);

  // Éléments du modèle de domaine (lot M1) : liens d'abord, puis éléments, chacun journalisé. La cascade de la base n'écrirait aucune trace.
  const links = await query<{ id: number; project_id: number; link_type: string }>(
    `SELECT id, project_id, link_type FROM links WHERE project_id IN (${marks}) ORDER BY id`,
    ids,
  );
  const items = await query<{ id: number; project_id: number; kind: string }>(
    `SELECT id, project_id, kind FROM items WHERE project_id IN (${marks}) ORDER BY id`,
    ids,
  );

  const ops: WriteOp[] = [];
  for (const l of links) {
    ops.push({
      sql: 'DELETE FROM links WHERE id = ?',
      params: [l.id],
      activity: { objectType: 'link', action: 'deleted', objectId: l.id, projectId: l.project_id, detail: l.link_type },
    });
  }
  for (const it of items) {
    ops.push({
      sql: 'DELETE FROM items WHERE id = ?',
      params: [it.id],
      activity: { objectType: 'item', action: 'deleted', objectId: it.id, projectId: it.project_id, detail: it.kind },
    });
  }
  for (const d of docs) {
    ops.push({
      sql: 'DELETE FROM documents WHERE id = ?',
      params: [d.id],
      activity: { objectType: 'document', action: 'deleted', objectId: d.id, projectId: d.project_id },
    });
  }
  for (const pid of [...ids].reverse()) {
    ops.push({
      sql: 'DELETE FROM projects WHERE id = ?',
      params: [pid],
      activity: { objectType: pid === id ? 'project' : 'folder', action: 'deleted', objectId: pid, projectId: pid === id ? null : id },
    });
  }
  await mutate(ops);
}

export interface ActivityEntry extends Row {
  id: number;
  at: string;
  object_type: string;
  object_id: number | null;
  action: string;
}

export async function recentActivity(limit = 20): Promise<ActivityEntry[]> {
  return query<ActivityEntry>('SELECT id, at, object_type, object_id, action FROM activity_log ORDER BY id DESC LIMIT ?', [limit]);
}
