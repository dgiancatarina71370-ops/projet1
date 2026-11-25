// Lot M3b : besoins, exigences, liens (décisions D44 à D51). Ce fichier couvre le domaine, la base et les dépôts ; les écrans sont dans ui-m3b.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { emptyDb, migratedDb } from './helpers/setup.ts';
import { seedAllTables, snapshot } from './helpers/seed.ts';
import { query } from '../src/data/db.ts';
import { migrate, getSchemaVersion } from '../src/data/migrate.ts';
import { migrations, SCHEMA_VERSION } from '../src/data/migrations/index.ts';
import { createBackup, restoreBackup } from '../src/data/backup-service.ts';
import { createProject, deleteProject } from '../src/data/repositories/projects.ts';
import { changeItemStatus, createItem, deleteItem, getItem, updateItem } from '../src/data/repositories/items.ts';
import { createRequirement, getRequirement, listRequirements, updateRequirement } from '../src/data/repositories/requirements.ts';
import { createStakeholder } from '../src/data/repositories/stakeholders.ts';
import { createLink, deleteLink, linkCandidates, linkedItems, listLinks } from '../src/data/repositories/links.ts';
import { checkModelIntegrity } from '../src/data/repositories/integrity.ts';
import { DEFAULT_REQUIREMENT_FIELDS, MAX_CRITERIA_LENGTH, changedRequirementFields, isNature, isPriority, natureLabel, normalizeRequirementFields, priorityLabel } from '../src/domain/requirements.ts';
import { EXPOSED_LINK_TYPES, LINK_RULES, canLoop, findAnyCycle, findPath, linkLabel, linkOptionsFor } from '../src/domain/links.ts';
import { initialStatus, isValidStatus, statusLabel } from '../src/domain/kinds.ts';

const count = async (table: string): Promise<number> => Number((await query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))[0].n);
const lastLine = async (): Promise<{ object_type: string; action: string; detail: string | null }> =>
  (await query<{ object_type: string; action: string; detail: string | null }>('SELECT object_type, action, detail FROM activity_log ORDER BY id DESC LIMIT 1'))[0];

// ------------------------------------------------------------------ domaine pur

test('domaine : statuts, natures et priorités MoSCoW, libellés validés', () => {
  assert.equal(initialStatus('need'), 'draft');
  assert.equal(initialStatus('requirement'), 'draft');
  for (const s of ['draft', 'validated', 'rejected', 'archived']) assert.ok(isValidStatus('need', s) && isValidStatus('requirement', s));
  assert.ok(!isValidStatus('need', 'active'));
  assert.deepEqual(['draft', 'validated', 'rejected', 'archived', 'active'].map(statusLabel), ['Brouillon', 'Validé', 'Rejeté', 'Archivé', 'Actif']);
  assert.equal(statusLabel('zzz'), 'Inconnu (zzz)');
  assert.ok(isNature('functional') && isNature('non_functional') && isNature('constraint') && !isNature('autre'));
  assert.ok(isPriority('must') && isPriority('should') && isPriority('could') && isPriority('wont') && !isPriority('never'));
  assert.deepEqual(['functional', 'non_functional', 'constraint'].map(natureLabel), ['Fonctionnelle', 'Non fonctionnelle', 'Contrainte']);
  assert.deepEqual(['must', 'should', 'could', 'wont'].map(priorityLabel), ['Indispensable (Must)', 'Important (Should)', 'Souhaitable (Could)', 'Hors périmètre (Won\'t)']);
});

