// Lot M5 : user stories et tests (décisions D61 à D69). Domaine, base et dépôts ; les écrans sont dans ui-m5.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { emptyDb, migratedDb } from './helpers/setup.ts';
import { seedAllTables, snapshot } from './helpers/seed.ts';
import { query } from '../src/data/db.ts';
import { mutate } from '../src/data/mutate.ts';
import { migrate, getSchemaVersion } from '../src/data/migrate.ts';
import { migrations, SCHEMA_VERSION } from '../src/data/migrations/index.ts';
import { createProject, deleteProject } from '../src/data/repositories/projects.ts';
import { changeItemStatus, createItem, deleteItem } from '../src/data/repositories/items.ts';
import { createRequirement } from '../src/data/repositories/requirements.ts';
import { createStory, getStory, listStories, updateStory } from '../src/data/repositories/stories.ts';
import { createTestCase, getTestCase, listTestCases, updateTestCase } from '../src/data/repositories/testcases.ts';
import { createLink, linkCandidates, linkedItems } from '../src/data/repositories/links.ts';
import { checkModelIntegrity } from '../src/data/repositories/integrity.ts';
import { MAX_STORY_CRITERIA_LENGTH, MAX_STORY_ROLE_LENGTH, MAX_STORY_SENTENCE_LENGTH, changedStoryFields, normalizeStoryFields } from '../src/domain/stories.ts';
import { MAX_TEST_TEXT_LENGTH, changedTestFields, isTestType, normalizeTestFields, testTypeLabel } from '../src/domain/testcases.ts';
import { EXPOSED_LINK_TYPES, linkOptionsFor } from '../src/domain/links.ts';
import { KINDS_WITH_DETAILS, initialStatus, isValidStatus, kindInfo, statusLabel } from '../src/domain/kinds.ts';
import { EXTENSION_TABLES } from '../src/data/sql-guard.ts';

const count = async (table: string): Promise<number> => Number((await query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))[0].n);
const lastLine = async (): Promise<{ object_type: string; action: string; detail: string | null }> =>
  (await query<{ object_type: string; action: string; detail: string | null }>('SELECT object_type, action, detail FROM activity_log ORDER BY id DESC LIMIT 1'))[0];

// ------------------------------------------------------------------ domaine pur

test('domaine : statuts des user stories (D63) et des tests (D65), libellés accordés', () => {
  assert.deepEqual([...kindInfo('story').statuses], ['draft', 'ready', 'done', 'rejected', 'archived']);
  assert.deepEqual([...kindInfo('test').statuses], ['to_run', 'passed', 'failed', 'blocked', 'archived']);
  assert.equal(initialStatus('story'), 'draft');
  assert.equal(initialStatus('test'), 'to_run');
  assert.ok(isValidStatus('story', 'ready') && !isValidStatus('story', 'passed') && !isValidStatus('test', 'done'));
  assert.deepEqual(['draft', 'ready', 'done', 'rejected', 'archived'].map((s) => statusLabel(s, 'story')), ['Brouillon', 'Prête', 'Réalisée', 'Rejetée', 'Archivée']);
  assert.deepEqual(['to_run', 'passed', 'failed', 'blocked', 'archived'].map((s) => statusLabel(s, 'test')), ['À exécuter', 'Réussi', 'Échoué', 'Bloqué', 'Archivé']);
  assert.equal(statusLabel('rejected'), 'Rejeté', 'sans type : forme par défaut inchangée');
  assert.equal(statusLabel('rejected', 'requirement'), 'Rejeté');
});

