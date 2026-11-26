// Logique pure de l'écran « Traçabilité » (lot M6) : onglets, filtre, libellés, textes. Sans base ni React.
import type { MatrixRow, Orphans, Ratio, Summary, TraceResult } from '../../domain/traceability.ts';

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

/** « 3 sur 5 » ; « — » quand il n'y a rien à couvrir (un ratio sur zéro n'a pas de sens). */
export function ratioText(r: Ratio): string {
  return r.total === 0 ? '—' : `${r.covered} sur ${r.total}`;
}

export interface SummaryLine {
  key: keyof Summary;
  label: string;
  ratio: Ratio;
}

/** Lignes du bandeau de couverture, dans l'ordre de la chaîne (D72). */
export function summaryLines(s: Summary): SummaryLine[] {
  return [
    { key: 'stakeholdersWithNeed', label: 'Parties prenantes avec un besoin', ratio: s.stakeholdersWithNeed },
    { key: 'needsWithRequirement', label: 'Besoins avec une exigence', ratio: s.needsWithRequirement },
    { key: 'requirementsWithStory', label: 'Exigences avec une user story', ratio: s.requirementsWithStory },
    { key: 'requirementsTested', label: 'Exigences testées', ratio: s.requirementsTested },
    { key: 'requirementsPassed', label: 'Exigences dont le résultat est Réussi', ratio: s.requirementsPassed },
    { key: 'mustTested', label: 'Exigences Indispensable (Must) testées', ratio: s.mustTested },
  ];
}

/** Phrase du bandeau pour les éléments laissés de côté (D73) ; vide s'il n'y en a aucun. */
export function ignoredText(n: number): string {
  if (n <= 0) return '';
  return n === 1 ? '1 élément archivé ou rejeté ignoré dans le calcul.' : `${n} éléments archivés ou rejetés ignorés dans le calcul.`;
}

export function filterMatrix(rows: readonly MatrixRow[], filter: string): MatrixRow[] {
  return filter === 'must' ? rows.filter((r) => r.priority === 'must') : [...rows];
}

export function emptyMatrixMessage(total: number, filter: string): string {
  if (total === 0) return 'Aucune exigence active dans ce projet : la matrice est vide.';
  return filter === 'must' ? `Aucune exigence Indispensable (Must) active : ${total} exigence${total > 1 ? 's' : ''} au total.` : 'Aucune exigence à afficher.';
}

export interface OrphanGroup {
  key: keyof Orphans;
  label: string;
}

/** Listes d'orphelins, dans l'ordre de la chaîne (D75). */
export const ORPHAN_GROUPS: readonly OrphanGroup[] = [
  { key: 'stakeholdersWithoutNeed', label: 'Parties prenantes sans besoin' },
  { key: 'needsWithoutRequirement', label: 'Besoins sans exigence' },
  { key: 'requirementsWithoutStory', label: 'Exigences sans user story' },
  { key: 'requirementsWithoutTest', label: 'Exigences sans test' },
  { key: 'storiesWithoutRequirement', label: 'User stories sans exigence' },
  { key: 'storiesWithoutTest', label: 'User stories sans test' },
  { key: 'testsWithoutTarget', label: 'Tests qui ne vérifient rien' },
];

export function orphanCount(o: Orphans): number {
  return ORPHAN_GROUPS.reduce((n, g) => n + o[g.key].length, 0);
}
