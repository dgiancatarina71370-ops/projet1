// Démarrage de la couche de données : branche le pilote Tauri, vérifie la base, applique les migrations.
import { appInfo, isTauri, tauriDriver } from '../data/tauri-driver.ts';
import type { AppInfo } from '../data/tauri-driver.ts';
import { setDriver } from '../data/internal.ts';
import { migrate } from '../data/migrate.ts';
import type { MigrationReport } from '../data/migrate.ts';
import { migrations } from '../data/migrations/index.ts';
import { inspectStartup } from '../data/startup-check.ts';
import { protectExistingBackups } from '../data/backup-service.ts';

export type BootResult =
  | { status: 'browser' }
  | { status: 'error'; message: string; info?: AppInfo }
  /** Base neuve alors que des sauvegardes existent (V2.2c) : rien n'est migré tant que l'utilisateur n'a pas choisi. */
  | { status: 'empty-db'; info: AppInfo; backupCount: number; newestStamp: string }
  | { status: 'ready'; info: AppInfo; report: MigrationReport };

let started: Promise<BootResult> | null = null;

/** Démarrage unique : appels répétés (ex. double effet du mode strict de React) = même promesse, jamais deux migrations concurrentes. */
export function boot(): Promise<BootResult> {
  started ??= doBoot();
  return started;
}

async function doBoot(): Promise<BootResult> {
  if (!isTauri()) return { status: 'browser' };
  let info: AppInfo | undefined;
  try {
    info = await appInfo();
    setDriver(tauriDriver); // avant le contrôle : lister et restaurer des sauvegardes doit rester possible si la base est illisible
    if (info.dbError) return { status: 'error', message: info.dbError, info };
    const verdict = await inspectStartup();
    if (verdict.kind === 'empty-with-backups') return { status: 'empty-db', info, backupCount: verdict.backupCount, newestStamp: verdict.newestStamp };
    const report = await migrate(migrations);
    return { status: 'ready', info, report };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e), info };
  }
}

/**
 * Choix explicite « continuer avec une base vide » : migration à neuf, puis protection des sauvegardes existantes
 * AVANT que la maintenance automatique ne démarre. Si la protection échoue, le démarrage est refusé (jamais de base neuve non protégée).
 */
export async function continueWithEmptyDatabase(info: AppInfo): Promise<BootResult> {
  try {
    const report = await migrate(migrations);
    await protectExistingBackups();
    return { status: 'ready', info, report };
  } catch (e) {
    return { status: 'error', message: `Impossible de continuer avec une base vide : ${e instanceof Error ? e.message : String(e)}`, info };
  }
}
