// Lot M4 : décisions, risques, liens étendus (décisions D52 à D60). Ce fichier couvre le domaine, la base et les dépôts ; les écrans sont dans ui-m4.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { emptyDb, migratedDb } from './helpers/setup.ts';
import { seedAllTables, snapshot } from './helpers/seed.ts';
import { query } from '../src/data/db.ts';
import { mutate } from '../src/data/mutate.ts';
import { migrate, getSchemaVersion } from '../src/data/migrate.ts';
import { migrations, SCHEMA_VERSION } from '../src/data/migrations/index.ts';
import { createBackup, restoreBackup } from '../src/data/backup-service.ts';
import { createProject, deleteProject } from '../src/data/repositories/projects.ts';
import { changeItemStatus, createItem, deleteItem, getItem } from '../src/data/repositories/items.ts';
import { createRequirement } from '../src/data/repositories/requirements.ts';
import { createDecision, getDecision, listDecisions, updateDecision } from '../src/data/repositories/decisions.ts';
import { createRisk, getRisk, listRisks, updateRisk } from '../src/data/repositories/risks.ts';
import { createLink, deleteLink, linkCandidates, linkedItems } from '../src/data/repositories/links.ts';
import { checkModelIntegrity } from '../src/data/repositories/integrity.ts';
import { DEFAULT_DECISION_FIELDS, MAX_DECIDER_LENGTH, MAX_DECISION_TEXT_LENGTH, changedDecisionFields, dayLabel, isCalendarDate, normalizeDecisionFields } from '../src/domain/decisions.ts';
import { DEFAULT_RISK_FIELDS, MAX_MITIGATION_LENGTH, MAX_OWNER_LENGTH, changedRiskFields, normalizeRiskFields } from '../src/domain/risks.ts';
import { EXPOSED_LINK_TYPES, LINK_RULES, canLoop, linkOptionsFor } from '../src/domain/links.ts';
import { KINDS_WITH_DETAILS, initialStatus, isValidStatus, kindInfo, statusLabel } from '../src/domain/kinds.ts';
import { EXTENSION_TABLES } from '../src/data/sql-guard.ts';

const count = async (table: string): Promise<number> => Number((await query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))[0].n);
const lastLine = async (): Promise<{ object_type: string; action: string; detail: string | null }> =>
  (await query<{ object_type: string; action: string; detail: string | null }>('SELECT object_type, action, detail FROM activity_log ORDER BY id DESC LIMIT 1'))[0];

// ------------------------------------------------------------------ domaine pur

test('domaine : statuts des décisions (D54) et des risques (D56), libellés accordés', () => {
  assert.deepEqual([...kindInfo('decision').statuses], ['proposed', 'decided', 'superseded', 'cancelled', 'archived']);
  assert.deepEqual([...kindInfo('risk').statuses], ['identified', 'mitigating', 'accepted', 'closed', 'archived']);
  assert.equal(initialStatus('decision'), 'proposed');
  assert.equal(initialStatus('risk'), 'identified');
  assert.ok(isValidStatus('decision', 'superseded') && !isValidStatus('decision', 'draft') && !isValidStatus('risk', 'decided'));
  assert.deepEqual(['proposed', 'decided', 'superseded', 'cancelled', 'archived'].map((s) => statusLabel(s, 'decision')), ['Proposée', 'Prise', 'Remplacée', 'Annulée', 'Archivée']);
  assert.deepEqual(['identified', 'mitigating', 'accepted', 'closed', 'archived'].map((s) => statusLabel(s, 'risk')), ['Identifié', 'En traitement', 'Accepté', 'Clos', 'Archivé']);
  assert.equal(statusLabel('archived'), 'Archivé', 'sans type : forme par défaut');
  assert.equal(statusLabel('archived', 'need'), 'Archivé');
  assert.equal(statusLabel('zzz', 'decision'), 'Inconnu (zzz)');
  assert.deepEqual([...KINDS_WITH_DETAILS].sort(), ['decision', 'requirement', 'risk', 'stakeholder', 'story', 'test', 'workshop']);
  assert.ok(EXTENSION_TABLES.includes('decision_details') && EXTENSION_TABLES.includes('risk_details'));
});

