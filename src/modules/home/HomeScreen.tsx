// Écran « Accueil » (lot F3) : charge les chiffres du projet actif et les présente. Lecture seule : rien n'est écrit, rien n'est journalisé.
// Recalculé à chaque arrivée sur l'écran et à chaque changement de projet (l'écran est recréé à chaque navigation).
import { useEffect, useState } from 'react';
import { getTraceability } from '../../data/repositories/traceability.ts';
import { countDrafts, recentProjectActivity } from '../../data/repositories/home.ts';
import type { DraftCounts } from '../../data/repositories/home.ts';
import type { Traceability } from '../../domain/traceability.ts';
import { Card } from '../../shared/ui.tsx';
import type { ItemKind } from '../../domain/kinds.ts';
import { HomeView, NoProjectView } from './HomeView.tsx';
import { activityLine } from './logic.ts';
import type { ActivityLine, DraftKind } from './logic.ts';

interface HomeData {
  projectId: number;
  trace: Traceability;
  drafts: DraftCounts;
  activity: ActivityLine[];
}

export function HomeScreen(props: {
  projectId: number | null;
  projectName: string;
  onGoToProjects: () => void;
  onOpenTraceability: () => void;
  onOpenOrphans: () => void;
  onOpenRegister: (kind: DraftKind) => void;
  onOpenItem: (kind: ItemKind, id: number) => void;
}) {
  const { projectId } = props;
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let dead = false;
    setData(null);
    setError('');
    if (projectId === null) return undefined;
    (async () => {
      try {
        const [trace, drafts, activity] = await Promise.all([getTraceability(projectId), countDrafts(projectId), recentProjectActivity(projectId)]);
        if (!dead) setData({ projectId, trace, drafts, activity: activity.map(activityLine) });
      } catch (e) {
        if (!dead) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      dead = true;
    };
  }, [projectId]);

  if (projectId === null) return <Card title="Accueil"><NoProjectView what="L’accueil et ses chiffres" onGoToProjects={props.onGoToProjects} /></Card>;
  if (data === null || data.projectId !== projectId) {
    return <Card title="Accueil">{error ? <p role="alert" className="text-sm text-hub-bad">{error}</p> : <p className="text-sm text-hub-muted">Calcul en cours…</p>}</Card>;
  }
  return (
    <HomeView
      projectName={props.projectName}
      summary={data.trace.summary}
      ignored={data.trace.ignored}
      orphans={data.trace.orphans}
      drafts={data.drafts}
      activity={data.activity}
      onOpenTraceability={props.onOpenTraceability}
      onOpenOrphans={props.onOpenOrphans}
      onOpenRegister={props.onOpenRegister}
      onOpenItem={props.onOpenItem}
    />
  );
}