test('domaine : champs d\'une user story, valeurs par défaut, limites exactes, journal', () => {
  assert.deepEqual(normalizeStoryFields({}), { role: '', goal: '', benefit: '', criteria: '' });
  assert.equal(normalizeStoryFields({ role: '  Conseiller  ' }).role, 'Conseiller');
  assert.equal(normalizeStoryFields({ goal: '  garde\nles espaces  ' }).goal, '  garde\nles espaces  ', 'seul le rôle est rogné');
  assert.equal(MAX_STORY_ROLE_LENGTH, 200);
  assert.equal(MAX_STORY_SENTENCE_LENGTH, 2000);
  assert.equal(MAX_STORY_CRITERIA_LENGTH, 10000);
  assert.doesNotThrow(() => normalizeStoryFields({ role: 'x'.repeat(200), goal: 'x'.repeat(2000), benefit: 'x'.repeat(2000), criteria: 'x'.repeat(10000) }));
  assert.throws(() => normalizeStoryFields({ role: 'x'.repeat(201) }), /rôle/);
  assert.throws(() => normalizeStoryFields({ goal: 'x'.repeat(2001) }), /Je veux/);
  assert.throws(() => normalizeStoryFields({ benefit: 'x'.repeat(2001) }), /Afin de/);
  assert.throws(() => normalizeStoryFields({ criteria: 'x'.repeat(10001) }), /critères/);
  const a = normalizeStoryFields({});
  assert.deepEqual(changedStoryFields(a, a), []);
  assert.deepEqual(changedStoryFields(a, normalizeStoryFields({ goal: 'g', criteria: 'c' })), ['goal', 'criteria']);
});

test('domaine : champs d\'un test, types, dates réelles, limites, journal', () => {
  assert.deepEqual(normalizeTestFields({}), { testType: 'acceptance', preconditions: '', steps: '', expected: '', lastRunOn: '' });
  assert.ok(isTestType('unit') && isTestType('integration') && isTestType('acceptance') && !isTestType('smoke') && !isTestType(''));
  assert.deepEqual(['unit', 'integration', 'acceptance'].map(testTypeLabel), ['Unitaire', 'Intégration', 'Recette (UAT)']);
  assert.throws(() => normalizeTestFields({ testType: 'smoke' as never }), /type/i);
  assert.equal(normalizeTestFields({ lastRunOn: '2028-02-29' }).lastRunOn, '2028-02-29');
  for (const bad of ['2027-02-29', '2026-13-01', '2026-11-31', '25/11/2026', 'hier']) assert.throws(() => normalizeTestFields({ lastRunOn: bad }), /date/i, bad);
  assert.equal(MAX_TEST_TEXT_LENGTH, 10000);
  assert.doesNotThrow(() => normalizeTestFields({ preconditions: 'x'.repeat(10000), steps: 'x'.repeat(10000), expected: 'x'.repeat(10000) }));
  for (const k of ['preconditions', 'steps', 'expected'] as const) assert.throws(() => normalizeTestFields({ [k]: 'x'.repeat(10001) }), /./, k);
  const a = normalizeTestFields({});
  assert.deepEqual(changedTestFields(a, a), []);
  assert.deepEqual(changedTestFields(a, normalizeTestFields({ testType: 'unit', steps: 's' })), ['testType', 'steps']);
});

test('liens : implémente et vérifie exposés (D66), options par type d\'élément', () => {
  assert.deepEqual([...EXPOSED_LINK_TYPES], ['expresses', 'derives', 'refines', 'implements', 'verifies', 'concerns', 'threatens', 'mitigates', 'supersedes']);
  const keys = (k: Parameters<typeof linkOptionsFor>[0]) => linkOptionsFor(k).map((o) => `${o.type}:${o.direction}`);
  assert.deepEqual(keys('story'), ['implements:out', 'verifies:in', 'concerns:in']);
  assert.deepEqual(keys('test'), ['verifies:out']);
  assert.ok(keys('requirement').includes('implements:in') && keys('requirement').includes('verifies:in'));
  assert.ok(KINDS_WITH_DETAILS.includes('story') && KINDS_WITH_DETAILS.includes('test'));
  assert.ok(EXTENSION_TABLES.includes('story_details') && EXTENSION_TABLES.includes('test_details'));
});

// ------------------------------------------------------------------ migration 6

