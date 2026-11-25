// Exigence E8 : migrations atomiques, sauvegarde « pre-migration », base inchangée en cas d'échec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { emptyDb, migratedDb, tempDir } from './helpers/setup.ts';
import { openTestDb } from './helpers/node-driver.ts';
import { setDriver } from '../src/data/internal.ts';
import { migrate, getSchemaVersion, SchemaTooNewError, MigrationFailedError } from '../src/data/migrate.ts';
import type { Migration } from '../src/data/migrate.ts';
import { migrations, SCHEMA_VERSION } from '../src/data/migrations/index.ts';
import { query } from '../src/data/db.ts';
import { createProject } from '../src/data/repositories/projects.ts';

const EXPECTED_TABLES = [
  'activity_log', 'backups_log', 'contacts', 'decision_details', 'document_sends', 'documents', 'dod_items', 'flags', 'items', 'links', 'meta',
  'projects', 'pspo_progress', 'requirement_details', 'risk_details', 'sequences', 'settings', 'stakeholder_details', 'template_defaults', 'templates', 'workspace_notes',
];

const tableNames = async () =>
  (await query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((r) => r.name);

// Migration d'essai : toujours la suivante de la liste livrée, pour que ces tests survivent à l'ajout de vraies migrations.
const NEXT = SCHEMA_VERSION + 1;
const v2: Migration = {
  version: NEXT,
  name: 'test-extra',
  statements: ['CREATE TABLE extra (id INTEGER PRIMARY KEY, label TEXT NOT NULL)', "INSERT INTO extra (label) VALUES ('x')"],
};

test('base vierge : migre vers le dernier schéma et crée exactement les vingt et une tables', async () => {
  const t = await emptyDb();
  const report = await migrate(migrations, { backup: t.driver.backup });
  assert.equal(report.from, 0);
  assert.equal(report.to, SCHEMA_VERSION);
  assert.deepEqual(await tableNames(), EXPECTED_TABLES);
  assert.equal(EXPECTED_TABLES.length, 21);
  assert.equal(await getSchemaVersion(), SCHEMA_VERSION);
  assert.equal(t.backups.length, 0, 'une base vierge n\'a rien à sauvegarder');
  t.close();
});

test('la liste de migrations livrée est valide et sans trou', () => {
  migrations.forEach((m, i) => assert.equal(m.version, i + 1));
});

test('relancer ne fait rien : aucune migration, aucune sauvegarde', async () => {
  const t = await migratedDb();
  const report = await migrate(migrations, { backup: t.driver.backup });
  assert.deepEqual(report.applied, []);
  assert.equal(t.backups.length, 0);
  t.close();
});

test('une base N s\'ouvre en N+1 après une sauvegarde « pre-migration » prise AVANT toute modification', async () => {
  const t = await migratedDb();
  const projectId = await createProject('Projet existant');
  const seenAtBackup: Array<{ version: number; hasExtra: boolean }> = [];

  const report = await migrate([...migrations, v2], {
    backup: async (kind) => {
      assert.equal(kind, 'pre-migration');
      seenAtBackup.push({ version: await getSchemaVersion(), hasExtra: (await tableNames()).includes('extra') });
      return t.driver.backup(kind);
    },
  });

  assert.deepEqual(seenAtBackup, [{ version: SCHEMA_VERSION, hasExtra: false }], 'la sauvegarde précède la migration');
  assert.deepEqual(report.applied, [NEXT]);
  assert.equal(await getSchemaVersion(), NEXT);
  assert.equal((await query('SELECT * FROM extra')).length, 1);
  assert.equal((await query('SELECT id FROM projects WHERE id = ?', [projectId])).length, 1, 'les données sont conservées');
  const stamp = await query('SELECT value FROM meta WHERE key = ?', [`migrated_${NEXT}_at`]);
  assert.equal(stamp.length, 1);

  // La sauvegarde est un fichier SQLite autonome au schéma d'avant, avec le projet.
  const copy = new DatabaseSync(t.backups[0].file);
  assert.equal((copy.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string }).value, String(SCHEMA_VERSION));
  assert.equal((copy.prepare('SELECT count(*) AS n FROM projects').get() as { n: number }).n, 1);
  assert.equal(copy.prepare("SELECT name FROM sqlite_master WHERE name = 'extra'").get(), undefined);
  copy.close();
  t.close();
});

