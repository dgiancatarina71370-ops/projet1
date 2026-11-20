// Accès brut au moteur. RÉSERVÉ à src/data/ : migrate.ts et mutate.ts.
// Les modules et les dépôts n'importent jamais ce fichier (règle vérifiée par scripts/check-architecture.mjs).
import type { DbDriver, Row, SqlValue, Statement, WriteResult, BackupKind, BackupResult } from './driver.ts';
import { assertAllowed, assertReadOnly } from './sql-guard.ts';

let driver: DbDriver | null = null;

export function setDriver(d: DbDriver | null): void {
  driver = d;
}

function current(): DbDriver {
  if (!driver) throw new Error('Base de données non initialisée.');
  return driver;
}

export async function rawSelect(sql: string, params: SqlValue[] = []): Promise<Row[]> {
  assertReadOnly(sql);
  return current().select(sql, params);
}

export async function rawExecute(sql: string, params: SqlValue[] = []): Promise<WriteResult> {
  assertAllowed(sql);
  return current().execute(sql, params);
}

export async function rawTransaction(statements: Statement[]): Promise<WriteResult[]> {
  for (const s of statements) assertAllowed(s.sql);
  return current().transaction(statements);
}

export async function rawBackup(kind: BackupKind): Promise<BackupResult> {
  return current().backup(kind);
}

/** Pilote complet, pour le service de sauvegarde (opérations sur fichiers). Réservé à src/data/ comme le reste de ce fichier. */
export function rawDriver(): DbDriver {
  return current();
}
