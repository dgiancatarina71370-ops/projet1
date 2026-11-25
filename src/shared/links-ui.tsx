// Zone « Liens » d'une fiche (lot M3b, décisions D48 et D49), version d'affichage pure : tout arrive par propriétés, en texte déjà prêt.
// Le conteneur (src/app/LinksSection.tsx) lit la base et applique les règles de la couche domain.
import { BUTTON_PRIMARY, BUTTON_SECONDARY, ConfirmBar, SelectField } from './ui.tsx';

export interface LinkRowView {
  linkId: number;
  /** Libellé lu depuis l'élément courant : « dérive de », « exprimé par »… */
  label: string;
  otherCode: string;
  otherTitle: string;
  otherStatus: string;
}

export interface LinkOptionView {
  key: string;
  /** « dérive de (Besoin) » */
  label: string;
}

export interface LinkCandidateView {
  id: number;
  /** « BES-001 · Titre (Brouillon) » */
  label: string;
}

export function LinksView(props: {
  rows: LinkRowView[];
  options: LinkOptionView[];
  optionKey: string;
  candidates: LinkCandidateView[];
  candidateId: string;
  busy: boolean;
  error: string;
  confirmRemove: { linkId: number; message: string } | null;
  onOption: (key: string) => void;
  onCandidate: (id: string) => void;
  onAdd: () => void;
  onAskRemove: (linkId: number) => void;
  onConfirmRemove: () => void;
  onCancelRemove: () => void;
}) {
  return (
    <section aria-label="Liens" className="space-y-3 border-t border-hub-line pt-3">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-hub-muted">Liens</h4>
      {props.rows.length === 0 ? (
        <p className="text-sm text-hub-muted">Aucun lien.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {props.rows.map((r) => (
            <li key={r.linkId} className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><span className="text-hub-muted">{r.label}</span> <strong>{r.otherCode}</strong> · {r.otherTitle} <span className="text-hub-muted">({r.otherStatus})</span></span>
                <button type="button" className={BUTTON_SECONDARY} disabled={props.busy} onClick={() => props.onAskRemove(r.linkId)}>Retirer</button>
              </div>
              {props.confirmRemove?.linkId === r.linkId && (
                <ConfirmBar message={props.confirmRemove.message} confirmLabel="Retirer le lien" busy={props.busy} onConfirm={props.onConfirmRemove} onCancel={props.onCancelRemove} />
              )}
            </li>
          ))}
        </ul>
      )}
      {props.options.length > 0 && (
        <form className="max-w-xl space-y-2" onSubmit={(e) => { e.preventDefault(); props.onAdd(); }}>
          <SelectField id="lk-option" label="Ajouter un lien" value={props.optionKey} options={props.options.map((o) => ({ value: o.key, label: o.label }))} onChange={props.onOption} />
          {props.candidates.length === 0 ? (
            <p className="text-sm text-hub-muted">Aucun élément disponible pour ce lien.</p>
          ) : (
            <SelectField id="lk-candidate" label="Avec" value={props.candidateId} options={[{ value: '', label: '— choisir —' }, ...props.candidates.map((c) => ({ value: String(c.id), label: c.label }))]} onChange={props.onCandidate} />
          )}
          <button type="submit" className={BUTTON_PRIMARY} disabled={props.busy || props.candidateId === ''}>Ajouter le lien</button>
        </form>
      )}
      {props.error && <p role="alert" className="text-sm text-hub-bad">{props.error}</p>}
    </section>
  );
}
