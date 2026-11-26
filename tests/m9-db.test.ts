// Lot M9, étape 3 : création du projet d'exemple en base (dépôts réels, base migrée).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDb } from './helpers/setup.ts';
import { snapshot } from './helpers/seed.ts';
import { query } from '../src/data/db.ts';
import { createProject, deleteProject, listProjects } from '../src/data/repositories/projects.ts';
import { createItem } from '../src/data/repositories/items.ts';
import { createSampleProject, findSampleProject } from '../src/data/repositories/sample-project.ts';
import { getTraceability } from '../src/data/repositories/traceability.ts';
import { checkModelIntegrity } from '../src/data/repositories/integrity.ts';
import { loadProjectData } from '../src/data/repositories/project-export.ts';
import { MODELS, generateDeliverable } from '../src/export/deliverables/models.ts';
import type { DItem } from '../src/domain/project-data.ts';
import { SAMPLE_ITEMS, SAMPLE_LINKS, SAMPLE_PROJECT_NAME } from '../src/domain/sample-project.ts';

const codes = (list: Array<{ code: string }>) => list.map((r) => r.code).sort();

test('création : 38 éléments, 52 liens, codes attendus, statuts et champs propres écrits', async () => {
  const t = await migratedDb();
  try {
    const r = await createSampleProject();
    assert.deepEqual({ items: r.items, links: r.links }, { items: 38, links: 52 });
    assert.equal(await findSampleProject(), r.projectId);
    const items = await query<{ code: string; kind: string; status: string; title: string }>('SELECT code, kind, status, title FROM items WHERE project_id = ? ORDER BY id', [r.projectId]);
    assert.equal(items.length, 38);
    for (const s of SAMPLE_ITEMS) {
      const row = items.find((i) => i.code === s.key);
      assert.ok(row, `${s.key} existe`);
      assert.equal(row.status, s.status, `${s.key} : statut`);
      assert.equal(row.title, s.title);
    }
    const links = await query<{ link_type: string }>('SELECT link_type FROM links WHERE project_id = ?', [r.projectId]);
    assert.equal(links.length, SAMPLE_LINKS.length);
    const test3 = await query<{ test_type: string; last_run_on: string }>("SELECT d.test_type, d.last_run_on FROM test_details d JOIN items i ON i.id = d.item_id WHERE i.code = 'TEST-003'");
    assert.deepEqual(test3[0], { test_type: 'integration', last_run_on: '2026-09-10' });
  } finally { t.close(); }
});

test('le projet créé est cohérent : contrôle d\'intégrité sans anomalie, journal rempli par les dépôts', async () => {
  const t = await migratedDb();
  try {
    const r = await createSampleProject();
    assert.deepEqual(await checkModelIntegrity(), []);
    const created = await query<{ n: number }>("SELECT COUNT(*) AS n FROM activity_log WHERE project_id = ? AND action = 'created' AND object_type = 'item'", [r.projectId]);
    assert.equal(created[0].n, 38);
    const linkLog = await query<{ n: number }>("SELECT COUNT(*) AS n FROM activity_log WHERE project_id = ? AND object_type = 'link' AND action = 'created'", [r.projectId]);
    assert.equal(linkLog[0].n, 52);
  } finally { t.close(); }
});

test('traçabilité calculée sur la vraie base : manques et résultats validés à l\'étape 1', async () => {
  const t = await migratedDb();
  try {
    const r = await createSampleProject();
    const tr = await getTraceability(r.projectId);
    assert.deepEqual(codes(tr.orphans.requirementsWithoutStory), ['EX-006', 'EX-007', 'EX-008']);
    assert.deepEqual(codes(tr.orphans.requirementsWithoutTest), ['EX-008']);
    assert.deepEqual(codes(tr.orphans.storiesWithoutRequirement), ['US-006']);
    assert.deepEqual(codes(tr.orphans.storiesWithoutTest), ['US-006']);
    assert.deepEqual([tr.orphans.stakeholdersWithoutNeed, tr.orphans.needsWithoutRequirement, tr.orphans.testsWithoutTarget].map((l) => l.length), [0, 0, 0]);
    assert.deepEqual(Object.fromEntries(tr.matrix.map((m) => [m.code, m.result])), { 'EX-001': 'passed', 'EX-002': 'passed', 'EX-003': 'failed', 'EX-004': 'to_run', 'EX-005': 'passed', 'EX-006': 'blocked', 'EX-007': 'passed', 'EX-008': 'none' });
  } finally { t.close(); }
});

test('les sept modèles de livrables se génèrent sur le projet d\'exemple, avec ou sans archivés (RIS-004)', async () => {
  const t = await migratedDb();
  try {
    const r = await createSampleProject();
    const data = await loadProjectData(r.projectId);
    assert.ok(data);
    assert.equal(data.projectName, SAMPLE_PROJECT_NAME);
    const workshopId = data.items.find((i) => i.kind === 'workshop')?.id ?? null;
    for (const m of MODELS) {
      const without: string = generateDeliverable(m.id, data, { includeArchived: false, workshopId }).markdown;
      const withAll: string = generateDeliverable(m.id, data, { includeArchived: true, workshopId }).markdown;
      assert.ok(without.length > 200, `${m.id} : contenu`);
      if (m.id === 'risks') {
        assert.ok(!without.includes('RIS-004') && withAll.includes('RIS-004'), 'le filtre des archivés agit sur le registre des risques');
      }
    }
    const report = generateDeliverable('workshop-report', data, { includeArchived: false, workshopId }).markdown;
    assert.ok(report.includes('Atelier de cadrage du portail de réservation') && report.includes('ATL-001'));
  } finally { t.close(); }
});

