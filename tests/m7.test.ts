// Lot M7 : ateliers (décisions D79 à D87). Domaine, base, dépôt, liens, intégrité ; les écrans sont dans ui-m7.test.ts.
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
import { createStakeholder } from '../src/data/repositories/stakeholders.ts';
import { createRequirement } from '../src/data/repositories/requirements.ts';
import { createDecision } from '../src/data/repositories/decisions.ts';
import { createRisk } from '../src/data/repositories/risks.ts';
import { createStory } from '../src/data/repositories/stories.ts';
import { createWorkshop, getWorkshop, listWorkshops, updateWorkshop } from '../src/data/repositories/workshops.ts';
import { createLink, linkCandidates, linkedItems } from '../src/data/repositories/links.ts';
import { checkModelIntegrity } from '../src/data/repositories/integrity.ts';
import { getTraceability } from '../src/data/repositories/traceability.ts';
import { MAX_WORKSHOP_OBJECTIVE_LENGTH, MAX_WORKSHOP_PLACE_LENGTH, MAX_WORKSHOP_TEXT_LENGTH, changedWorkshopFields, normalizeWorkshopFields } from '../src/domain/workshops.ts';
import { EXPOSED_LINK_TYPES, LINK_RULES, linkLabel, linkOptionsFor } from '../src/domain/links.ts';
import { KINDS, KINDS_WITH_DETAILS, initialStatus, isValidStatus, kindInfo, statusLabel } from '../src/domain/kinds.ts';
import { EXTENSION_TABLES } from '../src/data/sql-guard.ts';

const count = async (table: string): Promise<number> => Number((await query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))[0].n);
const lastLine = async (): Promise<{ object_type: string; action: string; detail: string | null }> =>
  (await query<{ object_type: string; action: string; detail: string | null }>('SELECT object_type, action, detail FROM activity_log ORDER BY id DESC LIMIT 1'))[0];

// ------------------------------------------------------------------ domaine pur

test('domaine : statuts d\'un atelier (D81), code ATL, libellés', () => {
  assert.deepEqual([...kindInfo('workshop').statuses], ['planned', 'held', 'archived']);
  assert.equal(kindInfo('workshop').prefix, 'ATL');
  assert.equal(kindInfo('workshop').label, 'Atelier');
  assert.equal(initialStatus('workshop'), 'planned');
  assert.ok(isValidStatus('workshop', 'held') && !isValidStatus('workshop', 'draft') && !isValidStatus('story', 'held'));
  assert.deepEqual(['planned', 'held', 'archived'].map((s) => statusLabel(s, 'workshop')), ['Planifié', 'Tenu', 'Archivé']);
  assert.ok(KINDS_WITH_DETAILS.includes('workshop') && EXTENSION_TABLES.includes('workshop_details'));
  assert.equal(KINDS.length, 8);
});

test('domaine : champs d\'un atelier, valeurs par défaut, limites exactes, dates réelles, journal (D80)', () => {
  assert.deepEqual(normalizeWorkshopFields({}), { heldOn: '', place: '', objective: '', notes: '', followUp: '' });
  assert.equal(normalizeWorkshopFields({ place: '  Salle A  ' }).place, 'Salle A');
  assert.equal(normalizeWorkshopFields({ notes: '  garde\nles espaces  ' }).notes, '  garde\nles espaces  ', 'les textes libres ne sont pas rognés');
  assert.deepEqual([MAX_WORKSHOP_PLACE_LENGTH, MAX_WORKSHOP_OBJECTIVE_LENGTH, MAX_WORKSHOP_TEXT_LENGTH], [200, 2000, 10000]);
  assert.doesNotThrow(() => normalizeWorkshopFields({ place: 'x'.repeat(200), objective: 'x'.repeat(2000), notes: 'x'.repeat(10000), followUp: 'x'.repeat(10000) }));
  assert.throws(() => normalizeWorkshopFields({ place: 'x'.repeat(201) }), /lieu/);
  assert.throws(() => normalizeWorkshopFields({ objective: 'x'.repeat(2001) }), /objectif/);
  assert.throws(() => normalizeWorkshopFields({ notes: 'x'.repeat(10001) }), /notes/);
  assert.throws(() => normalizeWorkshopFields({ followUp: 'x'.repeat(10001) }), /points ouverts/);
  assert.equal(normalizeWorkshopFields({ heldOn: '2028-02-29' }).heldOn, '2028-02-29');
  for (const bad of ['2027-02-29', '2026-13-01', '2026-11-31', '25/11/2026', 'hier']) assert.throws(() => normalizeWorkshopFields({ heldOn: bad }), /date/i, bad);
  const a = normalizeWorkshopFields({});
  assert.deepEqual(changedWorkshopFields(a, a), []);
  assert.deepEqual(changedWorkshopFields(a, normalizeWorkshopFields({ notes: 'n', followUp: 'f' })), ['notes', 'followUp']);
});

