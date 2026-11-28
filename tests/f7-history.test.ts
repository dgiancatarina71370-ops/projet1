// Lot F7 : historique par fiche (décisions F7-D01 à F7-D10). Base SQLite réelle (node:sqlite).
// Le rendu est dans ui-f7.test.ts ; la section dans la fiche, le rafraîchissement et les clics se vérifient à la recette sur clé (TESTS-F7.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDb } from './helpers/setup.ts';
import { query } from '../src/data/db.ts';
import { createProject } from '../src/data/repositories/projects.ts';
import { changeItemStatus, deleteItem } from '../src/data/repositories/items.ts';
import { createRequirement, updateRequirement } from '../src/data/repositories/requirements.ts';
import { createStory } from '../src/data/repositories/stories.ts';
import { createLink, deleteLink } from '../src/data/repositories/links.ts';
import { createSampleProject } from '../src/data/repositories/sample-project.ts';
import { HISTORY_PAGE_SIZE, countItemHistory, itemHistory, listJournal } from '../src/data/repositories/journal.ts';
import { formatLinkDetail, linkDetailPatterns, linkTypeOfDetail, parseLinkDetail } from '../src/domain/link-detail.ts';
import { HISTORY_EMPTY, HISTORY_LIMIT_NOTE, HISTORY_PAGE, historyCountText, historyLine, moreLabel } from '../src/app/history-logic.ts';
import type { HistoryRowInput } from '../src/app/history-logic.ts';
import { journalLine } from '../src/modules/journal/logic.ts';

type Kind = Parameters<typeof historyLine>[1];
const texts = async (id: number, kind: Kind) => (await itemHistory(id, 100, 0)).map((e) => historyLine(e, kind).text);
const logCount = async () => Number((await query<{ n: number }>('SELECT COUNT(*) AS n FROM activity_log'))[0].n);

test('détail d\'un lien : fabrication, lecture des deux formats, valeurs inattendues sans erreur (F7-D03)', () => {
  assert.equal(formatLinkDetail('derives', 12, 34), 'derives:12>34');
  assert.deepEqual(parseLinkDetail('derives:12>34'), { type: 'derives', fromId: 12, toId: 34 });
  assert.deepEqual(parseLinkDetail('derives'), { type: 'derives', fromId: null, toId: null });
  assert.equal(parseLinkDetail(null), null);
  assert.equal(parseLinkDetail(''), null);
  for (const bad of ['derives:a>b', 'derives:1>', ':1>2', 'x:1>2>3', 'x:1>2 ']) assert.deepEqual(parseLinkDetail(bad), { type: bad, fromId: null, toId: null }, bad);
  assert.equal(linkTypeOfDetail('verifies:7>8'), 'verifies');
  assert.equal(linkTypeOfDetail('verifies'), 'verifies');
  assert.equal(linkTypeOfDetail(null), null);
  assert.deepEqual(linkDetailPatterns(12), { asFrom: '%:12>%', asTo: '%>12' });
});

test('écriture : création, retrait d\'un lien et suppression d\'un élément écrivent le nouveau détail (F7-D03)', async () => {
  await migratedDb();
  const p = await createProject('P');
  const r = await createRequirement({ projectId: p, title: 'Exigence' });
  const s = await createStory({ projectId: p, title: 'Story' });
  const linkId = await createLink({ type: 'implements', fromId: s.id, toId: r.id });
  const log = () => query<{ action: string; detail: string }>("SELECT action, detail FROM activity_log WHERE object_type = 'link' ORDER BY id");
  assert.deepEqual(await log(), [{ action: 'created', detail: `implements:${s.id}>${r.id}` }]);
  await deleteLink(linkId);
  assert.deepEqual((await log())[1], { action: 'deleted', detail: `implements:${s.id}>${r.id}` });
  await createLink({ type: 'implements', fromId: s.id, toId: r.id });
  await deleteItem(r.id);
  const all = await log();
  assert.deepEqual(all[3], { action: 'deleted', detail: `implements:${s.id}>${r.id}` }, 'suppression d\'un élément : une ligne par lien touché');
  assert.ok(all.every((x) => x.detail.length <= 100));
});

