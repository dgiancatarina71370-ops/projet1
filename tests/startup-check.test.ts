// Lot V2.2c (défaut D-A) : une base neuve alors que des sauvegardes existent n'est jamais ouverte en silence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { emptyDb, migratedDb } from './helpers/setup.ts';
import type { TestDb } from './helpers/node-driver.ts';
import { query } from '../src/data/db.ts';
import { migrate } from '../src/data/migrate.ts';
import { migrations } from '../src/data/migrations/index.ts';
import { createProject, listProjects } from '../src/data/repositories/projects.ts';
import {
  createBackup,
  getRotationProtection,
  listBackups,
  protectExistingBackups,
  releaseBackupProtection,
  restoreBackup,
} from '../src/data/backup-service.ts';
import { formatProtection, isProtected, parseProtection, planRotation, protectionMarkFor } from '../src/data/backup-policy.ts';
import type { BackupEntry } from '../src/data/driver.ts';
import { inspectStartup } from '../src/data/startup-check.ts';

const at = (i: number) => new Date(Date.UTC(2026, 10, 20, 10, 0, 0) + i * 1000);
const names = (t: TestDb) => (fs.existsSync(t.backupsDir) ? fs.readdirSync(t.backupsDir).sort() : []);

/** Simule le fichier de base vidé (0 octet) : plus aucune table, comme une base jamais migrée. Les sauvegardes restent sur le disque. */
function wipe(t: TestDb): void {
  t.raw.exec('PRAGMA foreign_keys = OFF');
  const tables = t.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
  for (const x of tables) t.raw.exec(`DROP TABLE "${x.name}"`);
  t.raw.exec('PRAGMA foreign_keys = ON');
}

async function dbWithBackups(autos: number): Promise<TestDb> {
  const t = await migratedDb();
  await createProject('Projet à retrouver');
  for (let i = 0; i < autos; i++) {
    t.setNow(at(i));
    await createBackup('auto');
  }
  return t;
}

const entry = (stamp: string, kind: BackupEntry['kind'] = 'auto', seq = 1): BackupEntry => ({ file: `${stamp}-${kind}-${seq}`, name: `${stamp}-${kind}-${seq}`, kind, stamp, seq, sizeBytes: 1, schemaVersion: 1 });

// ------------------------------------------------------------------ détection

test('V2.2c : base vidée avec des sauvegardes présentes → situation suspecte, rien n\'est migré', async () => {
  const t = await dbWithBackups(3);
  wipe(t);
  const v = await inspectStartup();
  assert.equal(v.kind, 'empty-with-backups');
  if (v.kind === 'empty-with-backups') {
    assert.equal(v.backupCount, 3);
    assert.equal(v.newestStamp, '20261120-100002');
  }
  // Le contrôle ne modifie rien : toujours aucune table.
  assert.equal((await query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).length, 0);
  t.close();
});

test('V2.2c : première utilisation (base neuve, aucune sauvegarde) → démarrage normal', async () => {
  const t = emptyDb();
  assert.deepEqual(await inspectStartup(), { kind: 'normal' });
  t.close();
});

test('V2.2c : base saine → normal, même sans aucun projet et avec des sauvegardes', async () => {
  const t = await dbWithBackups(2);
  t.raw.exec('DELETE FROM projects');
  assert.deepEqual(await inspectStartup(), { kind: 'normal' });
  t.close();
});

test('V2.2c : un fichier présent sous un nom de sauvegarde mais illisible ne compte pas', async () => {
  const t = emptyDb();
  fs.mkdirSync(t.backupsDir, { recursive: true });
  fs.writeFileSync(path.join(t.backupsDir, 'ba-mentor-20260101-000000-manual.db'), 'ceci n\'est pas une base');
  assert.deepEqual(await inspectStartup(), { kind: 'normal' });
  t.close();
});

// ------------------------------------------------------------------ restauration depuis l'état « base vide »

test('V2.2c : restaurer depuis une base vide ramène les données et ne crée pas de copie « avant restauration » inutile', async () => {
  const t = await dbWithBackups(2);
  wipe(t);
  const before = names(t);
  const newest = (await listBackups())[0];
  const r = await restoreBackup(newest.file, { currentBaseUnreadable: true, currentBaseEmpty: true });
  assert.equal(r.preRestoreFile, null);
  assert.deepEqual(names(t), before, 'aucun fichier ajouté ni supprimé');
  assert.deepEqual((await listProjects()).map((p) => p.name), ['Projet à retrouver']);
  assert.deepEqual(await inspectStartup(), { kind: 'normal' });
  t.close();
});