test('domaine : dates de décision (jour réel du calendrier, format AAAA-MM-JJ, années bissextiles)', () => {
  for (const ok of ['2026-11-25', '2024-02-29', '2000-02-29', '1900-01-01', '2026-12-31']) assert.ok(isCalendarDate(ok), ok);
  for (const bad of ['', '2026-02-30', '2025-02-29', '1900-02-29', '2026-13-01', '2026-00-10', '2026-11-00', '2026-11-31', '25/11/2026', '2026-1-5', '2026-11-25T10:00', ' 2026-11-25', 'abc', '1899-12-31']) assert.ok(!isCalendarDate(bad), JSON.stringify(bad));
  assert.ok(!isCalendarDate(20261125 as unknown as string));
  assert.equal(dayLabel('2026-11-05'), '05/11/2026');
  assert.equal(dayLabel(''), '—');
  assert.match(dayLabel('zzz'), /Invalide \(zzz\)/);
});

test('domaine : champs d\'une décision, valeurs par défaut, limites, journal', () => {
  assert.deepEqual(DEFAULT_DECISION_FIELDS, { decidedOn: '', decider: '', alternatives: '', rationale: '' });
  assert.deepEqual(normalizeDecisionFields({}), DEFAULT_DECISION_FIELDS);
  assert.equal(MAX_DECIDER_LENGTH, 200);
  assert.equal(MAX_DECISION_TEXT_LENGTH, 10000);
  assert.deepEqual(normalizeDecisionFields({ decidedOn: ' 2026-11-25 ', decider: '  Comité  ', rationale: ' garde les espaces ' }), { decidedOn: '2026-11-25', decider: 'Comité', alternatives: '', rationale: ' garde les espaces ' });
  assert.throws(() => normalizeDecisionFields({ decidedOn: '2026-02-30' }), /date de la décision/);
  assert.throws(() => normalizeDecisionFields({ decider: 'x'.repeat(201) }), /décideur est limité à 200/);
  assert.throws(() => normalizeDecisionFields({ alternatives: 'x'.repeat(10001) }), /alternatives sont limitées à 10000/);
  assert.throws(() => normalizeDecisionFields({ rationale: 'x'.repeat(10001) }), /justification est limitée à 10000/);
  assert.equal(normalizeDecisionFields({ rationale: 'x'.repeat(10000) }).rationale.length, 10000);
  assert.deepEqual(changedDecisionFields(DEFAULT_DECISION_FIELDS, { ...DEFAULT_DECISION_FIELDS, decider: 'x', rationale: 'y' }), ['decider', 'rationale']);
  assert.deepEqual(changedDecisionFields(DEFAULT_DECISION_FIELDS, DEFAULT_DECISION_FIELDS), []);
});

test('domaine : champs d\'un risque, niveaux, valeurs par défaut, limites, journal', () => {
  assert.deepEqual(DEFAULT_RISK_FIELDS, { probability: 'medium', impact: 'medium', mitigation: '', owner: '' });
  assert.deepEqual(normalizeRiskFields({}), DEFAULT_RISK_FIELDS);
  assert.equal(MAX_OWNER_LENGTH, 200);
  assert.equal(MAX_MITIGATION_LENGTH, 10000);
  assert.deepEqual(normalizeRiskFields({ probability: 'high', owner: '  Chef de projet ' }), { probability: 'high', impact: 'medium', mitigation: '', owner: 'Chef de projet' });
  assert.throws(() => normalizeRiskFields({ probability: 'énorme' as 'low' }), /probabilité inconnu/);
  assert.throws(() => normalizeRiskFields({ impact: 'nul' as 'low' }), /impact inconnu/);
  assert.throws(() => normalizeRiskFields({ owner: 'x'.repeat(201) }), /responsable est limité à 200/);
  assert.throws(() => normalizeRiskFields({ mitigation: 'x'.repeat(10001) }), /plan de traitement est limité à 10000/);
  assert.deepEqual(changedRiskFields(DEFAULT_RISK_FIELDS, { ...DEFAULT_RISK_FIELDS, impact: 'high', owner: 'x' }), ['impact', 'owner']);
});

test('liens : « remplace » (D58), types exposés (D57, D66), options par type d\'élément', () => {
  assert.equal(LINK_RULES.length, 11);
  const rule = LINK_RULES.find((r) => r.type === 'supersedes');
  assert.deepEqual({ label: rule?.label, inverse: rule?.inverseLabel, from: rule?.from, to: rule?.to }, { label: 'remplace', inverse: 'remplacé par', from: ['decision'], to: ['decision'] });
  assert.ok(canLoop('supersedes'));
  assert.deepEqual([...EXPOSED_LINK_TYPES], ['expresses', 'derives', 'refines', 'implements', 'verifies', 'concerns', 'threatens', 'mitigates', 'supersedes', 'participates', 'originates'], 'implémente et vérifie exposés depuis M5, atelier depuis M7');
  assert.deepEqual(linkOptionsFor('decision').map((o) => o.key), ['concerns:out', 'mitigates:out', 'supersedes:out', 'supersedes:in', 'originates:out']);
  assert.deepEqual(linkOptionsFor('risk').map((o) => o.key), ['concerns:in', 'threatens:out', 'mitigates:in', 'originates:out']);
  assert.deepEqual(linkOptionsFor('risk').map((o) => o.label), ['concerné par', 'menace', 'atténué par', 'provient de']);
  assert.deepEqual(linkOptionsFor('decision').map((o) => o.label), ['concerne', 'atténue', 'remplace', 'remplacée par', 'provient de']);
  assert.deepEqual(linkOptionsFor('test').map((o) => o.key), ['verifies:out']);
});

