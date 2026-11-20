// Exigence E10 : toute écriture passe par mutate() et laisse sa ligne de journal dans la même transaction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDb } from './helpers/setup.ts';
import { setDriver } from '../src/data/internal.ts';
import { query } from '../src/data/db.ts';
import { mutate, MAX_DETAIL_LENGTH } from '../src/data/mutate.ts';
import { SqlRefusedError } from '../src/data/sql-guard.ts';
import { createProject, deleteProject, listProjects, recentActivity } from '../src/data/repositories/projects.ts';

const count = async (table: string) => Number((await query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))[0].n);
const NOW = '2026-11-20T10:00:00.000Z';
const insertDoc = (projectId: number) => ({
  sql: "INSERT INTO documents (project_id, kind, name, status, created_at, updated_at) VALUES (?, 'cr', 'Doc', 'draft', ?, ?)",
  params: [projectId, NOW, NOW],
  activity: { objectType: 'document', action: 'created' as const, objectId: 'inserted' as const, projectId },
});

test('création d\'un projet : une ligne de données ET une ligne de journal, liées', async () => {
  const t = await migratedDb();
  const id = await createProject('Projet A');
  assert.equal((await listProjects()).length, 1);
  const log = await query('SELECT object_type, object_id, action, project_id FROM activity_log');
  assert.deepEqual(log, [{ object_type: 'project', object_id: id, action: 'created', project_id: id }]);
  t.close();
});

test('atomicité : si une écriture échoue, ni la donnée ni son journal ne subsistent', async () => {
  const t = await migratedDb();
  await assert.rejects(() =>
    mutate([
      {
        sql: 'INSERT INTO projects (kind, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
        params: ['project', 'Valide', NOW, NOW],
        activity: { objectType: 'project', action: 'created', objectId: 'inserted', projectId: 'inserted' },
      },
      {
        sql: 'INSERT INTO projects (kind, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
        params: ['invalide', 'Refusé', NOW, NOW],
        activity: { objectType: 'project', action: 'created', objectId: 'inserted', projectId: 'inserted' },
      },
    ]),
  );
  assert.equal(await count('projects'), 0);
  assert.equal(await count('activity_log'), 0);
  t.close();
});

test('lecture seule : query() refuse toute écriture directe', async () => {
  const t = await migratedDb();
  for (const sql of [
    'INSERT INTO projects (kind, name, created_at, updated_at) VALUES (\'project\', \'x\', \'a\', \'a\')',
    'DELETE FROM projects',
    "UPDATE meta SET value = '99' WHERE key = 'schema_version'",
    'CREATE TABLE pirate (a)',
    'PRAGMA foreign_keys = OFF',
  ]) await assert.rejects(() => query(sql), SqlRefusedError);
  assert.equal(await count('projects'), 0);
  t.close();
});

test('mutate refuse le DDL, la lecture, ATTACH/DETACH, PRAGMA et l\'écriture directe du journal', async () => {
  const t = await migratedDb();
  for (const sql of [
    'CREATE TABLE pirate (a)',
    'DROP TABLE projects',
    'SELECT 1',
    "ATTACH DATABASE 'pirate.db' AS p",
    'DETACH DATABASE p',
    'PRAGMA foreign_keys = OFF',
    "INSERT INTO activity_log (at, object_type, action) VALUES ('x', 'project', 'created')",
    'DELETE FROM activity_log',
  ]) await assert.rejects(() => mutate([{ sql }]), SqlRefusedError, sql);
  assert.equal(await count('activity_log'), 0);
  t.close();
});

test('aucune ligne de journal quand l\'écriture ne change rien (INSERT OR IGNORE)', async () => {
  const t = await migratedDb();
  const op = {
    sql: 'INSERT OR IGNORE INTO contacts (name, email) VALUES (?, ?)',
    params: ['Alice', 'alice@example.org'],
    activity: { objectType: 'contact', action: 'created' as const, objectId: 'inserted' as const },
  };
  await mutate([op]);
  await mutate([op]);
  assert.equal(await count('contacts'), 1);
  assert.equal(await count('activity_log'), 1, 'le doublon ignoré ne crée pas de fausse création');
  t.close();
});

