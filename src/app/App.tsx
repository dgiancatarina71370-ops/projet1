import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { boot, continueWithEmptyDatabase } from './boot.ts';
import type { BootResult } from './boot.ts';
import { query } from '../data/db.ts';
import { listProjects, recentActivity } from '../data/repositories/projects.ts';
import { getLastProjectId, setLastProjectId } from '../data/repositories/ui-state.ts';
import type { ActivityEntry, Project } from '../data/repositories/projects.ts';
import { BackupPanel } from './BackupPanel.tsx';
import { ImportPanel } from './ImportPanel.tsx';
import { ExportPanel } from './ExportPanel.tsx';
import { AboutPanel } from './AboutPanel.tsx';
import { EmptyDbPanel } from './EmptyDbPanel.tsx';
import { installCloseHandler, setDatabaseReady, startMaintenance } from './maintenance.ts';
import type { Notice } from './maintenance.ts';
import { buildSignature, signatureLines } from '../shared/signature.ts';
import { Card } from '../shared/ui.tsx';
import { Shell } from './Shell.tsx';
import { startScreen } from './navigation.ts';
import type { ScreenId } from './navigation.ts';
import { ProjectsScreen } from '../modules/projects/ProjectsScreen.tsx';
import { chooseActiveProject, selectableProjects } from '../modules/projects/logic.ts';
import { StakeholdersScreen } from '../modules/stakeholders/StakeholdersScreen.tsx';
import { NeedsScreen } from '../modules/analysis/NeedsScreen.tsx';
import { DecisionsScreen } from '../modules/decisions/DecisionsScreen.tsx';
import { RisksScreen } from '../modules/risks/RisksScreen.tsx';
import { StoriesScreen } from '../modules/stories/StoriesScreen.tsx';
import { TestsScreen } from '../modules/testcases/TestsScreen.tsx';
import { RequirementsScreen } from '../modules/analysis/RequirementsScreen.tsx';
import { LinksSection } from './LinksSection.tsx';
import type { ItemKind } from '../domain/kinds.ts';

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

