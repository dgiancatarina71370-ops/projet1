// Lot M6 : traçabilité calculée (décisions D70 à D78). Fonction pure, lecteur en lecture seule, ouverture de fiche (D76).
// Les écrans sont dans ui-m6.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDb } from './helpers/setup.ts';
import { query } from '../src/data/db.ts';
import { createProject } from '../src/data/repositories/projects.ts';
import { changeItemStatus, createItem } from '../src/data/repositories/items.ts';
import { createStakeholder } from '../src/data/repositories/stakeholders.ts';
import { createRequirement } from '../src/data/repositories/requirements.ts';
import { createStory } from '../src/data/repositories/stories.ts';
import { createTestCase } from '../src/data/repositories/testcases.ts';
import { createDecision } from '../src/data/repositories/decisions.ts';
import { createLink } from '../src/data/repositories/links.ts';
import { getTraceability, loadTraceInput } from '../src/data/repositories/traceability.ts';
import { aggregateResult, computeTraceability, priorityRank } from '../src/domain/traceability.ts';
import type { TraceItem, TraceLink } from '../src/domain/traceability.ts';
import { shouldOpen } from '../src/shared/open-request.ts';
import { KINDS } from '../src/domain/kinds.ts';
import { SCREENS, screenForKind } from '../src/app/navigation.ts';

const it = (id: number, kind: TraceItem['kind'], code: string, status: string, extra: Partial<TraceItem> = {}): TraceItem => ({ id, kind, code, title: `T ${code}`, status, ...extra });
const ln = (type: string, fromId: number, toId: number): TraceLink => ({ type, fromId, toId });
const codes = (list: Array<{ code: string }>): string[] => list.map((x) => x.code);

// Jeu de référence : chaque cas de la chaîne apparaît au moins une fois.
const ITEMS: TraceItem[] = [
  it(1, 'stakeholder', 'PP-001', 'active'),
  it(2, 'stakeholder', 'PP-002', 'active'),
  it(3, 'need', 'BES-001', 'validated'),
  it(4, 'need', 'BES-002', 'draft'),
  it(5, 'requirement', 'EX-001', 'draft', { priority: 'must' }),
  it(6, 'requirement', 'EX-002', 'draft', { priority: 'should' }),
  it(7, 'requirement', 'EX-003', 'validated', { priority: 'must' }),
  it(8, 'story', 'US-001', 'ready'),
  it(9, 'story', 'US-002', 'draft'),
  it(10, 'story', 'US-003', 'draft'),
  it(11, 'test', 'TEST-001', 'passed', { lastRunOn: '2026-11-20' }),
  it(12, 'test', 'TEST-002', 'failed', { lastRunOn: '2026-11-25' }),
  it(13, 'test', 'TEST-003', 'passed'),
  it(14, 'test', 'TEST-004', 'to_run'),
  it(15, 'test', 'TEST-005', 'archived'),
  it(16, 'decision', 'DEC-001', 'decided'),
];
const LINKS: TraceLink[] = [
  ln('expresses', 1, 3), ln('derives', 3, 5), ln('implements', 8, 5), ln('implements', 9, 6),
  ln('verifies', 11, 5), ln('verifies', 12, 8), ln('verifies', 13, 5), ln('verifies', 13, 8), ln('verifies', 15, 6),
  ln('concerns', 16, 5),
];

// ------------------------------------------------------------------ fonction pure

test('résultat agrégé : le pire des tests (Échoué, Bloqué, À exécuter, Réussi), aucun test, statut inattendu (D72)', () => {
  assert.equal(aggregateResult([]), 'none');
  assert.equal(aggregateResult(['passed', 'passed']), 'passed');
  assert.equal(aggregateResult(['passed', 'to_run']), 'to_run');
  assert.equal(aggregateResult(['passed', 'to_run', 'blocked']), 'blocked');
  assert.equal(aggregateResult(['blocked', 'to_run', 'passed', 'failed']), 'failed');
  assert.equal(aggregateResult(['zzz']), 'to_run', 'un statut inconnu ne fait jamais croire à « Réussi »');
  assert.equal(aggregateResult(['passed', 'zzz']), 'to_run');
});

