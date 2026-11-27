// Lot F3 : lectures de l'écran Accueil (brouillons, journal du projet), lignes de modification, branchement (décisions F3-D01 à F3-D09).
// Base SQLite réelle (node:sqlite). Le rendu et les clics sont dans ui-f3.test.ts et à la recette sur clé (TESTS-F3.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { migratedDb } from './helpers/setup.ts';
import { query } from '../src/data/db.ts';
import { createProject } from '../src/data/repositories/projects.ts';
import { changeItemStatus, deleteItem, updateItem } from '../src/data/repositories/items.ts';
import { createRequirement } from '../src/data/repositories/requirements.ts';
import { createStory } from '../src/data/repositories/stories.ts';
import { createDecision } from '../src/data/repositories/decisions.ts';
import { createLink } from '../src/data/repositories/links.ts';
import { createSampleProject } from '../src/data/repositories/sample-project.ts';
import { getTraceability } from '../src/data/repositories/traceability.ts';
import { countDrafts, recentProjectActivity, HOME_ACTIVITY_LIMIT } from '../src/data/repositories/home.ts';
import { activityLine } from '../src/modules/home/logic.ts';
import { ratioText, summaryLines, orphanCount } from '../src/domain/trace-labels.ts';
import type { ProjectActivity } from '../src/data/repositories/home.ts';

const lines = (rows: ProjectActivity[]) => rows.map(activityLine);

test('brouillons : projet d\'exemple = 0 besoin, 2 exigences, 2 user stories (F3-D05)', async () => {
  await migratedDb();
  const { projectId } = await createSampleProject();
  assert.deepEqual(await countDrafts(projectId), { need: 0, requirement: 2, story: 2 });
});

test('brouillons : un élément archivé ou rejeté ne compte pas, et chaque projet ne compte que les siens', async () => {
  await migratedDb();
  const a = await createProject('A');
  const b = await createProject('B');
  const r1 = await createRequirement({ projectId: a, title: 'R1' });
  const r2 = await createRequirement({ projectId: a, title: 'R2' });
  await createRequirement({ projectId: b, title: 'Ailleurs' });
  await createStory({ projectId: a, title: 'S1' });
  assert.deepEqual(await countDrafts(a), { need: 0, requirement: 2, story: 1 });
  await changeItemStatus(r1.id, 'archived');
  await changeItemStatus(r2.id, 'validated');
  assert.deepEqual(await countDrafts(a), { need: 0, requirement: 0, story: 1 });
  assert.deepEqual(await countDrafts(b), { need: 0, requirement: 1, story: 0 });
});

test('brouillons : les types sans statut Brouillon ne sont pas comptés (une décision proposée n\'est pas un brouillon)', async () => {
  await migratedDb();
  const p = await createProject('P');
  await createDecision({ projectId: p, title: 'D' });
  assert.deepEqual(await countDrafts(p), { need: 0, requirement: 0, story: 0 });
});

test('journal du projet : création, statut, modification, suppression, plus récent d\'abord, avec les verbes attendus (F3-D06, F3-D07)', async () => {
  await migratedDb();
  const p = await createProject('P');
  const r = await createRequirement({ projectId: p, title: 'Première' });
  await changeItemStatus(r.id, 'validated');
  await updateItem(r.id, { title: 'Renommée' });
  const l1 = lines(await recentProjectActivity(p));
  assert.deepEqual(l1.map((l) => l.text), ['modifié', 'statut : Brouillon → Validé', 'créé']);
  assert.ok(l1.every((l) => l.code === r.code && l.itemId === r.id && l.kind === 'requirement'));
  assert.equal(l1[0].title, 'Renommée', 'le titre affiché est le titre actuel');
  await deleteItem(r.id);
  const l2 = lines(await recentProjectActivity(p));
  assert.equal(l2[0].text, 'Exigence supprimée');
  assert.equal(l2[0].code, null);
  assert.equal(l2[0].itemId, null);
  assert.equal(l2[0].title, null);
  assert.ok(l2.slice(1).every((l) => l.code === null && l.text.endsWith('(élément supprimé depuis)')), 'les anciennes lignes de l\'élément supprimé perdent code et clic');
});

