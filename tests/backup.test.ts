// Exigence E4 : une sauvegarde contient TOUTES les données, et une base restaurée est identique à l'originale.
// Plus : journal des sauvegardes, rotation, déclenchements automatiques, restauration et ses refus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { emptyDb, migratedDb, tempDir } from './helpers/setup.ts';
import { seedAllTables, snapshot, snapshotFile, uncoveredTables, FIXTURES } from './helpers/seed.ts';
import type { TestDb } from './helpers/node-driver.ts';
import { setDriver } from '../src/data/internal.ts';
import { query } from '../src/data/db.ts';
import { migrate, SchemaTooNewError } from '../src/data/migrate.ts';
import type { Migration } from '../src/data/migrate.ts';
import { migrations } from '../src/data/migrations/index.ts';
import { createProject } from '../src/data/repositories/projects.ts';
import {
  autoBackupIfNeeded,
  BackupRefusedError,
  createBackup,
  deleteBackup,
  getSecondaryDir,
  listBackups,
  restoreBackup,
  rotateBackups,
  setSecondaryDir,
  verifyBackup,
} from '../src/data/backup-service.ts';
import { stampToMs } from '../src/data/backup-policy.ts';

const at = (i: number, base = Date.UTC(2026, 10, 20, 10, 0, 0)) => new Date(base + i * 1000);
const count = async (table: string) => Number((await query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))[0].n);
const names = (t: TestDb) => (fs.existsSync(t.backupsDir) ? fs.readdirSync(t.backupsDir).sort() : []);

// ---------------------------------------------------------------- E4 : couverture et identité après restauration

test('E4 backup-coverage : chaque table est sauvegardée, la restauration redonne exactement l\'état sauvegardé', async () => {
  const t = await migratedDb();
  seedAllTables(t.raw); // échoue si une table n'a pas de ligne de test
  const before = snapshot(t.raw);
  assert.deepEqual(Object.keys(before).sort(), Object.keys(FIXTURES).sort(), 'le jeu de test couvre exactement les tables du schéma');

  const { created } = await createBackup('manual');
  // 1. Le fichier de sauvegarde contient toutes les tables, à l'identique.
  assert.deepEqual(snapshotFile(created.file), before);

  // 2. On modifie tout, puis on restaure.
  t.raw.exec('DELETE FROM projects; DELETE FROM contacts; DELETE FROM settings;');
  t.raw.exec("INSERT INTO contacts (name, email) VALUES ('Bob', 'bob@example.fr')");
  const beforeRestore = snapshot(t.raw);
  assert.notDeepEqual(beforeRestore, before);

  const result = await restoreBackup(created.file);
  assert.equal(result.migrated, false);
  assert.ok(result.preRestoreFile);

  // 3. Base restaurée = base sauvegardée, table par table (nombre de lignes et somme de contrôle).
  //    Seule backups_log diffère : elle gagne la ligne de la sauvegarde pre-restore, écrite après la restauration.
  const after = snapshot(t.raw);
  for (const table of Object.keys(before)) {
    if (table === 'backups_log') continue;
    assert.deepEqual(after[table], before[table], `table ${table}`);
  }
  assert.equal(after.backups_log.count, before.backups_log.count + 1);
  const last = await query<{ kind: string }>('SELECT kind FROM backups_log ORDER BY id DESC LIMIT 1');
  assert.equal(last[0].kind, 'pre-restore');

  // 4. La sauvegarde pre-restore contient l'état d'avant la restauration (rien n'est perdu).
  assert.deepEqual(snapshotFile(result.preRestoreFile!), beforeRestore);
  t.close();
});

test('E4 : une table sans ligne de test est détectée (une future migration ne peut pas échapper aux sauvegardes)', async () => {
  const t = await migratedDb();
  t.raw.exec('CREATE TABLE future_table (a TEXT)');
  assert.deepEqual(uncoveredTables(t.raw), ['future_table']);
  assert.throws(() => seedAllTables(t.raw), /Tables sans ligne de test : future_table/);
  t.close();
});

test('E4 : la sauvegarde est cohérente même après des écritures répétées (copie complète, integrity_check)', async () => {
  const t = await migratedDb();
  for (let i = 0; i < 25; i++) await createProject(`Projet ${i}`);
  const { created } = await createBackup('manual');
  const v = await verifyBackup(created.file);
  assert.equal(v.ok, true);
  assert.equal(v.schemaVersion, 1);
  assert.equal(v.sha256, created.sha256);
  assert.equal(Number(snapshotFile(created.file).projects.count), 25);
  t.close();
});