test('matrice : une ligne par exigence active, besoins, stories, tests directs et via story, résultat, tri MoSCoW puis code (D74)', () => {
  const t = computeTraceability(ITEMS, LINKS);
  assert.deepEqual(codes(t.matrix), ['EX-001', 'EX-003', 'EX-002'], 'Must d\'abord, puis Should');
  const [e1, e3, e2] = t.matrix;
  assert.deepEqual(codes(e1.needs), ['BES-001']);
  assert.deepEqual(codes(e1.stories), ['US-001']);
  assert.deepEqual(codes(e1.directTests), ['TEST-001', 'TEST-003']);
  assert.deepEqual(codes(e1.viaStoryTests), ['TEST-002'], 'TEST-003 vérifie aussi la story mais reste « direct » : pas de doublon');
  assert.equal(e1.result, 'failed');
  assert.deepEqual({ n: e2.needs.length, s: codes(e2.stories), d: e2.directTests.length, v: e2.viaStoryTests.length, r: e2.result }, { n: 0, s: ['US-002'], d: 0, v: 0, r: 'none' }, 'le test archivé ne couvre rien');
  assert.deepEqual({ n: e3.needs.length, s: e3.stories.length, r: e3.result, p: e3.priority }, { n: 0, s: 0, r: 'none', p: 'must' });
  assert.equal(e1.directTests[0].lastRunOn, '2026-11-20', 'la date d\'exécution est transmise');
});

test('couverture : ratios « x sur y » calculés sur les éléments actifs, Must testées (D72)', () => {
  const s = computeTraceability(ITEMS, LINKS).summary;
  assert.deepEqual(s.stakeholdersWithNeed, { covered: 1, total: 2 });
  assert.deepEqual(s.needsWithRequirement, { covered: 1, total: 2 });
  assert.deepEqual(s.requirementsWithStory, { covered: 2, total: 3 });
  assert.deepEqual(s.requirementsTested, { covered: 1, total: 3 });
  assert.deepEqual(s.requirementsPassed, { covered: 0, total: 3 });
  assert.deepEqual(s.mustTested, { covered: 1, total: 2 });
});

test('orphelins : sept listes, chacune avec ses éléments, décisions hors chaîne (D71, D75)', () => {
  const o = computeTraceability(ITEMS, LINKS).orphans;
  assert.deepEqual(codes(o.stakeholdersWithoutNeed), ['PP-002']);
  assert.deepEqual(codes(o.needsWithoutRequirement), ['BES-002']);
  assert.deepEqual(codes(o.requirementsWithoutStory), ['EX-003']);
  assert.deepEqual(codes(o.requirementsWithoutTest), ['EX-002', 'EX-003']);
  assert.deepEqual(codes(o.storiesWithoutRequirement), ['US-003']);
  assert.deepEqual(codes(o.storiesWithoutTest), ['US-002', 'US-003']);
  assert.deepEqual(codes(o.testsWithoutTarget), ['TEST-004']);
});

test('éléments archivés ou rejetés : ignorés, comptés à part, jamais couvrants (D73)', () => {
  const t = computeTraceability(ITEMS, LINKS);
  assert.equal(t.ignored, 1, 'TEST-005 archivé ; la décision n\'est pas dans la chaîne et ne compte pas');
  // Une story archivée ne couvre plus son exigence ; un besoin rejeté disparaît des deux côtés.
  const items = ITEMS.map((i) => (i.id === 8 ? { ...i, status: 'archived' } : i.id === 3 ? { ...i, status: 'rejected' } : i));
  const t2 = computeTraceability(items, LINKS);
  assert.equal(t2.ignored, 3);
  const e1 = t2.matrix.find((r) => r.code === 'EX-001');
  assert.deepEqual(codes(e1?.stories ?? []), []);
  assert.deepEqual(codes(e1?.needs ?? []), []);
  assert.deepEqual(codes(e1?.viaStoryTests ?? []), [], 'le test qui vérifie une story archivée n\'est plus « via story »');
  assert.ok(codes(t2.orphans.testsWithoutTarget).includes('TEST-002'), 'ce test n\'a plus de cible active');
  assert.deepEqual(t2.summary.needsWithRequirement, { covered: 0, total: 1 }, 'BES-001 rejeté ne compte plus au dénominateur');
  assert.deepEqual(t2.summary.stakeholdersWithNeed, { covered: 0, total: 2 }, 'PP-001 n\'exprime plus de besoin actif');
});

test('liens hors chaîne ou de mauvais type : ignorés', () => {
  const bad: TraceLink[] = [ln('derives', 5, 3), ln('implements', 5, 8), ln('verifies', 8, 5), ln('expresses', 3, 1), ln('inconnu', 1, 3), ln('derives', 3, 999), ln('expresses', 1, 5)];
  const t = computeTraceability(ITEMS, bad);
  assert.equal(t.matrix.every((r) => r.needs.length + r.stories.length + r.directTests.length + r.viaStoryTests.length === 0), true);
  assert.equal(t.orphans.stakeholdersWithoutNeed.length, 2);
});