test('migration en échec : base inchangée (aucune table à moitié créée, données intactes)', async () => {
  const t = await migratedDb();
  await createProject('Projet à protéger');
  const before = await tableNames();

  const broken: Migration = {
    version: NEXT,
    name: 'cassée',
    statements: ['CREATE TABLE half (id INTEGER)', 'INSERT INTO half (id) VALUES (1)', 'CECI N\'EST PAS DU SQL'],
  };
  await assert.rejects(() => migrate([...migrations, broken], { backup: t.driver.backup }), MigrationFailedError);

  assert.equal(await getSchemaVersion(), SCHEMA_VERSION, 'le numéro de schéma n\'a pas bougé');
  assert.deepEqual(await tableNames(), before, 'la table « half » n\'existe pas');
  assert.equal((await query('SELECT * FROM projects')).length, 1);
  assert.equal(t.backups.length, 1, 'la sauvegarde pre-migration a été faite avant la tentative');
  assert.equal(t.backups[0].kind, 'pre-migration');
  t.close();
});

test('base plus récente que l\'application : refusée, rien n\'est modifié ni sauvegardé', async () => {
  const t = await migratedDb();
  t.raw.exec("UPDATE meta SET value = '9' WHERE key = 'schema_version'");
  await assert.rejects(() => migrate(migrations, { backup: t.driver.backup }), SchemaTooNewError);
  assert.equal(await getSchemaVersion(), 9);
  assert.equal(t.backups.length, 0);
  t.close();
});

test('liste de migrations invalide : trou, doublon ou migration vide refusés', async () => {
  const t = await emptyDb();
  await assert.rejects(() => migrate([{ version: 2, name: 'x', statements: ['SELECT 1'] }]), /attendu la version 1/);
  await assert.rejects(() => migrate([migrations[0], migrations[0]]), /attendu la version 2/);
  await assert.rejects(() => migrate([{ version: 1, name: 'vide', statements: [] }]), /vide/);
  t.close();
});

test('la base migrée persiste sur disque : fermée puis rouverte, elle reste au bon schéma', async () => {
  const dir = tempDir();
  const a = openTestDb(dir);
  setDriver(a.driver);
  await migrate(migrations, { backup: a.driver.backup });
  await createProject('Persistant');
  a.close();

  const b = openTestDb(dir);
  setDriver(b.driver);
  assert.equal(await getSchemaVersion(), SCHEMA_VERSION);
  const report = await migrate(migrations, { backup: b.driver.backup });
  assert.deepEqual(report.applied, []);
  assert.equal((await query('SELECT name FROM projects'))[0].name, 'Persistant');
  b.close();
});

test('intégrité référentielle active : clé étrangère refusée, suppression en cascade', async () => {
  const t = await migratedDb();
  const now = new Date().toISOString();
  assert.throws(() =>
    t.raw.prepare("INSERT INTO documents (project_id, kind, name, status, created_at, updated_at) VALUES (999, 'cr', 'x', 'draft', ?, ?)").run(now, now),
  );
  const p = await createProject('P');
  t.raw.prepare("INSERT INTO documents (project_id, kind, name, status, created_at, updated_at) VALUES (?, 'cr', 'x', 'draft', ?, ?)").run(p, now, now);
  t.raw.prepare('DELETE FROM projects WHERE id = ?').run(p);
  assert.equal((await query('SELECT * FROM documents')).length, 0);
  t.close();
});
