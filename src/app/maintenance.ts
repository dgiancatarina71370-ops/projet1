// Sauvegardes automatiques et fermeture propre (spécification, section 9) : au lancement, toutes les 30 minutes, à la fermeture.
// L'application n'est pas un service : rien ne se déclenche application fermée.
import { autoBackupIfNeeded } from '../data/backup-service.ts';
import type { AutoTrigger } from '../data/backup-policy.ts';
import { PERIODIC_INTERVAL_MS } from '../data/backup-policy.ts';
import { exitApp, onCloseRequested } from '../data/tauri-driver.ts';

export interface Notice {
  level: 'info' | 'warning' | 'error';
  text: string;
}

let databaseReady = false;
let started = false;

export function setDatabaseReady(ready: boolean): void {
  databaseReady = ready;
}

async function runAuto(trigger: AutoTrigger, report: (n: Notice) => void): Promise<void> {
  try {
    const r = await autoBackupIfNeeded(trigger);
    if (!r.ran || !r.outcome) return;
    report({ level: 'info', text: `Sauvegarde automatique effectuée (${r.reason}).` });
    for (const w of r.outcome.warnings) report({ level: 'warning', text: w });
  } catch (e) {
    report({ level: 'error', text: `Sauvegarde automatique impossible : ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** Lancement + minuterie de 30 minutes. N'agit qu'une fois, même si le composant est monté deux fois (mode strict de React). */
export function startMaintenance(report: (n: Notice) => void): void {
  if (started) return;
  started = true;
  void runAuto('launch', report);
  setInterval(() => {
    if (databaseReady) void runAuto('periodic', report);
  }, PERIODIC_INTERVAL_MS);
}

/**
 * Fermeture : le noyau suspend la fermeture de la fenêtre et prévient l'interface ; on sauvegarde si des données ont changé, puis on quitte.
 * Si l'interface ne répond pas en 15 s, le noyau ferme quand même.
 */
export function installCloseHandler(): () => void {
  return onCloseRequested(() => {
    void (async () => {
      try {
        if (databaseReady) await autoBackupIfNeeded('close');
      } catch {
        // Une sauvegarde de fermeture ratée ne doit jamais empêcher de quitter.
      } finally {
        try {
          await exitApp();
        } catch {
          // Hors application (navigateur) : rien à quitter.
        }
      }
    })();
  });
}
