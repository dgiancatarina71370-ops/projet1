// Écran « Journal » (lot F4), version d'affichage pure : elle reçoit tout par propriétés, aucun bouton ne modifie une donnée.
// Le conteneur (JournalScreen.tsx) l'alimente. Lecture seule : le journal n'est jamais écrit depuis cet écran.
import { Card, INPUT_CLASS, NoProjectView } from '../../shared/ui.tsx';
import type { ItemKind } from '../../domain/kinds.ts';
import { ACTION_OPTIONS, OBJECT_GROUPS } from '../../domain/activity-labels.ts';
import { emptyJournalText, pageText } from './logic.ts';
import type { JournalLine } from './logic.ts';

export { NoProjectView };

export interface JournalViewProps {
  projectName: string;
  lines: JournalLine[];
  /** Entrées qui répondent aux filtres, et entrées du projet sans filtre (pour le message d'une liste vide). */
  total: number;
  unfilteredTotal: number;
  page: number;
  pages: number;
  group: string;
  action: string;
  onGroup: (v: string) => void;
  onAction: (v: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onOpenItem: (kind: ItemKind, id: number) => void;
}

const BUTTON = 'rounded border border-hub-line px-3 py-1 text-sm disabled:opacity-40';

export function JournalView(props: JournalViewProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-hub-muted">Projet : <span className="text-hub-fg">{props.projectName}</span></p>
      <Card title="Journal d’activité">
        <div role="search" className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="journal-group" className="text-hub-muted">Type d’objet</label>
          <select id="journal-group" className={`${INPUT_CLASS} w-40`} value={props.group} onChange={(e) => props.onGroup(e.target.value)}>
            {OBJECT_GROUPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label htmlFor="journal-action" className="text-hub-muted">Action</label>
          <select id="journal-action" className={`${INPUT_CLASS} w-44`} value={props.action} onChange={(e) => props.onAction(e.target.value)}>
            {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {props.lines.length === 0 ? (
          <p className="text-sm text-hub-muted">{emptyJournalText(props.unfilteredTotal)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-hub-muted">
                <tr><th className="py-1 pr-3">Date</th><th className="pr-3">Objet</th><th className="pr-3">Action</th><th className="pr-3">Libellé</th><th>Détail</th></tr>
              </thead>
              <tbody>
                {props.lines.map((l) => (
                  <tr key={l.id} className="border-t border-hub-line align-top">
                    <td className="whitespace-nowrap py-1 pr-3 text-hub-muted">{l.when}</td>
                    <td className="pr-3">{l.object}</td>
                    <td className="pr-3">{l.action}</td>
                    <td className="pr-3">
                      {l.code !== null && l.kind !== null && l.itemId !== null ? (
                        <button type="button" className="mr-2 whitespace-nowrap text-hub-accent underline" onClick={() => props.onOpenItem(l.kind as ItemKind, l.itemId as number)}>{l.code}</button>
                      ) : null}
                      <span>{l.label}</span>
                    </td>
                    <td className="text-hub-muted">{l.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <button type="button" className={BUTTON} disabled={props.page <= 1} onClick={props.onPrevious}>Précédent</button>
          <span role="status" className="text-hub-muted">{pageText(props.page, props.pages, props.total)}</span>
          <button type="button" className={BUTTON} disabled={props.page >= props.pages} onClick={props.onNext}>Suivant</button>
        </div>
      </Card>
    </div>
  );
}
