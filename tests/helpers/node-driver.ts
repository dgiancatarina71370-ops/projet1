// Pilote de test : même contrat que le pilote Tauri, sur node:sqlite (SQLite réel, comme dans l'application).
// Les opérations sur fichiers reproduisent celles du noyau Rust (src-tauri/src/backup.rs et files.rs). Le noyau a ses propres tests (cargo test).
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  BackupCreated,
  BackupEntry,
  BackupKind,
  BackupResult,
  DbDriver,
  Row,
  SqlValue,
  Statement,
  VerifyReport,
  WriteResult,
} from '../../src/data/driver.ts';

export interface TestDb {
  driver: DbDriver;
  /** Connexion courante ; change après une restauration. */
  readonly raw: DatabaseSync;
  file: string;
  dir: string;
  backupsDir: string;
  backups: Array<{ kind: BackupKind; file: string }>;
  /** Fixe l'heure utilisée pour dater les sauvegardes ; null = heure réelle. */
  setNow: (d: Date | null) => void;
  close: () => void;
}

const KINDS: BackupKind[] = ['manual', 'auto', 'pre-migration', 'pre-restore'];

function stampOf(d: Date): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function nameOf(stamp: string, kind: string, seq: number): string {
  return seq <= 1 ? `ba-mentor-${stamp}-${kind}.db` : `ba-mentor-${stamp}-${kind}-${seq}.db`;
}

function parseName(name: string): { stamp: string; kind: BackupKind; seq: number } | null {
  const m = /^ba-mentor-(\d{8}-\d{6})-(manual|auto|pre-migration|pre-restore)(?:-(\d+))?\.db$/.exec(name);
  if (!m) return null;
  const seq = m[3] === undefined ? 1 : Number(m[3]);
  if (m[3] !== undefined && seq < 2) return null;
  return { stamp: m[1], kind: m[2] as BackupKind, seq };
}

function freePath(dir: string, stamp: string, kind: string): string {
  let seq = 1;
  for (;;) {
    const p = path.join(dir, nameOf(stamp, kind, seq));
    if (!fs.existsSync(p)) return p;
    seq++;
  }
}

const sha256File = (file: string): string => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function probe(file: string): { ok: boolean; message: string; schemaVersion: number | null } {
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const row = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    if (row.integrity_check !== 'ok') return { ok: false, message: row.integrity_check, schemaVersion: null };
    let schemaVersion: number | null = null;
    try {
      const v = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
      schemaVersion = v ? Number(v.value) : null;
    } catch {
      schemaVersion = null; // base SQLite valide, mais sans table meta
    }
    return { ok: true, message: 'ok', schemaVersion };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), schemaVersion: null };
  } finally {
    try { db?.close(); } catch { /* déjà fermée */ }
  }
}

