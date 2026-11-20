import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openTestDb } from './node-driver.ts';
import type { TestDb } from './node-driver.ts';
import { setDriver } from '../../src/data/internal.ts';
import { migrate } from '../../src/data/migrate.ts';
import { migrations } from '../../src/data/migrations/index.ts';

export function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bamentor-test-'));
}

/** Base vierge branchée sur la couche de données, sans migration. */
export function emptyDb(): TestDb {
  const t = openTestDb(tempDir());
  setDriver(t.driver);
  return t;
}

/** Base migrée jusqu'au dernier schéma. */
export async function migratedDb(): Promise<TestDb> {
  const t = emptyDb();
  await migrate(migrations, { backup: t.driver.backup });
  return t;
}