test('domaine : valeurs par défaut et validation des champs d\'une exigence', () => {
  assert.equal(MAX_CRITERIA_LENGTH, 10000, 'limite validée : 10 000 caractères');
  assert.deepEqual(DEFAULT_REQUIREMENT_FIELDS, { nature: 'functional', priority: 'should', criteria: '' });
  assert.deepEqual(normalizeRequirementFields({}), DEFAULT_REQUIREMENT_FIELDS);
  assert.throws(() => normalizeRequirementFields({ nature: 'x' as 'functional' }), /nature/i);
  assert.throws(() => normalizeRequirementFields({ priority: 'x' as 'must' }), /priorité/i);
  assert.throws(() => normalizeRequirementFields({ criteria: 'x'.repeat(MAX_CRITERIA_LENGTH + 1) }), /critères/i);
  assert.equal(normalizeRequirementFields({ criteria: 'x'.repeat(MAX_CRITERIA_LENGTH) }).criteria.length, MAX_CRITERIA_LENGTH);
  assert.deepEqual(changedRequirementFields(DEFAULT_REQUIREMENT_FIELDS, { ...DEFAULT_REQUIREMENT_FIELDS, priority: 'must', criteria: 'c' }), ['priority', 'criteria']);
  assert.deepEqual(changedRequirementFields(DEFAULT_REQUIREMENT_FIELDS, DEFAULT_REQUIREMENT_FIELDS), []);
});

test('liens : libellé inverse pour chacun des huit types, options proposées par type d\'élément (D48)', () => {
  assert.equal(LINK_RULES.length, 8);
  for (const r of LINK_RULES) assert.ok(r.inverseLabel && r.inverseLabel !== r.label, r.type);
  assert.deepEqual([...EXPOSED_LINK_TYPES], ['expresses', 'derives', 'refines']);
  assert.deepEqual(linkOptionsFor('stakeholder').map((o) => o.key), ['expresses:out']);
  assert.deepEqual(linkOptionsFor('need').map((o) => o.key), ['expresses:in', 'derives:out']);
  assert.deepEqual(linkOptionsFor('requirement').map((o) => o.key), ['derives:in', 'refines:out', 'refines:in']);
  assert.deepEqual(linkOptionsFor('decision'), [], 'aucun lien exposé pour les types sans écran');
  assert.deepEqual(linkOptionsFor('need').map((o) => o.label), ['exprimé par', 'dérive en']);
  assert.equal(linkLabel('derives', 'out'), 'dérive en');
  assert.equal(linkLabel('derives', 'in'), 'dérive de');
  assert.match(linkLabel('inconnu', 'out'), /inconnu/);
});

test('liens : seuls les types qui relient un type à lui-même peuvent boucler ; détection de chemin et de cycle (D50)', () => {
  assert.ok(canLoop('refines'));
  for (const t of ['expresses', 'derives', 'implements', 'verifies', 'concerns', 'threatens', 'mitigates'] as const) assert.ok(!canLoop(t), t);
  assert.deepEqual(findPath([[1, 2], [2, 3]], 1, 3), [1, 2, 3]);
  assert.equal(findPath([[1, 2], [2, 3]], 3, 1), null);
  assert.deepEqual(findPath([], 5, 5), [5]);
  assert.equal(findAnyCycle([[1, 2], [2, 3]]), null);
  const cyc = findAnyCycle([[1, 2], [2, 3], [3, 1]]);
  assert.ok(cyc && cyc[0] === cyc[cyc.length - 1]);
  // un graphe avec un losange (pas de boucle) ne doit pas être pris pour un cycle
  assert.equal(findAnyCycle([[1, 2], [1, 3], [2, 4], [3, 4]]), null);
});

// ------------------------------------------------------------------ migration 4

