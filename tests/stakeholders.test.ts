// Lot M3a : navigation, projets, parties prenantes (décisions D32 à D43). Ce fichier couvre la base et les dépôts ; les écrans sont dans ui-m3a.test.tsx.
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
import { createProject, deleteProject, getProject, renameProject } from '../src/data/repositories/projects.ts';
import { changeItemStatus, createItem, deleteItem, getItem } from '../src/data/repositories/items.ts';
import { createLink } from '../src/data/repositories/links.ts';
import { createStakeholder, getStakeholder, listStakeholders, updateStakeholder } from '../src/data/repositories/stakeholders.ts';
import { getLastProjectId, setLastProjectId } from '../src/data/repositories/ui-state.ts';
import { checkModelIntegrity } from '../src/data/repositories/integrity.ts';
import { changedFields, DEFAULT_FIELDS, isLevel, levelLabel, normalizeFields, statusLabel } from '../src/domain/stakeholders.ts';
import { initialStatus, isValidStatus } from '../src/domain/kinds.ts';

const count = async (table: string): Promise<number> => Number((await query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))[0].n);
const journal = async (objectType: string, action: string): Promise<number> =>
  Number((await query<{ n: number }>('SELECT count(*) AS n FROM activity_log WHERE object_type = ? AND action = ?', [objectType, action]))[0].n);
const currentActivityIdForTests = async (): Promise<number> => Number((await query<{ m: number | null }>('SELECT max(id) AS m FROM activity_log'))[0].m ?? 0);
const lastLine = async (): Promise<{ object_type: string; object_id: number | null; action: string; project_id: number | null; detail: string | null }> =>
  (await query<{ object_type: string; object_id: number | null; action: string; project_id: number | null; detail: string | null }>(
    'SELECT object_type, object_id, action, project_id, detail FROM activity_log ORDER BY id DESC LIMIT 1',
  ))[0];

// ------------------------------------------------------------------ domaine pur

test('domaine : statuts d\'une partie prenante, niveaux et règles de saisie', () => {
  assert.equal(initialStatus('stakeholder'), 'active');
  assert.ok(isValidStatus('stakeholder', 'archived'));
  assert.ok(!isValidStatus('stakeholder', 'draft'), 'les statuts des autres types ne valent pas ici');
  assert.ok(isLevel('low') && isLevel('medium') && isLevel('high') && !isLevel('très élevé'));
  assert.equal(levelLabel('high'), 'Élevé');
  assert.equal(statusLabel('active'), 'Actif');
  assert.deepEqual(normalizeFields({}), DEFAULT_FIELDS);
  assert.deepEqual(normalizeFields({ organisation: '  DSI ', role: ' Sponsor ' }), { organisation: 'DSI', role: 'Sponsor', influence: 'medium', interest: 'medium' });
  assert.throws(() => normalizeFields({ organisation: 'x'.repeat(201) }), /organisation est limitée à 200/);
  assert.throws(() => normalizeFields({ role: 'x'.repeat(201) }), /rôle est limité à 200/);
  assert.throws(() => normalizeFields({ influence: 'énorme' as 'low' }), /influence inconnu/);
  assert.throws(() => normalizeFields({ interest: 'nul' as 'low' }), /intérêt inconnu/);
  assert.deepEqual(changedFields(DEFAULT_FIELDS, { ...DEFAULT_FIELDS, role: 'x', interest: 'high' }), ['role', 'interest']);
  assert.deepEqual(changedFields(DEFAULT_FIELDS, DEFAULT_FIELDS), []);
});

// ------------------------------------------------------------------ migration 3

