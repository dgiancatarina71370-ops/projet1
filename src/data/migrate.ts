// Exécuteur de migrations (exigence E8).
// Chaque migration s'applique dans UNE transaction avec la mise à jour du numéro de schéma : en cas d'échec, la base est inchangée.
import type { BackupKind, BackupResult, Statement } from './driver.ts';
import { rawSelect, rawTransaction, rawBackup } from './internal.ts';

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export class SchemaTooNewError extends Error {
  found: number;
  supported: number;
  constructor(found: number, supported: number) {
    super(`La base est au schéma ${found}, plus récent que celui de cette application (${supported}). Utilisez une version plus récente de BA-Mentor.`);
    this.name = 'SchemaTooNewError';
    this.found = found;
    this.supported = supported;
  }
}

export class MigrationFailedError extends Error {
  version: number;
  constructor(version: number, cause: unknown) {
    super(`Échec de la migration ${version} (base laissée inchangée) : ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'MigrationFailedError';
    this.version = version;
  }
}

export interface MigrationReport {
  from: number;
  to: number;
  applied: number[];
  backup: BackupResult | null;
}

export type BackupFn = (kind: BackupKind) => Promise<BackupResult>;

export function validateMigrations(migrations: Migration[]): void {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`Liste de migrations invalide : attendu la version ${i + 1} en position ${i + 1}, trouvé ${m.version}.`);
    }
    if (m.statements.length === 0) throw new Error(`La migration ${m.version} est vide.`);
  });
}

export async function getSchemaVersion(): Promise<number> {
  const t = await rawSelect("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'");
  if (t.length === 0) return 0;
  const r = await rawSelect("SELECT value FROM meta WHERE key = 'schema_version'");
  if (r.length === 0) return 0;
  const n = Number(r[0].value);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export async function migrate(
  migrations: Migration[],
  options: { backup?: BackupFn; now?: () => string } = {},
): Promise<MigrationReport> {
  validateMigrations(migrations);
  const target = migrations.length;
  const from = await getSchemaVersion();
  if (from > target) throw new SchemaTooNewError(from, target);
  if (from === target) return { from, to: target, applied: [], backup: null };

  // Sauvegarde avant toute migration d'une base existante. Une base vierge (version 0) n'a rien à protéger.
  let backup: BackupResult | null = null;
  if (from > 0) backup = await (options.backup ?? rawBackup)('pre-migration');

  const now = options.now ?? (() => new Date().toISOString());
  const applied: number[] = [];
  for (const m of migrations.slice(from)) {
    const statements: Statement[] = m.statements.map((sql) => ({ sql, params: [] }));
    const marker: Statement = {
      sql: "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      params: [String(m.version)],
    };
    const stamp: Statement = {
      sql: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      params: [`migrated_${m.version}_at`, now()],
    };
    try {
      await rawTransaction([...statements, marker, stamp]);
    } catch (e) {
      throw new MigrationFailedError(m.version, e);
    }
    applied.push(m.version);
  }
  return { from, to: target, applied, backup };
}