test('migration 6 : deux tables ajoutées, données existantes intactes, sauvegarde pre-migration au schéma 5, 23 tables', async () => {
  assert.equal(SCHEMA_VERSION, 6);
  assert.equal(migrations[5].name, 'story_test_details');
  const t = emptyDb();
  await migrate(migrations.slice(0, 5), { backup: t.driver.backup });
  t.raw.exec("INSERT INTO projects (id, kind, name, created_at, updated_at) VALUES (1, 'project', 'Avant', 'x', 'x')");
  t.raw.exec("INSERT INTO items (id, project_id, kind, number, code, title, description, status, created_at, updated_at) VALUES (1, 1, 'decision', 1, 'DEC-001', 'D', '', 'proposed', 'x', 'x')");
  t.raw.exec('INSERT INTO decision_details (item_id) VALUES (1)');
  const before = snapshot(t.raw);
  const report = await migrate(migrations, { backup: t.driver.backup });
  assert.deepEqual(report.applied, [6]);
  assert.equal(await getSchemaVersion(), 6);
  assert.equal(t.backups.filter((b) => b.kind === 'pre-migration').length, 1);
  const after = snapshot(t.raw);
  for (const table of Object.keys(before).filter((n) => n !== 'meta')) assert.deepEqual(after[table], before[table], `la table ${table} est inchangée`);
  assert.equal(after.story_details.count, 0);
  assert.equal(after.test_details.count, 0);
  const tables = (t.raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get() as { n: number }).n;
  assert.equal(tables, 23);
  const copy = new DatabaseSync(t.backups[t.backups.length - 1].file, { readOnly: true });
  assert.equal((copy.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('story_details', 'test_details')").get() as { n: number }).n, 0, 'la sauvegarde garde le schéma 5');
  copy.close();
  t.close();
});

test('migration 6 : valeurs par défaut en base, cascade avec l\'élément, jeu de test à jour', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const s = await createStory({ projectId: p, title: 'S' });
  const c = await createTestCase({ projectId: p, title: 'T' });
  t.raw.exec('DELETE FROM story_details; DELETE FROM test_details;');
  t.raw.exec(`INSERT INTO story_details (item_id) VALUES (${s.id}); INSERT INTO test_details (item_id) VALUES (${c.id})`);
  assert.deepEqual({ ...(t.raw.prepare('SELECT role, goal, benefit, criteria FROM story_details').get() as Record<string, string>) }, { role: '', goal: '', benefit: '', criteria: '' });
  assert.deepEqual({ ...(t.raw.prepare('SELECT test_type, preconditions, steps, expected, last_run_on FROM test_details').get() as Record<string, string>) }, { test_type: 'acceptance', preconditions: '', steps: '', expected: '', last_run_on: '' });
  t.raw.exec(`DELETE FROM items WHERE id IN (${s.id}, ${c.id})`);
  assert.equal(await count('story_details'), 0);
  assert.equal(await count('test_details'), 0);
  t.close();
});

test('migration 6 : le jeu de test couvre les deux tables', async () => {
  const t = await migratedDb();
  seedAllTables(t.raw);
  const s = snapshot(t.raw);
  assert.equal(s.story_details.count, 1);
  assert.equal(s.test_details.count, 1);
  t.close();
});

// ------------------------------------------------------------------ user stories

test('user story : code US-001…, statut brouillon, champs par défaut, détails créés avec l\'élément, une ligne de journal', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const before = await count('activity_log');
  const a = await createStory({ projectId: p, title: 'Consulter mon solde' });
  assert.equal(a.code, 'US-001');
  assert.equal(await count('activity_log'), before + 1);
  assert.equal((await lastLine()).action, 'created');
  const s = await getStory(a.id);
  assert.deepEqual({ st: s?.status, r: s?.role, g: s?.goal, b: s?.benefit, c: s?.criteria }, { st: 'draft', r: '', g: '', b: '', c: '' });
  const b = await createStory({ projectId: p, title: 'Virer', role: ' Client ', goal: 'virer\nde l\'argent', benefit: 'payer', criteria: 'Étant donné…' });
  assert.equal(b.code, 'US-002');
  const got = await getStory(b.id);
  assert.deepEqual({ r: got?.role, g: got?.goal, c: got?.criteria }, { r: 'Client', g: 'virer\nde l\'argent', c: 'Étant donné…' });
  assert.deepEqual((await listStories(p)).map((x) => x.code), ['US-001', 'US-002']);
  assert.deepEqual(await listStories(p, 'done'), []);
  t.close();
});

