// Démarrage de la couche de données : branche le pilote Tauri, vérifie la base, applique les migrations.
import { appInfo, isTauri, tauriDriver } from '../data/tauri-driver.ts';
import type { AppInfo } from '../data/tauri-driver.ts';
import { setDriver } from '../data/internal.ts';
import { migrate } from '../data/migrate.ts';
import type { MigrationReport } from '../data/migrate.ts';
import { migrations } from '../data/migrations/index.ts';

export type BootResult =
  | { status: 'browser' }
  | { status: 'error'; message: string; info?: AppInfo }
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
    if (info.dbError) return { status: 'error', message: info.dbError, info };
    setDriver(tauriDriver);
    const report = await migrate(migrations);
    return { status: 'ready', info, report };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e), info };
  }
}