test('exigence testée uniquement via une story : comptée comme testée, ni direct ni orpheline de test (D72)', () => {
  const items = [it(1, 'requirement', 'EX-001', 'draft', { priority: 'must' }), it(2, 'story', 'US-001', 'ready'), it(3, 'test', 'TEST-001', 'passed')];
  const t = computeTraceability(items, [ln('implements', 2, 1), ln('verifies', 3, 2)]);
  assert.deepEqual({ d: t.matrix[0].directTests.length, v: codes(t.matrix[0].viaStoryTests), r: t.matrix[0].result }, { d: 0, v: ['TEST-001'], r: 'passed' });
  assert.deepEqual(t.summary.requirementsTested, { covered: 1, total: 1 });
  assert.deepEqual(t.summary.mustTested, { covered: 1, total: 1 });
  assert.deepEqual(t.summary.requirementsPassed, { covered: 1, total: 1 });
  assert.equal(t.orphans.requirementsWithoutTest.length, 0);
  assert.equal(t.orphans.storiesWithoutTest.length, 0);
  assert.equal(t.orphans.testsWithoutTarget.length, 0);
});

test('cas limites : projet vide, liens en double, priorité inconnue, tri stable par code', () => {
  const empty = computeTraceability([], []);
  assert.deepEqual(empty.matrix, []);
  assert.deepEqual(empty.summary.requirementsTested, { covered: 0, total: 0 });
  assert.equal(empty.ignored, 0);
  const doubled = computeTraceability(ITEMS, [...LINKS, ...LINKS]);
  assert.deepEqual(codes(doubled.matrix[0].directTests), ['TEST-001', 'TEST-003'], 'un lien en double ne double pas la cellule');
  const odd = computeTraceability([it(1, 'requirement', 'EX-002', 'draft', { priority: 'zzz' }), it(2, 'requirement', 'EX-001', 'draft', { priority: 'wont' }), it(3, 'requirement', 'EX-003', 'draft', { priority: 'could' })], []);
  assert.deepEqual(codes(odd.matrix), ['EX-003', 'EX-001', 'EX-002'], 'could, wont, puis priorité inconnue en dernier');
  assert.deepEqual([priorityRank('must'), priorityRank('should'), priorityRank('could'), priorityRank('wont'), priorityRank('')], [0, 1, 2, 3, 4]);
  const same = computeTraceability([it(1, 'requirement', 'EX-002', 'draft', { priority: 'must' }), it(2, 'requirement', 'EX-001', 'draft', { priority: 'must' })], []);
  assert.deepEqual(codes(same.matrix), ['EX-001', 'EX-002']);
});

test('cohérence : couverts + non couverts = total, pour chaque ratio et chaque liste', () => {
  const t = computeTraceability(ITEMS, LINKS);
  assert.equal(t.summary.stakeholdersWithNeed.total - t.summary.stakeholdersWithNeed.covered, t.orphans.stakeholdersWithoutNeed.length);
  assert.equal(t.summary.needsWithRequirement.total - t.summary.needsWithRequirement.covered, t.orphans.needsWithoutRequirement.length);
  assert.equal(t.summary.requirementsWithStory.total - t.summary.requirementsWithStory.covered, t.orphans.requirementsWithoutStory.length);
  assert.equal(t.summary.requirementsTested.total - t.summary.requirementsTested.covered, t.orphans.requirementsWithoutTest.length);
  assert.equal(t.summary.requirementsWithStory.total, t.matrix.length);
});

test('fonction pure : les entrées ne sont pas modifiées', () => {
  const items = JSON.stringify(ITEMS);
  const links = JSON.stringify(LINKS);
  computeTraceability(ITEMS, LINKS);
  assert.equal(JSON.stringify(ITEMS), items);
  assert.equal(JSON.stringify(LINKS), links);
});

// ------------------------------------------------------------------ lecteur (base)

async function chain() {
  const p = await createProject('P');
  const sh = await createStakeholder({ projectId: p, title: 'Direction' });
  const need = await createItem({ projectId: p, kind: 'need', title: 'Besoin' });
  const ex = await createRequirement({ projectId: p, title: 'Exigence', priority: 'must' });
  const us = await createStory({ projectId: p, title: 'Story' });
  const direct = await createTestCase({ projectId: p, title: 'Direct', lastRunOn: '2026-11-25' });
  const via = await createTestCase({ projectId: p, title: 'Via' });
  await createLink({ type: 'expresses', fromId: sh.id, toId: need.id });
  await createLink({ type: 'derives', fromId: need.id, toId: ex.id });
  await createLink({ type: 'implements', fromId: us.id, toId: ex.id });
  await createLink({ type: 'verifies', fromId: direct.id, toId: ex.id });
  await createLink({ type: 'verifies', fromId: via.id, toId: us.id });
  return { p, sh, need, ex, us, direct, via };
}

