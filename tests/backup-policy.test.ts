// Politique de sauvegarde : conservation par type et déclenchements automatiques (fonctions pures).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BackupEntry, BackupKind } from '../src/data/driver.ts';
import { decideAutoBackup, lastBackupMs, LAUNCH_MAX_AGE_MS, newestFirst, planRotation, RETENTION, stampToMs } from '../src/data/backup-policy.ts';

const entry = (kind: BackupKind, stamp: string, seq = 1): BackupEntry => ({
  file: `/b/ba-mentor-${stamp}-${kind}${seq > 1 ? `-${seq}` : ''}.db`,
  name: `ba-mentor-${stamp}-${kind}${seq > 1 ? `-${seq}` : ''}.db`,
  kind,
  stamp,
  seq,
  sizeBytes: 1,
  schemaVersion: 1,
});
const stampOf = (i: number) => `20261120-10${String(Math.floor(i / 60)).padStart(2, '0')}${String(i % 60).padStart(2, '0')}`;

test('conservation : manuelle illimitée, auto 10, pre-migration 5, pre-restore 5', () => {
  assert.deepEqual(RETENTION, { manual: null, auto: 10, 'pre-migration': 5, 'pre-restore': 5 });
});

test('rotation : supprime les plus anciennes de chaque type, jamais une sauvegarde manuelle', () => {
  const entries: BackupEntry[] = [];
  for (let i = 0; i < 12; i++) entries.push(entry('auto', stampOf(i)));
  for (let i = 0; i < 30; i++) entries.push(entry('manual', stampOf(i)));
  for (let i = 0; i < 7; i++) entries.push(entry('pre-restore', stampOf(i)));
  for (let i = 0; i < 5; i++) entries.push(entry('pre-migration', stampOf(i)));
  const doomed = planRotation(entries);
  assert.equal(doomed.filter((e) => e.kind === 'manual').length, 0);
  assert.equal(doomed.filter((e) => e.kind === 'pre-migration').length, 0);
  assert.deepEqual(doomed.filter((e) => e.kind === 'auto').map((e) => e.stamp).sort(), [stampOf(0), stampOf(1)]);
  assert.deepEqual(doomed.filter((e) => e.kind === 'pre-restore').map((e) => e.stamp).sort(), [stampOf(0), stampOf(1)]);
});

test('rotation : à la seconde près, le numéro de collision départage le plus récent', () => {
  const entries = [entry('pre-restore', stampOf(5), 1), entry('pre-restore', stampOf(5), 2), entry('pre-restore', stampOf(5), 3), ...[1, 2, 3, 4].map((i) => entry('pre-restore', stampOf(i)))];
  // 7 fichiers, 5 conservés : partent les deux plus anciens.
  assert.deepEqual(planRotation(entries).map((e) => e.stamp).sort(), [stampOf(1), stampOf(2)]);
  assert.deepEqual([entry('auto', stampOf(5), 1), entry('auto', stampOf(5), 3), entry('auto', stampOf(5), 2)].sort(newestFirst).map((e) => e.seq), [3, 2, 1]);
});

test('rotation : moins de fichiers que la limite = rien à supprimer', () => {
  assert.deepEqual(planRotation([entry('auto', stampOf(1)), entry('auto', stampOf(2))]), []);
  assert.deepEqual(planRotation([]), []);
});

test('dates : conversion du nom de fichier, formats invalides rejetés', () => {
  assert.equal(stampToMs('20261120-143000'), Date.UTC(2026, 10, 20, 14, 30, 0));
  assert.ok(Number.isNaN(stampToMs('2026-11-20')));
  assert.equal(lastBackupMs([]), null);
  // Seules les sauvegardes manuelles et automatiques comptent comme « dernière sauvegarde ».
  assert.equal(lastBackupMs([entry('pre-restore', '20261120-230000'), entry('auto', '20261120-100000'), entry('manual', '20261119-100000')]), stampToMs('20261120-100000'));
  assert.equal(lastBackupMs([entry('pre-migration', '20261120-230000')]), null);
});

test('lancement : sauvegarde si aucune ou si la dernière a plus de 24 h', () => {
  const now = Date.UTC(2026, 10, 20, 12, 0, 0);
  const base = { trigger: 'launch' as const, nowMs: now, currentActivityId: 5, lastBackupActivityId: 5 };
  assert.equal(decideAutoBackup({ ...base, lastBackupMs: null }).run, true);
  assert.equal(decideAutoBackup({ ...base, lastBackupMs: now - LAUNCH_MAX_AGE_MS - 1000 }).run, true);
  assert.equal(decideAutoBackup({ ...base, lastBackupMs: now - LAUNCH_MAX_AGE_MS + 1000 }).run, false);
  assert.equal(decideAutoBackup({ ...base, lastBackupMs: now - 60_000 }).run, false);
});

test('fermeture et périodique : seulement si le journal d\'activité a avancé', () => {
  for (const trigger of ['close', 'periodic'] as const) {
    const base = { trigger, nowMs: 0, lastBackupMs: 0 };
    assert.equal(decideAutoBackup({ ...base, currentActivityId: 8, lastBackupActivityId: 8 }).run, false);
    assert.equal(decideAutoBackup({ ...base, currentActivityId: 9, lastBackupActivityId: 8 }).run, true);
  }
});