// ---------------------------------------------------------------- journal, secondaire

test('création : historique backups_log lié au fichier, aucune ligne dans activity_log, état du journal mémorisé', async () => {
  const t = await migratedDb();
  await createProject('A');
  const activityBefore = await count('activity_log');
  const { created, warnings } = await createBackup('manual');
  assert.deepEqual(warnings, []);
  const rows = await query<{ kind: string; file: string; size_bytes: number; sha256: string; ok: number }>('SELECT kind, file, size_bytes, sha256, ok FROM backups_log');
  assert.deepEqual(rows, [{ kind: 'manual', file: created.file, size_bytes: created.sizeBytes, sha256: created.sha256, ok: 1 }]);
  assert.equal(await count('activity_log'), activityBefore, 'les tables techniques n\'écrivent pas dans le journal d\'activité');
  const mem = await query<{ value: string }>("SELECT value FROM meta WHERE key = 'last_backup_activity_id'");
  assert.equal(Number(mem[0].value), activityBefore);
  // La ligne d'historique est écrite APRÈS la copie : elle n'est pas dans la sauvegarde qu'elle décrit.
  assert.equal(snapshotFile(created.file).backups_log.count, 0);
  t.close();
});

test('dossier secondaire : copie identique, enregistré dans la base ; échec = avertissement, la sauvegarde principale reste valide', async () => {
  const t = await migratedDb();
  const secondary = path.join(tempDir(), 'copie-pc');
  assert.equal(await getSecondaryDir(), null);
  await setSecondaryDir(secondary);
  assert.equal(await getSecondaryDir(), secondary);

  const ok = await createBackup('manual');
  assert.deepEqual(ok.warnings, []);
  assert.equal(fs.readFileSync(ok.created.secondary!.file!).equals(fs.readFileSync(ok.created.file)), true);

  // Un « dossier » sous un fichier ne peut pas être créé : chemin d'un poste où la clé n'est pas la même.
  const blocker = path.join(tempDir(), 'fichier');
  fs.writeFileSync(blocker, 'x');
  await setSecondaryDir(path.join(blocker, 'sous-dossier'));
  const bad = await createBackup('manual');
  assert.equal(bad.created.secondary!.ok, false);
  assert.match(bad.warnings.join(' '), /Copie secondaire non effectuée/);
  assert.equal((await verifyBackup(bad.created.file)).ok, true);
  assert.equal(await count('backups_log'), 2 + 0, 'les deux sauvegardes principales sont dans l\'historique');

  await setSecondaryDir(null);
  assert.equal(await getSecondaryDir(), null);
  t.close();
});

// ---------------------------------------------------------------- rotation

test('rotation : auto 10, pre-restore et pre-migration 5, manuelles jamais ; les plus récentes sont gardées', async () => {
  const t = await migratedDb();
  for (let i = 0; i < 12; i++) {
    t.setNow(at(i));
    await createBackup('auto');
  }
  for (let i = 0; i < 7; i++) {
    t.setNow(at(100 + i));
    await createBackup('manual');
  }
  for (let i = 0; i < 7; i++) {
    t.setNow(at(200 + i));
    await t.driver.backupCreate('pre-restore', null);
    await t.driver.backupCreate('pre-migration', null);
  }
  const r = await rotateBackups();
  const list = await listBackups();
  const of = (k: string) => list.filter((e) => e.kind === k);
  assert.equal(of('auto').length, 10);
  assert.equal(of('manual').length, 7);
  assert.equal(of('pre-restore').length, 5);
  assert.equal(of('pre-migration').length, 5);
  assert.deepEqual(r.warnings, []);
  // Les deux plus anciennes automatiques (secondes 0 et 1) ont disparu, les autres restent.
  const autoStamps = of('auto').map((e) => stampToMs(e.stamp)).sort((a, b) => a - b);
  assert.equal(autoStamps[0], at(2).getTime());
  assert.equal(autoStamps[9], at(11).getTime());
  t.close();
});

test('rotation : appliquée aussi dans le dossier secondaire', async () => {
  const t = await migratedDb();
  const secondary = path.join(tempDir(), 'copie');
  await setSecondaryDir(secondary);
  for (let i = 0; i < 12; i++) {
    t.setNow(at(i));
    await createBackup('auto');
  }
  assert.equal(fs.readdirSync(secondary).length, 10);
  t.close();
});

