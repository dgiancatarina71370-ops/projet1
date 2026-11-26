// Écran « Traçabilité » (lot M6), versions d'affichage pures : elles reçoivent tout par propriétés.
// Le conteneur (TraceabilityScreen.tsx) les alimente. Lecture seule : aucun bouton ne modifie une donnée (D78).
import type { ReactNode } from 'react';
import { Card, NoProjectView, StatusFilterBar, TabBar } from '../../shared/ui.tsx';
import { dayLabel } from '../../domain/decisions.ts';
import { priorityLabel } from '../../domain/requirements.ts';
import { statusLabel } from '../../domain/kinds.ts';
import type { MatrixRow, Orphans, Summary, TraceRef } from '../../domain/traceability.ts';
import { MATRIX_FILTERS, ORPHAN_GROUPS, TABS, emptyMatrixMessage, filterMatrix, ignoredText, orphanCount, ratioText, resultLabel, summaryLines } from './logic.ts';

export { NoProjectView };

export type OpenItem = (kind: TraceRef['kind'], id: number) => void;

/** Un code cliquable : ouvre la fiche de l'élément (D76). Le titre complet est dans l'infobulle. */
export function CodeButton(props: { item: TraceRef; onOpen: OpenItem; suffix?: string }) {
  const it = props.item;
  return (
    <button type="button" className="mr-2 whitespace-nowrap text-left text-hub-accent underline" title={`${it.title} (${statusLabel(it.status, it.kind)})`} onClick={() => props.onOpen(it.kind, it.id)}>
      {it.code}{props.suffix ?? ''}
    </button>
  );
}

function CodeList(props: { items: readonly TraceRef[]; onOpen: OpenItem; suffix?: string }) {
  if (props.items.length === 0) return <span className="text-hub-muted">—</span>;
  return <>{props.items.map((t) => <CodeButton key={t.id} item={t} onOpen={props.onOpen} suffix={props.suffix} />)}</>;
}

export function SummaryBand(props: { summary: Summary; ignored: number }) {
  const note = ignoredText(props.ignored);
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {summaryLines(props.summary).map((l) => (
          <div key={l.key} className="flex justify-between gap-3 border-b border-hub-line py-1">
            <dt className="text-hub-muted">{l.label}</dt>
            <dd className="whitespace-nowrap font-medium">{ratioText(l.ratio)}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="text-xs text-hub-muted">{note}</p>}
    </div>
  );
}

export function MatrixView(props: { rows: MatrixRow[]; total: number; filter: string; onFilter: (f: string) => void; onOpen: OpenItem }) {
  const shown = filterMatrix(props.rows, props.filter);
  return (
    <div className="space-y-3">
      <StatusFilterBar options={MATRIX_FILTERS} value={props.filter} onChange={props.onFilter} />
      {shown.length === 0 ? (
        <p className="text-sm text-hub-muted">{emptyMatrixMessage(props.total, props.filter)}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-hub-muted">
              <tr><th className="py-1 pr-3">Exigence</th><th className="pr-3">Priorité</th><th className="pr-3">Besoins</th><th className="pr-3">User stories</th><th className="pr-3">Tests directs</th><th className="pr-3">Tests via story</th><th>Résultat</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-hub-line align-top">
                  <td className="py-1 pr-3"><CodeButton item={{ id: r.id, kind: 'requirement', code: r.code, title: r.title, status: r.status }} onOpen={props.onOpen} /><span className="block text-xs text-hub-muted">{r.title}</span></td>
                  <td className="pr-3">{r.priority ? priorityLabel(r.priority) : '—'}</td>
                  <td className="pr-3"><CodeList items={r.needs} onOpen={props.onOpen} /></td>
                  <td className="pr-3"><CodeList items={r.stories} onOpen={props.onOpen} /></td>
                  <td className="pr-3"><CodeList items={r.directTests} onOpen={props.onOpen} /></td>
                  <td className="pr-3"><CodeList items={r.viaStoryTests} onOpen={props.onOpen} /></td>
                  <td>{resultLabel(r.result)}{lastRun(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Dernière exécution des tests de l'exigence : la plus récente date connue (information, sans jugement de fraîcheur). */
function lastRun(r: MatrixRow): string {
  const dates = [...r.directTests, ...r.viaStoryTests].map((t) => t.lastRunOn ?? '').filter((d) => d !== '').sort();
  return dates.length === 0 ? '' : ` · dernière exécution ${dayLabel(dates[dates.length - 1])}`;
}

export function OrphansView(props: { orphans: Orphans; onOpen: OpenItem }) {
  if (orphanCount(props.orphans) === 0) return <p className="text-sm text-hub-muted">Aucun orphelin : chaque élément actif de la chaîne a les liens attendus.</p>;
  return (
    <div className="space-y-4">
      {ORPHAN_GROUPS.map((g) => {
        const list = props.orphans[g.key];
        return (
          <section key={g.key}>
            <h3 className="text-sm font-semibold">{g.label} <span className="font-normal text-hub-muted">({list.length})</span></h3>
            {list.length === 0 ? (
              <p className="text-xs text-hub-muted">Aucun.</p>
            ) : (
              <ul className="mt-1 space-y-0.5 text-sm">
                {list.map((t) => (
                  <li key={t.id}><CodeButton item={t} onOpen={props.onOpen} /><span className="text-hub-muted">{t.title}</span></li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function TraceabilityPageView(props: {
  projectName: string; summary: Summary; ignored: number; rows: MatrixRow[]; orphans: Orphans;
  tab: string; onTab: (t: string) => void; filter: string; onFilter: (f: string) => void; onOpen: OpenItem; error: string;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-hub-muted">Projet : <strong>{props.projectName}</strong>. Vue calculée à partir des liens, en lecture seule : rien ne s'y modifie.</p>
      {props.error && <p role="alert" className="text-sm text-hub-bad">{props.error}</p>}
      <SummaryBand summary={props.summary} ignored={props.ignored} />
      <TabBar tabs={TABS.map((t) => (t.value === 'orphans' ? { ...t, label: `${t.label} (${orphanCount(props.orphans)})` } : t))} value={props.tab} onChange={props.onTab} />
      {props.tab === 'orphans' ? (
        <OrphansView orphans={props.orphans} onOpen={props.onOpen} />
      ) : (
        <MatrixView rows={props.rows} total={props.rows.length} filter={props.filter} onFilter={props.onFilter} onOpen={props.onOpen} />
      )}
    </div>
  );
}

export function TraceabilityCard(props: { children: ReactNode }) {
  return <Card title="Traçabilité">{props.children}</Card>;
}