test('doublon refusé : un second appel échoue sans rien écrire', async () => {
  const t = await migratedDb();
  try {
    await createSampleProject();
    const before = snapshot(t.raw);
    await assert.rejects(() => createSampleProject(), /existe déjà/);
    assert.deepEqual(snapshot(t.raw), before);
    assert.equal((await listProjects()).filter((p) => p.name === SAMPLE_PROJECT_NAME).length, 1);
  } finally { t.close(); }
});

test('base déjà remplie : les autres projets ne sont ni modifiés ni liés à l\'exemple, et leurs codes restent indépendants', async () => {
  const t = await migratedDb();
  try {
    const other = await createProject('Mon vrai projet');
    await createItem({ projectId: other, kind: 'need', title: 'Besoin existant' });
    const r = await createSampleProject();
    const mine = await query<{ code: string }>('SELECT code FROM items WHERE project_id = ?', [other]);
    assert.deepEqual(mine, [{ code: 'BES-001' }]);
    const cross = await query<{ n: number }>('SELECT COUNT(*) AS n FROM links WHERE project_id = ?', [other]);
    assert.equal(cross[0].n, 0);
    assert.notEqual(r.projectId, other);
    assert.equal((await query<{ n: number }>('SELECT COUNT(*) AS n FROM items WHERE project_id = ?', [r.projectId]))[0].n, 38);
  } finally { t.close(); }
});

test('suppression : la suppression de projet habituelle retire tout, puis l\'exemple peut être recréé avec les mêmes codes', async () => {
  const t = await migratedDb();
  try {
    const first = await createSampleProject();
    await deleteProject(first.projectId);
    assert.equal(await findSampleProject(), null);
    assert.equal((await query<{ n: number }>('SELECT COUNT(*) AS n FROM items'))[0].n, 0);
    assert.equal((await query<{ n: number }>('SELECT COUNT(*) AS n FROM links'))[0].n, 0);
    const second = await createSampleProject();
    assert.notEqual(second.projectId, first.projectId);
    const bes = await query<{ code: string }>("SELECT code FROM items WHERE project_id = ? AND kind = 'need' ORDER BY number", [second.projectId]);
    assert.deepEqual(bes.map((b) => b.code), ['BES-001', 'BES-002', 'BES-003', 'BES-004']);
    assert.deepEqual(await checkModelIntegrity(), []);
  } finally { t.close(); }
});

test('échec en cours de création : le projet partiel est supprimé, rien ne subsiste, l\'erreur est claire', async () => {
  const t = await migratedDb();
  try {
    const brokenLink = [...SAMPLE_LINKS.slice(0, 10), { type: 'verifies' as const, from: 'PP-001', to: 'EX-001' }];
    await assert.rejects(() => createSampleProject({ items: SAMPLE_ITEMS, links: brokenLink }), /Création du projet d'exemple impossible : .*Lien refusé/);
    assert.equal(await findSampleProject(), null);
    assert.equal((await query<{ n: number }>('SELECT COUNT(*) AS n FROM items'))[0].n, 0);
    assert.equal((await query<{ n: number }>('SELECT COUNT(*) AS n FROM links'))[0].n, 0);
    assert.equal((await listProjects()).length, 0);
    // Les tables de comptage (séquences) et le journal gardent la trace de la tentative : c'est voulu, ce sont des tables techniques.
    const badField = SAMPLE_ITEMS.map((i) => (i.key === 'EX-003' ? { ...i, title: ' ' } : i));
    await assert.rejects(() => createSampleProject({ items: badField, links: SAMPLE_LINKS }), /Création du projet d'exemple impossible/);
    assert.equal(await findSampleProject(), null);
    assert.equal((await query<{ n: number }>('SELECT COUNT(*) AS n FROM items'))[0].n, 0);
    // Après deux échecs, une création normale réussit et donne les codes attendus.
    const ok = await createSampleProject();
    const first = await query<{ code: string }>("SELECT code FROM items WHERE project_id = ? AND kind = 'stakeholder' ORDER BY number LIMIT 1", [ok.projectId]);
    assert.equal(first[0].code, 'PP-001');
  } finally { t.close(); }
});

test('un code inattendu est détecté avant de créer des liens faux', async () => {
  const t = await migratedDb();
  try {
    const shifted = SAMPLE_ITEMS.map((i) => (i.key === 'PP-001' ? { ...i, key: 'PP-009' } : i));
    await assert.rejects(() => createSampleProject({ items: shifted, links: [] }), /au lieu de PP-009/);
    assert.equal(await findSampleProject(), null);
  } finally { t.close(); }
});

test('champs propres : chaque valeur de chaque élément est bien écrite dans sa table de détails', async () => {
  const t = await migratedDb();
  try {
    const r = await createSampleProject();
    const data = await loadProjectData(r.projectId);
    assert.ok(data);
    const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    for (const s of SAMPLE_ITEMS) {
      const row: DItem | undefined = data.items.find((i) => i.code === s.key);
      assert.ok(row, s.key);
      assert.equal(row.description, s.description, `${s.key} : description`);
      for (const [k, v] of Object.entries(s.fields)) assert.equal(row.d[snake(k)], v, `${s.key} : ${k}`);
    }
  } finally { t.close(); }
});