// ------------------------------------------------------------------ migration 5

test('migration 5 : deux tables ajoutées, données existantes intactes, sauvegarde pre-migration au schéma 4', async () => {
  assert.ok(SCHEMA_VERSION >= 5, 'la migration 5 reste livrée ; M5 en ajoute une sixième, M7 une septième');
  assert.equal(migrations[4].name, 'decision_risk_details');
  const t = emptyDb();
  await migrate(migrations.slice(0, 4), { backup: t.driver.backup });
  t.raw.exec("INSERT INTO projects (id, kind, name, created_at, updated_at) VALUES (1, 'project', 'Avant', 'x', 'x')");
  t.raw.exec("INSERT INTO items (id, project_id, kind, number, code, title, description, status, created_at, updated_at) VALUES (1, 1, 'requirement', 1, 'EX-001', 'E', '', 'draft', 'x', 'x')");
  t.raw.exec('INSERT INTO requirement_details (item_id) VALUES (1)');
  t.raw.exec("INSERT INTO activity_log (at, object_type, object_id, action) VALUES ('x', 'item', 1, 'created')");
  const before = snapshot(t.raw);
  const report = await migrate(migrations.slice(0, 5), { backup: t.driver.backup });
  assert.deepEqual(report.applied, [5]);
  assert.equal(await getSchemaVersion(), 5);
  assert.equal(t.backups.filter((b) => b.kind === 'pre-migration').length, 1);
  const after = snapshot(t.raw);
  for (const table of Object.keys(before).filter((n) => n !== 'meta')) assert.deepEqual(after[table], before[table], `la table ${table} est inchangée`);
  assert.equal(after.decision_details.count, 0);
  assert.equal(after.risk_details.count, 0);
  const copy = new DatabaseSync(t.backups[t.backups.length - 1].file, { readOnly: true });
  assert.equal((copy.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('decision_details', 'risk_details')").get() as { n: number }).n, 0, 'la sauvegarde garde le schéma 4');
  copy.close();
  t.close();
});

test('migration 5 : valeurs par défaut en base, cascade avec l\'élément, jeu de test à jour', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const d = await createDecision({ projectId: p, title: 'D' });
  const r = await createRisk({ projectId: p, title: 'R' });
  t.raw.exec(`DELETE FROM decision_details; DELETE FROM risk_details;`);
  t.raw.exec(`INSERT INTO decision_details (item_id) VALUES (${d.id}); INSERT INTO risk_details (item_id) VALUES (${r.id})`);
  assert.deepEqual({ ...(t.raw.prepare('SELECT decided_on, decider, alternatives, rationale FROM decision_details').get() as Record<string, string>) }, { decided_on: '', decider: '', alternatives: '', rationale: '' });
  assert.deepEqual({ ...(t.raw.prepare('SELECT probability, impact, mitigation, owner FROM risk_details').get() as Record<string, string>) }, { probability: 'medium', impact: 'medium', mitigation: '', owner: '' });
  t.raw.exec(`DELETE FROM items WHERE id IN (${d.id}, ${r.id})`);
  assert.equal(await count('decision_details'), 0);
  assert.equal(await count('risk_details'), 0);
  t.close();
});

test('migration 5 : le jeu de test couvre les deux tables', async () => {
  const t = await migratedDb();
  seedAllTables(t.raw);
  const s = snapshot(t.raw);
  assert.equal(s.decision_details.count, 1);
  assert.equal(s.risk_details.count, 1);
  t.close();
});

// ------------------------------------------------------------------ décisions

test('décision : code DEC-001…, statut proposée, valeurs par défaut, détails créés avec l\'élément, une ligne de journal', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const before = await count('activity_log');
  const a = await createDecision({ projectId: p, title: '  Choisir SQLite  ' });
  assert.equal(a.code, 'DEC-001');
  assert.equal(await count('activity_log'), before + 1, 'une seule ligne pour l\'élément et ses détails');
  assert.deepEqual(await lastLine(), { object_type: 'item', action: 'created', detail: 'decision' });
  const d = await getDecision(a.id);
  assert.deepEqual({ t: d?.title, s: d?.status, on: d?.decided_on, by: d?.decider, alt: d?.alternatives, why: d?.rationale }, { t: 'Choisir SQLite', s: 'proposed', on: '', by: '', alt: '', why: '' });
  const b = await createDecision({ projectId: p, title: 'Hors ligne', decidedOn: '2026-11-20', decider: ' Comité ', alternatives: 'A\nB', rationale: 'Parce que' });
  assert.equal(b.code, 'DEC-002');
  const got = await getDecision(b.id);
  assert.deepEqual({ on: got?.decided_on, by: got?.decider, alt: got?.alternatives }, { on: '2026-11-20', by: 'Comité', alt: 'A\nB' });
  assert.deepEqual((await listDecisions(p)).map((x) => x.code), ['DEC-001', 'DEC-002']);
  assert.deepEqual((await listDecisions(p, 'decided')), []);
  assert.equal(await getDecision(9999), null);
  t.close();
});