test('liens : « participe à » et « provient de » (D82), libellés neutres en genre, options par type d\'élément', () => {
  assert.equal(LINK_RULES.length, 11);
  assert.deepEqual([...EXPOSED_LINK_TYPES].slice(-2), ['participates', 'originates']);
  const rule = (t: string) => LINK_RULES.find((r) => r.type === t);
  assert.deepEqual({ l: rule('participates')?.label, i: rule('participates')?.inverseLabel, f: rule('participates')?.from, t: rule('participates')?.to }, { l: 'participe à', i: 'réunit', f: ['stakeholder'], t: ['workshop'] });
  assert.deepEqual({ l: rule('originates')?.label, i: rule('originates')?.inverseLabel, f: rule('originates')?.from, t: rule('originates')?.to }, { l: 'provient de', i: 'est à l\'origine de', f: ['need', 'requirement', 'decision', 'risk'], t: ['workshop'] });
  const keys = (k: Parameters<typeof linkOptionsFor>[0]) => linkOptionsFor(k).map((o) => o.key);
  assert.deepEqual(keys('workshop'), ['participates:in', 'originates:in']);
  assert.deepEqual(linkOptionsFor('workshop').map((o) => o.label), ['réunit', 'est à l\'origine de']);
  assert.ok(keys('stakeholder').includes('participates:out'));
  for (const k of ['need', 'requirement', 'decision', 'risk'] as const) assert.ok(keys(k).includes('originates:out'), k);
  assert.ok(!keys('story').some((x) => x.startsWith('originates')) && !keys('test').some((x) => x.startsWith('participates')));
  assert.equal(linkLabel('originates', 'in', 'workshop'), 'est à l\'origine de', 'l\'accord au féminin ne touche pas ce libellé');
  assert.equal(linkLabel('originates', 'out', 'requirement'), 'provient de');
});

// ------------------------------------------------------------------ migration 7

