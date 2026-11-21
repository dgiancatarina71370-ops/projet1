// Contrôle de démarrage (lot V2.2c, défaut D-A) : une base neuve alors que des sauvegardes existent n'est jamais ouverte en silence.
// Un fichier de 0 octet est une base SQLite valide : sans ce contrôle, l'application la migrerait à neuf et afficherait une liste vide.
import { rawDriver } from './internal.ts';
import { getSchemaVersion } from './migrate.ts';
import { newestFirst } from './backup-policy.ts';

export type StartupVerdict =
  | { kind: 'normal' }
  | { kind: 'empty-with-backups'; backupCount: number; newestStamp: string };

/**
 * À appeler AVANT la migration. « Neuve » = aucune migration appliquée (schéma 0).
 * Seules comptent les sauvegardes exploitables (schéma lisible, au moins 1). Une base migrée, même sans aucun projet, n'est jamais suspecte.
 */
export async function inspectStartup(): Promise<StartupVerdict> {
  if ((await getSchemaVersion()) > 0) return { kind: 'normal' };
  const usable = (await rawDriver().backupList(null)).filter((e) => e.schemaVersion !== null && e.schemaVersion >= 1).sort(newestFirst);
  if (usable.length === 0) return { kind: 'normal' };
  return { kind: 'empty-with-backups', backupCount: usable.length, newestStamp: usable[0].stamp };
}