test('user story : valeurs invalides refusées sans écrire, createItem refuse le type, un échec des détails annule tout', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const items = await count('items');
  const log = await count('activity_log');
  await assert.rejects(createStory({ projectId: p, title: '  ' }));
  await assert.rejects(createStory({ projectId: p, title: 'ok', role: 'x'.repeat(201) }));
  await assert.rejects(createStory({ projectId: p, title: 'ok', criteria: 'x'.repeat(10001) }));
  await assert.rejects(createItem({ projectId: p, kind: 'story', title: 'direct' }));
  assert.equal(await count('items'), items);
  assert.equal(await count('activity_log'), log);
  t.raw.exec('DROP TABLE story_details');
  await assert.rejects(createStory({ projectId: p, title: 'ok' }));
  assert.equal(await count('items'), items, 'l\'élément n\'est pas resté seul');
  t.close();
});

test('user story : modification atomique, journal qui nomme les champs sans contenu, rien si rien ne change, statuts libres', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const s = await createStory({ projectId: p, title: 'S', goal: 'a' });
  const log = await count('activity_log');
  assert.equal(await updateStory(s.id, { fields: { goal: 'a' } }), false);
  assert.equal(await count('activity_log'), log);
  assert.equal(await updateStory(s.id, { title: 'S2', fields: { goal: 'SECRET', criteria: 'AUTRE' } }), true);
  assert.equal(await count('activity_log'), log + 1);
  const line = await lastLine();
  assert.equal(line.action, 'updated');
  assert.ok(line.detail?.includes('title') && line.detail.includes('goal') && line.detail.includes('criteria'));
  assert.ok(!line.detail?.includes('SECRET') && !line.detail?.includes('AUTRE'), 'jamais le contenu');
  await assert.rejects(updateStory(s.id, { fields: { role: 'x'.repeat(201) } }));
  assert.equal((await getStory(s.id))?.goal, 'SECRET', 'refus : rien n\'a changé');
  for (const st of ['done', 'draft', 'rejected', 'ready', 'archived', 'draft']) await changeItemStatus(s.id, st);
  assert.equal((await getStory(s.id))?.status, 'draft');
  await assert.rejects(changeItemStatus(s.id, 'passed'), 'statut d\'un autre type refusé');
  t.close();
});

// ------------------------------------------------------------------ tests

test('test : code TEST-001…, statut à exécuter, type recette par défaut, détails créés avec l\'élément, une ligne de journal', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const before = await count('activity_log');
  const a = await createTestCase({ projectId: p, title: 'Connexion' });
  assert.equal(a.code, 'TEST-001');
  assert.equal(await count('activity_log'), before + 1);
  const c = await getTestCase(a.id);
  assert.deepEqual({ st: c?.status, ty: c?.test_type, d: c?.last_run_on }, { st: 'to_run', ty: 'acceptance', d: '' });
  const b = await createTestCase({ projectId: p, title: 'Calcul', testType: 'unit', steps: '1. Lancer', expected: '42', lastRunOn: '2026-11-25' });
  assert.equal(b.code, 'TEST-002');
  const got = await getTestCase(b.id);
  assert.deepEqual({ ty: got?.test_type, s: got?.steps, e: got?.expected, d: got?.last_run_on }, { ty: 'unit', s: '1. Lancer', e: '42', d: '2026-11-25' });
  assert.deepEqual((await listTestCases(p)).map((x) => x.code), ['TEST-001', 'TEST-002']);
  assert.deepEqual(await listTestCases(p, 'failed'), []);
  t.close();
});