test('historique d\'une exigence : création, statut, modification, lien ajouté puis retiré, du plus récent au plus ancien (F7-D02, F7-D04)', async () => {
  await migratedDb();
  const p = await createProject('P');
  const r = await createRequirement({ projectId: p, title: 'Exigence' });
  const s = await createStory({ projectId: p, title: 'Story' });
  await changeItemStatus(r.id, 'validated');
  await updateRequirement(r.id, { title: 'Exigence bis', fields: { priority: 'must' } });
  const linkId = await createLink({ type: 'implements', fromId: s.id, toId: r.id });
  assert.deepEqual(await texts(r.id, 'requirement'), [`Lien ajouté : implémentée par ${s.code}`, 'Modifié · Champs : Titre, Priorité', 'Statut : Brouillon → Validé', 'Créé']);
  // Du côté de la story, le sens est inversé : elle « implémente » l'exigence.
  assert.deepEqual(await texts(s.id, 'story'), [`Lien ajouté : implémente ${r.code}`, 'Créé']);
  await deleteLink(linkId);
  assert.deepEqual(await texts(r.id, 'requirement'), [`Lien retiré : implémentée par ${s.code}`, `Lien ajouté : implémentée par ${s.code}`, 'Modifié · Champs : Titre, Priorité', 'Statut : Brouillon → Validé', 'Créé']);
  assert.deepEqual(await texts(s.id, 'story'), [`Lien retiré : implémente ${r.code}`, `Lien ajouté : implémente ${r.code}`, 'Créé'], 'même retrait dans la fiche de l\'autre extrémité');
  assert.equal(await countItemHistory(r.id), 5);
  assert.equal(await countItemHistory(s.id), 3);
});

test('lignes d\'avant la 0.17.0 (détail « type » seul) : un lien existant se rattache par jointure ; un lien retiré n\'est dans aucune fiche, sans erreur (F7-D03)', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const r = await createRequirement({ projectId: p, title: 'Exigence' });
  const s = await createStory({ projectId: p, title: 'Story' });
  const linkId = await createLink({ type: 'implements', fromId: s.id, toId: r.id });
  t.raw.exec("UPDATE activity_log SET detail = 'implements' WHERE object_type = 'link'");
  assert.deepEqual(await texts(r.id, 'requirement'), [`Lien ajouté : implémentée par ${s.code}`, 'Créé'], 'ancien format, lien existant');
  await deleteLink(linkId);
  t.raw.exec("UPDATE activity_log SET detail = 'implements' WHERE object_type = 'link'");
  assert.deepEqual(await texts(r.id, 'requirement'), ['Créé'], 'ancien format, lien retiré : plus aucune ligne attribuable');
  assert.deepEqual(await texts(s.id, 'story'), ['Créé']);
  // Le Journal du projet, lui, garde les deux lignes et lit le type dans les deux formats (F7-D10).
  const j = (await listJournal(p, { group: 'link', action: 'all' })).map(journalLine);
  assert.deepEqual(j.map((x) => [x.action, x.detail]), [['Supprimé', 'implémente'], ['Créé', 'implémente']]);
});

test('le Journal affiche le même type pour l\'ancien et le nouveau format de détail (F7-D10)', () => {
  const base = { id: 1, at: '2026-11-28T10:00:00.000Z', object_type: 'link', object_id: 9, action: 'deleted', item_kind: null, item_code: null, item_title: null, link_type: null, from_code: null, to_code: null, document_name: null, project_name: null };
  assert.equal(journalLine({ ...base, detail: 'derives' }).detail, 'dérive en');
  assert.equal(journalLine({ ...base, detail: 'derives:3>4' }).detail, 'dérive en');
  assert.equal(journalLine({ ...base, detail: null }).detail, '');
  assert.equal(journalLine({ ...base, detail: 'bizarre:3>4' }).detail, 'type inconnu (bizarre)');
});

test('autre extrémité supprimée : « vers un élément supprimé depuis » ; les lignes de lien d\'un élément supprimé se rattachent à l\'autre fiche (F7-D04)', async () => {
  await migratedDb();
  const p = await createProject('P');
  const r = await createRequirement({ projectId: p, title: 'Exigence' });
  const s = await createStory({ projectId: p, title: 'Story' });
  await createLink({ type: 'implements', fromId: s.id, toId: r.id });
  await deleteItem(r.id);
  assert.deepEqual(await texts(s.id, 'story'), ['Lien retiré : vers un élément supprimé depuis', 'Lien ajouté : vers un élément supprimé depuis', 'Créé']);
});