test('migration 7 : une table ajoutée, données existantes intactes, sauvegarde pre-migration au schéma 6, 24 tables', async () => {
  assert.equal(SCHEMA_VERSION, 7);
  assert.equal(migrations[6].name, 'workshop_details');
  const t = emptyDb();
  await migrate(migrations.slice(0, 6), { backup: t.driver.backup });
  t.raw.exec("INSERT INTO projects (id, kind, name, created_at, updated_at) VALUES (1, 'project', 'Avant', 'x', 'x')");
  t.raw.exec("INSERT INTO items (id, project_id, kind, number, code, title, description, status, created_at, updated_at) VALUES (1, 1, 'story', 1, 'US-001', 'S', '', 'draft', 'x', 'x')");
  t.raw.exec('INSERT INTO story_details (item_id) VALUES (1)');
  const before = snapshot(t.raw);
  const report = await migrate(migrations, { backup: t.driver.backup });
  assert.deepEqual(report.applied, [7]);
  assert.equal(await getSchemaVersion(), 7);
  assert.equal(t.backups.filter((b) => b.kind === 'pre-migration').length, 1);
  const after = snapshot(t.raw);
  for (const table of Object.keys(before).filter((n) => n !== 'meta')) assert.deepEqual(after[table], before[table], `la table ${table} est inchangée`);
  assert.equal(after.workshop_details.count, 0);
  assert.equal((t.raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get() as { n: number }).n, 24);
  const copy = new DatabaseSync(t.backups[t.backups.length - 1].file, { readOnly: true });
  assert.equal((copy.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'workshop_details'").get() as { n: number }).n, 0, 'la sauvegarde garde le schéma 6');
  copy.close();
  t.close();
});

test('migration 7 : valeurs par défaut en base, cascade avec l\'élément, jeu de test à jour', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const w = await createWorkshop({ projectId: p, title: 'W' });
  t.raw.exec('DELETE FROM workshop_details');
  t.raw.exec(`INSERT INTO workshop_details (item_id) VALUES (${w.id})`);
  assert.deepEqual({ ...(t.raw.prepare('SELECT held_on, place, objective, notes, follow_up FROM workshop_details').get() as Record<string, string>) }, { held_on: '', place: '', objective: '', notes: '', follow_up: '' });
  t.raw.exec(`DELETE FROM items WHERE id = ${w.id}`);
  assert.equal(await count('workshop_details'), 0);
  t.close();
});

test('migration 7 : le jeu de test couvre la table des ateliers', async () => {
  const t = await migratedDb();
  seedAllTables(t.raw);
  assert.equal(snapshot(t.raw).workshop_details.count, 1);
  t.close();
});

test('base du schéma 6 : s\'ouvre et passe au schéma 7 sans perdre user stories ni tests', async () => {
  const t = emptyDb();
  await migrate(migrations.slice(0, 6), { backup: t.driver.backup });
  t.raw.exec("INSERT INTO projects (id, kind, name, created_at, updated_at) VALUES (1, 'project', 'P', 'x', 'x')");
  t.raw.exec("INSERT INTO items (id, project_id, kind, number, code, title, description, status, created_at, updated_at) VALUES (1, 1, 'test', 1, 'TEST-001', 'T', '', 'to_run', 'x', 'x')");
  t.raw.exec('INSERT INTO test_details (item_id) VALUES (1)');
  await migrate(migrations, { backup: t.driver.backup });
  assert.equal(await getSchemaVersion(), 7);
  assert.equal(await count('test_details'), 1);
  t.close();
});

// ------------------------------------------------------------------ dépôt

test('atelier : code ATL-001…, statut planifié, champs par défaut, détails créés avec l\'élément, une ligne de journal', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const before = await count('activity_log');
  const a = await createWorkshop({ projectId: p, title: 'Recueil du besoin' });
  assert.equal(a.code, 'ATL-001');
  assert.equal(await count('activity_log'), before + 1);
  assert.equal((await lastLine()).action, 'created');
  const w = await getWorkshop(a.id);
  assert.deepEqual({ st: w?.status, d: w?.held_on, p: w?.place, o: w?.objective, n: w?.notes, f: w?.follow_up }, { st: 'planned', d: '', p: '', o: '', n: '', f: '' });
  const b = await createWorkshop({ projectId: p, title: 'Cadrage', heldOn: '2026-11-26', place: ' Salle B ', objective: 'Cadrer', notes: 'l1\nl2', followUp: 'Action' });
  assert.equal(b.code, 'ATL-002');
  const got = await getWorkshop(b.id);
  assert.deepEqual({ d: got?.held_on, p: got?.place, n: got?.notes, f: got?.follow_up }, { d: '2026-11-26', p: 'Salle B', n: 'l1\nl2', f: 'Action' });
  assert.deepEqual((await listWorkshops(p)).map((x) => x.code), ['ATL-001', 'ATL-002']);
  assert.deepEqual(await listWorkshops(p, 'held'), []);
  t.close();
});

test('atelier : valeurs invalides refusées sans écrire, createItem refuse le type, un échec des détails annule tout', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const items = await count('items');
  const log = await count('activity_log');
  await assert.rejects(createWorkshop({ projectId: p, title: '  ' }));
  await assert.rejects(createWorkshop({ projectId: p, title: 'ok', heldOn: '2027-02-29' }));
  await assert.rejects(createWorkshop({ projectId: p, title: 'ok', objective: 'x'.repeat(2001) }));
  await assert.rejects(createItem({ projectId: p, kind: 'workshop', title: 'direct' }));
  assert.equal(await count('items'), items);
  assert.equal(await count('activity_log'), log);
  t.raw.exec('DROP TABLE workshop_details');
  await assert.rejects(createWorkshop({ projectId: p, title: 'ok' }));
  assert.equal(await count('items'), items, 'l\'élément n\'est pas resté seul');
  t.close();
});

test('atelier : modification atomique, journal sans contenu, rien si rien ne change, statuts libres', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const w = await createWorkshop({ projectId: p, title: 'W', notes: 'a' });
  const log = await count('activity_log');
  assert.equal(await updateWorkshop(w.id, { fields: { notes: 'a' } }), false);
  assert.equal(await count('activity_log'), log);
  assert.equal(await updateWorkshop(w.id, { title: 'W2', fields: { notes: 'SECRET', followUp: 'AUTRE', heldOn: '2026-11-26' } }), true);
  assert.equal(await count('activity_log'), log + 1);
  const line = await lastLine();
  assert.equal(line.action, 'updated');
  assert.ok(line.detail?.includes('title') && line.detail.includes('notes') && line.detail.includes('followUp') && line.detail.includes('heldOn'));
  assert.ok(!line.detail?.includes('SECRET') && !line.detail?.includes('AUTRE'), 'jamais le contenu');
  await assert.rejects(updateWorkshop(w.id, { fields: { place: 'x'.repeat(201) } }));
  assert.equal((await getWorkshop(w.id))?.notes, 'SECRET', 'refus : rien n\'a changé');
  for (const st of ['held', 'planned', 'archived', 'held']) await changeItemStatus(w.id, st);
  assert.equal((await getWorkshop(w.id))?.status, 'held');
  await assert.rejects(changeItemStatus(w.id, 'draft'), 'statut d\'un autre type refusé');
  t.close();
});