test('test : valeurs invalides refusées sans écrire, un échec des détails annule tout, statuts libres, journal sans contenu', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const items = await count('items');
  await assert.rejects(createTestCase({ projectId: p, title: 'ok', lastRunOn: '2027-02-29' }));
  await assert.rejects(createTestCase({ projectId: p, title: 'ok', testType: 'smoke' as never }));
  await assert.rejects(createItem({ projectId: p, kind: 'test', title: 'direct' }));
  assert.equal(await count('items'), items);
  const c = await createTestCase({ projectId: p, title: 'T', steps: 'a' });
  const log = await count('activity_log');
  assert.equal(await updateTestCase(c.id, { fields: { steps: 'a' } }), false);
  assert.equal(await count('activity_log'), log);
  assert.equal(await updateTestCase(c.id, { fields: { steps: 'SECRET', lastRunOn: '2026-11-25' } }), true);
  const line = await lastLine();
  assert.ok(line.detail?.includes('steps') && line.detail.includes('lastRunOn') && !line.detail.includes('SECRET'));
  for (const st of ['passed', 'failed', 'blocked', 'to_run', 'archived']) await changeItemStatus(c.id, st);
  assert.equal((await getTestCase(c.id))?.status, 'archived');
  await assert.rejects(changeItemStatus(c.id, 'done'));
  t.raw.exec('DROP TABLE test_details');
  await assert.rejects(createTestCase({ projectId: p, title: 'ok' }));
  assert.equal(await count('items'), items + 1);
  t.close();
});

test('user story et test : texte hostile conservé tel quel, jamais interprété', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const evil = `'); DROP TABLE items; -- <script>alert(1)</script> {{x}}`;
  const s = await createStory({ projectId: p, title: evil, goal: evil, criteria: evil });
  const c = await createTestCase({ projectId: p, title: evil, steps: evil, expected: evil });
  assert.equal((await getStory(s.id))?.goal, evil);
  assert.equal((await getTestCase(c.id))?.expected, evil);
  assert.ok(await count('items') >= 2);
  t.close();
});

// ------------------------------------------------------------------ liens et chaîne de traçabilité

test('liens : implémente et vérifie, créés et lus depuis chaque extrémité avec le bon sens', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const ex = await createRequirement({ projectId: p, title: 'Exigence' });
  const us = await createStory({ projectId: p, title: 'Story' });
  const ts = await createTestCase({ projectId: p, title: 'Test' });
  await createLink({ type: 'implements', fromId: us.id, toId: ex.id });
  await createLink({ type: 'verifies', fromId: ts.id, toId: us.id });
  await createLink({ type: 'verifies', fromId: ts.id, toId: ex.id });
  const fromStory = await linkedItems(us.id);
  assert.deepEqual(fromStory.map((l) => `${l.link_type}:${l.direction}:${l.other_code}`).sort(), ['implements:out:EX-001', 'verifies:in:TEST-001']);
  const fromEx = await linkedItems(ex.id);
  assert.deepEqual(fromEx.map((l) => `${l.link_type}:${l.direction}:${l.other_code}`).sort(), ['implements:in:US-001', 'verifies:in:TEST-001']);
  t.close();
});

