// Traçabilité calculée (lot M6, décisions D70 à D78). Fonction pure : elle reçoit les éléments et les liens d'un projet et ne lit ni n'écrit rien.
// Chaîne de référence (D71) : Partie prenante —exprime→ Besoin —dérive en→ Exigence ←implémente— User story ←vérifie— Test,
// un Test pouvant aussi vérifier une Exigence directement. Les liens de décisions et de risques sont hors chaîne.
import type { ItemKind } from './kinds.ts';

export interface TraceItem {
  id: number;
  kind: ItemKind;
  code: string;
  title: string;
  status: string;
  /** Priorité MoSCoW (exigences seulement). */
  priority?: string;
  /** Date de dernière exécution AAAA-MM-JJ (tests seulement, chaîne vide si absente). */
  lastRunOn?: string;
}

export interface TraceLink {
  type: string;
  fromId: number;
  toId: number;
}

export interface TraceRef {
  id: number;
  kind: ItemKind;
  code: string;
  title: string;
  status: string;
  lastRunOn?: string;
}

/** Types d'éléments qui font partie de la chaîne (D71). */
export const CHAIN_KINDS: readonly ItemKind[] = ['stakeholder', 'need', 'requirement', 'story', 'test'];

/** Statuts exclus du calcul (D73) : ils ne couvrent rien et n'ont rien à couvrir. */
export const IGNORED_STATUSES: readonly string[] = ['archived', 'rejected'];

export const isIgnoredStatus = (status: string): boolean => IGNORED_STATUSES.includes(status);

/** Résultat agrégé d'une exigence : le pire des tests, dans l'ordre Échoué, Bloqué, À exécuter, Réussi (D72). « none » : aucun test. */
export type TraceResult = 'failed' | 'blocked' | 'to_run' | 'passed' | 'none';

export function aggregateResult(testStatuses: readonly string[]): TraceResult {
  if (testStatuses.length === 0) return 'none';
  if (testStatuses.includes('failed')) return 'failed';
  if (testStatuses.includes('blocked')) return 'blocked';
  // « Réussi » seulement si tous les tests le sont : un statut inattendu en base rend le résultat « À exécuter », jamais « Réussi ».
  return testStatuses.every((s) => s === 'passed') ? 'passed' : 'to_run';
}

export interface MatrixRow {
  id: number;
  code: string;
  title: string;
  status: string;
  priority: string;
  needs: TraceRef[];
  stories: TraceRef[];
  directTests: TraceRef[];
  /** Tests qui vérifient une user story implémentant l'exigence, sans la vérifier directement. */
  viaStoryTests: TraceRef[];
  result: TraceResult;
}

export interface Ratio {
  covered: number;
  total: number;
}

export interface Summary {
  stakeholdersWithNeed: Ratio;
  needsWithRequirement: Ratio;
  requirementsWithStory: Ratio;
  requirementsTested: Ratio;
  requirementsPassed: Ratio;
  /** Exigences « Indispensable (Must) » (actives) et parmi elles celles qui ont au moins un test. */
  mustTested: Ratio;
}

export interface Orphans {
  stakeholdersWithoutNeed: TraceRef[];
  needsWithoutRequirement: TraceRef[];
  requirementsWithoutStory: TraceRef[];
  requirementsWithoutTest: TraceRef[];
  storiesWithoutRequirement: TraceRef[];
  storiesWithoutTest: TraceRef[];
  testsWithoutTarget: TraceRef[];
}

export interface Traceability {
  /** Éléments de la chaîne archivés ou rejetés, laissés de côté (D73). */
  ignored: number;
  summary: Summary;
  matrix: MatrixRow[];
  orphans: Orphans;
}

/** Ordre MoSCoW du tri de la matrice (D74) : Must d'abord ; une priorité inconnue vient en dernier. */
const PRIORITY_RANK: Record<string, number> = { must: 0, should: 1, could: 2, wont: 3 };
export const priorityRank = (priority: string): number => PRIORITY_RANK[priority] ?? 4;

const ref = (it: TraceItem): TraceRef => {
  const r: TraceRef = { id: it.id, kind: it.kind, code: it.code, title: it.title, status: it.status };
  if (it.lastRunOn !== undefined) r.lastRunOn = it.lastRunOn;
  return r;
};

const byCode = (a: { code: string; id: number }, b: { code: string; id: number }): number => (a.code < b.code ? -1 : a.code > b.code ? 1 : a.id - b.id);

const ratio = (covered: number, total: number): Ratio => ({ covered, total });

