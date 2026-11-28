// Section « Historique » d'une fiche (lot F7), version d'affichage pure : tout arrive par propriétés, en texte déjà prêt.
// Le conteneur (src/app/HistorySection.tsx) lit la base. Comme la zone Liens, la section est assemblée par l'application (règle R1).
import { BUTTON_SECONDARY } from './ui.tsx';

export interface HistoryLineView {
  id: number;
  /** Date et heure locales, déjà formatées. */
  when: string;
  text: string;
}

export function HistoryView(props: {
  lines: HistoryLineView[];
  /** « 12 entrées ». */
  countText: string;
  emptyText: string;
  limitNote: string;
  /** Libellé du bouton ; null = rien à montrer de plus. */
  moreLabel: string | null;
  busy: boolean;
  error: string;
  onMore: () => void;
}) {
  return (
    <section aria-label="Historique" className="space-y-2 border-t border-hub-line pt-3">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-hub-muted">Historique</h4>
      {props.lines.length === 0 ? (
        <p className="text-sm text-hub-muted">{props.emptyText}</p>
      ) : (
        <>
          <p className="text-xs text-hub-muted">{props.countText}</p>
          <ul className="space-y-1 text-sm">
            {props.lines.map((l) => (
              <li key={l.id}><span className="text-hub-muted">{l.when}</span> · {l.text}</li>
            ))}
          </ul>
        </>
      )}
      {props.moreLabel !== null && <button type="button" className={BUTTON_SECONDARY} disabled={props.busy} onClick={props.onMore}>{props.moreLabel}</button>}
      {props.error && <p role="alert" className="text-sm text-hub-bad">{props.error}</p>}
      <p className="text-xs text-hub-muted">{props.limitNote}</p>
    </section>
  );
}
