// Mémoire de l'interface (lot M3a, décision D34) : le dernier projet actif.
// Il est gardé dans la table technique « meta » : aucune ligne de journal, donc aucune sauvegarde automatique déclenchée par un simple changement de projet.
// La valeur peut être périmée (projet supprimé, ancienne sauvegarde restaurée) : elle est donc toujours revérifiée à la lecture.
import { query, queryOne } from '../db.ts';
import { mutate } from '../mutate.ts';

export const META_LAST_PROJECT = 'ui_last_project';

export async function getLastProjectId(): Promise<number | null> {
  const rows = await query<{ value: string }>('SELECT value FROM meta WHERE key = ?', [META_LAST_PROJECT]);
  if (rows.length === 0) return null;
  const id = Number(rows[0].value);
  if (!Number.isInteger(id) || id < 1) return null;
  const p = await queryOne<{ id: number }>("SELECT id FROM projects WHERE id = ? AND kind = 'project'", [id]);
  return p ? p.id : null;
}

export async function setLastProjectId(id: number | null): Promise<void> {
  await mutate([
    {
      sql: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      params: [META_LAST_PROJECT, id === null ? '' : String(id)],
    },
  ]);
}