test('migration 4 : la table apparaît, les données existantes sont intactes, sauvegarde pre-migration au schéma 3', async () => {
  assert.equal(SCHEMA_VERSION, 4);
  const t = emptyDb();
  await migrate(migrations.slice(0, 3), { backup: t.driver.backup });
  t.raw.exec("INSERT INTO projects (id, kind, name, created_at, updated_at) VALUES (1, 'project', 'Avant', 'x', 'x')");
  t.raw.exec("INSERT INTO items (id, project_id, kind, number, code, title, description, status, created_at, updated_at) VALUES (1, 1, 'need', 1, 'BES-001', 'Besoin', '', 'draft', 'x', 'x')");
  t.raw.exec("INSERT INTO items (id, project_id, kind, number, code, title, description, status, created_at, updated_at) VALUES (2, 1, 'stakeholder', 1, 'PP-001', 'PP', '', 'active', 'x', 'x')");
  t.raw.exec("INSERT INTO stakeholder_details (item_id) VALUES (2)");
  t.raw.exec("INSERT INTO activity_log (at, object_type, object_id, action) VALUES ('x', 'item', 1, 'created')");
  const before = snapshot(t.raw);
  const report = await migrate(migrations, { backup: t.driver.backup });
  assert.deepEqual(report.applied, [4]);
  assert.equal(await getSchemaVersion(), 4);
  assert.equal(t.backups.filter((b) => b.kind === 'pre-migration').length, 1, 'une sauvegarde avant la migration 4 (la création de la base vierge n\'en demande pas)');
  const after = snapshot(t.raw);
  for (const table of Object.keys(before).filter((n) => n !== 'meta')) assert.deepEqual(after[table], before[table], `la table ${table} est inchangée`); // meta porte le numéro de schéma : elle change, voulu
  assert.equal(after.requirement_details.count, 0);
  const copy = new DatabaseSync(t.backups[t.backups.length - 1].file, { readOnly: true });
  assert.equal((copy.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'requirement_details'").get() as { n: number }).n, 0, 'la sauvegarde garde le schéma 3');
  copy.close();
  t.close();
});

test('migration 4 : valeurs par défaut en base, suppression en cascade avec l\'élément, jeu de test à jour', async () => {
  assert.equal(migrations[3].name, 'requirement_details');
  const t = await migratedDb();
  const p = await createProject('P');
  const r = await createRequirement({ projectId: p, title: 'E' });
  t.raw.exec(`DELETE FROM requirement_details WHERE item_id = ${r.id}`);
  t.raw.exec(`INSERT INTO requirement_details (item_id) VALUES (${r.id})`);
  const row = t.raw.prepare('SELECT nature, priority, criteria FROM requirement_details').get() as Record<string, string>;
  assert.deepEqual({ ...row }, { nature: 'functional', priority: 'should', criteria: '' });
  t.raw.exec(`DELETE FROM items WHERE id = ${r.id}`);
  assert.equal(await count('requirement_details'), 0, 'la cascade supprime les détails');
  t.close();
});

test('migration 4 : le jeu de test couvre la table des exigences', async () => {
  const t = await migratedDb();
  seedAllTables(t.raw);
  assert.equal(snapshot(t.raw).requirement_details.count, 1);
  t.close();
});

// ------------------------------------------------------------------ besoins

test('besoin : code BES-001…, statut brouillon, une ligne de journal, modification qui ne nomme que les champs changés', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const before = await count('activity_log');
  const a = await createItem({ projectId: p, kind: 'need', title: '  Suivre les campagnes  ', description: 'Détail' });
  const b = await createItem({ projectId: p, kind: 'need', title: 'Deuxième' });
  assert.equal(a.code, 'BES-001');
  assert.equal(b.code, 'BES-002');
  assert.equal(await count('activity_log'), before + 2);
  const item = await getItem(a.id);
  assert.equal(item?.title, 'Suivre les campagnes');
  assert.equal(item?.status, 'draft');
  assert.equal(await updateItem(a.id, { title: 'Suivre les campagnes' }), false, 'rien ne change : rien n\'est écrit');
  assert.equal(await count('activity_log'), before + 2);
  assert.equal(await updateItem(a.id, { description: 'Secret métier XYZ' }), true);
  const line = await lastLine();
  assert.equal(line.action, 'updated');
  assert.equal(line.detail, 'description');
  assert.ok(!(line.detail ?? '').includes('XYZ'), 'le journal ne contient jamais le contenu');
  assert.ok(await checkModelIntegrity().then((i) => i.length === 0));
  t.close();
});

test('besoin : titre vide ou trop long refusé, statuts librement modifiables entre eux (D47)', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  await assert.rejects(createItem({ projectId: p, kind: 'need', title: '   ' }), /titre/i);
  await assert.rejects(createItem({ projectId: p, kind: 'need', title: 'x'.repeat(201) }), /200/);
  const n = await createItem({ projectId: p, kind: 'need', title: 'N' });
  for (const s of ['validated', 'rejected', 'draft', 'archived', 'validated']) {
    await changeItemStatus(n.id, s);
    assert.equal((await getItem(n.id))?.status, s);
  }
  await assert.rejects(changeItemStatus(n.id, 'active'), /statut/i);
  t.close();
});

