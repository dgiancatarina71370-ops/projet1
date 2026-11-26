// Lot M9, étape 2 : cohérence du projet d'exemple (données pures). La création en base est testée à l'étape suivante.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_ITEMS, SAMPLE_LINKS, SAMPLE_PROJECT_NAME } from '../src/domain/sample-project.ts';
import { formatCode } from '../src/domain/codes.ts';
import { KINDS, kindInfo } from '../src/domain/kinds.ts';
import type { ItemKind } from '../src/domain/kinds.ts';
import { isLinkAllowed } from '../src/domain/links.ts';
import { computeTraceability } from '../src/domain/traceability.ts';
import { MAX_TITLE, normalizeFields } from '../src/domain/stakeholders.ts';
import { normalizeRequirementFields } from '../src/domain/requirements.ts';
import { normalizeDecisionFields } from '../src/domain/decisions.ts';
import { normalizeRiskFields } from '../src/domain/risks.ts';
import { normalizeStoryFields } from '../src/domain/stories.ts';
import { normalizeTestFields } from '../src/domain/testcases.ts';
import { normalizeWorkshopFields } from '../src/domain/workshops.ts';

const kindOf = new Map(SAMPLE_ITEMS.map((i) => [i.key, i.kind]));
const count = (k: ItemKind) => SAMPLE_ITEMS.filter((i) => i.kind === k).length;

test('volumes validés à l\'étape 1 : 38 éléments, 52 liens', () => {
  assert.equal(SAMPLE_PROJECT_NAME, '[Exemple] Portail de réservation de salles');
  assert.equal(SAMPLE_ITEMS.length, 38);
  assert.equal(SAMPLE_LINKS.length, 52);
  assert.deepEqual(
    Object.fromEntries(KINDS.map((k) => [k.kind, count(k.kind)])),
    { stakeholder: 5, need: 4, requirement: 8, decision: 3, risk: 4, story: 6, test: 7, workshop: 1 },
  );
});

test('les clés sont uniques et coïncident avec les codes que la création attribuera (ordre des listes)', () => {
  assert.equal(kindOf.size, SAMPLE_ITEMS.length);
  const next: Record<string, number> = {};
  for (const item of SAMPLE_ITEMS) {
    next[item.kind] = (next[item.kind] ?? 0) + 1;
    assert.equal(item.key, formatCode(item.kind, next[item.kind]), `clé de « ${item.title} »`);
  }
});

test('chaque élément a un titre valide, un statut connu de son type et des champs que le domaine accepte tels quels', () => {
  for (const item of SAMPLE_ITEMS) {
    assert.ok(item.title.trim() === item.title && item.title !== '' && item.title.length <= MAX_TITLE, `${item.key} : titre`);
    assert.ok(kindInfo(item.kind).statuses.includes(item.status), `${item.key} : statut ${item.status}`);
    let normalized: unknown;
    switch (item.kind) {
      case 'stakeholder': normalized = normalizeFields(item.fields); break;
      case 'requirement': normalized = normalizeRequirementFields(item.fields); break;
      case 'decision': normalized = normalizeDecisionFields(item.fields); break;
      case 'risk': normalized = normalizeRiskFields(item.fields); break;
      case 'story': normalized = normalizeStoryFields(item.fields); break;
      case 'test': normalized = normalizeTestFields(item.fields); break;
      case 'workshop': normalized = normalizeWorkshopFields(item.fields); break;
      default: normalized = item.fields; break;
    }
    assert.deepEqual(normalized, item.fields, `${item.key} : champs inchangés par la normalisation`);
  }
});

test('les textes riches sont rédigés (aucun champ de fond vide), sauf les cas annoncés', () => {
  for (const item of SAMPLE_ITEMS) {
    if (item.kind === 'requirement') assert.ok(item.fields.criteria.trim() !== '', `${item.key} : critères`);
    if (item.kind === 'risk') assert.ok(item.fields.mitigation.trim() !== '' && item.fields.owner !== '', `${item.key} : traitement et responsable`);
    if (item.kind === 'decision') assert.ok(item.fields.alternatives !== '' && item.fields.rationale !== '' && item.fields.decidedOn !== '', `${item.key} : décision complète`);
    if (item.kind === 'story') assert.ok(item.fields.role !== '' && item.fields.goal !== '' && item.fields.benefit !== '', `${item.key} : rôle, objectif, bénéfice`);
    if (item.kind === 'test') assert.ok(item.fields.steps !== '' && item.fields.expected !== '' && item.fields.preconditions !== '', `${item.key} : test rédigé`);
    if (item.kind === 'workshop') assert.ok(item.fields.objective !== '' && item.fields.notes !== '' && item.fields.followUp !== '' && item.fields.heldOn !== '', `${item.key} : atelier complet`);
  }
});

test('un test exécuté a une date de dernière exécution, un test à exécuter ou bloqué n\'en a pas', () => {
  for (const item of SAMPLE_ITEMS) {
    if (item.kind !== 'test') continue;
    const ran = item.status === 'passed' || item.status === 'failed';
    assert.equal(item.fields.lastRunOn !== '', ran, `${item.key}`);
  }
});

