import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { boot, continueWithEmptyDatabase } from './boot.ts';
import type { BootResult } from './boot.ts';
import { query } from '../data/db.ts';
import { createProject, deleteProject, listProjects, recentActivity } from '../data/repositories/projects.ts';
import type { ActivityEntry, Project } from '../data/repositories/projects.ts';
import { BackupPanel } from './BackupPanel.tsx';
import { ImportPanel } from './ImportPanel.tsx';
import { ExportPanel } from './ExportPanel.tsx';
import { AboutPanel } from './AboutPanel.tsx';
import { EmptyDbPanel } from './EmptyDbPanel.tsx';
import { installCloseHandler, setDatabaseReady, startMaintenance } from './maintenance.ts';
import type { Notice } from './maintenance.ts';
import { buildSignature, signatureLines } from '../shared/signature.ts';

interface Snapshot {
  tables: Array<{ name: string; rows: number }>;
  projects: Project[];
  activity: ActivityEntry[];
}

async function takeSnapshot(): Promise<Snapshot> {
  const names = await query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const tables: Snapshot['tables'] = [];
  for (const t of names) {
    const [r] = await query<{ n: number }>(`SELECT count(*) AS n FROM ${t.name}`);
    tables.push({ name: t.name, rows: Number(r.n) });
  }
  return { tables, projects: await listProjects(), activity: await recentActivity(12) };
}

function Card(props: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-hub-line bg-hub-panel p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-hub-muted">{props.title}</h2>
      {props.children}
    </section>
  );
}