test('migration 3 : le journal est reconstruit sans perdre une ligne, identifiants intacts, sauvegarde pre-migration au schéma 2', async () => {
  const t = emptyDb();
  await migrate(migrations.slice(0, 2), { backup: t.driver.backup });
  assert.equal(await getSchemaVersion(), 2);
  const raw = t.raw;
  raw.exec("INSERT INTO projects (id, kind, name, created_at, updated_at) VALUES (1, 'project', 'Avant', 'x', 'x')");
  for (let i = 1; i <= 40; i++) {
    raw.exec(`INSERT INTO activity_log (at, object_type, object_id, action, project_id, detail) VALUES ('2026-11-2${i % 10}T10:00:00Z', 'item', ${i}, '${i % 2 ? 'created' : 'status_changed'}', 1, 'd${i}')`);
  }
  raw.exec('DELETE FROM activity_log WHERE id IN (5, 6, 7)'); // des trous : les identifiants doivent rester ceux d'origine
  raw.exec("INSERT INTO items (id, project_id, kind, number, code, title, description, status, created_at, updated_at) VALUES (1, 1, 'need', 1, 'BES-001', 'Besoin', '', 'draft', 'x', 'x')");
  const before = snapshot(raw);
  const oldIds = (raw.prepare('SELECT id FROM activity_log ORDER BY id').all() as Array<{ id: number }>).map((r) => r.id);
  const oldRows = JSON.stringify(raw.prepare('SELECT * FROM activity_log ORDER BY id').all());

  const report = await migrate(migrations, { backup: t.driver.backup });
  assert.deepEqual(report.applied, [3]);
  assert.equal(t.backups.filter((b) => b.kind === 'pre-migration').length, 1);
  assert.equal(await getSchemaVersion(), 3);

  assert.equal(JSON.stringify(t.raw.prepare('SELECT * FROM activity_log ORDER BY id').all()), oldRows, 'chaque ligne du journal est identique, colonne par colonne');
  assert.deepEqual((t.raw.prepare('SELECT id FROM activity_log ORDER BY id').all() as Array<{ id: number }>).map((r) => r.id), oldIds);
  const after = snapshot(t.raw);
  for (const table of ['projects', 'items', 'links', 'documents', 'sequences', 'activity_log']) assert.deepEqual(after[table], before[table], `la table ${table} est inchangée`);
  assert.equal(after.stakeholder_details.count, 0);

  // Le journal accepte « updated », refuse toujours une action inconnue, et continue sa numérotation après le plus grand identifiant.
  t.raw.exec("INSERT INTO activity_log (at, object_type, object_id, action) VALUES ('x', 'item', 1, 'updated')");
  assert.equal((t.raw.prepare('SELECT max(id) AS m FROM activity_log').get() as { m: number }).m, 41);
  assert.throws(() => t.raw.exec("INSERT INTO activity_log (at, object_type, object_id, action) VALUES ('x', 'item', 1, 'renamed')"), /CHECK/);
  const idx = t.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_activity_type_at'").all();
  assert.equal(idx.length, 1, 'l\'index du journal est recréé');

  const copy = new DatabaseSync(t.backups[0].file, { readOnly: true });
  const sql = (copy.prepare("SELECT sql FROM sqlite_master WHERE name = 'activity_log'").get() as { sql: string }).sql;
  assert.ok(!sql.includes("'updated'"), 'la sauvegarde pre-migration garde l\'ancien journal');
  assert.equal((copy.prepare('SELECT count(*) AS n FROM activity_log').get() as { n: number }).n, 37);
  copy.close();
  t.close();
});

test('migration 3 : le journal reconstruit sert encore à la sauvegarde automatique (dernier identifiant)', async () => {
  const t = emptyDb();
  await migrate(migrations.slice(0, 2), { backup: t.driver.backup });
  t.raw.exec("INSERT INTO projects (id, kind, name, created_at, updated_at) VALUES (1, 'project', 'P', 'x', 'x')");
  for (let i = 0; i < 5; i++) t.raw.exec("INSERT INTO activity_log (at, object_type, object_id, action) VALUES ('x', 'project', 1, 'created')");
  const idBefore = await currentActivityIdForTests();
  await migrate(migrations, { backup: t.driver.backup });
  assert.equal(await currentActivityIdForTests(), idBefore, 'la migration ne change pas le dernier identifiant : aucune sauvegarde automatique n\'est déclenchée à tort');
  t.close();
});