test('décision : valeurs invalides refusées sans écrire, createItem refuse un type à détails, un échec des détails annule tout', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  await assert.rejects(createDecision({ projectId: p, title: 'X', decidedOn: '2026-02-30' }), /date de la décision/);
  await assert.rejects(createDecision({ projectId: p, title: 'X', decider: 'x'.repeat(201) }), /200/);
  await assert.rejects(createDecision({ projectId: p, title: '   ' }), /titre/i);
  assert.equal(await count('items'), 0);
  await assert.rejects(createItem({ projectId: p, kind: 'decision', title: 'Sans détails' }), /dépôt de son type/);
  await assert.rejects(createItem({ projectId: p, kind: 'risk', title: 'Sans détails' }), /dépôt de son type/);
  assert.equal(await count('items'), 0);
  t.raw.exec("CREATE TRIGGER fail_dd BEFORE INSERT ON decision_details BEGIN SELECT RAISE(ABORT, 'panne simulée'); END");
  await assert.rejects(createDecision({ projectId: p, title: 'Ne doit pas exister' }), /panne simulée/);
  assert.equal(await count('items'), 0);
  assert.equal(await count('sequences'), 0, 'aucun numéro consommé');
  t.raw.exec('DROP TRIGGER fail_dd');
  assert.equal((await createDecision({ projectId: p, title: 'Maintenant' })).code, 'DEC-001');
  t.close();
});

test('décision : modification atomique, journal « updated » qui nomme les champs sans contenu, aucune écriture si rien ne change', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const d = await createDecision({ projectId: p, title: 'D', rationale: 'avant' });
  const before = await count('activity_log');
  assert.equal(await updateDecision(d.id, { title: 'D' }), false);
  assert.equal(await updateDecision(d.id, { fields: { rationale: 'avant', decidedOn: '' } }), false);
  assert.equal(await count('activity_log'), before);
  assert.equal(await updateDecision(d.id, { title: 'D2', fields: { decidedOn: '2026-11-25', rationale: 'secret confidentiel' } }), true);
  assert.equal(await count('activity_log'), before + 1);
  const line = await lastLine();
  assert.equal(line.action, 'updated');
  assert.equal(line.detail, 'title,decidedOn,rationale');
  assert.ok(!(line.detail ?? '').includes('confidentiel'));
  const now = await getDecision(d.id);
  assert.deepEqual({ t: now?.title, on: now?.decided_on, why: now?.rationale }, { t: 'D2', on: '2026-11-25', why: 'secret confidentiel' });
  await assert.rejects(updateDecision(d.id, { fields: { decidedOn: '2026-13-01' } }), /date de la décision/);
  assert.equal((await getDecision(d.id))?.decided_on, '2026-11-25', 'une modification refusée ne change rien');
  assert.equal(await updateDecision(d.id, { fields: { decidedOn: '' } }), true, 'la date peut être effacée');
  assert.equal((await getDecision(d.id))?.decided_on, '');
  await assert.rejects(updateDecision(9999, { title: 'x' }), /n'existe pas/);
  t.close();
});

