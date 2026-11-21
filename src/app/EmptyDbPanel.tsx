import { useState } from 'react';
import { BackupPanel } from './BackupPanel.tsx';
import { formatLocal } from '../shared/format.ts';
import { stampToMs } from '../data/backup-policy.ts';
import { plural } from '../shared/plural.ts';

/** Démarrage sur une base neuve alors que des sauvegardes existent (V2.2c) : restaurer, ou continuer en connaissance de cause. */
export function EmptyDbPanel(props: { dataDir: string; backupCount: number; newestStamp: string; onContinue: () => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const n = props.backupCount;

  const go = async () => {
    setBusy(true);
    try {
      await props.onContinue();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="rounded-lg border border-hub-bad bg-hub-panel p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-hub-bad">La base de données est vide</h2>
        <p role="alert" className="text-hub-bad">
          La base de données ne contient aucune donnée, alors que {n} {plural(n, 'sauvegarde existe', 'sauvegardes existent')} dans le dossier de sauvegarde (la plus récente date du {formatLocal(stampToMs(props.newestStamp))}).
        </p>
        <p className="mt-2 text-sm text-hub-muted">
          Cela arrive si le fichier de base a été vidé, tronqué ou remplacé. Vos données ne sont probablement pas perdues : restaurez une sauvegarde ci-dessous. Dossier de données : {props.dataDir}
        </p>
      </section>

      <section className="rounded-lg border border-hub-line bg-hub-panel p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-hub-muted">Restaurer une sauvegarde</h2>
        <BackupPanel mode="recovery" emptyBase />
      </section>

      <section className="rounded-lg border border-hub-line bg-hub-panel p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-hub-muted">Exceptionnel : continuer avec une base vide</h2>
        {!asking && (
          <button type="button" onClick={() => setAsking(true)} className="rounded border border-hub-line px-3 py-1.5 text-sm">Continuer avec une base vide…</button>
        )}
        {asking && (
          <div role="alertdialog" className="space-y-2 rounded border border-hub-bad p-3 text-sm">
            <p>Vous allez travailler sur une base <strong>vide</strong> : aucun de vos projets ni livrables n'y figure. Ce n'est pas une perte définitive tant que vos sauvegardes existent.</p>
            <p className="text-hub-muted">{n < 2 ? 'Votre sauvegarde actuelle sera protégée' : `Vos ${n} sauvegardes actuelles seront protégées`} : la rotation automatique ne les supprimera pas, jusqu'à ce que vous leviez vous-même la protection dans le Centre de sauvegarde. Vous pourrez en restaurer une à tout moment.</p>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={go} className="rounded bg-hub-bad px-3 py-1 font-medium text-hub-bg disabled:opacity-50">Confirmer : continuer avec une base vide</button>
              <button type="button" disabled={busy} onClick={() => setAsking(false)} className="rounded border border-hub-line px-3 py-1">Annuler</button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