test('liens : couples interdits refusés (story qui vérifie, test qui implémente, besoin qui implémente), doublon et soi-même refusés', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const need = await createItem({ projectId: p, kind: 'need', title: 'Besoin' });
  const ex = await createRequirement({ projectId: p, title: 'Exigence' });
  const us = await createStory({ projectId: p, title: 'Story' });
  const ts = await createTestCase({ projectId: p, title: 'Test' });
  await assert.rejects(createLink({ type: 'verifies', fromId: us.id, toId: ex.id }), 'une story ne vérifie pas');
  await assert.rejects(createLink({ type: 'implements', fromId: ts.id, toId: ex.id }), 'un test n\'implémente pas');
  await assert.rejects(createLink({ type: 'implements', fromId: need.id, toId: ex.id }));
  await assert.rejects(createLink({ type: 'implements', fromId: ex.id, toId: us.id }), 'mauvais sens');
  await createLink({ type: 'implements', fromId: us.id, toId: ex.id });
  await assert.rejects(createLink({ type: 'implements', fromId: us.id, toId: ex.id }), 'doublon');
  await assert.rejects(createLink({ type: 'implements', fromId: us.id, toId: us.id }));
  t.close();
});

test('liens : candidats (bon type, pas soi-même, pas déjà reliés, même projet) et aucun lien entre deux projets', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const q = await createProject('Q');
  const ex = await createRequirement({ projectId: p, title: 'E1' });
  const ex2 = await createRequirement({ projectId: p, title: 'E2' });
  await createRequirement({ projectId: q, title: 'Autre projet' });
  const us = await createStory({ projectId: p, title: 'S' });
  const usQ = await createStory({ projectId: q, title: 'SQ' });
  assert.deepEqual((await linkCandidates(us.id, 'implements', 'out')).map((c) => c.code).sort(), ['EX-001', 'EX-002']);
  await createLink({ type: 'implements', fromId: us.id, toId: ex.id });
  assert.deepEqual((await linkCandidates(us.id, 'implements', 'out')).map((c) => c.code), [ex2.code]);
  await assert.rejects(createLink({ type: 'implements', fromId: usQ.id, toId: ex2.id }), 'deux projets');
  t.close();
});

test('chaîne : partie prenante → besoin → exigence → story → test, lisible de bout en bout, et cohérente à l\'intégrité', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const sh = await createItem({ projectId: p, kind: 'stakeholder', title: 'Direction' }).catch(() => null);
  const need = await createItem({ projectId: p, kind: 'need', title: 'Besoin' });
  const ex = await createRequirement({ projectId: p, title: 'Exigence' });
  const us = await createStory({ projectId: p, title: 'Story' });
  const ts = await createTestCase({ projectId: p, title: 'Test' });
  assert.equal(sh, null, 'une partie prenante ne se crée pas sans ses détails (D43)');
  await createLink({ type: 'derives', fromId: need.id, toId: ex.id });
  await createLink({ type: 'implements', fromId: us.id, toId: ex.id });
  await createLink({ type: 'verifies', fromId: ts.id, toId: us.id });
  assert.deepEqual((await linkedItems(ex.id)).map((l) => l.other_code).sort(), ['BES-001', 'US-001']);
  assert.deepEqual(await checkModelIntegrity(), []);
  t.close();
});

// ------------------------------------------------------------------ suppression, garde, intégrité

test('suppression : une story ou un test lié part avec ses liens et ses détails, les autres restent', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const ex = await createRequirement({ projectId: p, title: 'E' });
  const us = await createStory({ projectId: p, title: 'S' });
  const ts = await createTestCase({ projectId: p, title: 'T' });
  await createLink({ type: 'implements', fromId: us.id, toId: ex.id });
  await createLink({ type: 'verifies', fromId: ts.id, toId: us.id });
  await deleteItem(us.id);
  assert.equal(await getStory(us.id), null);
  assert.equal(await count('story_details'), 0);
  assert.equal(await count('links'), 0);
  assert.ok(await getTestCase(ts.id), 'le test reste');
  assert.ok(await count('items') >= 2);
  t.close();
});

test('suppression du projet : stories, tests, détails et liens partent avec lui', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const ex = await createRequirement({ projectId: p, title: 'E' });
  const us = await createStory({ projectId: p, title: 'S' });
  const ts = await createTestCase({ projectId: p, title: 'T' });
  await createLink({ type: 'implements', fromId: us.id, toId: ex.id });
  await createLink({ type: 'verifies', fromId: ts.id, toId: us.id });
  await deleteProject(p);
  for (const table of ['items', 'story_details', 'test_details', 'links']) assert.equal(await count(table), 0, table);
  t.close();
});

