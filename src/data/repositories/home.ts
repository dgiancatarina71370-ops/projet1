// Lectures de l'écran « Accueil » (lot F3, décisions F3-D05 à F3-D08). Lecture seule : ni mutate(), ni écriture, ni journal.
// La couverture et les orphelins viennent de getTraceability (traceability.ts) : un seul calcul pour toute l'application.
import { query } from '../db.ts';
import type { Row } from '../db.ts';

/** Types qui ont réellement un statut « Brouillon » (F3-D05) : les autres types n'en ont pas et ne sont pas comptés. */
export const DRAFT_KINDS: readonly string[] = ['need', 'requirement', 'story'];

export type DraftCounts = Record<'need' | 'requirement' | 'story', number>;

interface CountRow extends Row {
  kind: string;
  n: number;
}

/** Nombre d'éléments au statut « draft » du projet, par type (zéro affiché pour un type sans brouillon). */
export async function countDrafts(projectId: number): Promise<DraftCounts> {
  const marks = DRAFT_KINDS.map(() => '?').join(', ');
  const rows = await query<CountRow>(
    `SELECT kind, count(*) AS n FROM items WHERE project_id = ? AND status = 'draft' AND kind IN (${marks}) GROUP BY kind`,
    [projectId, ...DRAFT_KINDS],
  );
  const counts: DraftCounts = { need: 0, requirement: 0, story: 0 };
  for (const r of rows) counts[r.kind as keyof DraftCounts] = Number(r.n);
  return counts;
}

export interface ProjectActivity extends Row {
  id: number;
  at: string;
  action: string;
  /** Texte technique du journal : « statut avant>après », liste de champs, ou type pour une suppression. */
  detail: string | null;
  object_id: number | null;
  /** Renseignés tant que l'élément existe ; nuls pour un élément supprimé (le journal ne garde ni code ni titre). */
  kind: string | null;
  code: string | null;
  title: string | null;
}

export const HOME_ACTIVITY_LIMIT = 10;

/**
 * Dernières modifications d'éléments du projet (F3-D06) : le journal filtré sur le projet et sur les éléments
 * (pas les liens ni les documents), le plus récent d'abord. Le code et le titre viennent de « items » (jointure externe).
 */
export async function recentProjectActivity(projectId: number, limit = HOME_ACTIVITY_LIMIT): Promise<ProjectActivity[]> {
  return query<ProjectActivity>(
    `SELECT a.id, a.at, a.action, a.detail, a.object_id, i.kind AS kind, i.code AS code, i.title AS title
FROM activity_log a
LEFT JOIN items i ON i.id = a.object_id AND a.action <> 'deleted'
WHERE a.project_id = ? AND a.object_type = 'item'
ORDER BY a.id DESC LIMIT ?`,
    [projectId, limit],
  );
}