test('suppression d\'un projet : chaque objet supprimé en cascade est journalisé', async () => {
  const t = await migratedDb();
  const p = await createProject('Projet');
  const f = await createProject('Dossier', 'folder', p);
  await mutate([insertDoc(p)]);
  await mutate([insertDoc(f)]);
  assert.equal(await count('documents'), 2);

  await deleteProject(p);

  assert.equal(await count('projects'), 0);
  assert.equal(await count('documents'), 0);
  const deleted = await query<{ object_type: string }>("SELECT object_type FROM activity_log WHERE action = 'deleted' ORDER BY object_type");
  assert.deepEqual(deleted.map((r) => r.object_type), ['document', 'document', 'folder', 'project']);
  t.close();
});

test('un objet de la V1 importé garde sa date d\'origine dans le journal', async () => {
  const t = await migratedDb();
  const old = '2025-03-14T09:30:00.000Z';
  await mutate([
    {
      sql: 'INSERT INTO projects (kind, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      params: ['project', 'Repris de la V1', old, old],
      activity: { objectType: 'project', action: 'imported', objectId: 'inserted', projectId: 'inserted', at: old },
    },
  ]);
  const [row] = await recentActivity(1);
  assert.equal(row.action, 'imported');
  assert.equal(row.at, old);
  t.close();
});

test('le journal ne reçoit ni titre ni contenu : détail limité', async () => {
  const t = await migratedDb();
  await assert.rejects(
    () =>
      mutate([
        {
          sql: 'INSERT INTO projects (kind, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
          params: ['project', 'x', NOW, NOW],
          activity: { objectType: 'project', action: 'created', objectId: 'inserted', detail: 'x'.repeat(MAX_DETAIL_LENGTH + 1) },
        },
      ]),
    SqlRefusedError,
  );
  assert.equal(await count('projects'), 0);
  const cols = (await query<{ name: string }>('SELECT name FROM pragma_table_info(\'activity_log\')')).map((c) => c.name);
  assert.deepEqual(cols, ['id', 'at', 'object_type', 'object_id', 'action', 'project_id', 'detail']);
  t.close();
});

test('sans pilote branché, toute lecture ou écriture est refusée proprement', async () => {
  setDriver(null);
  await assert.rejects(() => query('SELECT 1'), /non initialisée/);
  await assert.rejects(
    () => mutate([{ sql: 'DELETE FROM projects WHERE id = 1', activity: { objectType: 'project', action: 'deleted', objectId: 1 } }]),
    /non initialisée/,
  );
});

test('tables techniques : seules backups_log et meta s\'écrivent sans journal ; toute autre table exige « activity »', async () => {
  const t = await migratedDb();
  // Admis, et aucune ligne de journal.
  await mutate([{ sql: "INSERT INTO meta (key, value) VALUES ('essai', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value", params: [] }]);
  await mutate([
    {
      sql: "INSERT INTO backups_log (at, kind, file, size_bytes, sha256, ok) VALUES (?, 'manual', 'f.db', 1, 'abc', 1)",
      params: ['2026-11-20T10:00:00.000Z'],
    },
  ]);
  assert.equal(await count('activity_log'), 0);
  // Refusé : tout le reste, y compris les variantes d'écriture (REPLACE, UPDATE OR, guillemets, casse, commentaires).
  for (const sql of [
    "INSERT INTO projects (kind, name, created_at, updated_at) VALUES ('project', 'x', 'a', 'a')",
    "insert or replace into settings (key, value) values ('a', 'b')",
    "REPLACE INTO contacts (name, email) VALUES ('a', 'a@b.c')",
    "UPDATE OR IGNORE documents SET name = 'x'",
    'DELETE FROM "projects"',
    "/* meta */ DELETE FROM flags",
    "INSERT INTO `workspace_notes` (id, updated_at) VALUES (1, 'a')",
  ]) {
    await assert.rejects(() => mutate([{ sql }]), SqlRefusedError, sql);
  }
  assert.equal(await count('projects'), 0);
  // La même écriture avec « activity » reste admise, y compris sur une table technique.
  await mutate([{ sql: "UPDATE meta SET value = '2' WHERE key = 'essai'", activity: { objectType: 'meta', action: 'status_changed', objectId: 1 } }]);
  assert.equal(await count('activity_log'), 1);
  t.close();
});
