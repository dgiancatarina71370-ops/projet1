// Seul fichier de l'application qui parle aux commandes Tauri (règle vérifiée par scripts/check-architecture.mjs).
import type { BackupCreated, BackupEntry, BackupKind, BackupResult, DbDriver, Row, SqlValue, Statement, VerifyReport, WriteResult } from './driver.ts';

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
  /** Renseigné si la protection contre l'ouverture multiple n'a pas pu être posée. */
  lockWarning?: string | null;
  /** Un autre BA-Mentor tient déjà ces données : cette fenêtre ne peut rien modifier. */
  lockedOut?: boolean;
  backupsDir?: string;
}

export function appInfo(): Promise<AppInfo> {
  return invoke<AppInfo>('app_info');
}

export const tauriDriver: DbDriver = {
  select: (sql: string, params: SqlValue[]) => invoke<Row[]>('db_select', { sql, params }),
  execute: (sql: string, params: SqlValue[]) => invoke<WriteResult>('db_execute', { sql, params }),
  transaction: (statements: Statement[]) =>
    invoke<WriteResult[]>('db_transaction', { statements: statements.map((s) => ({ sql: s.sql, params: s.params ?? [] })) }),
  backup: (kind: BackupKind) => invoke<BackupResult>('backup_create', { kind, secondaryDir: null }),
  backupCreate: (kind: BackupKind, secondaryDir: string | null) => invoke<BackupCreated>('backup_create', { kind, secondaryDir }),
  backupList: (dir: string | null) => invoke<BackupEntry[]>('backup_list', { dir }),
  backupVerify: (file: string) => invoke<VerifyReport>('backup_verify', { file }),
  backupRestore: (file: string, rollbackFile: string | null) => invoke<void>('backup_restore', { file, rollbackFile }),
  backupDelete: (file: string, secondaryDir: string | null) => invoke<void>('backup_delete', { file, secondaryDir }),
  pickDatabaseFile: () => invoke<string | null>('pick_database_file'),
  pickFolder: () => invoke<string | null>('pick_folder'),
};

/** Demande de fermeture de la fenêtre : le noyau la suspend et attend que l'interface appelle exitApp() (15 s au plus). */
export function onCloseRequested(handler: () => void): () => void {
  window.addEventListener('bamentor-close', handler);
  return () => window.removeEventListener('bamentor-close', handler);
}

export function exitApp(): Promise<void> {
  return invoke<void>('app_exit');
}