export function App() {
  const [result, setResult] = useState<BootResult | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notices, setNotices] = useState<Notice[]>([]);

  const refresh = useCallback(async () => setSnap(await takeSnapshot()), []);

  // Entrée dans l'application : seulement quand la base est prête (jamais pendant l'écran « base vide »).
  const enter = useCallback(
    async (r: BootResult) => {
      setResult(r);
      if (r.status === 'ready') {
        setDatabaseReady(true);
        await refresh();
        startMaintenance((n) => setNotices((old) => [...old.slice(-4), n]));
      }
    },
    [refresh],
  );

  useEffect(() => {
    let dead = false;
    boot().then(async (r) => {
      if (dead) return;
      await enter(r);
    });
    return () => {
      dead = true;
    };
  }, [enter]);

  // Fermeture : sauvegarde si des données ont changé, puis sortie (voir maintenance.ts).
  useEffect(() => installCloseHandler(), []);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const version = result && result.status !== 'browser' && result.info ? result.info.version : '—';
  const sig = buildSignature(version);
  const buildDate = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__.slice(0, 16).replace('T', ' ') + ' UTC' : '';

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-hub-line px-6 py-4">
        <h1 className="text-lg font-semibold">BA-Mentor — état technique</h1>
        <p className="text-sm text-hub-muted">Lot V2.2c : protection contre le démarrage silencieux sur une base vide (après export signé Markdown et HTML, écran À propos, import V1, sauvegarde, restauration et protection contre l’ouverture multiple). Les modules arrivent aux lots suivants.</p>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-6">
        {!result && <p className="text-hub-muted">Démarrage…</p>}

        {result?.status === 'browser' && (
          <Card title="Application requise">
            <p>Cette page doit s’exécuter dans l’application BA-Mentor (Tauri). Lancez l’exécutable plutôt que d’ouvrir la page dans un navigateur.</p>
          </Card>
        )}

        {result?.status === 'empty-db' && (
          <EmptyDbPanel
            dataDir={result.info.dataDir}
            backupCount={result.backupCount}
            newestStamp={result.newestStamp}
            onContinue={async () => enter(await continueWithEmptyDatabase(result.info))}
          />
        )}

        {result?.status === 'error' && (
          <>
            <Card title="Démarrage impossible">
              <p role="alert" className="text-hub-bad">{result.message}</p>
              {result.info && <p className="mt-2 text-sm text-hub-muted">Dossier de données : {result.info.dataDir}</p>}
            </Card>
            {result.info && !result.info.lockedOut && (
              <Card title="Restaurer une sauvegarde">
                <BackupPanel mode="recovery" />
              </Card>
            )}
          </>
        )}

        {result?.status === 'ready' && result.info.lockWarning && (
          <p role="status" className="rounded border border-yellow-500 px-3 py-2 text-sm text-yellow-300">{result.info.lockWarning}</p>
        )}
        {notices.map((n, i) => (
          <p key={i} role={n.level === 'error' ? 'alert' : 'status'} className={`rounded border px-3 py-2 text-sm ${n.level === 'error' ? 'border-hub-bad text-hub-bad' : n.level === 'warning' ? 'border-yellow-500 text-yellow-300' : 'border-hub-line text-hub-muted'}`}>{n.text}</p>
        ))}

        {result?.status === 'ready' && (
          <>
            <Card title="Base de données">
              <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
                <dt className="text-hub-muted">Version de l’application</dt><dd>{result.info.version}</dd>
                <dt className="text-hub-muted">Dossier de données</dt><dd className="break-all">{result.info.dataDir}</dd>
                <dt className="text-hub-muted">Fichier de base</dt><dd className="break-all">{result.info.dbFile}</dd>
                <dt className="text-hub-muted">Schéma</dt>
                <dd>
                  version {result.report.to}
                  {result.report.applied.length > 0 ? ` (migrations appliquées : ${result.report.applied.join(', ')} ; ancienne version ${result.report.from})` : ' (à jour)'}
                </dd>
                <dt className="text-hub-muted">Sauvegarde avant migration</dt>
                <dd className="break-all">{result.report.backup ? result.report.backup.file : 'aucune (non nécessaire)'}</dd>
              </dl>
            </Card>

            <Card title="Centre de sauvegarde">
              <BackupPanel mode="normal" refreshKey={notices.length} />
            </Card>

            <Card title="Importer les données de la V1">
              <ImportPanel
                onImported={() => {
                  refresh().catch(() => undefined);
                  setNotices((old) => [...old.slice(-4), { level: 'info', text: 'Import V1 terminé : les données sont dans la base.' }]);
                }}
              />
            </Card>

            <Card title="Exporter un livrable (Markdown, HTML)">
              <ExportPanel version={version} refreshKey={snap ? snap.tables.map((t) => t.rows).join(',') : ''} />
            </Card>

            <Card title="À propos">
              <AboutPanel version={version} buildDate={buildDate} dataDir={result.info.dataDir} schema={result.report.to} />
            </Card>

            <Card title="Projets de démonstration (écriture par mutate, avec journal)">
              <button
                type="button"
                disabled={busy}
                className="rounded bg-hub-accent px-3 py-1.5 text-sm font-medium text-hub-bg disabled:opacity-50"
                onClick={() => act(() => createProject(`Projet de démonstration ${(snap?.projects.length ?? 0) + 1}`))}
              >
                Créer un projet
              </button>
              {error && <p role="alert" className="mt-2 text-sm text-hub-bad">{error}</p>}
              <ul className="mt-3 space-y-1 text-sm">
                {snap?.projects.length === 0 && <li className="text-hub-muted">Aucun projet.</li>}
                {snap?.projects.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded border border-hub-line px-3 py-1.5">
                    <span>#{p.id} · {p.name}</span>
                    <button type="button" disabled={busy} className="text-hub-bad disabled:opacity-50" onClick={() => act(() => deleteProject(p.id))}>
                      Supprimer
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Journal d’activité (12 derniers)">
                <ul className="space-y-1 text-sm">
                  {snap?.activity.length === 0 && <li className="text-hub-muted">Journal vide.</li>}
                  {snap?.activity.map((a) => (
                    <li key={a.id} className="text-hub-muted">
                      <span className="text-hub-fg">{a.action}</span> · {a.object_type} #{a.object_id} · {a.at.slice(0, 19).replace('T', ' ')}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card title="Tables (15 attendues)">
                <ul className="grid grid-cols-2 gap-x-4 text-sm">
                  {snap?.tables.map((t) => (
                    <li key={t.name} className="flex justify-between"><span>{t.name}</span><span className="text-hub-muted">{t.rows}</span></li>
                  ))}
                </ul>
              </Card>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-hub-line px-6 py-3 text-xs text-hub-muted">
        {signatureLines(sig).join(' · ')}
        {buildDate && <span> · Compilé le {buildDate}</span>}
      </footer>
    </div>
  );
}
