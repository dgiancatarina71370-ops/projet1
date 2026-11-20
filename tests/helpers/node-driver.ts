// Pilote de test : même contrat que le pilote Tauri, sur node:sqlite (SQLite réel, comme dans l'application).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type { BackupKind, BackupResult, DbDriver, Row, SqlValue, Statement, WriteResult } from '../../src/data/driver.ts';

export interface TestDb {
  driver: DbDriver;
  raw: DatabaseSync;
  file: string;
  dir: string;
  backups: Array<{ kind: BackupKind; file: string }>;
  close: () => void;
}

export function openTestDb(dir: string, name = 'ba-mentor.db'): TestDb {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
  const backups: TestDb['backups'] = [];

  const num = (v: unknown): number => Number(v);

  const driver: DbDriver = {
    async select(sql: string, params: SqlValue[]): Promise<Row[]> {
      return raw.prepare(sql).all(...params).map((r) => ({ ...r })) as Row[];
    },
    async execute(sql: string, params: SqlValue[]): Promise<WriteResult> {
      const r = raw.prepare(sql).run(...params);
      return { changes: num(r.changes), lastInsertRowid: num(r.lastInsertRowid) };
    },
    async transaction(statements: Statement[]): Promise<WriteResult[]> {
      const out: WriteResult[] = [];
      raw.exec('BEGIN');
      try {
        for (const s of statements) {
          const r = raw.prepare(s.sql).run(...(s.params ?? []));
          out.push({ changes: num(r.changes), lastInsertRowid: num(r.lastInsertRowid) });
        }
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
      return out;
    },
    async backup(kind: BackupKind): Promise<BackupResult> {
      const bdir = path.join(dir, 'backups');
      fs.mkdirSync(bdir, { recursive: true });
      const target = path.join(bdir, `ba-mentor-${backups.length + 1}-${kind}.db`);
      // Copie cohérente : VACUUM INTO produit un fichier SQLite complet, comme l'API de sauvegarde en ligne de l'application.
      raw.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
      backups.push({ kind, file: target });
      return { file: target, sizeBytes: fs.statSync(target).size };
    },
  };

  return { driver, raw, file, dir, backups, close: () => raw.close() };
}
