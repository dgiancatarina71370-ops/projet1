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

export interface BackupEntry {
  file: string;
  name: string;
  kind: BackupKind;
  /** AAAAMMJJ-HHMMSS en UTC, tiré du nom du fichier. */
  stamp: string;
  /** 1 pour le premier fichier d'une seconde donnée, 2 et plus en cas de collision de nom. */
  seq: number;
  sizeBytes: number;
  schemaVersion: number | null;
}

export interface SecondaryResult {
  ok: boolean;
  file: string | null;
  error: string | null;
}

export interface BackupCreated extends BackupResult {
  sha256: string;
  /** null si aucun dossier secondaire n'était demandé. */
  secondary: SecondaryResult | null;
}

export interface VerifyReport {
  ok: boolean;
  message: string;
  sha256: string;
  schemaVersion: number | null;
  sizeBytes: number;
}

export interface DbDriver {
  select(sql: string, params: SqlValue[]): Promise<Row[]>;
  execute(sql: string, params: SqlValue[]): Promise<WriteResult>;
  /** Toutes les instructions dans une seule transaction : tout est validé ou rien. */
  transaction(statements: Statement[]): Promise<WriteResult[]>;
  /** Sauvegarde simple (utilisée par les migrations). */
  backup(kind: BackupKind): Promise<BackupResult>;
  /** Sauvegarde vérifiée avec empreinte, et copie facultative dans un dossier secondaire. */
  backupCreate(kind: BackupKind, secondaryDir: string | null): Promise<BackupCreated>;
  /** Sauvegardes d'un dossier : celui de l'application (null) ou le dossier secondaire. Le dossier est la source de vérité. */
  backupList(dir: string | null): Promise<BackupEntry[]>;
  backupVerify(file: string): Promise<VerifyReport>;
  /** Remplace la base par `file`. `rollbackFile` : copie pre-restore pour le retour arrière en cas d'échec. */
  backupRestore(file: string, rollbackFile: string | null): Promise<void>;
  backupDelete(file: string, secondaryDir: string | null): Promise<void>;
  /** Boîtes de dialogue système ; null si l'utilisateur annule. */
  pickDatabaseFile(): Promise<string | null>;
  pickFolder(): Promise<string | null>;
}