test('décision : statuts libres entre eux (D54), statut d\'un autre type refusé', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const d = await createDecision({ projectId: p, title: 'D' });
  for (const s of ['decided', 'superseded', 'proposed', 'cancelled', 'archived', 'decided']) {
    await changeItemStatus(d.id, s);
    assert.equal((await getItem(d.id))?.status, s);
  }
  await assert.rejects(changeItemStatus(d.id, 'draft'), /statut/i);
  await assert.rejects(changeItemStatus(d.id, 'identified'), /statut/i);
  t.close();
});

// ------------------------------------------------------------------ risques

test('risque : code RIS-001…, statut identifié, niveaux par défaut, détails créés avec l\'élément, une ligne de journal', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const before = await count('activity_log');
  const a = await createRisk({ projectId: p, title: 'Retard de livraison' });
  assert.equal(a.code, 'RIS-001');
  assert.equal(await count('activity_log'), before + 1);
  const r = await getRisk(a.id);
  assert.deepEqual({ s: r?.status, p: r?.probability, i: r?.impact, m: r?.mitigation, o: r?.owner }, { s: 'identified', p: 'medium', i: 'medium', m: '', o: '' });
  const b = await createRisk({ projectId: p, title: 'Perte de données', probability: 'low', impact: 'high', mitigation: 'Sauvegardes\nquotidiennes', owner: ' DSI ' });
  assert.equal(b.code, 'RIS-002');
  const got = await getRisk(b.id);
  assert.deepEqual({ p: got?.probability, i: got?.impact, m: got?.mitigation, o: got?.owner }, { p: 'low', i: 'high', m: 'Sauvegardes\nquotidiennes', o: 'DSI' });
  assert.deepEqual((await listRisks(p)).map((x) => x.code), ['RIS-001', 'RIS-002']);
  assert.deepEqual(await listRisks(p, 'closed'), []);
  t.close();
});

test('risque : valeurs invalides refusées sans écrire, un échec des détails annule tout, statuts libres', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  await assert.rejects(createRisk({ projectId: p, title: 'X', probability: 'zzz' as 'low' }), /probabilité/);
  await assert.rejects(createRisk({ projectId: p, title: 'X', impact: 'zzz' as 'low' }), /impact/);
  await assert.rejects(createRisk({ projectId: p, title: 'X', owner: 'x'.repeat(201) }), /200/);
  assert.equal(await count('items'), 0);
  t.raw.exec("CREATE TRIGGER fail_rd BEFORE INSERT ON risk_details BEGIN SELECT RAISE(ABORT, 'panne simulée'); END");
  await assert.rejects(createRisk({ projectId: p, title: 'Ne doit pas exister' }), /panne simulée/);
  assert.equal(await count('items'), 0);
  assert.equal(await count('sequences'), 0);
  t.raw.exec('DROP TRIGGER fail_rd');
  const r = await createRisk({ projectId: p, title: 'R' });
  for (const s of ['mitigating', 'accepted', 'closed', 'identified', 'archived']) {
    await changeItemStatus(r.id, s);
    assert.equal((await getItem(r.id))?.status, s);
  }
  await assert.rejects(changeItemStatus(r.id, 'decided'), /statut/i);
  t.close();
});

test('risque : modification atomique, journal sans contenu, aucune écriture si rien ne change', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const r = await createRisk({ projectId: p, title: 'R', owner: 'A' });
  const before = await count('activity_log');
  assert.equal(await updateRisk(r.id, { fields: { owner: 'A', probability: 'medium' } }), false);
  assert.equal(await count('activity_log'), before);
  assert.equal(await updateRisk(r.id, { fields: { probability: 'high', mitigation: 'plan confidentiel' } }), true);
  assert.equal(await count('activity_log'), before + 1);
  const line = await lastLine();
  assert.equal(line.detail, 'probability,mitigation');
  assert.ok(!(line.detail ?? '').includes('confidentiel'));
  await assert.rejects(updateRisk(r.id, { fields: { impact: 'zzz' as 'low' } }), /impact/);
  assert.equal((await getRisk(r.id))?.probability, 'high');
  await assert.rejects(updateRisk(9999, { title: 'x' }), /n'existe pas/);
  t.close();
});

test('décision et risque : texte hostile conservé tel quel, jamais interprété', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const hostile = "'); DROP TABLE items; -- <script>alert(1)</script> é « » \\ %s ${x}";
  const d = await createDecision({ projectId: p, title: hostile, description: hostile, decider: hostile.slice(0, 100), alternatives: hostile, rationale: hostile });
  const r = await createRisk({ projectId: p, title: hostile, description: hostile, mitigation: hostile, owner: hostile.slice(0, 100) });
  assert.equal((await getDecision(d.id))?.rationale, hostile);
  assert.equal((await getRisk(r.id))?.mitigation, hostile);
  assert.equal(await count('items'), 2);
  t.close();
});