// ------------------------------------------------------------------ exigences

test('exigence : code EX-001…, valeurs par défaut, détails créés avec l\'élément en une transaction, une ligne de journal', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const before = await count('activity_log');
  const a = await createRequirement({ projectId: p, title: 'Exporter en Word' });
  assert.equal(a.code, 'EX-001');
  assert.equal(await count('activity_log'), before + 1, 'une seule ligne de journal pour l\'élément et ses détails');
  const r = await getRequirement(a.id);
  assert.deepEqual({ nature: r?.nature, priority: r?.priority, criteria: r?.criteria, status: r?.status }, { nature: 'functional', priority: 'should', criteria: '', status: 'draft' });
  const b = await createRequirement({ projectId: p, title: 'Temps de réponse', nature: 'non_functional', priority: 'must', criteria: 'Moins de 2 s\nsur 95 % des requêtes' });
  assert.equal(b.code, 'EX-002');
  assert.equal((await getRequirement(b.id))?.criteria, 'Moins de 2 s\nsur 95 % des requêtes', 'les retours à la ligne sont conservés');
  assert.deepEqual((await listRequirements(p)).map((x) => x.code), ['EX-001', 'EX-002']);
  assert.deepEqual((await listRequirements(p, 'validated')), []);
  t.close();
});

test('exigence : un échec des détails annule aussi l\'élément et le compteur', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  t.raw.exec("CREATE TRIGGER fail_rq BEFORE INSERT ON requirement_details BEGIN SELECT RAISE(ABORT, 'panne simulée'); END");
  await assert.rejects(createRequirement({ projectId: p, title: 'Ne doit pas exister' }), /panne simulée/);
  assert.equal(await count('items'), 0);
  assert.equal(await count('sequences'), 0);
  assert.equal(await count('activity_log'), 1, 'seule la création du projet est journalisée');
  t.raw.exec('DROP TRIGGER fail_rq');
  assert.equal((await createRequirement({ projectId: p, title: 'Maintenant' })).code, 'EX-001');
  t.close();
});

test('exigence : valeurs invalides refusées sans rien écrire ; un élément « exigence » sans détails ne peut pas être créé par createItem', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  await assert.rejects(createRequirement({ projectId: p, title: 'X', nature: 'zzz' as 'functional' }), /nature/i);
  await assert.rejects(createRequirement({ projectId: p, title: 'X', priority: 'zzz' as 'must' }), /priorité/i);
  await assert.rejects(createRequirement({ projectId: p, title: 'X', criteria: 'x'.repeat(MAX_CRITERIA_LENGTH + 1) }), /critères/i);
  assert.equal(await count('items'), 0);
  await assert.rejects(createItem({ projectId: p, kind: 'requirement', title: 'Sans détails' }), /dépôt de son type/);
  assert.equal(await count('items'), 0);
  t.close();
});

test('exigence : modification atomique, journal « updated » qui ne nomme que les champs modifiés, aucune écriture si rien ne change', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const r = await createRequirement({ projectId: p, title: 'E', criteria: 'avant' });
  const before = await count('activity_log');
  assert.equal(await updateRequirement(r.id, { title: 'E' }), false);
  assert.equal(await updateRequirement(r.id, { fields: { criteria: 'avant', priority: 'should' } }), false);
  assert.equal(await count('activity_log'), before);
  assert.equal(await updateRequirement(r.id, { title: 'E2', fields: { priority: 'must', criteria: 'apres confidentiel' } }), true);
  assert.equal(await count('activity_log'), before + 1, 'une seule ligne même si l\'élément et ses détails changent');
  const line = await lastLine();
  assert.equal(line.action, 'updated');
  assert.equal(line.detail, 'title,priority,criteria');
  assert.ok(!(line.detail ?? '').includes('confidentiel'));
  const now = await getRequirement(r.id);
  assert.deepEqual({ t: now?.title, p: now?.priority, c: now?.criteria }, { t: 'E2', p: 'must', c: 'apres confidentiel' });
  // un changement des seuls détails ne touche pas à l'élément commun, mais la date de modification avance
  await assert.rejects(updateRequirement(r.id, { fields: { nature: 'zzz' as 'functional' } }), /nature/i);
  assert.equal((await getRequirement(r.id))?.priority, 'must', 'une modification refusée ne change rien');
  await assert.rejects(updateRequirement(9999, { title: 'x' }), /n'existe pas/);
  t.close();
});

