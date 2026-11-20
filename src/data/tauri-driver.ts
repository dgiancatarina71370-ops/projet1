// Seul fichier de l'application qui parle aux commandes Tauri (règle vérifiée par scripts/check-architecture.mjs).
import type { BackupKind, BackupResult, DbDriver, Row, SqlValue, Statement, WriteResult } from './driver.ts';

interface TauriGlobal {
  core: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
}

function tauri(): TauriGlobal | null {
  const g = globalThis as unknown as { __TAURI__?: TauriGlobal };
  return g.__TAURI__ ?? null;
}

export function isTauri(): boolean {
  return tauri() !== null;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const t = tauri();
  if (!t) throw new Error('Cette fonction exige l\'application BA-Mentor (Tauri).');
  return (await t.core.invoke(cmd, args)) as T;
}

export interface AppInfo {
  version: string;
  dataDir: string;
  dbFile: string;
  mode: string;
  /** Renseigné si la base n'a pas pu être ouverte au démarrage. */
  dbError?: string | null;
}

export function appInfo(): Promise<AppInfo> {
  return invoke<AppInfo>('app_info');
}

export const tauriDriver: DbDriver = {
  select: (sql: string, params: SqlValue[]) => invoke<Row[]>('db_select', { sql, params }),
  execute: (sql: string, params: SqlValue[]) => invoke<WriteResult>('db_execute', { sql, params }),
  transaction: (statements: Statement[]) =>
    invoke<WriteResult[]>('db_transaction', { statements: statements.map((s) => ({ sql: s.sql, params: s.params ?? [] })) }),
  backup: (kind: BackupKind) => invoke<BackupResult>('db_backup', { kind }),
};