// ------------------------------------------------------------------ liens

async function world() {
  const p = await createProject('P');
  const need = await createItem({ projectId: p, kind: 'need', title: 'Besoin' });
  const req = await createRequirement({ projectId: p, title: 'Exigence' });
  const risk = await createRisk({ projectId: p, title: 'Risque' });
  const d1 = await createDecision({ projectId: p, title: 'D1' });
  const d2 = await createDecision({ projectId: p, title: 'D2' });
  const d3 = await createDecision({ projectId: p, title: 'D3' });
  return { p, need, req, risk, d1, d2, d3 };
}

test('liens : concerne, menace, atténue créés et lus depuis chaque extrémité avec le bon sens', async () => {
  const t = await migratedDb();
  const w = await world();
  await createLink({ type: 'concerns', fromId: w.d1.id, toId: w.req.id });
  await createLink({ type: 'concerns', fromId: w.d1.id, toId: w.need.id });
  await createLink({ type: 'concerns', fromId: w.d1.id, toId: w.risk.id });
  await createLink({ type: 'threatens', fromId: w.risk.id, toId: w.req.id });
  await createLink({ type: 'mitigates', fromId: w.req.id, toId: w.risk.id });
  await createLink({ type: 'mitigates', fromId: w.d2.id, toId: w.risk.id });
  const shape = (l: { link_type: string; direction: string; other_code: string }) => [l.link_type, l.direction, l.other_code];
  assert.deepEqual((await linkedItems(w.risk.id)).map(shape), [['concerns', 'in', 'DEC-001'], ['mitigates', 'in', 'DEC-002'], ['mitigates', 'in', 'EX-001'], ['threatens', 'out', 'EX-001']]);
  assert.deepEqual((await linkedItems(w.req.id)).map(shape), [['concerns', 'in', 'DEC-001'], ['mitigates', 'out', 'RIS-001'], ['threatens', 'in', 'RIS-001']]);
  assert.deepEqual((await linkedItems(w.d1.id)).map(shape), [['concerns', 'out', 'BES-001'], ['concerns', 'out', 'EX-001'], ['concerns', 'out', 'RIS-001']]);
  assert.deepEqual(await checkModelIntegrity(), []);
  t.close();
});

test('liens : couples interdits refusés (risque qui menace une décision, besoin qui atténue, décision qui menace)', async () => {
  const t = await migratedDb();
  const w = await world();
  await assert.rejects(createLink({ type: 'threatens', fromId: w.risk.id, toId: w.d1.id }), /refusé/);
  await assert.rejects(createLink({ type: 'mitigates', fromId: w.need.id, toId: w.risk.id }), /refusé/);
  await assert.rejects(createLink({ type: 'threatens', fromId: w.d1.id, toId: w.req.id }), /refusé/);
  await assert.rejects(createLink({ type: 'concerns', fromId: w.req.id, toId: w.d1.id }), /refusé/);
  assert.equal(await count('links'), 0);
  t.close();
});

test('liens : « remplace » entre décisions, doublon refusé, lien à soi-même refusé, chaîne et boucles refusées (D58, D50)', async () => {
  const t = await migratedDb();
  const w = await world();
  await createLink({ type: 'supersedes', fromId: w.d2.id, toId: w.d1.id });
  await assert.rejects(createLink({ type: 'supersedes', fromId: w.d2.id, toId: w.d1.id }), /existe déjà/);
  await assert.rejects(createLink({ type: 'supersedes', fromId: w.d1.id, toId: w.d1.id }), /lui-même/);
  await assert.rejects(createLink({ type: 'supersedes', fromId: w.d1.id, toId: w.d2.id }), /boucle/);
  await createLink({ type: 'supersedes', fromId: w.d3.id, toId: w.d2.id });
  await assert.rejects(createLink({ type: 'supersedes', fromId: w.d1.id, toId: w.d3.id }), /boucle.*DEC-001.*DEC-003|boucle/);
  await createLink({ type: 'supersedes', fromId: w.d3.id, toId: w.d1.id }); // raccourci : pas une boucle
  assert.equal(await count('links'), 3);
  assert.deepEqual((await linkedItems(w.d1.id)).map((l) => [l.link_type, l.direction, l.other_code]), [['supersedes', 'in', 'DEC-002'], ['supersedes', 'in', 'DEC-003']]);
  assert.deepEqual((await linkedItems(w.d3.id)).map((l) => [l.link_type, l.direction, l.other_code]), [['supersedes', 'out', 'DEC-001'], ['supersedes', 'out', 'DEC-002']]);
  assert.deepEqual(await checkModelIntegrity(), []);
  // « remplace » et « concerne » sont indépendants : un cycle sur un type n'est pas un cycle sur l'autre
  await createLink({ type: 'concerns', fromId: w.d1.id, toId: w.risk.id });
  t.close();
});