test('atelier : texte hostile conservé tel quel, jamais interprété', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const evil = `'); DROP TABLE items; -- <script>alert(1)</script> {{x}}`;
  const w = await createWorkshop({ projectId: p, title: evil, objective: evil, notes: evil, followUp: evil, place: evil });
  const got = await getWorkshop(w.id);
  assert.deepEqual([got?.title, got?.objective, got?.notes, got?.follow_up, got?.place], [evil, evil, evil, evil, evil]);
  assert.ok(await count('items') >= 1);
  t.close();
});

// ------------------------------------------------------------------ liens et filiation

async function world() {
  const p = await createProject('P');
  const ws = await createWorkshop({ projectId: p, title: 'Atelier' });
  const sh = await createStakeholder({ projectId: p, title: 'Sponsor' });
  const need = await createItem({ projectId: p, kind: 'need', title: 'Besoin' });
  const ex = await createRequirement({ projectId: p, title: 'Exigence' });
  const dec = await createDecision({ projectId: p, title: 'Décision' });
  const risk = await createRisk({ projectId: p, title: 'Risque' });
  const story = await createStory({ projectId: p, title: 'Story' });
  return { p, ws, sh, need, ex, dec, risk, story };
}

test('liens : « participe à » et « provient de » créés et lus depuis chaque extrémité avec le bon sens', async () => {
  const t = await migratedDb();
  const w = await world();
  await createLink({ type: 'participates', fromId: w.sh.id, toId: w.ws.id });
  for (const x of [w.need, w.ex, w.dec, w.risk]) await createLink({ type: 'originates', fromId: x.id, toId: w.ws.id });
  const fromWs = await linkedItems(w.ws.id);
  assert.deepEqual(fromWs.map((l) => `${l.link_type}:${l.direction}:${l.other_code}`).sort(), ['originates:in:BES-001', 'originates:in:DEC-001', 'originates:in:EX-001', 'originates:in:RIS-001', 'participates:in:PP-001']);
  assert.deepEqual((await linkedItems(w.ex.id)).map((l) => `${l.link_type}:${l.direction}:${l.other_code}`), ['originates:out:ATL-001']);
  assert.deepEqual((await linkedItems(w.sh.id)).map((l) => `${l.link_type}:${l.direction}:${l.other_code}`), ['participates:out:ATL-001']);
  t.close();
});

test('liens : couples interdits refusés, doublon et lien à soi-même refusés, un même élément peut provenir de plusieurs ateliers', async () => {
  const t = await migratedDb();
  const w = await world();
  const ws2 = await createWorkshop({ projectId: w.p, title: 'Second' });
  await assert.rejects(createLink({ type: 'originates', fromId: w.story.id, toId: w.ws.id }), 'une story ne provient pas d\'un atelier');
  await assert.rejects(createLink({ type: 'originates', fromId: w.sh.id, toId: w.ws.id }), 'une partie prenante participe, elle ne « provient » pas');
  await assert.rejects(createLink({ type: 'participates', fromId: w.need.id, toId: w.ws.id }));
  await assert.rejects(createLink({ type: 'participates', fromId: w.ws.id, toId: w.sh.id }), 'mauvais sens');
  await assert.rejects(createLink({ type: 'originates', fromId: w.ws.id, toId: w.ws.id }));
  await createLink({ type: 'originates', fromId: w.need.id, toId: w.ws.id });
  await assert.rejects(createLink({ type: 'originates', fromId: w.need.id, toId: w.ws.id }), 'doublon');
  await createLink({ type: 'originates', fromId: w.need.id, toId: ws2.id });
  assert.equal((await linkedItems(w.need.id)).length, 2);
  t.close();
});

