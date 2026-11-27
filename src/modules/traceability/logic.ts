// Logique pure de l'écran « Traçabilité » (lot M6) : onglets, filtre, libellés, textes. Sans base ni React.
import type { MatrixRow, TraceResult } from '../../domain/traceability.ts';

export const TABS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'matrix', label: 'Matrice' },
  { value: 'orphans', label: 'Orphelins' },
];

export const MATRIX_FILTERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'all', label: 'Toutes les exigences' },
  { value: 'must', label: 'Indispensable (Must) seulement' },
];

export const RESULT_LABELS: Record<TraceResult, string> = {
  failed: 'Échoué',
  blocked: 'Bloqué',
  to_run: 'À exécuter',
  passed: 'Réussi',
  none: 'Aucun test',
};

export const resultLabel = (r: string): string => (r in RESULT_LABELS ? RESULT_LABELS[r as TraceResult] : `Inconnu (${r})`);

export function filterMatrix(rows: readonly MatrixRow[], filter: string): MatrixRow[] {
  return filter === 'must' ? rows.filter((r) => r.priority === 'must') : [...rows];
}

export function emptyMatrixMessage(total: number, filter: string): string {
  if (total === 0) return 'Aucune exigence active dans ce projet : la matrice est vide.';
  return filter === 'must' ? `Aucune exigence Indispensable (Must) active : ${total} exigence${total > 1 ? 's' : ''} au total.` : 'Aucune exigence à afficher.';
}

// Repris de src/domain/trace-labels.ts (lot F3) : les écrans Traçabilité et Accueil partagent les mêmes libellés.
export { ORPHAN_GROUPS, ignoredText, orphanCount, ratioText, summaryLines } from '../../domain/trace-labels.ts';
export type { OrphanGroup, SummaryLine } from '../../domain/trace-labels.ts';