export function openTestDb(dir: string, name = 'ba-mentor.db'): TestDb {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  const backupsDir = path.join(dir, 'backups');
  const open = (): DatabaseSync => {
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
    return db;
  };
  let raw = open();
  let fixedNow: Date | null = null;
  const now = (): Date => fixedNow ?? new Date();
  const backups: TestDb['backups'] = [];
  const num = (v: unknown): number => Number(v);

  const backupCreate = async (kind: BackupKind, secondaryDir: string | null): Promise<BackupCreated> => {
    if (!KINDS.includes(kind)) throw new Error('Type de sauvegarde inconnu.');
    fs.mkdirSync(backupsDir, { recursive: true });
    const stamp = stampOf(now());
    const target = freePath(backupsDir, stamp, kind);
    // VACUUM INTO produit une copie cohérente complète, comme l'API de sauvegarde en ligne de l'application.
    raw.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    const p = probe(target);
    if (!p.ok) {
      fs.rmSync(target, { force: true });
      throw new Error(`La copie n'a pas passé la vérification d'intégrité : ${p.message}`);
    }
    const sha256 = sha256File(target);
    let secondary: BackupCreated['secondary'] = null;
    if (secondaryDir !== null && secondaryDir.trim() !== '') {
      try {
        fs.mkdirSync(secondaryDir, { recursive: true });
        const dest = freePath(secondaryDir, stamp, kind);
        fs.copyFileSync(target, dest);
        if (sha256File(dest) !== sha256) {
          fs.rmSync(dest, { force: true });
          throw new Error('La copie secondaire ne correspond pas à l\'original.');
        }
        secondary = { ok: true, file: dest, error: null };
      } catch (e) {
        secondary = { ok: false, file: null, error: `Dossier secondaire inaccessible : ${e instanceof Error ? e.message : String(e)}` };
      }
    }
    backups.push({ kind, file: target });
    return { file: target, sizeBytes: fs.statSync(target).size, sha256, secondary };
  };

  const replaceDb = (src: string): void => {
    const tmp = `${file}.restoring`;
    fs.copyFileSync(src, tmp);
    fs.renameSync(tmp, file);
  };

  const reopenChecked = (): void => {
    raw = open();
    const row = raw.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    if (row.integrity_check !== 'ok') throw new Error(`La base restaurée ne passe pas la vérification d'intégrité : ${row.integrity_check}`);
  };

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
      const c = await backupCreate(kind, null);
      return { file: c.file, sizeBytes: c.sizeBytes };
    },
    backupCreate,
    async backupList(dir: string | null): Promise<BackupEntry[]> {
      const d = dir === null ? backupsDir : dir;
      if (!fs.existsSync(d)) return [];
      const out: BackupEntry[] = [];
      for (const name of fs.readdirSync(d)) {
        const p = parseName(name);
        if (!p) continue;
        const full = path.join(d, name);
        if (!fs.statSync(full).isFile()) continue;
        out.push({ file: full, name, kind: p.kind, stamp: p.stamp, seq: p.seq, sizeBytes: fs.statSync(full).size, schemaVersion: probe(full).schemaVersion });
      }
      return out.sort((a, b) => (a.stamp === b.stamp ? a.seq - b.seq : a.stamp < b.stamp ? -1 : 1));
    },
    async backupVerify(f: string): Promise<VerifyReport> {
      const st = fs.statSync(f); // lève une erreur si le fichier est absent
      const p = probe(f);
      return { ok: p.ok, message: p.message, sha256: sha256File(f), schemaVersion: p.ok ? p.schemaVersion : null, sizeBytes: st.size };
    },
    async backupRestore(f: string, rollbackFile: string | null): Promise<void> {
      const p = probe(f);
      if (!p.ok) throw new Error(`Le fichier choisi est inutilisable : ${p.message}`);
      if (p.schemaVersion === null) throw new Error('Ce fichier n\'est pas une base BA-Mentor (numéro de schéma absent).');
      raw.close();
      for (const suffix of ['-journal', '-wal', '-shm']) fs.rmSync(`${file}${suffix}`, { force: true });
      try {
        replaceDb(f);
        reopenChecked();
      } catch (e) {
        if (rollbackFile) {
          try { raw.close(); } catch { /* déjà fermée */ }
          replaceDb(rollbackFile);
          reopenChecked();
          throw new Error(`Restauration échouée, la base précédente a été rétablie : ${e instanceof Error ? e.message : String(e)}`);
        }
        throw e;
      }
    },
    async backupDelete(f: string, secondaryDir: string | null): Promise<void> {
      if (!parseName(path.basename(f))) throw new Error('Seules les sauvegardes de BA-Mentor peuvent être supprimées.');
      const parent = fs.realpathSync(path.dirname(f));
      const allowed = [backupsDir, ...(secondaryDir ? [secondaryDir] : [])].filter((a) => fs.existsSync(a)).map((a) => fs.realpathSync(a));
      if (!allowed.includes(parent)) throw new Error('Ce fichier n\'est pas dans un dossier de sauvegarde de BA-Mentor.');
      fs.rmSync(f);
    },
    async pickDatabaseFile(): Promise<string | null> {
      return null;
    },
    async pickFolder(): Promise<string | null> {
      return null;
    },
    async pickImportFile() {
      return null;
    },
  };

  return {
    driver,
    get raw() {
      return raw;
    },
    file,
    dir,
    backupsDir,
    backups,
    setNow: (d: Date | null) => {
      fixedNow = d;
    },
    close: () => {
      try { raw.close(); } catch { /* déjà fermée */ }
    },
  };
}