test('rotation : un échec de sauvegarde ne supprime aucune ancienne sauvegarde', async () => {
  const t = await migratedDb();
  for (let i = 0; i < 10; i++) {
    t.setNow(at(i));
    await createBackup('auto');
  }
  const before = names(t);
  setDriver({ ...t.driver, backupCreate: async () => { throw new Error('disque plein'); } });
  t.setNow(at(50));
  await assert.rejects(() => createBackup('auto'), /disque plein/);
  setDriver(t.driver);
  assert.deepEqual(names(t), before);
  t.close();
});

test('suppression : seulement une sauvegarde nommée comme il faut, dans le dossier de l\'application ou le dossier secondaire', async () => {
  const t = await migratedDb();
  const { created } = await createBackup('manual');
  await assert.rejects(() => t.driver.backupDelete(t.file, null), /Seules les sauvegardes/);
  const intruder = path.join(tempDir(), 'ba-mentor-20261120-100000-manual.db');
  fs.writeFileSync(intruder, 'x');
  await assert.rejects(() => deleteBackup(intruder), /dossier de sauvegarde/);
  assert.equal(fs.existsSync(intruder), true);
  await deleteBackup(created.file);
  assert.equal(fs.existsSync(created.file), false);
  assert.equal(fs.existsSync(t.file), true, 'la base n\'a pas été touchée');
  t.close();
});

// ---------------------------------------------------------------- déclenchements automatiques

test('automatique : lancement, fermeture, périodique selon le journal d\'activité', async () => {
  const t = await migratedDb();
  const t0 = at(0).getTime();
  t.setNow(at(0));
  // Lancement sans aucune sauvegarde : sauvegarde.
  assert.equal((await autoBackupIfNeeded('launch', t0)).ran, true);
  // Lancement 1 h après : pas de nouvelle sauvegarde.
  t.setNow(at(3600));
  assert.equal((await autoBackupIfNeeded('launch', t0 + 3600_000)).ran, false);
  // Rien n'a changé : ni fermeture ni périodique ne sauvegardent.
  assert.equal((await autoBackupIfNeeded('close', t0 + 3600_000)).ran, false);
  assert.equal((await autoBackupIfNeeded('periodic', t0 + 3600_000)).ran, false);
  // Une écriture passe par mutate() et avance le journal : la fermeture sauvegarde, puis plus rien à sauvegarder.
  await createProject('Nouveau');
  const r = await autoBackupIfNeeded('close', t0 + 3700_000);
  assert.equal(r.ran, true);
  assert.equal((await autoBackupIfNeeded('periodic', t0 + 3800_000)).ran, false);
  // Lancement 25 h après la dernière sauvegarde utile : sauvegarde.
  t.setNow(at(3700 + 25 * 3600));
  assert.equal((await autoBackupIfNeeded('launch', t0 + 3700_000 + 25 * 3600_000)).ran, true);
  t.close();
});

// ---------------------------------------------------------------- restauration : refus et reprise