test('motifs : l\'identifiant 12 ne retient jamais 112 ni 120, en origine comme en cible ; une autre projet n\'est jamais lu (F7-D03)', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const q = await createProject('Q');
  const items: Array<{ id: number; code: string }> = [];
  for (let i = 0; i < 3; i += 1) items.push(await createRequirement({ projectId: p, title: `E${i}` }));
  const me = items[1].id;
  const insert = (detail: string, project: number) =>
    t.raw.exec(`INSERT INTO activity_log (at, object_type, object_id, action, project_id, detail) VALUES ('2026-11-28T10:00:00.000Z', 'link', 99999, 'created', ${project}, '${detail}')`);
  const base = await countItemHistory(me);
  insert(`derives:${me}0>5`, p); // 120 si me = 12 : préfixe
  insert(`derives:5>${me}0`, p);
  insert(`derives:5>1${me}`, p); // 112 : suffixe
  insert(`derives:1${me}>5`, p);
  assert.equal(await countItemHistory(me), base, 'aucun faux positif');
  insert(`derives:${me}>5`, p);
  insert(`derives:5>${me}`, p);
  assert.equal(await countItemHistory(me), base + 2, 'origine et cible exactes retenues');
  insert(`derives:${me}>5`, q);
  assert.equal(await countItemHistory(me), base + 2, 'ligne d\'un autre projet ignorée');
  // Fiche d'un autre projet ou inexistante : rien.
  assert.equal(await countItemHistory(999999), 0);
  assert.deepEqual(await itemHistory(999999), []);
  void q;
});

test('isolation : l\'historique d\'un élément ne contient aucune ligne d\'un autre élément ni d\'un autre projet (F7-D02)', async () => {
  await migratedDb();
  const a = await createProject('A');
  const b = await createProject('B');
  const ra = await createRequirement({ projectId: a, title: 'RA' });
  const rb = await createRequirement({ projectId: b, title: 'RB' });
  await changeItemStatus(rb.id, 'validated');
  assert.deepEqual(await texts(ra.id, 'requirement'), ['Créé']);
  assert.deepEqual(await texts(rb.id, 'requirement'), ['Statut : Brouillon → Validé', 'Créé']);
});

test('projet d\'exemple : la somme des historiques égale les lignes d\'éléments plus deux fois les lignes de liens', async () => {
  await migratedDb();
  const { projectId: p } = await createSampleProject();
  const ids = await query<{ id: number }>('SELECT id FROM items WHERE project_id = ? ORDER BY id', [p]);
  assert.equal(ids.length, 38);
  let sum = 0;
  for (const i of ids) sum += await countItemHistory(i.id);
  assert.equal(sum, 65 + 52 * 2);
  for (const i of ids) assert.ok((await countItemHistory(i.id)) >= 1, 'chaque élément a au moins sa création');
});

test('pagination : tranches de 10, total, dernière tranche partielle, décalage hors limite, sans doublon (F7-D05)', async () => {
  await migratedDb();
  const p = await createProject('P');
  const r = await createRequirement({ projectId: p, title: 'E' });
  for (let i = 0; i < 13; i += 1) await changeItemStatus(r.id, i % 2 === 0 ? 'validated' : 'draft');
  assert.equal(HISTORY_PAGE, HISTORY_PAGE_SIZE);
  assert.equal(await countItemHistory(r.id), 14);
  const first = await itemHistory(r.id);
  const second = await itemHistory(r.id, HISTORY_PAGE_SIZE, 10);
  assert.equal(first.length, 10);
  assert.equal(second.length, 4);
  assert.deepEqual([...first, ...second].map((e) => e.id), [...first, ...second].map((e) => e.id).sort((x, y) => y - x), 'du plus récent au plus ancien, sans doublon');
  assert.equal(new Set([...first, ...second].map((e) => e.id)).size, 14);
  assert.equal(historyLine(second[3], 'requirement').text, 'Créé');
  assert.deepEqual(await itemHistory(r.id, 10, 14), []);
  assert.equal(moreLabel(14, 10), 'Afficher les 4 suivantes');
  assert.equal(moreLabel(25, 10), 'Afficher les 10 suivantes');
  assert.equal(moreLabel(11, 10), 'Afficher la suivante');
  assert.equal(moreLabel(10, 10), null);
  assert.equal(moreLabel(0, 0), null);
});

