// Écran « Traçabilité » (lot M6) : charge le calcul du projet actif et le présente ; un clic sur un code ouvre la fiche (D76).
import { useCallback, useEffect, useState } from 'react';
import { getTraceability } from '../../data/repositories/traceability.ts';
import type { Traceability } from '../../domain/traceability.ts';
import { NoProjectView, TraceabilityCard, TraceabilityPageView } from './TraceabilityView.tsx';
import type { OpenItem } from './TraceabilityView.tsx';

export function TraceabilityScreen(props: { projectId: number | null; projectName: string; onGoToProjects: () => void; onOpenItem: OpenItem; initialTab?: string }) {
  const { projectId } = props;
  const [data, setData] = useState<Traceability | null>(null);
  const [tab, setTab] = useState(props.initialTab ?? 'matrix');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (projectId === null) { setData(null); return; }
    try {
      setData(await getTraceability(projectId));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [projectId]);

  // Le calcul est refait à chaque arrivée sur l'écran et à chaque changement de projet (l'écran est recréé à chaque navigation).
  useEffect(() => { void load(); }, [load]);

  if (projectId === null) return <TraceabilityCard><NoProjectView what="Les données de traçabilité" onGoToProjects={props.onGoToProjects} /></TraceabilityCard>;
  if (data === null) return <TraceabilityCard>{error ? <p role="alert" className="text-sm text-hub-bad">{error}</p> : <p className="text-sm text-hub-muted">Calcul en cours…</p>}</TraceabilityCard>;
  return (
    <TraceabilityCard>
      <TraceabilityPageView projectName={props.projectName} summary={data.summary} ignored={data.ignored} rows={data.matrix} orphans={data.orphans} tab={tab} onTab={setTab} filter={filter} onFilter={setFilter} onOpen={props.onOpenItem} error={error} />
    </TraceabilityCard>
  );
}