async function backupFileWithSchema(schema: number, hasMeta = true): Promise<string> {
  const f = path.join(tempDir(), 'ba-mentor-20261120-100000-manual.db');
  const db = new DatabaseSync(f);
  if (hasMeta) db.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('schema_version', '${schema}')`);
  else db.exec('CREATE TABLE autre (a TEXT)');
  db.close();
  return f;
}

test('restauration refusée sans toucher à la base : schéma plus récent, fichier corrompu, base étrangère', async () => {
  const t = await migratedDb();
  seedAllTables(t.raw);
  const before = snapshot(t.raw);

  const tooNew = await backupFileWithSchema(99);
  const foreign = await backupFileWithSchema(1, false);
  await assert.rejects(() => restoreBackup(tooNew), SchemaTooNewError);
  const corrupt = path.join(tempDir(), 'corrompu.db');
  fs.writeFileSync(corrupt, Buffer.alloc(5000, 7));
  await assert.rejects(() => restoreBackup(corrupt), BackupRefusedError);
  await assert.rejects(() => restoreBackup(foreign), /pas une base BA-Mentor/);
  await assert.rejects(() => restoreBackup(path.join(tempDir(), 'absent.db')));

  assert.deepEqual(snapshot(t.raw), before, 'la base est intacte');
  assert.equal(names(t).length, 0, 'aucune sauvegarde pre-restore n\'est créée pour une restauration refusée');
  t.close();
});

test('restauration depuis un fichier d\'un autre poste (hors dossier de l\'application)', async () => {
  const a = await migratedDb();
  seedAllTables(a.raw);
  const otherPc = path.join(tempDir(), 'ba-mentor-20250101-000000-manual.db');
  a.raw.exec(`VACUUM INTO '${otherPc}'`);
  a.raw.exec('DELETE FROM contacts');
  assert.equal(await count('contacts'), 0);
  await restoreBackup(otherPc);
  assert.equal(await count('contacts'), 1);
  a.close();
});

test('schéma plus ancien : accepté puis migré ; échec de migration : la base d\'avant est rétablie', async () => {
  const t = await migratedDb();
  const m2: Migration = { version: 2, name: 'extra', statements: ['CREATE TABLE extra (a TEXT)'] };
  const broken: Migration = { version: 2, name: 'cassée', statements: ['CREATE TABLE extra (a TEXT)', 'CECI N\'EST PAS DU SQL'] };

  await createProject('Dans la sauvegarde');
  const { created } = await createBackup('manual'); // schéma 1, 1 projet
  await createProject('Après la sauvegarde');
  assert.equal(await count('projects'), 2);

  // Échec : la restauration passe le schéma 1 → 2 avec une migration cassée.
  await assert.rejects(() => restoreBackup(created.file, { migrations: [...migrations, broken] }), /rétablie/);
  assert.equal(await count('projects'), 2, 'la base d\'avant (2 projets) est revenue');
  assert.equal((await query('SELECT name FROM sqlite_master WHERE name = \'extra\'')).length, 0);

  // Succès : la base restaurée est migrée jusqu'au schéma 2.
  const ok = await restoreBackup(created.file, { migrations: [...migrations, m2] });
  assert.deepEqual([ok.restoredSchema, ok.currentSchema, ok.migrated], [1, 2, true]);
  assert.equal(await count('projects'), 1);
  assert.equal((await query('SELECT name FROM sqlite_master WHERE name = \'extra\'')).length, 1);
  assert.equal(Number((await query<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'"))[0].value), 2);
  t.close();
});

test('restauration : si la sauvegarde pre-restore échoue, tout est annulé avant remplacement', async () => {
  const t = await migratedDb();
  await createProject('Avant');
  const { created } = await createBackup('manual');
  await createProject('Après');
  setDriver({
    ...t.driver,
    backupCreate: async (kind, dir) => {
      if (kind === 'pre-restore') throw new Error('disque plein');
      return t.driver.backupCreate(kind, dir);
    },
  });
  await assert.rejects(() => restoreBackup(created.file), /pre-restore/);
  setDriver(t.driver);
  assert.equal(await count('projects'), 2, 'la base n\'a pas été remplacée');
  t.close();
});

test('base actuelle illisible : la restauration est possible sans pre-restore', async () => {
  const t = await migratedDb();
  await createProject('Sauvé');
  const { created } = await createBackup('manual');
  await createProject('Perdu');
  setDriver({ ...t.driver, backupCreate: async (kind, dir) => { if (kind === 'pre-restore') throw new Error('Base indisponible.'); return t.driver.backupCreate(kind, dir); } });
  const r = await restoreBackup(created.file, { currentBaseUnreadable: true });
  setDriver(t.driver);
  assert.equal(r.preRestoreFile, null);
  assert.equal(await count('projects'), 1);
  t.close();
});

test('restauration puis migration : la base d\'une version plus ancienne reçoit sa sauvegarde pre-migration', async () => {
  const t = await migratedDb();
  const m2: Migration = { version: 2, name: 'extra', statements: ['CREATE TABLE extra (a TEXT)'] };
  const { created } = await createBackup('manual');
  await restoreBackup(created.file, { migrations: [...migrations, m2] });
  const kinds = (await listBackups()).map((e) => e.kind).sort();
  assert.deepEqual(kinds, ['manual', 'pre-migration', 'pre-restore']);
  // Base vierge : pas de pre-migration (rien à protéger) — comportement V2.1 conservé.
  const e = emptyDb();
  await migrate(migrations);
  assert.equal(e.backups.length, 0);
  e.close();
  t.close();
});