test('liens : candidats (bon type, pas déjà reliés, même projet)', async () => {
  const t = await migratedDb();
  const w = await world();
  const other = await createProject('Autre');
  await createWorkshop({ projectId: other, title: 'Ailleurs' });
  const ws2 = await createWorkshop({ projectId: w.p, title: 'Second' });
  assert.deepEqual((await linkCandidates(w.need.id, 'originates', 'out')).map((c) => c.code).sort(), ['ATL-001', 'ATL-002']);
  await createLink({ type: 'originates', fromId: w.need.id, toId: w.ws.id });
  assert.deepEqual((await linkCandidates(w.need.id, 'originates', 'out')).map((c) => c.code), [ws2.code]);
  assert.deepEqual((await linkCandidates(w.ws.id, 'participates', 'in')).map((c) => c.code), ['PP-001']);
  assert.deepEqual((await linkCandidates(w.ws.id, 'originates', 'in')).map((c) => c.code).sort(), ['DEC-001', 'EX-001', 'RIS-001']);
  const ownOther = await createStakeholder({ projectId: other, title: 'Ailleurs' });
  const wsOther = (await listWorkshops(other))[0];
  await assert.rejects(createLink({ type: 'participates', fromId: ownOther.id, toId: w.ws.id }), 'deux projets');
  assert.ok(wsOther);
  t.close();
});

test('traçabilité : les ateliers et leurs liens ne changent rien au calcul de M6 (D84)', async () => {
  const t = await migratedDb();
  const w = await world();
  const before = JSON.stringify(await getTraceability(w.p));
  await createLink({ type: 'originates', fromId: w.ex.id, toId: w.ws.id });
  await createLink({ type: 'participates', fromId: w.sh.id, toId: w.ws.id });
  await changeItemStatus(w.ws.id, 'archived');
  assert.equal(JSON.stringify(await getTraceability(w.p)), before, 'ni couverture, ni orphelins, ni éléments ignorés');
  t.close();
});

// ------------------------------------------------------------------ suppression, garde, intégrité

test('suppression : un atelier lié part avec ses liens et ses détails, les éléments qui en provenaient restent', async () => {
  const t = await migratedDb();
  const w = await world();
  await createLink({ type: 'originates', fromId: w.ex.id, toId: w.ws.id });
  await createLink({ type: 'participates', fromId: w.sh.id, toId: w.ws.id });
  await deleteItem(w.ws.id);
  assert.equal(await getWorkshop(w.ws.id), null);
  assert.equal(await count('workshop_details'), 0);
  assert.equal(await count('links'), 0);
  assert.ok(await count('items') >= 5, 'exigence, partie prenante… restent');
  t.close();
});

test('suppression du projet : ateliers, détails et liens partent avec lui', async () => {
  const t = await migratedDb();
  const w = await world();
  await createLink({ type: 'originates', fromId: w.ex.id, toId: w.ws.id });
  await deleteProject(w.p);
  for (const table of ['items', 'workshop_details', 'links']) assert.equal(await count(table), 0, table);
  t.close();
});

test('garde : les détails d\'atelier ne s\'écrivent jamais seuls', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const w = await createWorkshop({ projectId: p, title: 'W' });
  await assert.rejects(mutate([{ sql: 'UPDATE workshop_details SET notes = ? WHERE item_id = ?', params: ['x', w.id], extension: true }]), 'sans opération journalisée');
  await assert.rejects(mutate([{ sql: 'UPDATE workshop_details SET notes = ? WHERE item_id = ?', params: ['x', w.id] }]), 'sans drapeau d\'extension');
  assert.equal((await getWorkshop(w.id))?.notes, '');
  t.close();
});

test('intégrité : chaque anomalie d\'atelier est détectée, une à la fois, puis disparaît une fois réparée', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const w = await createWorkshop({ projectId: p, title: 'W' });
  const problems = async () => (await checkModelIntegrity()).map((x) => x.problem).sort();
  assert.deepEqual(await problems(), []);
  t.raw.exec(`DELETE FROM workshop_details WHERE item_id = ${w.id}`);
  assert.deepEqual(await problems(), ['workshop-details-missing']);
  t.raw.exec(`INSERT INTO workshop_details (item_id) VALUES (${w.id})`);
  assert.deepEqual(await problems(), []);
  t.raw.exec(`UPDATE workshop_details SET held_on = '2026-02-30' WHERE item_id = ${w.id}`);
  assert.deepEqual(await problems(), ['workshop-invalid-date']);
  t.raw.exec(`UPDATE workshop_details SET held_on = '' WHERE item_id = ${w.id}`);
  assert.deepEqual(await problems(), []);
  t.raw.exec(`UPDATE items SET kind = 'need' WHERE id = ${w.id}`);
  assert.ok((await problems()).includes('workshop-details-wrong-kind'));
  t.close();
});
