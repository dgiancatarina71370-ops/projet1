// Écran « Journal » (lot F4) : charge une page du journal du projet actif, selon les filtres. Lecture seule : rien n'est écrit, rien n'est journalisé.
// Les filtres et la page repartent de zéro à chaque arrivée sur l'écran et à chaque changement de projet (F4-D10) ; changer un filtre revient à la page 1.
import { useEffect, useState } from 'react';
import { countJournal, listJournal, JOURNAL_PAGE_SIZE } from '../../data/repositories/journal.ts';
import { Card } from '../../shared/ui.tsx';
import type { ItemKind } from '../../domain/kinds.ts';
import { JournalView, NoProjectView } from './JournalView.tsx';
import { clampPage, journalLine, pageCount } from './logic.ts';
import type { JournalLine } from './logic.ts';

interface JournalData {
  projectId: number;
  lines: JournalLine[];
  total: number;
  unfilteredTotal: number;
  page: number;
  pages: number;
}

export function JournalScreen(props: { projectId: number | null; projectName: string; onGoToProjects: () => void; onOpenItem: (kind: ItemKind, id: number) => void }) {
  const { projectId } = props;
  const [group, setGroup] = useState('all');
  const [action, setAction] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<JournalData | null>(null);
  const [error, setError] = useState('');

  // Changement de projet : filtres et page repartent de zéro.
  useEffect(() => {
    setGroup('all');
    setAction('all');
    setPage(1);
  }, [projectId]);

  useEffect(() => {
    let dead = false;
    setError('');
    if (projectId === null) {
      setData(null);
      return undefined;
    }
    (async () => {
      try {
        const total = await countJournal(projectId, { group, action });
        const unfilteredTotal = group === 'all' && action === 'all' ? total : await countJournal(projectId, { group: 'all', action: 'all' });
        const pages = pageCount(total, JOURNAL_PAGE_SIZE);
        const shown = clampPage(page, pages);
        const rows = await listJournal(projectId, { group, action }, shown);
        if (!dead) setData({ projectId, lines: rows.map(journalLine), total, unfilteredTotal, page: shown, pages });
      } catch (e) {
        if (!dead) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      dead = true;
    };
  }, [projectId, group, action, page]);

  if (projectId === null) return <Card title="Journal"><NoProjectView what="Le journal d’activité" onGoToProjects={props.onGoToProjects} /></Card>;
  if (error) return <Card title="Journal"><p role="alert" className="text-sm text-hub-bad">{error}</p></Card>;
  if (data === null || data.projectId !== projectId) return <Card title="Journal"><p className="text-sm text-hub-muted">Chargement…</p></Card>;
  return (
    <JournalView
      projectName={props.projectName}
      lines={data.lines}
      total={data.total}
      unfilteredTotal={data.unfilteredTotal}
      page={data.page}
      pages={data.pages}
      group={group}
      action={action}
      onGroup={(v) => { setGroup(v); setPage(1); }}
      onAction={(v) => { setAction(v); setPage(1); }}
      onPrevious={() => setPage(Math.max(1, data.page - 1))}
      onNext={() => setPage(Math.min(data.pages, data.page + 1))}
      onOpenItem={props.onOpenItem}
    />
  );
}
