// Service de sauvegarde et de restauration (spécification, section 9). Seul fichier, avec migrate.ts, qui orchestre les sauvegardes.
// Il décide (rotation, déclenchements, contrôles avant restauration) ; le noyau exécute les opérations sur fichiers.
import type { BackupCreated, BackupEntry, BackupKind, VerifyReport } from './driver.ts';
import { rawDriver } from './internal.ts';
import { query } from './db.ts';
import { mutate } from './mutate.ts';
import type { WriteOp } from './mutate.ts';
import { migrate, SchemaTooNewError } from './migrate.ts';
import type { Migration } from './migrate.ts';
import { migrations as defaultMigrations } from './migrations/index.ts';
import { decideAutoBackup, formatProtection, lastBackupMs, newestFirst, parseProtection, planRotation, protectionMarkFor } from './backup-policy.ts';
import type { AutoTrigger, ProtectionMark } from './backup-policy.ts';

export class BackupRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupRefusedError';
  }
}

const META_SECONDARY = 'backup_secondary_dir';
const META_LAST_ACTIVITY = 'last_backup_activity_id';
const META_PROTECTION = 'rotation_protected_until';

const upsertMeta = (key: string, value: string): WriteOp => ({
  sql: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  params: [key, value],
});

async function getMeta(key: string): Promise<string | null> {
  const rows = await query<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  return rows.length === 0 ? null : rows[0].value;
}

async function currentActivityId(): Promise<number> {
  const rows = await query<{ n: number }>('SELECT COALESCE(MAX(id), 0) AS n FROM activity_log');
  return Number(rows[0].n);
}

const logOp = (kind: BackupKind, c: BackupCreated): WriteOp => ({
  sql: 'INSERT INTO backups_log (at, kind, file, size_bytes, sha256, ok) VALUES (?, ?, ?, ?, ?, 1)',
  params: [new Date().toISOString(), kind, c.file, c.sizeBytes, c.sha256],
});

/** Dossier de sauvegarde secondaire (facultatif), gardé dans la base : aucun réglage hors du fichier de base. */
export async function getSecondaryDir(): Promise<string | null> {
  const v = await getMeta(META_SECONDARY);
  return v && v.trim() !== '' ? v : null;
}

export async function setSecondaryDir(dir: string | null): Promise<void> {
  await mutate([upsertMeta(META_SECONDARY, dir ? dir.trim() : '')]);
}

/** Repère de protection de la rotation (V2.2c), ou null si aucune sauvegarde n'est protégée. */
export async function getRotationProtection(): Promise<ProtectionMark | null> {
  return parseProtection(await getMeta(META_PROTECTION));
}

/**
 * Choix « continuer avec une base vide » : les sauvegardes présentes dans le dossier de l'application ne sont plus jamais supprimées
 * par la rotation, jusqu'à ce que l'utilisateur lève la protection (ou restaure une sauvegarde, la base restaurée ayant son propre état).
 * À appeler dès que la base est migrée, avant toute sauvegarde automatique.
 */
export async function protectExistingBackups(): Promise<ProtectionMark | null> {
  const mark = protectionMarkFor(await rawDriver().backupList(null));
  if (mark === null) return null;
  await mutate([upsertMeta(META_PROTECTION, formatProtection(mark))]);
  return mark;
}

export async function releaseBackupProtection(): Promise<void> {
  await mutate([upsertMeta(META_PROTECTION, '')]);
}

export interface BackupOutcome {
  created: BackupCreated;
  /** Fichiers supprimés par la rotation. */
  rotated: string[];
  /** Incidents non bloquants : copie secondaire impossible, suppression de rotation impossible. */
  warnings: string[];
}

/**
 * Applique la conservation par type, dans le dossier de l'application et dans le dossier secondaire.
 * Appelée seulement après une sauvegarde réussie : un échec ne supprime jamais d'ancienne sauvegarde.
 */
