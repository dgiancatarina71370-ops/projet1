// Lot F4 : lecture du journal du projet (filtres, pagination, isolation), libellés, pagination pure, branchement (décisions F4-D01 à F4-D10).
// Base SQLite réelle (node:sqlite). Le rendu et les clics sont dans ui-f4.test.ts et à la recette sur clé (TESTS-F4.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { migratedDb } from './helpers/setup.ts';
import { query } from '../src/data/db.ts';
import { createProject } from '../src/data/repositories/projects.ts';
import { changeItemStatus, deleteItem } from '../src/data/repositories/items.ts';
import { createRequirement, updateRequirement } from '../src/data/repositories/requirements.ts';
import { createStory } from '../src/data/repositories/stories.ts';
import { createLink, listLinks, deleteLink } from '../src/data/repositories/links.ts';
import { createSampleProject } from '../src/data/repositories/sample-project.ts';
import { countJournal, listJournal, JOURNAL_PAGE_SIZE } from '../src/data/repositories/journal.ts';
import { clampPage, emptyJournalText, journalLine, pageCount, pageText } from '../src/modules/journal/logic.ts';
import { ACTION_OPTIONS, OBJECT_GROUPS, fieldLabel, fieldsText, linkTypeLabel, objectGroupTypes } from '../src/domain/activity-labels.ts';

const ALL = { group: 'all', action: 'all' };
const f = (group: string, action: string) => ({ group, action });
const lines = async (p: number, filter = ALL, page = 1) => (await listJournal(p, filter, page)).map(journalLine);

test('projet d\'exemple : 118 entrées, comptes par type d\'objet et par action (F4-D04, F4-D05)', async () => {
  await migratedDb();
  const { projectId: p } = await createSampleProject();
  assert.equal(await countJournal(p, ALL), 118);
  assert.equal(await countJournal(p, f('item', 'all')), 65);
  assert.equal(await countJournal(p, f('link', 'all')), 52);
  assert.equal(await countJournal(p, f('project', 'all')), 1);
  assert.equal(await countJournal(p, f('document', 'all')), 0);
  assert.equal(await countJournal(p, f('all', 'created')), 91);
  assert.equal(await countJournal(p, f('all', 'status_changed')), 27);
  assert.equal(await countJournal(p, f('all', 'updated')), 0);
  assert.equal(await countJournal(p, f('all', 'deleted')), 0);
  assert.equal(await countJournal(p, f('link', 'status_changed')), 0, 'les deux filtres se combinent');
  assert.equal(await countJournal(p, f('item', 'created')), 38);
  assert.equal(await countJournal(p, f('all', 'valeur inconnue')), 0);
});

test('pagination : pages de 25, dernière page de 18, aucune entrée perdue ni dupliquée, ordre décroissant (F4-D09)', async () => {
  await migratedDb();
  const { projectId: p } = await createSampleProject();
  assert.equal(JOURNAL_PAGE_SIZE, 25);
  const pages: number[][] = [];
  for (let n = 1; n <= 5; n++) pages.push((await listJournal(p, ALL, n)).map((e) => e.id));
  assert.deepEqual(pages.map((x) => x.length), [25, 25, 25, 25, 18]);
  const flat = pages.flat();
  assert.equal(new Set(flat).size, 118);
  const dbAll = (await query<{ id: number }>('SELECT id FROM activity_log WHERE project_id = ? ORDER BY id DESC', [p])).map((r) => r.id);
  assert.deepEqual(flat, dbAll, 'l\'union des pages est exactement le journal du projet, du plus récent au plus ancien');
  assert.deepEqual(await listJournal(p, ALL, 6), [], 'page hors limites : liste vide, sans erreur');
  assert.equal((await listJournal(p, ALL, 0)).length, 25, 'page 0 ramenée à la première');
  assert.equal((await listJournal(p, f('item', 'all'), 3)).length, 15);
  assert.equal((await listJournal(p, f('link', 'all'), 3)).length, 2);
  assert.equal(pageCount(118, 25), 5);
});

