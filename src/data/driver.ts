// Contrat entre la couche de données et le moteur SQLite.
// Deux implémentations : tauri-driver.ts (application) et tests/helpers/node-driver.ts (tests, node:sqlite).

export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

export interface Statement {
  sql: string;
  params?: SqlValue[];
}

export interface WriteResult {
  changes: number;
  lastInsertRowid: number;
}

export type BackupKind = 'manual' | 'auto' | 'pre-migration' | 'pre-restore';

export interface BackupResult {
  file: string;
  sizeBytes: number;
}

export interface DbDriver {
  select(sql: string, params: SqlValue[]): Promise<Row[]>;
  execute(sql: string, params: SqlValue[]): Promise<WriteResult>;
  /** Toutes les instructions dans une seule transaction : tout est validé ou rien. */
  transaction(statements: Statement[]): Promise<WriteResult[]>;
  backup(kind: BackupKind): Promise<BackupResult>;
}