test('exigence : texte hostile conservé tel quel (apostrophes, SQL, balises, accents), jamais interprété', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const hostile = "'); DROP TABLE items; -- <script>alert(1)</script> é « » \\ %s ${x}";
  const r = await createRequirement({ projectId: p, title: hostile, description: hostile, criteria: hostile });
  const got = await getRequirement(r.id);
  assert.equal(got?.title, hostile);
  assert.equal(got?.criteria, hostile);
  assert.equal(await count('items'), 1);
  t.close();
});

// ------------------------------------------------------------------ liens

async function chain() {
  const p = await createProject('P');
  const pp = await createStakeholder({ projectId: p, title: 'PP' });
  const need = await createItem({ projectId: p, kind: 'need', title: 'Besoin' });
  const e1 = await createRequirement({ projectId: p, title: 'E1' });
  const e2 = await createRequirement({ projectId: p, title: 'E2' });
  const e3 = await createRequirement({ projectId: p, title: 'E3' });
  return { p, pp, need, e1, e2, e3 };
}

test('liens : chaîne Partie prenante → Besoin → Exigence, lue depuis chaque extrémité avec le bon sens', async () => {
  const t = await migratedDb();
  const c = await chain();
  const l1 = await createLink({ type: 'expresses', fromId: c.pp.id, toId: c.need.id });
  await createLink({ type: 'derives', fromId: c.need.id, toId: c.e1.id });
  const fromNeed = await linkedItems(c.need.id);
  assert.deepEqual(fromNeed.map((l) => [l.link_type, l.direction, l.other_code]), [['derives', 'out', 'EX-001'], ['expresses', 'in', 'PP-001']]);
  assert.deepEqual((await linkedItems(c.e1.id)).map((l) => [l.link_type, l.direction, l.other_code]), [['derives', 'in', 'BES-001']]);
  assert.deepEqual((await linkedItems(c.pp.id)).map((l) => [l.link_type, l.direction, l.other_code]), [['expresses', 'out', 'BES-001']]);
  assert.equal(fromNeed[1].link_id, l1);
  assert.equal(fromNeed[0].other_title, 'E1');
  assert.deepEqual(await linkedItems(c.e3.id), []);
  t.close();
});

test('liens : doublon, couple de types interdit, projet différent et lien à soi-même refusés avec un message clair', async () => {
  const t = await migratedDb();
  const c = await chain();
  await createLink({ type: 'derives', fromId: c.need.id, toId: c.e1.id });
  await assert.rejects(createLink({ type: 'derives', fromId: c.need.id, toId: c.e1.id }), /existe déjà/);
  await assert.rejects(createLink({ type: 'derives', fromId: c.e1.id, toId: c.need.id }), /refusé/);
  await assert.rejects(createLink({ type: 'expresses', fromId: c.need.id, toId: c.e1.id }), /refusé/);
  await assert.rejects(createLink({ type: 'refines', fromId: c.e1.id, toId: c.e1.id }), /lui-même/);
  const other = await createProject('Autre');
  const foreign = await createRequirement({ projectId: other, title: 'Ailleurs' });
  await assert.rejects(createLink({ type: 'refines', fromId: c.e1.id, toId: foreign.id }), /même projet/);
  assert.equal(await count('links'), 1);
  t.close();
});