export function App() {
  const [result, setResult] = useState<BootResult | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [screen, setScreen] = useState<ScreenId>('projects');
  const [activeId, setActiveId] = useState<number | null>(null);

  const refresh = useCallback(async () => setSnap(await takeSnapshot()), []);

  const report = useCallback((text: string, level: Notice['level'] = 'error') => setNotices((old) => [...old.slice(-4), { level, text }]), []);

  // Mémorise le projet actif (table technique, sans journal) ; un échec de mémorisation ne doit pas empêcher de travailler.
  const rememberProject = useCallback(
    async (id: number | null) => {
      try {
        await setLastProjectId(id);
      } catch (e) {
        report(`Le projet actif n'a pas pu être mémorisé : ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [report],
  );

  // Entrée dans l'application : seulement quand la base est prête (jamais pendant l'écran « base vide »).
  const enter = useCallback(
    async (r: BootResult) => {
      setResult(r);
      if (r.status === 'ready') {
        setDatabaseReady(true);
        await refresh();
        const projects = await listProjects();
        const id = chooseActiveProject(projects, await getLastProjectId());
        setActiveId(id);
        setScreen(startScreen(id));
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

  const selectProject = useCallback(
    async (id: number) => {
      setActiveId(id);
      await rememberProject(id);
    },
    [rememberProject],
  );

  // Après toute écriture des écrans : relit l'état, garde le projet actif s'il existe encore, sinon retombe sur un autre (ou aucun).
  const afterChange = useCallback(
    async (activate?: number) => {
      await refresh();
      const projects = await listProjects();
      const next = chooseActiveProject(projects, activate ?? activeId);
      if (next !== activeId) {
        setActiveId(next);
        await rememberProject(next);
      } else if (activate !== undefined) {
        await rememberProject(activate);
      }
    },
    [activeId, refresh, rememberProject],
  );

  const version = result && result.status !== 'browser' && result.info ? result.info.version : '—';
  const sig = buildSignature(version);
  const buildDate = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__.slice(0, 16).replace('T', ' ') + ' UTC' : '';
  const projectOptions = snap ? selectableProjects(snap.projects).map((p) => ({ id: p.id, name: p.name })) : [];
  const active = projectOptions.find((p) => p.id === activeId) ?? null;
  const ready = result?.status === 'ready';
  // Zone « Liens » de chaque fiche : l'application l'assemble (les écrans de registre ne s'importent pas entre eux).
  const renderLinks = (itemId: number, kind: string) => <LinksSection key={itemId} itemId={itemId} kind={kind as ItemKind} onChanged={() => void refresh()} />;

  return (
    <Shell
      intro="Lot M5 : user stories, tests et liens entre éléments (de la partie prenante au test). Le schéma de la base passe à la version 6. Sauvegarde, import V1, export et À propos sont dans l’écran Technique. La traçabilité calculée (couverture, éléments orphelins) arrive au lot suivant."
      navigable={ready}
      screen={screen}
      onNavigate={setScreen}
      projects={projectOptions}
      activeId={activeId}
      onSelectProject={(id) => void selectProject(id)}
      footer={signatureLines(sig).join(' · ') + (buildDate ? ` · Compilé le ${buildDate}` : '')}
    >
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

      {result?.status === 'ready' && screen === 'projects' && snap && (
        <ProjectsScreen projects={snap.projects} activeId={activeId} onChanged={afterChange} onActivate={selectProject} />
      )}

      {result?.status === 'ready' && screen === 'stakeholders' && (
        <StakeholdersScreen
          projectId={active ? active.id : null}
          projectName={active ? active.name : ''}
          onGoToProjects={() => setScreen('projects')}
          onChanged={() => void refresh()}
          renderLinks={renderLinks}
        />
      )}

      {result?.status === 'ready' && screen === 'needs' && (
        <NeedsScreen
          projectId={active ? active.id : null}
          projectName={active ? active.name : ''}
          onGoToProjects={() => setScreen('projects')}
          onChanged={() => void refresh()}
          renderLinks={renderLinks}
        />
      )}

      {result?.status === 'ready' && screen === 'requirements' && (
        <RequirementsScreen
          projectId={active ? active.id : null}
          projectName={active ? active.name : ''}
          onGoToProjects={() => setScreen('projects')}
          onChanged={() => void refresh()}
          renderLinks={renderLinks}
        />
      )}

      {result?.status === 'ready' && screen === 'decisions' && (
        <DecisionsScreen
          projectId={active ? active.id : null}
          projectName={active ? active.name : ''}
          onGoToProjects={() => setScreen('projects')}
          onChanged={() => void refresh()}
          renderLinks={renderLinks}
        />
      )}

      {result?.status === 'ready' && screen === 'risks' && (
        <RisksScreen
          projectId={active ? active.id : null}
          projectName={active ? active.name : ''}
          onGoToProjects={() => setScreen('projects')}
          onChanged={() => void refresh()}
          renderLinks={renderLinks}
        />
      )}

      {result?.status === 'ready' && screen === 'stories' && (
        <StoriesScreen
          projectId={active ? active.id : null}
          projectName={active ? active.name : ''}
          onGoToProjects={() => setScreen('projects')}
          onChanged={() => void refresh()}
          renderLinks={renderLinks}
        />
      )}

      {result?.status === 'ready' && screen === 'tests' && (
        <TestsScreen
          projectId={active ? active.id : null}
          projectName={active ? active.name : ''}
          onGoToProjects={() => setScreen('projects')}
          onChanged={() => void refresh()}
          renderLinks={renderLinks}
        />
      )}

      {result?.status === 'ready' && screen === 'technical' && (
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
                void afterChange();
                setNotices((old) => [...old.slice(-4), { level: 'info', text: 'Import V1 terminé : les données sont dans la base.' }]);
              }}
            />
          </Card>

          <Card title="Exporter un livrable (Markdown, HTML, Word)">
            <ExportPanel version={version} refreshKey={snap ? snap.tables.map((t) => t.rows).join(',') : ''} />
          </Card>

          <Card title="À propos">
            <AboutPanel version={version} buildDate={buildDate} dataDir={result.info.dataDir} schema={result.report.to} />
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
            <Card title={`Tables (${snap?.tables.length ?? 0})`}>
              <ul className="grid grid-cols-2 gap-x-4 text-sm">
                {snap?.tables.map((t) => (
                  <li key={t.name} className="flex justify-between"><span>{t.name}</span><span className="text-hub-muted">{t.rows}</span></li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </Shell>
  );
}