test('les liens sont autorisés par la matrice du domaine, sans doublon, ni lien vers soi-même, et leurs clés existent', () => {
  const seen = new Set<string>();
  for (const l of SAMPLE_LINKS) {
    const from = kindOf.get(l.from);
    const to = kindOf.get(l.to);
    assert.ok(from && to, `clés inconnues : ${l.from} → ${l.to}`);
    assert.ok(isLinkAllowed(l.type, from, to), `lien refusé : ${l.from} ${l.type} ${l.to}`);
    assert.notEqual(l.from, l.to);
    const id = `${l.type}|${l.from}|${l.to}`;
    assert.ok(!seen.has(id), `doublon : ${id}`);
    seen.add(id);
  }
  const perType: Record<string, number> = {};
  for (const l of SAMPLE_LINKS) perType[l.type] = (perType[l.type] ?? 0) + 1;
  assert.deepEqual(perType, { expresses: 6, derives: 8, refines: 1, implements: 5, verifies: 11, concerns: 4, supersedes: 1, mitigates: 2, threatens: 4, participates: 5, originates: 5 });
});

test('le seul lien de remplacement est DEC-2 remplace DEC-1, et la décision remplacée porte le statut « Remplacée »', () => {
  assert.deepEqual(SAMPLE_LINKS.filter((l) => l.type === 'supersedes'), [{ type: 'supersedes', from: 'DEC-002', to: 'DEC-001' }]);
  assert.equal(SAMPLE_ITEMS.find((i) => i.key === 'DEC-001')?.status, 'superseded');
});

// ---- Traçabilité : valeurs de référence validées à l'étape 1 (D109)

const ids = new Map(SAMPLE_ITEMS.map((i, n) => [i.key, n + 1]));
const trace = computeTraceability(
  SAMPLE_ITEMS.map((i) => ({ id: ids.get(i.key) as number, kind: i.kind, code: i.key, title: i.title, status: i.status, ...(i.kind === 'requirement' ? { priority: i.fields.priority } : {}), ...(i.kind === 'test' ? { lastRunOn: i.fields.lastRunOn } : {}) })),
  SAMPLE_LINKS.map((l) => ({ type: l.type, fromId: ids.get(l.from) as number, toId: ids.get(l.to) as number })),
);
const codes = (list: Array<{ code: string }>) => list.map((r) => r.code).sort();

test('traçabilité : les manques volontaires sont exactement ceux annoncés', () => {
  assert.deepEqual(codes(trace.orphans.stakeholdersWithoutNeed), []);
  assert.deepEqual(codes(trace.orphans.needsWithoutRequirement), []);
  assert.deepEqual(codes(trace.orphans.requirementsWithoutStory), ['EX-006', 'EX-007', 'EX-008']);
  assert.deepEqual(codes(trace.orphans.requirementsWithoutTest), ['EX-008']);
  assert.deepEqual(codes(trace.orphans.storiesWithoutRequirement), ['US-006']);
  assert.deepEqual(codes(trace.orphans.storiesWithoutTest), ['US-006']);
  assert.deepEqual(codes(trace.orphans.testsWithoutTarget), []);
});

test('traçabilité : résultat de chaque exigence (échec, blocage, test via la story, aucun test)', () => {
  const result = Object.fromEntries(trace.matrix.map((r) => [r.code, r.result]));
  assert.deepEqual(result, { 'EX-001': 'passed', 'EX-002': 'passed', 'EX-003': 'failed', 'EX-004': 'to_run', 'EX-005': 'passed', 'EX-006': 'blocked', 'EX-007': 'passed', 'EX-008': 'none' });
  const ex4 = trace.matrix.find((r) => r.code === 'EX-004');
  assert.deepEqual(ex4?.directTests, []);
  assert.deepEqual(codes(ex4?.viaStoryTests ?? []), ['TEST-004']);
});

test('traçabilité : les quatre exigences indispensables sont toutes testées, et l\'élément archivé n\'entre pas dans la chaîne', () => {
  const must = trace.matrix.filter((r) => r.priority === 'must');
  assert.deepEqual(codes(must), ['EX-001', 'EX-002', 'EX-003', 'EX-007']);
  assert.ok(must.every((r) => r.directTests.length + r.viaStoryTests.length > 0));
  assert.equal(SAMPLE_ITEMS.filter((i) => i.status === 'archived').map((i) => i.key).join(), 'RIS-004');
  assert.equal(trace.ignored, 0, 'les risques ne font pas partie de la chaîne');
});

test('aucune personne réelle : seulement des fonctions, et le domaine fictif ne cite aucune organisation réelle', () => {
  const text = JSON.stringify(SAMPLE_ITEMS).toLowerCase();
  for (const banned of ['la poste', 'laposte', 'giancatarina', 'david', 'archimod', 'crp', 'dropp']) assert.ok(!text.includes(banned), banned);
});