// ------------------------------------------------------------------ création

test('création : code PP-001, statut actif, détails par défaut, une seule ligne de journal', async () => {
  const t = await migratedDb();
  const p = await createProject('Projet');
  const logBefore = await count('activity_log');
  const a = await createStakeholder({ projectId: p, title: '  Responsable CRP  ', organisation: 'La Poste', role: 'Sponsor', influence: 'high', interest: 'high' });
  assert.equal(a.code, 'PP-001');
  assert.equal((await count('activity_log')) - logBefore, 1, 'une création = une ligne de journal, détails compris');
  const line = await lastLine();
  assert.deepEqual([line.object_type, line.action, line.object_id, line.project_id, line.detail], ['item', 'created', a.id, p, 'stakeholder']);
  const s = await getStakeholder(a.id);
  assert.deepEqual([s?.title, s?.status, s?.organisation, s?.role, s?.influence, s?.interest], ['Responsable CRP', 'active', 'La Poste', 'Sponsor', 'high', 'high']);

  const b = await createStakeholder({ projectId: p, title: 'Utilisateur' });
  assert.equal(b.code, 'PP-002');
  const d = await getStakeholder(b.id);
  assert.deepEqual([d?.organisation, d?.role, d?.influence, d?.interest], ['', '', 'medium', 'medium']);
  assert.equal(await count('stakeholder_details'), 2);
  assert.deepEqual((await listStakeholders(p)).map((x) => x.code), ['PP-001', 'PP-002']);
  const p2 = await createProject('Autre');
  assert.equal((await createStakeholder({ projectId: p2, title: 'Autre projet' })).code, 'PP-001', 'chaque projet a sa numérotation');
  assert.deepEqual(await checkModelIntegrity(), []);
  t.close();
});

test('création : une saisie invalide est refusée sans rien écrire, sans consommer de numéro', async () => {
  const t = await migratedDb();
  const p = await createProject('Projet');
  const folder = await createProject('Dossier', 'folder');
  const logBefore = await count('activity_log');
  await assert.rejects(createStakeholder({ projectId: p, title: '   ' }), /titre est obligatoire/);
  await assert.rejects(createStakeholder({ projectId: p, title: 'x'.repeat(201) }), /titre est limité/);
  await assert.rejects(createStakeholder({ projectId: p, title: 'ok', influence: 'énorme' as 'low' }), /influence inconnu/);
  await assert.rejects(createStakeholder({ projectId: p, title: 'ok', organisation: 'x'.repeat(201) }), /limitée à 200/);
  await assert.rejects(createStakeholder({ projectId: folder, title: 'ok' }), /pas dans un dossier/);
  await assert.rejects(createStakeholder({ projectId: 999, title: 'ok' }), /projet n'existe pas/);
  assert.equal(await count('items'), 0);
  assert.equal(await count('stakeholder_details'), 0);
  assert.equal(await count('sequences'), 0);
  assert.equal(await count('activity_log'), logBefore);
  t.close();
});

test('création : l\'élément et ses détails sont atomiques (un échec des détails annule aussi l\'élément et le compteur)', async () => {
  const t = await migratedDb();
  const p = await createProject('Projet');
  t.raw.exec('CREATE TRIGGER fail_details BEFORE INSERT ON stakeholder_details BEGIN SELECT RAISE(ABORT, \'panne simulée\'); END');
  await assert.rejects(createStakeholder({ projectId: p, title: 'Ne doit pas exister' }), /panne simulée/);
  assert.equal(await count('items'), 0);
  assert.equal(await count('sequences'), 0, 'le numéro n\'est pas consommé');
  t.raw.exec('DROP TRIGGER fail_details');
  assert.equal((await createStakeholder({ projectId: p, title: 'Maintenant' })).code, 'PP-001');
  t.close();
});

// ------------------------------------------------------------------ modification

test('modification : une ligne « updated » qui ne nomme que les champs, jamais leur contenu', async () => {
  const t = await migratedDb();
  const p = await createProject('Projet');
  const { id } = await createStakeholder({ projectId: p, title: 'Ancien nom', description: 'Avant' });
  const log = await count('activity_log');

  assert.equal(await updateStakeholder(id, { title: 'Nouveau nom secret', description: 'Texte confidentiel', fields: { role: 'Sponsor', influence: 'high' } }), true);
  assert.equal((await count('activity_log')) - log, 1);
  const line = await lastLine();
  assert.deepEqual([line.object_type, line.action, line.object_id, line.project_id], ['item', 'updated', id, p]);
  assert.equal(line.detail, 'title,description,role,influence');
  assert.ok(!/secret|confidentiel|Sponsor/.test(line.detail ?? ''), 'aucun contenu dans le journal');
  const s = await getStakeholder(id);
  assert.deepEqual([s?.title, s?.description, s?.role, s?.influence, s?.interest], ['Nouveau nom secret', 'Texte confidentiel', 'Sponsor', 'high', 'medium']);

  // Détails seuls : une ligne, et la date de modification de l'élément est mise à jour.
  const t0 = (await getItem(id))!.updated_at;
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await updateStakeholder(id, { fields: { interest: 'low' } }), true);
  assert.equal((await lastLine()).detail, 'interest');
  assert.ok((await getItem(id))!.updated_at > t0);
  t.close();
});

