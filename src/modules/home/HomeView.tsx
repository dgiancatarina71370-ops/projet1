// Écran « Accueil » (lot F3), version d'affichage pure : elle reçoit tout par propriétés, aucun bouton ne modifie une donnée.
// Le conteneur (HomeScreen.tsx) l'alimente. Couverture et orphelins : les libellés de Traçabilité (src/domain/trace-labels.ts).
import { BUTTON_PRIMARY, Card, NoProjectView } from '../../shared/ui.tsx';
import type { Orphans, Summary } from '../../domain/traceability.ts';
import { ignoredText, orphanCount, ratioText, summaryLines } from '../../domain/trace-labels.ts';
import type { ItemKind } from '../../domain/kinds.ts';
import { DRAFT_NOTE, NO_ACTIVITY_TEXT, draftLines, kindLabel, orphanText } from './logic.ts';
import type { ActivityLine, DraftKind } from './logic.ts';

export { NoProjectView };

export interface HomeViewProps {
  projectName: string;
  summary: Summary;
  ignored: number;
  orphans: Orphans;
  drafts: Record<DraftKind, number>;
  activity: ActivityLine[];
  onOpenTraceability: () => void;
  onOpenOrphans: () => void;
  onOpenRegister: (kind: DraftKind) => void;
  onOpenItem: (kind: ItemKind, id: number) => void;
}

const LINK_BUTTON = 'text-hub-accent underline';

export function HomeView(props: HomeViewProps) {
  const orphans = orphanCount(props.orphans);
  const note = ignoredText(props.ignored);
  return (
    <div className="space-y-4">
      <p className="text-sm text-hub-muted">Projet : <span className="text-hub-fg">{props.projectName}</span></p>

      <Card title="Couverture de traçabilité">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {summaryLines(props.summary).map((l) => (
            <div key={l.key} className="flex justify-between gap-3 border-b border-hub-line py-1">
              <dt className="text-hub-muted">{l.label}</dt>
              <dd className="whitespace-nowrap font-medium">{ratioText(l.ratio)}</dd>
            </div>
          ))}
        </dl>
        {note && <p className="mt-2 text-xs text-hub-muted">{note}</p>}
        <p className="mt-3 text-sm"><button type="button" className={LINK_BUTTON} onClick={props.onOpenTraceability}>Voir la traçabilité</button></p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Orphelins">
          <p className="text-sm" role="status">{orphanText(orphans)}</p>
          {orphans > 0 && (
            <p className="mt-2 text-sm"><button type="button" className={BUTTON_PRIMARY} onClick={props.onOpenOrphans}>Voir les orphelins</button></p>
          )}
        </Card>

        <Card title="Brouillons">
          <ul className="space-y-1 text-sm">
            {draftLines(props.drafts).map((d) => (
              <li key={d.kind} className="flex justify-between gap-3 border-b border-hub-line py-1">
                <button type="button" className={`${LINK_BUTTON} text-left`} onClick={() => props.onOpenRegister(d.kind)}>{d.label}</button>
                <span className="whitespace-nowrap font-medium">{d.count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-hub-muted">{DRAFT_NOTE}</p>
        </Card>
      </div>

      <Card title="Dernières modifications">
        {props.activity.length === 0 ? (
          <p className="text-sm text-hub-muted">{NO_ACTIVITY_TEXT}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {props.activity.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-2 border-b border-hub-line py-1">
                <span className="whitespace-nowrap text-hub-muted">{a.when}</span>
                {a.code !== null && a.kind !== null && a.itemId !== null ? (
                  <button type="button" className={`${LINK_BUTTON} whitespace-nowrap`} title={`${kindLabel(a.kind)} : ${a.title ?? ''}`} onClick={() => props.onOpenItem(a.kind as ItemKind, a.itemId as number)}>{a.code}</button>
                ) : null}
                {a.title ? <span>{a.title}</span> : null}
                <span className="text-hub-muted">{a.code !== null ? '· ' : ''}{a.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