test('garde : les détails de story et de test ne s\'écrivent jamais seuls, ni sur une autre table', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const us = await createStory({ projectId: p, title: 'S' });
  await assert.rejects(mutate([{ sql: 'UPDATE story_details SET goal = ? WHERE item_id = ?', params: ['x', us.id], extension: true }]), 'sans opération journalisée');
  await assert.rejects(mutate([{ sql: 'UPDATE story_details SET goal = ? WHERE item_id = ?', params: ['x', us.id] }]), 'sans drapeau d\'extension');
  await assert.rejects(mutate([{ sql: 'UPDATE projects SET name = ? WHERE id = ?', params: ['x', p], extension: true }]), 'extension sur une table non listée');
  assert.equal((await getStory(us.id))?.goal, '');
  t.close();
});

test('intégrité : chaque anomalie de story et de test est détectée, une à la fois, puis disparaît une fois réparée', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const us = await createStory({ projectId: p, title: 'S' });
  const ts = await createTestCase({ projectId: p, title: 'T' });
  const kinds = async () => (await checkModelIntegrity()).map((x) => x.problem).sort();
  assert.deepEqual(await kinds(), []);
  t.raw.exec(`DELETE FROM story_details WHERE item_id = ${us.id}`);
  assert.deepEqual(await kinds(), ['story-details-missing']);
  t.raw.exec(`INSERT INTO story_details (item_id) VALUES (${us.id})`);
  assert.deepEqual(await kinds(), []);
  t.raw.exec(`DELETE FROM test_details WHERE item_id = ${ts.id}`);
  assert.deepEqual(await kinds(), ['test-details-missing']);
  t.raw.exec(`INSERT INTO test_details (item_id) VALUES (${ts.id})`);
  t.raw.exec(`UPDATE test_details SET test_type = 'smoke' WHERE item_id = ${ts.id}`);
  assert.deepEqual(await kinds(), ['test-invalid-type']);
  t.raw.exec(`UPDATE test_details SET test_type = 'unit', last_run_on = '2026-02-30' WHERE item_id = ${ts.id}`);
  assert.deepEqual(await kinds(), ['test-invalid-date']);
  t.raw.exec(`UPDATE test_details SET last_run_on = '' WHERE item_id = ${ts.id}`);
  assert.deepEqual(await kinds(), []);
  t.raw.exec(`UPDATE items SET kind = 'need' WHERE id = ${us.id}`);
  assert.ok((await kinds()).includes('story-details-wrong-kind'));
  t.raw.exec(`UPDATE items SET kind = 'story' WHERE id = ${us.id}`);
  t.raw.exec(`UPDATE items SET kind = 'need' WHERE id = ${ts.id}`);
  assert.ok((await kinds()).includes('test-details-wrong-kind'));
  t.close();
});

test('base 0.6.0 (schéma 5) : une base plus ancienne s\'ouvre et passe au schéma 6 sans perdre les décisions et risques', async () => {
  const t = emptyDb();
  await migrate(migrations.slice(0, 5), { backup: t.driver.backup });
  t.raw.exec("INSERT INTO projects (id, kind, name, created_at, updated_at) VALUES (1, 'project', 'P', 'x', 'x')");
  t.raw.exec("INSERT INTO items (id, project_id, kind, number, code, title, description, status, created_at, updated_at) VALUES (1, 1, 'risk', 1, 'RIS-001', 'R', '', 'identified', 'x', 'x')");
  t.raw.exec('INSERT INTO risk_details (item_id) VALUES (1)');
  await migrate(migrations, { backup: t.driver.backup });
  assert.equal(await getSchemaVersion(), 6);
  assert.equal(await count('risk_details'), 1);
  t.close();
});