test('liens : candidats pour les nouveaux types (bon type, pas soi-même, pas déjà reliés, même projet)', async () => {
  const t = await migratedDb();
  const w = await world();
  const other = await createProject('Autre');
  await createDecision({ projectId: other, title: 'Ailleurs' });
  assert.deepEqual((await linkCandidates(w.d1.id, 'supersedes', 'out')).map((c) => c.code), ['DEC-002', 'DEC-003']);
  assert.deepEqual((await linkCandidates(w.risk.id, 'mitigates', 'in')).map((c) => c.code), ['DEC-001', 'DEC-002', 'DEC-003', 'EX-001']);
  assert.deepEqual((await linkCandidates(w.risk.id, 'threatens', 'out')).map((c) => c.code), ['BES-001', 'EX-001']);
  assert.deepEqual((await linkCandidates(w.need.id, 'concerns', 'in')).map((c) => c.code), ['DEC-001', 'DEC-002', 'DEC-003']);
  assert.deepEqual(await linkCandidates(w.need.id, 'mitigates', 'out'), [], 'un besoin n\'atténue rien');
  const id = await createLink({ type: 'supersedes', fromId: w.d1.id, toId: w.d2.id });
  assert.deepEqual((await linkCandidates(w.d1.id, 'supersedes', 'out')).map((c) => c.code), ['DEC-003']);
  assert.deepEqual((await linkCandidates(w.d2.id, 'supersedes', 'in')).map((c) => c.code), ['DEC-003']);
  await deleteLink(id);
  assert.deepEqual((await linkCandidates(w.d1.id, 'supersedes', 'out')).map((c) => c.code), ['DEC-002', 'DEC-003']);
  t.close();
});

test('liens : un lien ne traverse pas deux projets, même pour les nouveaux types', async () => {
  const t = await migratedDb();
  const w = await world();
  const other = await createProject('Autre');
  const foreign = await createRisk({ projectId: other, title: 'Ailleurs' });
  await assert.rejects(createLink({ type: 'mitigates', fromId: w.d1.id, toId: foreign.id }), /même projet/);
  t.close();
});

test('suppression : un élément lié (décision, risque) est supprimé avec ses liens et ses détails, les autres restent', async () => {
  const t = await migratedDb();
  const w = await world();
  await createLink({ type: 'concerns', fromId: w.d1.id, toId: w.risk.id });
  await createLink({ type: 'mitigates', fromId: w.d1.id, toId: w.risk.id });
  await createLink({ type: 'supersedes', fromId: w.d2.id, toId: w.d1.id });
  await deleteItem(w.d1.id);
  assert.equal(await count('links'), 0);
  assert.equal(await getDecision(w.d1.id), null);
  assert.ok(await getRisk(w.risk.id) && await getDecision(w.d2.id));
  assert.equal(await count('decision_details'), 2);
  await deleteItem(w.risk.id);
  assert.equal(await count('risk_details'), 0);
  assert.deepEqual(await checkModelIntegrity(), []);
  t.close();
});

test('suppression du projet : décisions, risques, détails et liens partent avec lui', async () => {
  const t = await migratedDb();
  const w = await world();
  await createLink({ type: 'concerns', fromId: w.d1.id, toId: w.risk.id });
  await deleteProject(w.p);
  for (const tbl of ['items', 'decision_details', 'risk_details', 'requirement_details', 'links']) assert.equal(await count(tbl), 0, tbl);
  t.close();
});

// ------------------------------------------------------------------ garde d'écriture

test('garde : les détails de décision et de risque ne s\'écrivent jamais seuls, ni sur une autre table', async () => {
  const t = await migratedDb();
  const w = await world();
  await assert.rejects(mutate([{ sql: "UPDATE decision_details SET decider = 'x'", extension: true }]), /journal|extension/i);
  await assert.rejects(mutate([{ sql: "UPDATE risk_details SET owner = 'x'" }]), /journal/i);
  await assert.rejects(mutate([{ sql: "UPDATE items SET title = 'x'", extension: true }]), /extension/i);
  assert.equal((await getDecision(w.d1.id))?.decider, '');
  t.close();
});

// ------------------------------------------------------------------ intégrité

