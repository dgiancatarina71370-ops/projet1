// Politique de sauvegarde (fonctions pures, testées sans moteur) : quoi conserver, et quand sauvegarder automatiquement.
// Le noyau exécute les primitives ; les décisions sont prises ici (spécification, section 9).
import type { BackupEntry, BackupKind } from './driver.ts';

/** Nombre de sauvegardes conservées par type ; null = jamais supprimées automatiquement. */
export const RETENTION: Record<BackupKind, number | null> = {
  manual: null,
  auto: 10,
  'pre-migration': 5,
  'pre-restore': 5,
};

export const LAUNCH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const PERIODIC_INTERVAL_MS = 30 * 60 * 1000;

/** Plus récent d'abord : par date du nom de fichier, puis par numéro de collision. */
export function newestFirst(a: BackupEntry, b: BackupEntry): number {
  if (a.stamp !== b.stamp) return a.stamp < b.stamp ? 1 : -1;
  return b.seq - a.seq;
}

/** Sauvegardes à supprimer pour respecter la conservation de chaque type. Ne supprime jamais une sauvegarde manuelle. */
export function planRotation(entries: BackupEntry[]): BackupEntry[] {
  const doomed: BackupEntry[] = [];
  for (const kind of Object.keys(RETENTION) as BackupKind[]) {
    const keep = RETENTION[kind];
    if (keep === null) continue;
    const ofKind = entries.filter((e) => e.kind === kind).sort(newestFirst);
    doomed.push(...ofKind.slice(keep));
  }
  return doomed;
}

/** AAAAMMJJ-HHMMSS (UTC) → millisecondes Unix ; NaN si le format est inattendu. */
export function stampToMs(stamp: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(stamp);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

/** Date de la dernière sauvegarde « utile » (manuelle ou automatique), ou null. Les sauvegardes de sécurité (pre-*) ne comptent pas. */
export function lastBackupMs(entries: BackupEntry[]): number | null {
  const times = entries.filter((e) => e.kind === 'manual' || e.kind === 'auto').map((e) => stampToMs(e.stamp)).filter((n) => Number.isFinite(n));
  return times.length === 0 ? null : Math.max(...times);
}

export type AutoTrigger = 'launch' | 'close' | 'periodic';

export interface AutoInput {
  trigger: AutoTrigger;
  nowMs: number;
  lastBackupMs: number | null;
  /** Plus grand identifiant du journal d'activité aujourd'hui. */
  currentActivityId: number;
  /** Plus grand identifiant du journal au moment de la dernière sauvegarde. */
  lastBackupActivityId: number;
}

export interface AutoDecision {
  run: boolean;
  reason: string;
}

/**
 * Au lancement : si aucune sauvegarde ou si la dernière date de plus de 24 h.
 * À la fermeture et toutes les 30 minutes : seulement si des données ont changé depuis la dernière sauvegarde,
 * ce que révèle le journal d'activité (invariant E10 : toute écriture utilisateur y laisse une ligne).
 */
export function decideAutoBackup(i: AutoInput): AutoDecision {
  if (i.trigger === 'launch') {
    if (i.lastBackupMs === null) return { run: true, reason: 'aucune sauvegarde existante' };
    if (i.nowMs - i.lastBackupMs > LAUNCH_MAX_AGE_MS) return { run: true, reason: 'dernière sauvegarde de plus de 24 heures' };
    return { run: false, reason: 'sauvegarde récente' };
  }
  if (i.currentActivityId !== i.lastBackupActivityId) return { run: true, reason: 'données modifiées depuis la dernière sauvegarde' };
  return { run: false, reason: 'aucune modification depuis la dernière sauvegarde' };
}