export function computeTraceability(items: readonly TraceItem[], links: readonly TraceLink[]): Traceability {
  const chain = items.filter((i) => CHAIN_KINDS.includes(i.kind));
  const active = chain.filter((i) => !isIgnoredStatus(i.status));
  const ignored = chain.length - active.length;
  const byId = new Map<number, TraceItem>(active.map((i) => [i.id, i]));
  const ofKind = (kind: ItemKind): TraceItem[] => active.filter((i) => i.kind === kind).sort(byCode);

  // Liens retenus : un type reconnu de la chaîne, dont les deux extrémités sont actives et du type attendu.
  const kindOf = (id: number): ItemKind | undefined => byId.get(id)?.kind;
  const pick = (type: string, from: ItemKind, to: readonly ItemKind[]): TraceLink[] =>
    links.filter((l) => {
      if (l.type !== type) return false;
      const f = kindOf(l.fromId);
      const t = kindOf(l.toId);
      return f === from && t !== undefined && to.includes(t);
    });
  const expresses = pick('expresses', 'stakeholder', ['need']);
  const derives = pick('derives', 'need', ['requirement']);
  const implementsL = pick('implements', 'story', ['requirement']);
  const verifies = pick('verifies', 'test', ['requirement', 'story']);

  const items_ = (ids: Iterable<number>): TraceRef[] => [...new Set(ids)].map((id) => byId.get(id) as TraceItem).map(ref).sort(byCode);

  const needsOf = (reqId: number) => items_(derives.filter((l) => l.toId === reqId).map((l) => l.fromId));
  const storiesOf = (reqId: number) => items_(implementsL.filter((l) => l.toId === reqId).map((l) => l.fromId));
  const directTestsOf = (reqId: number) => items_(verifies.filter((l) => l.toId === reqId).map((l) => l.fromId));

  const matrix: MatrixRow[] = ofKind('requirement').map((req) => {
    const stories = storiesOf(req.id);
    const direct = directTestsOf(req.id);
    const directIds = new Set(direct.map((t) => t.id));
    const storyIds = new Set(stories.map((s) => s.id));
    // Un test qui vérifie à la fois l'exigence et une de ses stories reste « direct » (pas de doublon).
    const via = items_(verifies.filter((l) => storyIds.has(l.toId) && !directIds.has(l.fromId)).map((l) => l.fromId));
    return {
      id: req.id,
      code: req.code,
      title: req.title,
      status: req.status,
      priority: req.priority ?? '',
      needs: needsOf(req.id),
      stories,
      directTests: direct,
      viaStoryTests: via,
      result: aggregateResult([...direct, ...via].map((t) => t.status)),
    };
  });
  matrix.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || byCode(a, b));

  const hasTest = (r: MatrixRow): boolean => r.directTests.length + r.viaStoryTests.length > 0;
  const stakeholders = ofKind('stakeholder');
  const needs = ofKind('need');
  const stories = ofKind('story');
  const tests = ofKind('test');

  const expressingIds = new Set(expresses.map((l) => l.fromId));
  const derivedNeedIds = new Set(derives.map((l) => l.fromId));
  const implementingIds = new Set(implementsL.map((l) => l.fromId));
  const verifiedStoryIds = new Set(verifies.filter((l) => kindOf(l.toId) === 'story').map((l) => l.toId));
  const verifyingTestIds = new Set(verifies.map((l) => l.fromId));
  const reqByCode = (pred: (r: MatrixRow) => boolean): TraceRef[] => matrix.filter(pred).map((r) => ref(byId.get(r.id) as TraceItem)).sort(byCode);

  const must = matrix.filter((r) => r.priority === 'must');
  const orphans: Orphans = {
    stakeholdersWithoutNeed: stakeholders.filter((s) => !expressingIds.has(s.id)).map(ref),
    needsWithoutRequirement: needs.filter((n) => !derivedNeedIds.has(n.id)).map(ref),
    requirementsWithoutStory: reqByCode((r) => r.stories.length === 0),
    requirementsWithoutTest: reqByCode((r) => !hasTest(r)),
    storiesWithoutRequirement: stories.filter((s) => !implementingIds.has(s.id)).map(ref),
    storiesWithoutTest: stories.filter((s) => !verifiedStoryIds.has(s.id)).map(ref),
    testsWithoutTarget: tests.filter((t) => !verifyingTestIds.has(t.id)).map(ref),
  };

  const summary: Summary = {
    stakeholdersWithNeed: ratio(stakeholders.length - orphans.stakeholdersWithoutNeed.length, stakeholders.length),
    needsWithRequirement: ratio(needs.length - orphans.needsWithoutRequirement.length, needs.length),
    requirementsWithStory: ratio(matrix.length - orphans.requirementsWithoutStory.length, matrix.length),
    requirementsTested: ratio(matrix.filter(hasTest).length, matrix.length),
    requirementsPassed: ratio(matrix.filter((r) => r.result === 'passed').length, matrix.length),
    mustTested: ratio(must.filter(hasTest).length, must.length),
  };

  return { ignored, summary, matrix, orphans };
}