test('intégrité : chaque anomalie de décision et de risque est détectée, une à la fois, puis disparaît une fois réparée', async () => {
  const t = await migratedDb();
  const w = await world();
  assert.deepEqual(await checkModelIntegrity(), []);
  const problems = async () => (await checkModelIntegrity()).map((i) => i.problem);
  // décisions
  t.raw.exec(`UPDATE decision_details SET decided_on = '2026-02-30' WHERE item_id = ${w.d1.id}`);
  assert.deepEqual(await problems(), ['decision-invalid-date']);
  t.raw.exec(`UPDATE decision_details SET decided_on = '25/11/2026' WHERE item_id = ${w.d1.id}`);
  assert.deepEqual(await problems(), ['decision-invalid-date']);
  t.raw.exec(`UPDATE decision_details SET decided_on = '2026-11-25' WHERE item_id = ${w.d1.id}`);
  assert.deepEqual(await problems(), []);
  t.raw.exec(`INSERT INTO decision_details (item_id) VALUES (${w.need.id})`);
  assert.deepEqual(await problems(), ['decision-details-wrong-kind']);
  t.raw.exec(`DELETE FROM decision_details WHERE item_id = ${w.need.id}`);
  t.raw.exec(`DELETE FROM decision_details WHERE item_id = ${w.d2.id}`);
  assert.deepEqual(await problems(), ['decision-details-missing']);
  t.raw.exec(`INSERT INTO decision_details (item_id) VALUES (${w.d2.id})`);
  // risques
  t.raw.exec(`UPDATE risk_details SET probability = 'zzz' WHERE item_id = ${w.risk.id}`);
  assert.deepEqual(await problems(), ['risk-invalid-level']);
  t.raw.exec(`UPDATE risk_details SET probability = 'low', impact = 'zzz' WHERE item_id = ${w.risk.id}`);
  assert.deepEqual(await problems(), ['risk-invalid-level']);
  t.raw.exec(`UPDATE risk_details SET impact = 'low' WHERE item_id = ${w.risk.id}`);
  t.raw.exec(`INSERT INTO risk_details (item_id) VALUES (${w.need.id})`);
  assert.deepEqual(await problems(), ['risk-details-wrong-kind']);
  t.raw.exec(`DELETE FROM risk_details WHERE item_id = ${w.need.id}`);
  t.raw.exec(`DELETE FROM risk_details WHERE item_id = ${w.risk.id}`);
  assert.deepEqual(await problems(), ['risk-details-missing']);
  t.raw.exec(`INSERT INTO risk_details (item_id) VALUES (${w.risk.id})`);
  // boucle de « remplace » écrite hors du dépôt
  t.raw.exec(`INSERT INTO links (project_id, link_type, from_id, to_id, created_at) VALUES (${w.p}, 'supersedes', ${w.d1.id}, ${w.d2.id}, 'x'), (${w.p}, 'supersedes', ${w.d2.id}, ${w.d1.id}, 'x')`);
  assert.deepEqual(await problems(), ['link-cycle']);
  t.raw.exec('DELETE FROM links');
  assert.deepEqual(await problems(), []);
  t.close();
});

// ------------------------------------------------------------------ sauvegarde

test('sauvegarde et restauration : décisions, risques, détails et liens reviennent exactement ; la numérotation continue', async () => {
  const t = await migratedDb();
  const w = await world();
  await createLink({ type: 'concerns', fromId: w.d1.id, toId: w.risk.id });
  await createLink({ type: 'supersedes', fromId: w.d2.id, toId: w.d1.id });
  await updateDecision(w.d1.id, { fields: { decidedOn: '2026-11-20', decider: 'Comité' } });
  await updateRisk(w.risk.id, { fields: { probability: 'high', mitigation: 'Plan' } });
  const { created } = await createBackup('manual');
  const saved = snapshot(t.raw);
  await updateDecision(w.d1.id, { fields: { decider: 'Changé' } });
  await createRisk({ projectId: w.p, title: 'Ajouté après' });
  await deleteItem(w.d2.id);
  await restoreBackup(created.file);
  const back = snapshot(t.raw);
  for (const table of ['items', 'decision_details', 'risk_details', 'links', 'sequences', 'projects']) assert.deepEqual(back[table], saved[table], table);
  assert.deepEqual(await checkModelIntegrity(), []);
  assert.equal((await createRisk({ projectId: w.p, title: 'Après restauration' })).code, 'RIS-002');
  assert.equal((await createDecision({ projectId: w.p, title: 'Après restauration' })).code, 'DEC-004');
  t.close();
});