test('journal du projet : jamais un autre projet, jamais les liens ni le projet lui-même, plafonné à dix', async () => {
  await migratedDb();
  const a = await createProject('A');
  const b = await createProject('B');
  const x = await createRequirement({ projectId: a, title: 'X' });
  const y = await createStory({ projectId: a, title: 'Y' });
  await createLink({ type: 'implements', fromId: y.id, toId: x.id });
  await createRequirement({ projectId: b, title: 'Ailleurs' });
  const rowsA = await recentProjectActivity(a);
  assert.equal(rowsA.length, 2, 'deux créations d\'éléments : ni le lien, ni la création du projet, ni l\'autre projet');
  assert.deepEqual(rowsA.map((r) => r.code), [y.code, x.code]);
  for (let i = 0; i < 14; i++) await createRequirement({ projectId: a, title: `R${i}` });
  const many = await recentProjectActivity(a);
  assert.equal(many.length, HOME_ACTIVITY_LIMIT);
  assert.equal(HOME_ACTIVITY_LIMIT, 10);
  assert.ok(many.every((r, i) => i === 0 || many[i - 1].id > r.id), 'ordre strictement décroissant du journal');
  assert.deepEqual(await recentProjectActivity(a, 3).then((r) => r.length), 3);
  assert.equal((await recentProjectActivity(b)).length, 1);
});

test('journal du projet : projet sans élément = liste vide, sans erreur', async () => {
  await migratedDb();
  const p = await createProject('Vide');
  assert.deepEqual(await recentProjectActivity(p), []);
  assert.deepEqual(await recentProjectActivity(999999), []);
});

test('lecture seule : charger les données de l\'accueil n\'écrit rien dans le journal (aucune sauvegarde automatique déclenchée)', async () => {
  await migratedDb();
  const { projectId } = await createSampleProject();
  const before = await query<{ n: number; last: number }>('SELECT count(*) AS n, max(id) AS last FROM activity_log');
  const metaBefore = await query<{ n: number }>('SELECT count(*) AS n FROM meta');
  for (let i = 0; i < 3; i++) {
    await getTraceability(projectId);
    await countDrafts(projectId);
    await recentProjectActivity(projectId);
  }
  const after = await query<{ n: number; last: number }>('SELECT count(*) AS n, max(id) AS last FROM activity_log');
  assert.deepEqual(after, before);
  assert.deepEqual(await query<{ n: number }>('SELECT count(*) AS n FROM meta'), metaBefore);
});

test('couverture et orphelins de l\'accueil : même calcul que Traçabilité, valeurs du projet d\'exemple (F3-D03, F3-D04)', async () => {
  await migratedDb();
  const { projectId } = await createSampleProject();
  const t = await getTraceability(projectId);
  assert.deepEqual(summaryLines(t.summary).map((l) => ratioText(l.ratio)), ['5 sur 5', '4 sur 4', '5 sur 8', '7 sur 8', '4 sur 8', '4 sur 4']);
  assert.equal(orphanCount(t.orphans), 6);
  assert.equal(t.ignored, 0);
});

test('projet d\'exemple : les dix dernières modifications relevées pour la recette (TESTS-F3, test 8)', async () => {
  await migratedDb();
  const { projectId } = await createSampleProject();
  const rows = await recentProjectActivity(projectId);
  assert.equal(rows.length, 10);
  assert.ok(rows.every((r) => r.code !== null), 'tous les éléments existent encore');
  // Les statuts sont fixés dans l'ordre du jeu d'exemple après toutes les créations : les dix lignes sont les dix derniers changements.
  assert.ok(rows.every((r) => r.action === 'status_changed' || r.action === 'created'));
  console.log('# lignes du projet d\'exemple :', rows.map((r) => `${r.code} ${activityLine(r).text}`).join(' | '));
});