test('modification : sans changement, aucune écriture ni ligne de journal ; une saisie invalide ne change rien', async () => {
  const t = await migratedDb();
  const p = await createProject('Projet');
  const { id } = await createStakeholder({ projectId: p, title: 'Nom', organisation: 'Org' });
  const log = await count('activity_log');
  const snap = snapshot(t.raw);
  assert.equal(await updateStakeholder(id, { title: 'Nom', description: '', fields: { organisation: 'Org', influence: 'medium' } }), false);
  assert.equal(await updateStakeholder(id, { title: '  Nom  ' }), false, 'les espaces autour ne comptent pas comme un changement');
  assert.equal(await updateStakeholder(id, {}), false);
  assert.equal(await count('activity_log'), log);
  assert.deepEqual(snapshot(t.raw).items, snap.items);

  await assert.rejects(updateStakeholder(id, { title: '' }), /titre est obligatoire/);
  await assert.rejects(updateStakeholder(id, { fields: { influence: 'x' as 'low' } }), /influence inconnu/);
  await assert.rejects(updateStakeholder(id, { description: 'x'.repeat(10001) }), /description est limitée/);
  await assert.rejects(updateStakeholder(9999, { title: 'x' }), /n'existe pas/);
  assert.equal(await count('activity_log'), log);
  assert.deepEqual(snapshot(t.raw).items, snap.items);
  assert.deepEqual(snapshot(t.raw).stakeholder_details, snap.stakeholder_details);
  t.close();
});

test('statut : actif et archivé, filtre de la liste, statut d\'un autre type refusé', async () => {
  const t = await migratedDb();
  const p = await createProject('Projet');
  const a = await createStakeholder({ projectId: p, title: 'A' });
  const b = await createStakeholder({ projectId: p, title: 'B' });
  await changeItemStatus(b.id, 'archived');
  assert.deepEqual((await lastLine()).detail, 'active>archived');
  assert.deepEqual((await listStakeholders(p, 'active')).map((s) => s.code), [a.code]);
  assert.deepEqual((await listStakeholders(p, 'archived')).map((s) => s.code), [b.code]);
  assert.equal((await listStakeholders(p)).length, 2);
  await assert.rejects(changeItemStatus(a.id, 'draft'), /Statut « draft » inconnu/);
  await changeItemStatus(b.id, 'active');
  assert.equal((await getStakeholder(b.id))?.status, 'active');
  assert.equal(await getStakeholder((await createItem({ projectId: p, kind: 'need', title: 'Besoin' })).id), null, 'un besoin n\'est pas une partie prenante');
  t.close();
});

// ------------------------------------------------------------------ suppression

test('suppression : les détails disparaissent avec l\'élément, les liens sont journalisés, le projet entraîne tout', async () => {
  const t = await migratedDb();
  const p = await createProject('Projet');
  const s = await createStakeholder({ projectId: p, title: 'PP' });
  const need = await createItem({ projectId: p, kind: 'need', title: 'Besoin' });
  await createLink({ type: 'expresses', fromId: s.id, toId: need.id });
  await deleteItem(s.id);
  assert.equal(await count('stakeholder_details'), 0);
  assert.equal(await count('links'), 0);
  assert.equal(await journal('link', 'deleted'), 1);
  assert.equal(await journal('item', 'deleted'), 1);
  assert.equal((await createStakeholder({ projectId: p, title: 'Autre' })).code, 'PP-002', 'un numéro supprimé n\'est pas réattribué');

  await deleteProject(p);
  assert.equal(await count('items'), 0);
  assert.equal(await count('stakeholder_details'), 0);
  assert.equal(await journal('item', 'deleted'), 3);
  t.close();
});

// ------------------------------------------------------------------ garde d'écriture des tables d'extension

test('garde : une table d\'extension ne s\'écrit qu\'avec une écriture journalisée, jamais seule ni sur une autre table', async () => {
  const t = await migratedDb();
  const p = await createProject('Projet');
  const s = await createStakeholder({ projectId: p, title: 'PP' });
  const upd = { sql: 'UPDATE stakeholder_details SET role = ? WHERE item_id = ?', params: ['Pirate', s.id] };
  await assert.rejects(mutate([{ ...upd }]), /Écriture sans journal d'activité refusée/, 'sans « extension », la table n\'est pas technique');
  await assert.rejects(mutate([{ ...upd, extension: true }]), /avec une écriture journalisée/);
  await assert.rejects(
    mutate([{ sql: 'UPDATE items SET title = ? WHERE id = ?', params: ['Pirate', s.id], extension: true }]),
    /n'est admis que pour les tables/,
  );
  await assert.rejects(
    mutate([{ ...upd, extension: true, activity: { objectType: 'item', action: 'updated', objectId: s.id } }]),
    /exclusifs/,
  );
  assert.equal((await getStakeholder(s.id))?.role, '', 'aucun refus n\'a écrit quoi que ce soit');
  await mutate([
    { sql: 'UPDATE items SET updated_at = ? WHERE id = ?', params: ['2026-11-25T00:00:00Z', s.id], activity: { objectType: 'item', action: 'updated', objectId: s.id, detail: 'role' } },
    { ...upd, params: ['Légitime', s.id], extension: true },
  ]);
  assert.equal((await getStakeholder(s.id))?.role, 'Légitime');
  t.close();
});

// ------------------------------------------------------------------ projets

test('projet : renommer écrit « updated » (nom seul), refuse vide ou trop long, sans effet si identique', async () => {
  const t = await migratedDb();
  const p = await createProject('Ancien');
  const folder = await createProject('Dossier', 'folder', p);
  assert.equal(await renameProject(p, '  Nouveau nom  '), true);
  assert.equal((await getProject(p))?.name, 'Nouveau nom');
  const line = await lastLine();
  assert.deepEqual([line.object_type, line.action, line.object_id, line.project_id, line.detail], ['project', 'updated', p, p, 'name']);
  const log = await count('activity_log');
  assert.equal(await renameProject(p, 'Nouveau nom'), false);
  assert.equal(await count('activity_log'), log);
  await assert.rejects(renameProject(p, '  '), /nom du projet est obligatoire/);
  await assert.rejects(renameProject(p, 'x'.repeat(201)), /limité à 200/);
  await assert.rejects(renameProject(999, 'x'), /n'existe pas/);
  await assert.rejects(createProject('x'.repeat(201)), /limité à 200/);
  assert.equal(await renameProject(folder, 'Dossier 2'), true);
  assert.equal((await lastLine()).object_type, 'folder');
  assert.ok(!/Nouveau|Dossier/.test((await lastLine()).detail ?? ''), 'aucun nom dans le journal');
  t.close();
});

test('dernier projet actif : mémorisé dans meta sans journal, revérifié à la lecture', async () => {
  const t = await migratedDb();
  assert.equal(await getLastProjectId(), null);
  const p1 = await createProject('Un');
  const p2 = await createProject('Deux');
  const folder = await createProject('Dossier', 'folder');
  const log = await count('activity_log');
  await setLastProjectId(p2);
  assert.equal(await getLastProjectId(), p2);
  assert.equal(await count('activity_log'), log, 'aucune ligne de journal : aucune sauvegarde automatique déclenchée');
  await setLastProjectId(folder);
  assert.equal(await getLastProjectId(), null, 'un dossier n\'est pas un projet actif');
  await setLastProjectId(p1);
  await deleteProject(p1);
  assert.equal(await getLastProjectId(), null, 'projet supprimé : repli, pas d\'erreur');
  await setLastProjectId(null);
  assert.equal(await getLastProjectId(), null);
  t.raw.exec("UPDATE meta SET value = 'abc' WHERE key = 'ui_last_project'");
  assert.equal(await getLastProjectId(), null, 'valeur illisible ignorée');
  t.close();
});

// ------------------------------------------------------------------ intégrité

test('intégrité : détails manquants, détails d\'un autre type, niveau invalide', async () => {
  const t = await migratedDb();
  const p = await createProject('Projet');
  const s = await createStakeholder({ projectId: p, title: 'PP' });
  const need = await createItem({ projectId: p, kind: 'need', title: 'Besoin' });
  assert.deepEqual(await checkModelIntegrity(), []);

  t.raw.exec(`UPDATE stakeholder_details SET influence = 'énorme' WHERE item_id = ${s.id}`);
  assert.deepEqual((await checkModelIntegrity()).map((i) => i.problem), ['stakeholder-invalid-level']);
  t.raw.exec(`UPDATE stakeholder_details SET influence = 'low' WHERE item_id = ${s.id}`);

  t.raw.exec(`INSERT INTO stakeholder_details (item_id) VALUES (${need.id})`);
  assert.deepEqual((await checkModelIntegrity()).map((i) => i.problem), ['stakeholder-details-wrong-kind']);
  t.raw.exec(`DELETE FROM stakeholder_details WHERE item_id = ${need.id}`);

  t.raw.exec(`DELETE FROM stakeholder_details WHERE item_id = ${s.id}`);
  assert.deepEqual((await checkModelIntegrity()).map((i) => i.problem), ['stakeholder-details-missing']);
  t.close();
});

// ------------------------------------------------------------------ sauvegarde et restauration

test('sauvegarde et restauration : parties prenantes et détails reviennent exactement', async () => {
  const t = await migratedDb();
  const p = await createProject('Projet');
  await createStakeholder({ projectId: p, title: 'PP', organisation: 'Org', influence: 'high' });
  const { created } = await createBackup('manual');
  const saved = snapshot(t.raw);
  await updateStakeholder(1, { fields: { organisation: 'Changée' } });
  await createStakeholder({ projectId: p, title: 'Ajoutée après' });
  await restoreBackup(created.file);
  const back = snapshot(t.raw);
  for (const table of ['items', 'stakeholder_details', 'sequences', 'projects']) assert.deepEqual(back[table], saved[table], `la table ${table} revient telle qu'elle était`);
  assert.deepEqual(await checkModelIntegrity(), []);
  assert.equal((await createStakeholder({ projectId: p, title: 'Après restauration' })).code, 'PP-002');
  t.close();
});

test('schéma livré : version 3, et le jeu de test couvre la nouvelle table', async () => {
  assert.equal(SCHEMA_VERSION, 3);
  assert.equal(migrations[2].name, 'stakeholders_and_updates');
  const t = await migratedDb();
  seedAllTables(t.raw);
  assert.equal(snapshot(t.raw).stakeholder_details.count, 1);
  t.close();
});