test('lecteur : charge les éléments de la chaîne avec priorité et date d\'exécution, et seulement ceux du projet (D77)', async () => {
  const t = await migratedDb();
  const w = await chain();
  const other = await createProject('Autre');
  await createRequirement({ projectId: other, title: 'Ailleurs' });
  await createDecision({ projectId: w.p, title: 'Hors chaîne' });
  const input = await loadTraceInput(w.p);
  assert.deepEqual(input.items.map((i) => i.code), ['PP-001', 'BES-001', 'EX-001', 'US-001', 'TEST-001', 'TEST-002'], 'ni la décision, ni l\'autre projet');
  assert.equal(input.items.find((i) => i.code === 'EX-001')?.priority, 'must');
  assert.equal(input.items.find((i) => i.code === 'TEST-001')?.lastRunOn, '2026-11-25');
  assert.equal(input.items.find((i) => i.code === 'US-001')?.priority, undefined);
  assert.equal(input.links.length, 5);
  t.close();
});

test('lecteur : la chaîne complète donne la matrice attendue, et la modification d\'un statut ou d\'un lien se reflète au rappel', async () => {
  const t = await migratedDb();
  const w = await chain();
  let tr = await getTraceability(w.p);
  assert.equal(tr.matrix.length, 1);
  assert.deepEqual({ n: codes(tr.matrix[0].needs), s: codes(tr.matrix[0].stories), d: codes(tr.matrix[0].directTests), v: codes(tr.matrix[0].viaStoryTests), r: tr.matrix[0].result }, { n: ['BES-001'], s: ['US-001'], d: ['TEST-001'], v: ['TEST-002'], r: 'to_run' });
  assert.deepEqual(tr.summary.requirementsTested, { covered: 1, total: 1 });
  await changeItemStatus(w.direct.id, 'passed');
  await changeItemStatus(w.via.id, 'failed');
  tr = await getTraceability(w.p);
  assert.equal(tr.matrix[0].result, 'failed');
  await changeItemStatus(w.via.id, 'archived');
  tr = await getTraceability(w.p);
  assert.equal(tr.matrix[0].result, 'passed', 'le test archivé n\'entre plus dans le résultat');
  assert.equal(tr.ignored, 1);
  t.close();
});

test('lecteur : lecture seule, aucune écriture ni ligne de journal, une base cohérente reste cohérente', async () => {
  const t = await migratedDb();
  const w = await chain();
  const dump = async () => JSON.stringify([await query('SELECT * FROM items ORDER BY id'), await query('SELECT * FROM links ORDER BY id'), await query('SELECT * FROM activity_log ORDER BY id'), await query('SELECT * FROM sequences ORDER BY name'), await query('SELECT key, value FROM meta ORDER BY key')]);
  const before = await dump();
  await getTraceability(w.p);
  await getTraceability(w.p);
  assert.equal(await dump(), before);
  t.close();
});

test('lecteur : un projet vide ou inexistant donne un résultat vide, sans erreur', async () => {
  const t = await migratedDb();
  const p = await createProject('Vide');
  const empty = await getTraceability(p);
  assert.deepEqual([empty.matrix.length, empty.ignored, empty.summary.mustTested.total], [0, 0, 0]);
  assert.equal((await getTraceability(99999)).matrix.length, 0);
  t.close();
});

// ------------------------------------------------------------------ ouverture de fiche (D76)

test('ouverture de fiche : la demande n\'est traitée que si l\'élément est dans la liste chargée', () => {
  assert.equal(shouldOpen(5, [1, 5, 9]), true);
  assert.equal(shouldOpen(5, []), false, 'liste pas encore chargée : on attend');
  assert.equal(shouldOpen(5, [1, 9]), false, 'élément absent (supprimé ou autre projet) : pas d\'ouverture');
  assert.equal(shouldOpen(null, [1, 5]), false);
  assert.equal(shouldOpen(undefined, [1, 5]), false);
  assert.equal(shouldOpen(0, [0]), true, 'un identifiant 0 reste un identifiant');
});

test('ouverture de fiche : chaque type d\'élément mène à son propre écran de registre', () => {
  const targets = KINDS.map((k) => screenForKind(k.kind));
  assert.deepEqual(targets, ['stakeholders', 'needs', 'requirements', 'decisions', 'risks', 'stories', 'tests']);
  assert.equal(new Set(targets).size, KINDS.length, 'un écran par type');
  for (const s of targets) assert.ok(SCREENS.some((x) => x.id === s), `${s} est un écran du menu`);
});