test('V2.2c : hors état « base vide », la restauration crée toujours sa copie de sécurité', async () => {
  const t = await dbWithBackups(1);
  const r = await restoreBackup((await listBackups())[0].file);
  assert.ok(r.preRestoreFile);
  t.close();
});

// ------------------------------------------------------------------ « Continuer avec une base vide » et protection

test('V2.2c : continuer avec une base vide protège les sauvegardes existantes, même après de nombreuses sauvegardes automatiques', async () => {
  const t = await dbWithBackups(3);
  const old = names(t);
  assert.equal(old.length, 3);
  wipe(t);
  assert.equal((await inspectStartup()).kind, 'empty-with-backups');

  // Choix de l'utilisateur : migration à neuf, puis protection, avant toute sauvegarde automatique.
  await migrate(migrations, { backup: t.driver.backup });
  const mark = await protectExistingBackups();
  assert.deepEqual(mark, { stamp: '20261120-100002', seq: 1 });
  assert.deepEqual(await getRotationProtection(), mark);

  // Travail sur la base neuve : 12 sauvegardes automatiques, plus que la conservation (10).
  for (let i = 10; i < 22; i++) {
    t.setNow(at(i));
    await createBackup('auto');
  }
  const after = names(t);
  for (const n of old) assert.ok(after.includes(n), `la sauvegarde protégée ${n} existe toujours`);
  assert.equal(after.length, 3 + 10, 'les 10 plus récentes automatiques + les 3 protégées');

  // Levée de la protection : la rotation reprend normalement.
  await releaseBackupProtection();
  assert.equal(await getRotationProtection(), null);
  t.setNow(at(30));
  await createBackup('auto');
  const final = names(t);
  assert.equal(final.length, 10);
  for (const n of old) assert.ok(!final.includes(n));
  t.close();
});

test('V2.2c : sans protection (état normal), la rotation supprime toujours au-delà de 10 automatiques (comportement inchangé)', async () => {
  const t = await dbWithBackups(12);
  assert.equal(names(t).length, 10);
  assert.equal(await getRotationProtection(), null);
  t.close();
});

test('V2.2c : restaurer une sauvegarde après « Continuer » : la base restaurée a son propre état, la protection n\'y figure pas', async () => {
  const t = await dbWithBackups(2);
  wipe(t);
  await migrate(migrations, { backup: t.driver.backup });
  await protectExistingBackups();
  assert.ok(await getRotationProtection());
  await restoreBackup((await listBackups())[0].file);
  assert.equal(await getRotationProtection(), null);
  assert.deepEqual((await listProjects()).map((p) => p.name), ['Projet à retrouver']);
  t.close();
});

// ------------------------------------------------------------------ règles pures

test('V2.2c : repère de protection (format, comparaison, rotation)', () => {
  assert.equal(formatProtection({ stamp: '20261120-100002', seq: 2 }), '20261120-100002|2');
  assert.deepEqual(parseProtection('20261120-100002|2'), { stamp: '20261120-100002', seq: 2 });
  for (const bad of [null, undefined, '', '  ', 'n\'importe quoi', '20261120-100002', '2026|1']) assert.equal(parseProtection(bad), null);

  const mark = { stamp: '20261120-100002', seq: 2 };
  assert.equal(isProtected(entry('20261120-100001'), mark), true);
  assert.equal(isProtected(entry('20261120-100002', 'auto', 1), mark), true);
  assert.equal(isProtected(entry('20261120-100002', 'auto', 2), mark), true);
  assert.equal(isProtected(entry('20261120-100002', 'auto', 3), mark), false);
  assert.equal(isProtected(entry('20261120-100003'), mark), false);
  assert.equal(isProtected(entry('20200101-000000'), null), false);

  assert.equal(protectionMarkFor([]), null);
  assert.deepEqual(protectionMarkFor([entry('20261120-100001'), entry('20261120-100005', 'manual', 2), entry('20261120-100005', 'manual', 1)]), { stamp: '20261120-100005', seq: 2 });

  // 12 automatiques dont 5 protégées : les protégées ne comptent pas et ne sont jamais supprimées.
  const all = Array.from({ length: 12 }, (_, i) => entry(`20261120-1000${String(i).padStart(2, '0')}`));
  const doomed = planRotation(all, { stamp: '20261120-100004', seq: 1 });
  assert.equal(doomed.length, 0, '7 non protégées ≤ 10 : rien à supprimer');
  const noMark = planRotation(all);
  assert.deepEqual(noMark.map((e) => e.stamp).sort(), ['20261120-100000', '20261120-100001']);
});