export async function rotateBackups(): Promise<{ rotated: string[]; warnings: string[] }> {
  const d = rawDriver();
  const secondary = await getSecondaryDir();
  const mark = await getRotationProtection();
  const rotated: string[] = [];
  const warnings: string[] = [];
  const dirs: Array<string | null> = secondary ? [null, secondary] : [null];
  for (const dir of dirs) {
    let entries: BackupEntry[];
    try {
      entries = await d.backupList(dir);
    } catch (e) {
      warnings.push(`Rotation impossible (${dir ?? 'dossier de l\'application'}) : ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const doomed of planRotation(entries, mark)) {
      try {
        await d.backupDelete(doomed.file, secondary);
        rotated.push(doomed.file);
      } catch (e) {
        warnings.push(`Suppression impossible de ${doomed.name} : ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return { rotated, warnings };
}

/**
 * Sauvegarde manuelle, automatique ou de sécurité avant import : copie vérifiée, historique, mémoire de l'état du journal, copie secondaire, rotation.
 * « pre-migration » sert aussi de sauvegarde de sécurité avant un import V1 (la base n'admet pas d'autre type sans migration).
 */
export async function createBackup(kind: 'manual' | 'auto' | 'pre-migration'): Promise<BackupOutcome> {
  const d = rawDriver();
  const secondary = await getSecondaryDir();
  const created = await d.backupCreate(kind, secondary); // lève une erreur en cas d'échec : rien n'est écrit, rien n'est supprimé
  const warnings: string[] = [];
  if (created.secondary && !created.secondary.ok) warnings.push(`Copie secondaire non effectuée : ${created.secondary.error ?? 'raison inconnue'}`);
  // Écrit APRÈS la copie : la ligne d'historique n'est donc pas dans la sauvegarde qu'elle décrit (la source de vérité reste le dossier).
  await mutate([logOp(kind, created), upsertMeta(META_LAST_ACTIVITY, String(await currentActivityId()))]);
  const r = await rotateBackups();
  return { created, rotated: r.rotated, warnings: [...warnings, ...r.warnings] };
}

/** Sauvegardes présentes dans le dossier de l'application, la plus récente d'abord. */
export async function listBackups(): Promise<BackupEntry[]> {
  return (await rawDriver().backupList(null)).sort(newestFirst);
}

export function verifyBackup(file: string): Promise<VerifyReport> {
  return rawDriver().backupVerify(file);
}

export async function deleteBackup(file: string): Promise<void> {
  await rawDriver().backupDelete(file, await getSecondaryDir());
}

export interface AutoResult {
  ran: boolean;
  reason: string;
  outcome: BackupOutcome | null;
}

/** Sauvegarde automatique si la politique l'exige (lancement, fermeture, toutes les 30 minutes). */
export async function autoBackupIfNeeded(trigger: AutoTrigger, nowMs: number = Date.now()): Promise<AutoResult> {
  const entries = await rawDriver().backupList(null);
  const decision = decideAutoBackup({
    trigger,
    nowMs,
    lastBackupMs: lastBackupMs(entries),
    currentActivityId: await currentActivityId(),
    lastBackupActivityId: Number((await getMeta(META_LAST_ACTIVITY)) ?? 0),
  });
  if (!decision.run) return { ran: false, reason: decision.reason, outcome: null };
  return { ran: true, reason: decision.reason, outcome: await createBackup('auto') };
}

export interface RestoreOptions {
  /** Migrations à appliquer après restauration (par défaut celles de l'application). */
  migrations?: Migration[];
  /** Base actuelle illisible (échec au démarrage) : la sauvegarde pre-restore est alors impossible et n'est pas exigée. */
  currentBaseUnreadable?: boolean;
  /** Base actuelle neuve (aucune migration, aucune donnée) : une copie « avant restauration » serait inutile et pourrait écarter une vraie copie par la rotation. */
  currentBaseEmpty?: boolean;
}

export interface RestoreResult {
  restoredSchema: number;
  currentSchema: number;
  migrated: boolean;
  preRestoreFile: string | null;
  warnings: string[];
}

/**
 * Restauration (section 9) : contrôle du fichier, refus d'un schéma plus récent, sauvegarde pre-restore de la base actuelle,
 * remplacement, migration éventuelle. Si une étape échoue après le remplacement, la base d'avant est rétablie.
 */
export async function restoreBackup(file: string, options: RestoreOptions = {}): Promise<RestoreResult> {
  const d = rawDriver();
  const migrations = options.migrations ?? defaultMigrations;
  const current = migrations.length;

  const report = await d.backupVerify(file);
  if (!report.ok) throw new BackupRefusedError(`Le fichier choisi est inutilisable : ${report.message}`);
  if (report.schemaVersion === null) throw new BackupRefusedError('Ce fichier n\'est pas une base BA-Mentor (numéro de schéma absent).');
  if (report.schemaVersion > current) throw new SchemaTooNewError(report.schemaVersion, current);

  let pre: BackupCreated | null = null;
  try {
    if (!options.currentBaseEmpty) pre = await d.backupCreate('pre-restore', null);
  } catch (e) {
    if (!options.currentBaseUnreadable) {
      throw new BackupRefusedError(`Restauration annulée : la sauvegarde de la base actuelle (pre-restore) a échoué. ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await d.backupRestore(file, pre?.file ?? null);

  let migrated = false;
  try {
    const report2 = await migrate(migrations);
    migrated = report2.applied.length > 0;
  } catch (e) {
    if (pre) {
      await d.backupRestore(pre.file, null);
      throw new BackupRefusedError(`La migration de la base restaurée a échoué ; la base précédente a été rétablie. ${e instanceof Error ? e.message : String(e)}`);
    }
    throw e;
  }

  const warnings: string[] = [];
  if (pre) {
    // La base restaurée ne connaît pas la sauvegarde pre-restore : on l'inscrit à l'historique.
    await mutate([logOp('pre-restore', pre)]);
  }
  const r = await rotateBackups();
  warnings.push(...r.warnings);
  return { restoredSchema: report.schemaVersion, currentSchema: current, migrated, preRestoreFile: pre?.file ?? null, warnings };
}

/** Boîte de dialogue système pour choisir une base à restaurer (null si annulée). */
export function pickDatabaseFile(): Promise<string | null> {
  return rawDriver().pickDatabaseFile();
}

/** Boîte de dialogue système pour choisir le dossier de sauvegarde secondaire (null si annulée). */
export function pickFolder(): Promise<string | null> {
  return rawDriver().pickFolder();
}