test('liens : « raffine » refuse les boucles directes, longues et croisées, accepte les losanges et les deux sens (D50)', async () => {
  const t = await migratedDb();
  const c = await chain();
  await createLink({ type: 'refines', fromId: c.e1.id, toId: c.e2.id });
  await assert.rejects(createLink({ type: 'refines', fromId: c.e2.id, toId: c.e1.id }), /boucle/);
  await createLink({ type: 'refines', fromId: c.e2.id, toId: c.e3.id });
  await assert.rejects(createLink({ type: 'refines', fromId: c.e3.id, toId: c.e1.id }), /boucle.*EX-003.*EX-001|boucle/);
  await createLink({ type: 'refines', fromId: c.e1.id, toId: c.e3.id }); // raccourci : pas une boucle
  assert.equal(await count('links'), 3);
  assert.deepEqual(await checkModelIntegrity(), []);
  t.close();
});

test('liens : candidats = bon type, même projet, pas soi-même, pas déjà relié de cette façon ; retirés après création, revenus après suppression', async () => {
  const t = await migratedDb();
  const c = await chain();
  const other = await createProject('Autre');
  await createRequirement({ projectId: other, title: 'Ailleurs' });
  assert.deepEqual((await linkCandidates(c.need.id, 'derives', 'out')).map((x) => x.code), ['EX-001', 'EX-002', 'EX-003']);
  assert.deepEqual((await linkCandidates(c.need.id, 'expresses', 'in')).map((x) => x.code), ['PP-001']);
  assert.deepEqual(await linkCandidates(c.need.id, 'refines', 'out'), [], 'un besoin ne peut pas raffiner');
  assert.deepEqual((await linkCandidates(c.e1.id, 'refines', 'out')).map((x) => x.code), ['EX-002', 'EX-003']);
  const id = await createLink({ type: 'derives', fromId: c.need.id, toId: c.e1.id });
  assert.deepEqual((await linkCandidates(c.need.id, 'derives', 'out')).map((x) => x.code), ['EX-002', 'EX-003']);
  assert.deepEqual((await linkCandidates(c.e1.id, 'derives', 'in')).map((x) => x.code), [], 'le seul besoin est déjà relié');
  await deleteLink(id);
  assert.deepEqual((await linkCandidates(c.need.id, 'derives', 'out')).map((x) => x.code), ['EX-001', 'EX-002', 'EX-003']);
  await assert.rejects(linkCandidates(9999, 'derives', 'out'), /n'existe pas/);
  t.close();
});

test('liens : les éléments archivés ou rejetés restent reliables (D51)', async () => {
  const t = await migratedDb();
  const c = await chain();
  await changeItemStatus(c.e1.id, 'archived');
  await changeItemStatus(c.need.id, 'rejected');
  assert.ok((await linkCandidates(c.need.id, 'derives', 'out')).some((x) => x.code === 'EX-001'));
  await createLink({ type: 'derives', fromId: c.need.id, toId: c.e1.id });
  const l = (await linkedItems(c.need.id))[0];
  assert.equal(l.other_status, 'archived');
  t.close();
});

test('suppression : un élément lié est supprimé avec ses liens et ses détails, sans toucher aux autres éléments, une ligne de journal', async () => {
  const t = await migratedDb();
  const c = await chain();
  await createLink({ type: 'derives', fromId: c.need.id, toId: c.e1.id });
  await createLink({ type: 'refines', fromId: c.e1.id, toId: c.e2.id });
  await deleteItem(c.e1.id);
  assert.equal(await count('links'), 0);
  assert.equal(await getRequirement(c.e1.id), null);
  assert.ok(await getItem(c.need.id) && await getRequirement(c.e2.id));
  assert.equal(await count('requirement_details'), 2);
  assert.deepEqual(await checkModelIntegrity(), []);
  t.close();
});

test('suppression du projet : besoins, exigences, détails et liens partent avec lui', async () => {
  const t = await migratedDb();
  const c = await chain();
  await createLink({ type: 'derives', fromId: c.need.id, toId: c.e1.id });
  await deleteProject(c.p);
  // Les compteurs (table sequences) restent : les identifiants de projet ne sont jamais réutilisés, ils sont sans effet.
  for (const tbl of ['items', 'requirement_details', 'stakeholder_details', 'links']) assert.equal(await count(tbl), 0, tbl);
  t.close();
});

// ------------------------------------------------------------------ intégrité

test('intégrité : chaque anomalie M3b est détectée, une à la fois, puis disparaît une fois réparée', async () => {
  const t = await migratedDb();
  const c = await chain();
  assert.deepEqual(await checkModelIntegrity(), []);
  t.raw.exec(`UPDATE requirement_details SET nature = 'zzz' WHERE item_id = ${c.e1.id}`);
  assert.deepEqual((await checkModelIntegrity()).map((i) => i.problem), ['requirement-invalid-value']);
  t.raw.exec(`UPDATE requirement_details SET nature = 'functional', priority = 'zzz' WHERE item_id = ${c.e1.id}`);
  assert.deepEqual((await checkModelIntegrity()).map((i) => i.problem), ['requirement-invalid-value']);
  t.raw.exec(`UPDATE requirement_details SET priority = 'should' WHERE item_id = ${c.e1.id}`);
  t.raw.exec(`INSERT INTO requirement_details (item_id) VALUES (${c.need.id})`);
  assert.deepEqual((await checkModelIntegrity()).map((i) => i.problem), ['requirement-details-wrong-kind']);
  t.raw.exec(`DELETE FROM requirement_details WHERE item_id = ${c.need.id}`);
  t.raw.exec(`DELETE FROM requirement_details WHERE item_id = ${c.e2.id}`);
  assert.deepEqual((await checkModelIntegrity()).map((i) => i.problem), ['requirement-details-missing']);
  t.raw.exec(`INSERT INTO requirement_details (item_id) VALUES (${c.e2.id})`);
  // une boucle « raffine » écrite hors du dépôt (par exemple par une base trafiquée) est signalée
  const T = 'x';
  t.raw.exec(`INSERT INTO links (project_id, link_type, from_id, to_id, created_at) VALUES (${c.p}, 'refines', ${c.e1.id}, ${c.e2.id}, '${T}'), (${c.p}, 'refines', ${c.e2.id}, ${c.e1.id}, '${T}')`);
  assert.deepEqual((await checkModelIntegrity()).map((i) => i.problem), ['link-cycle']);
  t.raw.exec('DELETE FROM links');
  assert.deepEqual(await checkModelIntegrity(), []);
  t.close();
});

// ------------------------------------------------------------------ sauvegarde

test('sauvegarde et restauration : besoins, exigences, détails et liens reviennent exactement ; la numérotation continue', async () => {
  const t = await migratedDb();
  const c = await chain();
  await createLink({ type: 'derives', fromId: c.need.id, toId: c.e1.id });
  await updateRequirement(c.e1.id, { fields: { priority: 'must', criteria: 'Critère' } });
  const { created } = await createBackup('manual');
  const saved = snapshot(t.raw);
  await updateRequirement(c.e1.id, { fields: { priority: 'wont' } });
  await createRequirement({ projectId: c.p, title: 'Ajoutée après' });
  await deleteItem(c.need.id);
  await restoreBackup(created.file);
  const back = snapshot(t.raw);
  for (const table of ['items', 'requirement_details', 'stakeholder_details', 'links', 'sequences', 'projects']) assert.deepEqual(back[table], saved[table], table);
  assert.deepEqual(await checkModelIntegrity(), []);
  assert.equal((await createRequirement({ projectId: c.p, title: 'Après restauration' })).code, 'EX-004');
  t.close();
});

// ------------------------------------------------------------------ journal : aucune création de lien ne perd l'inverse

test('journal : créer puis supprimer un lien écrit deux lignes « link », sans contenu', async () => {
  const t = await migratedDb();
  const c = await chain();
  const before = await count('activity_log');
  const id = await createLink({ type: 'derives', fromId: c.need.id, toId: c.e1.id });
  await deleteLink(id);
  assert.equal(await count('activity_log'), before + 2);
  const lines = await query<{ object_type: string; action: string; detail: string }>('SELECT object_type, action, detail FROM activity_log ORDER BY id DESC LIMIT 2');
  assert.deepEqual(lines.map((l) => [l.object_type, l.action, l.detail]), [['link', 'deleted', 'derives'], ['link', 'created', 'derives']]);
  assert.equal((await listLinks(c.p)).length, 0);
  t.close();
});