test('lignes de modification : statuts accordés au type, détails inattendus sans erreur, élément supprimé depuis', () => {
  const base = { id: 1, object_id: 7, at: '2026-11-27T14:08:09.000Z', kind: 'decision', code: 'DEC-001', title: 'T' };
  assert.equal(activityLine({ ...base, action: 'status_changed', detail: 'decided>archived' }).text, 'statut : Prise → Archivée');
  assert.equal(activityLine({ ...base, kind: 'risk', code: 'RIS-001', action: 'status_changed', detail: 'identified>archived' }).text, 'statut : Identifié → Archivé');
  assert.equal(activityLine({ ...base, action: 'status_changed', detail: null }).text, 'statut modifié');
  assert.equal(activityLine({ ...base, action: 'status_changed', detail: 'abc' }).text, 'statut modifié');
  assert.equal(activityLine({ ...base, action: 'imported', detail: null }).text, 'imported');
  assert.equal(activityLine({ ...base, kind: null, code: null, title: null, action: 'created', detail: 'risk' }).text, 'créé (élément supprimé depuis)');
  const kinds: Array<[string, string]> = [['stakeholder', 'Partie prenante supprimée'], ['need', 'Besoin supprimé'], ['requirement', 'Exigence supprimée'], ['decision', 'Décision supprimée'], ['risk', 'Risque supprimé'], ['story', 'User story supprimée'], ['test', 'Test supprimé'], ['workshop', 'Atelier supprimé']];
  for (const [k, text] of kinds) assert.equal(activityLine({ ...base, kind: null, code: null, title: null, action: 'deleted', detail: k }).text, text);
  assert.equal(activityLine({ ...base, kind: null, code: null, title: null, action: 'deleted', detail: null }).text, 'Élément supprimé');
  assert.match(activityLine({ ...base, action: 'created', detail: 'decision' }).when, /^\d{2}\/\d{2}\/2026 \d{2}:\d{2}:\d{2}$/);
});

test('architecture : le dépôt de l\'accueil est en lecture seule, le module n\'écrit rien', () => {
  const repo = fs.readFileSync('src/data/repositories/home.ts', 'utf8');
  assert.ok(!/mutate|INSERT|UPDATE|DELETE/.test(repo.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/'deleted'/g, '')), 'aucune écriture dans home.ts');
  for (const f of ['HomeScreen.tsx', 'HomeView.tsx', 'logic.ts']) {
    assert.ok(!/mutate|INSERT INTO|UPDATE |DELETE FROM/.test(fs.readFileSync(`src/modules/home/${f}`, 'utf8')), `${f} n'écrit rien`);
  }
});

test('branchement : démarrage sur l\'accueil, bouton Orphelins → onglet Orphelins, navigation par le menu efface la demande (F3-D02, F3-D04)', () => {
  const app = fs.readFileSync('src/app/App.tsx', 'utf8');
  assert.match(app, /screen === 'home'/);
  assert.match(app, /<HomeScreen/);
  assert.match(app, /setTraceTab\('orphans'\)/);
  assert.match(app, /initialTab=\{traceTab \?\? undefined\}/);
  const nav = app.slice(app.indexOf('const navigate = useCallback'), app.indexOf('const openOrphans'));
  assert.match(nav, /setTraceTab\(null\)/, 'le menu efface la demande d\'onglet');
  assert.ok(!app.includes('Lot M8'), 'texte d\'introduction corrigé (F3-D09)');
  const screen = fs.readFileSync('src/modules/traceability/TraceabilityScreen.tsx', 'utf8');
  assert.match(screen, /useState\(props\.initialTab \?\? 'matrix'\)/, 'sans demande, Traçabilité s\'ouvre sur la matrice');
});