test('lire l\'historique n\'écrit rien, pas même au journal (F7-D09)', async () => {
  await migratedDb();
  const p = await createProject('P');
  const r = await createRequirement({ projectId: p, title: 'E' });
  const before = await logCount();
  await countItemHistory(r.id);
  await itemHistory(r.id);
  await itemHistory(r.id, 10, 10);
  assert.equal(await logCount(), before);
});

test('textes purs : valeurs inattendues sans erreur, accords, constantes (F7-D02, F7-D04, F7-D05)', () => {
  const row = (over: Partial<HistoryRowInput>): HistoryRowInput => ({ id: 1, at: '2026-11-28T10:00:00.000Z', object_type: 'item', action: 'created', detail: 'requirement', link_type: null, direction: null, other_code: null, ...over });
  assert.equal(historyLine(row({}), 'requirement').text, 'Créé');
  assert.equal(historyLine(row({ action: 'status_changed', detail: null }), 'requirement').text, 'Statut : modifié');
  assert.equal(historyLine(row({ action: 'status_changed', detail: 'draft>validated' }), 'requirement').text, 'Statut : Brouillon → Validé');
  assert.equal(historyLine(row({ action: 'updated', detail: null }), 'requirement').text, 'Modifié');
  assert.equal(historyLine(row({ action: 'updated', detail: 'title,futur' }), 'requirement').text, 'Modifié · Champs : Titre, futur');
  assert.equal(historyLine(row({ action: 'imported' }), 'requirement').text, 'Importé');
  assert.equal(historyLine(row({ action: 'bizarre' }), 'requirement').text, 'bizarre');
  assert.equal(historyLine(row({ object_type: 'link', action: 'created' }), 'requirement').text, 'Lien ajouté');
  assert.equal(historyLine(row({ object_type: 'link', action: 'deleted', link_type: 'derives', direction: 'in', other_code: 'BES-001' }), 'requirement').text, 'Lien retiré : dérive de BES-001');
  assert.equal(historyLine(row({ object_type: 'link', action: 'created', link_type: 'bizarre', direction: 'out', other_code: 'X-1' }), 'requirement').text, 'Lien ajouté : type inconnu (bizarre) X-1');
  assert.equal(historyLine(row({ at: 'pas une date' }), 'requirement').when, '—');
  assert.equal(historyCountText(0), '0 entrée');
  assert.equal(historyCountText(1), '1 entrée');
  assert.equal(historyCountText(12), '12 entrées');
  assert.ok(HISTORY_EMPTY.length > 0 && HISTORY_LIMIT_NOTE.includes('0.17.0'));
});

test('branchement : un emplacement renderHistory dans les huit registres, un seul composant, lecture seule, version alignée (F7-D01, F7-D08, F7-D09)', async () => {
  const fs = await import('node:fs');
  const read = (p: string) => fs.readFileSync(p, 'utf8');
  const screens = ['analysis/NeedsScreen', 'analysis/RequirementsScreen', 'decisions/DecisionsScreen', 'risks/RisksScreen', 'stakeholders/StakeholdersScreen', 'stories/StoriesScreen', 'testcases/TestsScreen', 'workshops/WorkshopsScreen'];
  for (const s of screens) assert.match(read(`src/modules/${s}.tsx`), /renderHistory\?: HistorySlot/, `${s} déclare l'emplacement`);
  const app = read('src/app/App.tsx');
  assert.equal((app.match(/renderHistory=\{renderHistory\}/g) ?? []).length, 8, 'l\'application le fournit aux huit écrans');
  assert.match(app, /setHistoryTick\(\(t\) => t \+ 1\)/, 'chaque écriture (refresh) relance la lecture');
  assert.match(read('src/shared/register-screen.tsx'), /props\.renderHistory\?\.\(current\.id, config\.kind\)/);
  const section = read('src/app/HistorySection.tsx');
  assert.ok(!/mutate|INSERT|UPDATE |DELETE/.test(section), 'la section n\'écrit rien');
  assert.match(section, /props\.tick/);
  const pkg = (JSON.parse(read('package.json')) as { version: string }).version;
  assert.equal(pkg, '0.17.0');
  assert.ok(read('src-tauri/tauri.conf.json').includes(`"version": "${pkg}"`));
  assert.ok(read('src-tauri/Cargo.toml').includes(`version = "${pkg}"`));
});
