import { useCallback, useEffect, useState } from 'react';
import type { BackupEntry, VerifyReport } from '../data/driver.ts';
import {
  createBackup,
  deleteBackup,
  getSecondaryDir,
  listBackups,
  pickDatabaseFile,
  pickFolder,
  restoreBackup,
  setSecondaryDir,
  verifyBackup,
} from '../data/backup-service.ts';
import { stampToMs } from '../data/backup-policy.ts';
import { formatBytes, formatLocal } from '../shared/format.ts';

interface Message {
  level: 'ok' | 'warning' | 'error';
  text: string;
}

type Pending = { action: 'restore' | 'delete'; file: string; label: string; external?: VerifyReport } | null;

const KIND_LABEL: Record<string, string> = {
  manual: 'Manuelle',
  auto: 'Automatique',
  'pre-migration': 'Avant migration',
  'pre-restore': 'Avant restauration',
};

const COLOR: Record<Message['level'], string> = { ok: 'text-hub-ok', warning: 'text-yellow-400', error: 'text-hub-bad' };

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Centre de sauvegarde. Mode « recovery » : la base est illisible au démarrage ; seule la restauration est proposée.
 */
export function BackupPanel(props: { mode: 'normal' | 'recovery'; /** Change quand une sauvegarde automatique a eu lieu : la liste se relit. */ refreshKey?: number }) {
  const recovery = props.mode === 'recovery';
  const [entries, setEntries] = useState<BackupEntry[]>([]);
  const [secondary, setSecondary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<Pending>(null);

  const refresh = useCallback(async () => {
    setEntries(await listBackups());
    if (!recovery) setSecondary(await getSecondaryDir());
  }, [recovery]);

  useEffect(() => {
    refresh().catch((e) => setMessages([{ level: 'error', text: errorText(e) }]));
  }, [refresh, props.refreshKey]);

  const run = async (fn: () => Promise<Message[] | void>) => {
    setBusy(true);
    setMessages([]);
    try {
      const out = await fn();
      if (out) setMessages(out);
      await refresh().catch(() => undefined);
    } catch (e) {
      setMessages([{ level: 'error', text: errorText(e) }]);
    } finally {
      setBusy(false);
    }
  };

  const doCreate = () =>
    run(async () => {
      const r = await createBackup('manual');
      const out: Message[] = [{ level: 'ok', text: `Sauvegarde créée : ${r.created.file} (${formatBytes(r.created.sizeBytes)}, SHA-256 ${r.created.sha256.slice(0, 12)}…).` }];
      if (r.created.secondary?.ok) out.push({ level: 'ok', text: `Copie secondaire : ${r.created.secondary.file}` });
      for (const w of r.warnings) out.push({ level: 'warning', text: w });
      if (r.rotated.length > 0) out.push({ level: 'ok', text: `${r.rotated.length} ancienne(s) sauvegarde(s) supprimée(s) par la rotation.` });
      return out;
    });

  const doVerify = (e: BackupEntry) =>
    run(async () => {
      const v = await verifyBackup(e.file);
      return [{ level: v.ok ? 'ok' : 'error', text: v.ok ? `${e.name} : intégrité correcte, schéma ${v.schemaVersion ?? '?'}, SHA-256 ${v.sha256.slice(0, 16)}…` : `${e.name} : ${v.message}` }];
    });

  const doPickSecondary = () =>
    run(async () => {
      const dir = await pickFolder();
      if (dir) await setSecondaryDir(dir);
    });

  const doPickExternal = () =>
    run(async () => {
      const file = await pickDatabaseFile();
      if (!file) return;
      const v = await verifyBackup(file);
      if (!v.ok) return [{ level: 'error', text: `Fichier inutilisable : ${v.message}` }];
      if (v.schemaVersion === null) return [{ level: 'error', text: 'Ce fichier n\'est pas une base BA-Mentor.' }];
      setPending({ action: 'restore', file, label: file, external: v });
    });

  const doConfirm = () => {
    const p = pending;
    if (!p) return;
    setPending(null);
    if (p.action === 'delete') return run(() => deleteBackup(p.file));
    return run(async () => {
      const r = await restoreBackup(p.file, { currentBaseUnreadable: recovery });
      setTimeout(() => window.location.reload(), 1500);
      const out: Message[] = [
        {
          level: 'ok',
          text: `Restauration terminée (schéma ${r.restoredSchema}${r.migrated ? `, migré vers ${r.currentSchema}` : ''}). L'état précédent est conservé : ${r.preRestoreFile ?? 'aucune copie possible (base illisible, fichier abîmé conservé dans le dossier de données)'}. Rechargement…`,
        },
      ];
      for (const w of r.warnings) out.push({ level: 'warning', text: w });
      return out;
    });
  };

  return (
    <div className="space-y-3 text-sm">
      {!recovery && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={doCreate} className="rounded bg-hub-accent px-3 py-1.5 font-medium text-hub-bg disabled:opacity-50">
            Créer une sauvegarde manuelle
          </button>
          <button type="button" disabled={busy} onClick={doPickExternal} className="rounded border border-hub-line px-3 py-1.5 disabled:opacity-50">
            Restaurer depuis un fichier…
          </button>
        </div>
      )}
      {recovery && (
        <button type="button" disabled={busy} onClick={doPickExternal} className="rounded border border-hub-line px-3 py-1.5 disabled:opacity-50">
          Restaurer depuis un fichier…
        </button>
      )}

      {!recovery && (
        <div className="rounded border border-hub-line p-3">
          <div className="text-hub-muted">Dossier de sauvegarde secondaire (facultatif, par exemple sur le disque du poste)</div>
          <div className="mt-1 break-all">{secondary ?? 'aucun'}</div>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={doPickSecondary} className="rounded border border-hub-line px-3 py-1 disabled:opacity-50">Choisir…</button>
            {secondary && (
              <button type="button" disabled={busy} onClick={() => run(() => setSecondaryDir(null))} className="rounded border border-hub-line px-3 py-1 disabled:opacity-50">Retirer</button>
            )}
          </div>
          <div className="mt-1 text-xs text-hub-muted">Une sauvegarde rangée sur la même clé ne protège pas de la perte de la clé. Si ce dossier n'existe pas sur un autre poste, la copie secondaire est ignorée avec un avertissement.</div>
        </div>
      )}

      {pending && (
        <div role="alertdialog" className="rounded border border-hub-bad p-3">
          <p>
            {pending.action === 'restore' ? 'Restaurer cette sauvegarde remplace TOUTES les données actuelles. Une copie de l\'état actuel est faite juste avant.' : 'Supprimer définitivement cette sauvegarde ?'}
          </p>
          <p className="mt-1 break-all text-hub-muted">{pending.label}</p>
          {pending.external && <p className="mt-1 text-hub-muted">Fichier contrôlé : intégrité correcte, schéma {pending.external.schemaVersion}, {formatBytes(pending.external.sizeBytes)}.</p>}
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={doConfirm} className="rounded bg-hub-bad px-3 py-1 font-medium text-hub-bg">{pending.action === 'restore' ? 'Confirmer la restauration' : 'Confirmer la suppression'}</button>
            <button type="button" onClick={() => setPending(null)} className="rounded border border-hub-line px-3 py-1">Annuler</button>
          </div>
        </div>
      )}

      {messages.map((m, i) => (
        <p key={i} role={m.level === 'error' ? 'alert' : 'status'} className={`break-all ${COLOR[m.level]}`}>{m.text}</p>
      ))}

      <table className="w-full text-left">
        <thead className="text-hub-muted">
          <tr><th className="py-1 pr-3">Date</th><th className="pr-3">Type</th><th className="pr-3">Taille</th><th className="pr-3">Schéma</th><th /></tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr><td colSpan={5} className="py-2 text-hub-muted">Aucune sauvegarde dans le dossier de l’application.</td></tr>
          )}
          {entries.map((e) => (
            <tr key={e.file} className="border-t border-hub-line">
              <td className="py-1 pr-3">{formatLocal(stampToMs(e.stamp))}</td>
              <td className="pr-3">{KIND_LABEL[e.kind] ?? e.kind}</td>
              <td className="pr-3">{formatBytes(e.sizeBytes)}</td>
              <td className="pr-3">{e.schemaVersion ?? '?'}</td>
              <td className="space-x-3 text-right">
                <button type="button" disabled={busy} onClick={() => doVerify(e)} className="text-hub-accent disabled:opacity-50">Vérifier</button>
                <button type="button" disabled={busy} onClick={() => setPending({ action: 'restore', file: e.file, label: `${KIND_LABEL[e.kind] ?? e.kind} du ${formatLocal(stampToMs(e.stamp))}` })} className="text-hub-accent disabled:opacity-50">Restaurer</button>
                {!recovery && (
                  <button type="button" disabled={busy} onClick={() => setPending({ action: 'delete', file: e.file, label: e.name })} className="text-hub-bad disabled:opacity-50">Supprimer</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-hub-muted">Conservation : manuelles sans limite, automatiques 10, avant migration 5, avant restauration 5. Les dates sont affichées en heure locale.</p>
    </div>
  );
}