test('libellés du projet d\'exemple : la première ligne est le dernier lien, la dernière est la création du projet', async () => {
  await migratedDb();
  const { projectId: p } = await createSampleProject();
  const first = (await lines(p))[0];
  assert.deepEqual([first.object, first.action, first.label, first.detail], ['Lien', 'Créé', 'RIS-002 → ATL-001', 'provient de']);
  const last = (await lines(p, ALL, 5)).at(-1);
  assert.deepEqual([last?.object, last?.action], ['Projet', 'Créé']);
  assert.ok((last?.label ?? '').startsWith('[Exemple]'));
  const status = (await lines(p, f('all', 'status_changed')))[0];
  assert.equal(status.code, 'ATL-001');
  assert.equal(status.detail, 'Planifié → Tenu');
  assert.equal(status.object, 'Atelier');
});

test('isolation : un projet ne voit jamais les entrées d\'un autre ; les entrées sans projet ne sont lues par aucun (F4-D03)', async () => {
  await migratedDb();
  const a = await createProject('A');
  const b = await createProject('B');
  await createRequirement({ projectId: a, title: 'RA' });
  await createRequirement({ projectId: b, title: 'RB1' });
  await createRequirement({ projectId: b, title: 'RB2' });
  // Entrée d'import V1 sans projet, écrite comme le fait l'import.
  const { mutate } = await import('../src/data/mutate.ts');
  await mutate([{ sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', params: ['k', 'v'], activity: { objectType: 'setting', action: 'imported', objectId: 1, detail: 'k' } }]);
  assert.equal(await countJournal(a, ALL), 2, 'création du projet + 1 exigence');
  assert.equal(await countJournal(b, ALL), 3);
  const all = (await query<{ n: number }>('SELECT count(*) AS n FROM activity_log'))[0].n;
  assert.equal(all, 6, 'le journal contient l\'entrée sans projet');
  assert.ok((await listJournal(a, ALL)).every((e) => e.object_type !== 'setting'));
  assert.equal(await countJournal(a, f('all', 'imported')), 0);
  assert.equal(await countJournal(999999, ALL), 0);
});

test('libellés : modification (champs en français), statut, suppression d\'élément, lien existant puis supprimé', async () => {
  await migratedDb();
  const p = await createProject('P');
  const r = await createRequirement({ projectId: p, title: 'Exigence' });
  const s = await createStory({ projectId: p, title: 'Story' });
  const linkId = await createLink({ type: 'implements', fromId: s.id, toId: r.id });
  await changeItemStatus(r.id, 'validated');
  await updateRequirement(r.id, { title: 'Exigence bis', fields: { priority: 'must' } });
  let l = await lines(p);
  assert.deepEqual([l[0].object, l[0].action, l[0].code, l[0].label, l[0].detail], ['Exigence', 'Modifié', r.code, 'Exigence bis', 'Champs : Titre, Priorité']);
  assert.deepEqual([l[1].action, l[1].detail], ['Statut changé', 'Brouillon → Validé']);
  assert.deepEqual([l[2].object, l[2].label, l[2].detail, l[2].code], ['Lien', `${s.code} → ${r.code}`, 'implémente', null]);
  assert.ok(l[0].itemId === r.id && l[0].kind === 'requirement', 'ligne cliquable');
  await deleteLink(linkId);
  l = await lines(p);
  assert.deepEqual([l[0].action, l[0].label, l[0].detail], ['Supprimé', 'Lien supprimé', 'implémente']);
  assert.ok(l.some((x) => x.label === `(lien supprimé depuis)`), 'ancienne ligne du lien supprimé');
  await deleteItem(r.id);
  l = await lines(p);
  assert.deepEqual([l[0].action, l[0].label, l[0].code, l[0].itemId], ['Supprimé', 'Exigence supprimée', null, null]);
  const old = l.filter((x) => x.label === '(élément supprimé depuis)');
  assert.equal(old.length, 3, 'création, statut et modification de l\'exigence supprimée');
  assert.ok(old.every((x) => x.code === null && x.itemId === null), 'plus de code ni de clic');
  assert.equal((await listLinks(p)).length, 0);
});

test('libellés purs : champs connus, champ inconnu sans erreur, rôle selon le type, lien inconnu, entrées inattendues', () => {
  assert.equal(fieldsText('title,description,criteria', 'requirement'), 'Champs : Titre, Description, Critères d\'acceptation');
  assert.equal(fieldsText('title,futurChamp', 'requirement'), 'Champs : Titre, futurChamp');
  assert.equal(fieldsText(null, null), '');
  assert.equal(fieldLabel('role', 'story'), 'En tant que');
  assert.equal(fieldLabel('role', 'stakeholder'), 'Rôle dans le projet');
  assert.equal(linkTypeLabel('derives'), 'dérive en');
  assert.equal(linkTypeLabel('bizarre'), 'type inconnu (bizarre)');
  const base = { id: 1, at: '2026-11-27T14:08:09.000Z', object_id: 3, action: 'created', detail: null, item_kind: null, item_code: null, item_title: null, link_type: null, from_code: null, to_code: null, document_name: null, project_name: null };
  assert.equal(journalLine({ ...base, object_type: 'document', document_name: 'Cahier des charges', action: 'imported' }).label, 'Cahier des charges');
  assert.equal(journalLine({ ...base, object_type: 'document', document_name: 'X', action: 'imported' }).detail, 'Importé depuis la V1');
  assert.equal(journalLine({ ...base, object_type: 'document', action: 'deleted' }).label, 'Document supprimé');
  assert.equal(journalLine({ ...base, object_type: 'document_send', action: 'imported' }).label, 'Envoi de document');
  assert.equal(journalLine({ ...base, object_type: 'project', project_name: 'Projet P' }).label, 'Projet P');
  assert.equal(journalLine({ ...base, object_type: 'project', action: 'deleted' }).label, 'Projet supprimé');
  assert.equal(journalLine({ ...base, object_type: 'chose', detail: 'x' }).label, 'chose', 'type inconnu : jamais d\'erreur');
  assert.equal(journalLine({ ...base, object_type: 'item', action: 'status_changed', detail: 'bizarre', item_kind: 'risk', item_code: 'RIS-001', item_title: 'T' }).detail, 'statut modifié');
  assert.match(journalLine({ ...base, object_type: 'item' }).when, /^\d{2}\/\d{2}\/2026 \d{2}:\d{2}:\d{2}$/);
});

test('pagination pure : nombre de pages, bornes, textes (F4-D09, F4-D10)', () => {
  assert.deepEqual([0, 1, 25, 26, 118].map((n) => pageCount(n, 25)), [1, 1, 1, 2, 5]);
  assert.deepEqual([clampPage(0, 5), clampPage(3, 5), clampPage(9, 5), clampPage(Number.NaN, 5)], [1, 3, 5, 1]);
  assert.equal(pageText(2, 5, 118), 'Page 2 sur 5 · 118 entrées');
  assert.equal(pageText(1, 1, 1), 'Page 1 sur 1 · 1 entrée');
  assert.equal(pageText(1, 1, 0), 'Page 1 sur 1 · 0 entrée');
  assert.equal(emptyJournalText(0), 'Aucune entrée dans le journal de ce projet.');
  assert.equal(emptyJournalText(118), 'Aucune entrée pour ces filtres (118 au total dans ce projet).');
  assert.deepEqual(OBJECT_GROUPS.map((g) => g.label), ['Tous', 'Éléments', 'Liens', 'Documents', 'Projet']);
  assert.deepEqual(ACTION_OPTIONS.map((a) => a.label), ['Toutes', 'Créé', 'Modifié', 'Statut changé', 'Supprimé', 'Importé']);
  assert.deepEqual([...objectGroupTypes('document')], ['document', 'document_send', 'distribution']);
  assert.deepEqual([...objectGroupTypes('project')], ['project', 'folder']);
  assert.deepEqual([...objectGroupTypes('all')], []);
  assert.deepEqual([...objectGroupTypes('inconnu')], []);
});

test('lecture seule : consulter le journal n\'écrit rien (journal et table meta identiques)', async () => {
  await migratedDb();
  const { projectId } = await createSampleProject();
  const before = await query('SELECT count(*) AS n, max(id) AS last FROM activity_log');
  const meta = await query('SELECT count(*) AS n FROM meta');
  for (let i = 1; i <= 5; i++) {
    await countJournal(projectId, ALL);
    await listJournal(projectId, f('item', 'created'), i);
  }
  assert.deepEqual(await query('SELECT count(*) AS n, max(id) AS last FROM activity_log'), before);
  assert.deepEqual(await query('SELECT count(*) AS n FROM meta'), meta);
});

test('architecture : le dépôt du journal est en lecture seule ; les libellés de l\'accueil viennent de domain (F4-D08)', () => {
  const repo = fs.readFileSync('src/data/repositories/journal.ts', 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/mutate|INSERT|UPDATE|DELETE FROM/.test(repo), 'aucune écriture dans journal.ts');
  for (const g of ['JournalScreen.tsx', 'JournalView.tsx', 'logic.ts']) assert.ok(!/mutate|INSERT INTO|UPDATE |DELETE FROM/.test(fs.readFileSync(`src/modules/journal/${g}`, 'utf8')), `${g} n'écrit rien`);
  const home = fs.readFileSync('src/modules/home/logic.ts', 'utf8');
  assert.match(home, /from '..\/..\/domain\/activity-labels.ts'/);
  assert.ok(!/Exigence supprimée/.test(home), 'plus de copie des libellés dans l\'accueil');
});

test('branchement : filtres et page repartent de zéro, changer un filtre revient à la page 1, code cliquable, Technique scindé (F4-D01, F4-D02, F4-D10)', () => {
  const screen = fs.readFileSync('src/modules/journal/JournalScreen.tsx', 'utf8');
  assert.match(screen, /useEffect\(\(\) => \{\s*setGroup\('all'\);\s*setAction\('all'\);\s*setPage\(1\);\s*\}, \[projectId\]\)/, 'changement de projet : remise à zéro');
  assert.match(screen, /onGroup=\{\(v\) => \{ setGroup\(v\); setPage\(1\); \}\}/);
  assert.match(screen, /onAction=\{\(v\) => \{ setAction\(v\); setPage\(1\); \}\}/);
  const app = fs.readFileSync('src/app/App.tsx', 'utf8');
  assert.match(app, /screen === 'journal'[\s\S]*?<JournalScreen[\s\S]*?onOpenItem=\{openItem\}/);
  const tech = app.slice(app.indexOf("screen === 'technical'"), app.indexOf("screen === 'about'"));
  for (const keep of ['Base de données', 'Centre de sauvegarde', 'Importer les données de la V1', 'Tables (']) assert.ok(tech.includes(keep), `Technique garde « ${keep} »`);
  assert.ok(!tech.includes('Exporter un livrable') && !tech.includes('ExportPanel'), 'depuis F5 (F5-D10), la carte d\'export a quitté Technique pour l\'écran Documents');
  assert.ok(!tech.includes('AboutPanel') && !tech.includes('Journal d’activité'), 'Technique perd À propos et le journal global');
  const about = app.slice(app.indexOf("screen === 'about'"));
  assert.ok(about.includes('<AboutPanel'), 'À propos a son écran');
  assert.ok(!app.includes('recentActivity'), 'plus de lecture du journal global au démarrage');
});
