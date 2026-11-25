// Écran « Décisions » (lot M4), versions d'affichage pures : elles reçoivent tout par propriétés.
// Le conteneur (DecisionsScreen.tsx) les alimente. Le cadre de fiche, l'en-tête et l'écran « sans projet » viennent de shared/ui.tsx (décision D59).
import { DetailFrame, FormButtons, NoProjectView, RegisterHeader, StatusFilterBar, TextAreaField, TextField } from '../../shared/ui.tsx';
import type { DetailActions } from '../../shared/ui.tsx';
import { decisionDateLabel } from '../../domain/decisions.ts';
import { statusLabel } from '../../domain/kinds.ts';
import { STATUS_FILTER_OPTIONS, STATUS_OPTIONS, emptyDecisionsMessage } from './logic.ts';
import type { DecisionForm, DecisionFormErrors } from './logic.ts';

export { NoProjectView };

export interface DecisionRow {
  id: number;
  code: string;
  title: string;
  description: string;
  status: string;
  decided_on: string;
  decider: string;
  alternatives: string;
  rationale: string;
}

export function DecisionListView(props: { projectName: string; rows: DecisionRow[]; total: number; filter: string; onFilter: (f: string) => void; onNew: () => void; onOpen: (id: number) => void }) {
  return (
    <div className="space-y-3">
      <RegisterHeader projectName={props.projectName} total={props.total} singular="décision" plural="décisions" newLabel="Nouvelle décision" onNew={props.onNew} />
      <StatusFilterBar options={STATUS_FILTER_OPTIONS} value={props.filter} onChange={props.onFilter} />
      {props.rows.length === 0 ? (
        <p className="text-sm text-hub-muted">{emptyDecisionsMessage(props.total, props.filter)}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-hub-muted"><tr><th className="py-1 pr-3">Code</th><th className="pr-3">Titre</th><th className="pr-3">Date</th><th className="pr-3">Décideur</th><th>Statut</th></tr></thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.id} className="border-t border-hub-line">
                <td className="py-1 pr-3 whitespace-nowrap">{r.code}</td>
                <td className="pr-3"><button type="button" className="text-left text-hub-accent underline" onClick={() => props.onOpen(r.id)}>{r.title}</button></td>
                <td className="pr-3 whitespace-nowrap">{decisionDateLabel(r.decided_on)}</td>
                <td className="pr-3">{r.decider || '—'}</td>
                <td>{statusLabel(r.status, 'decision')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function DecisionDetailView(props: DetailActions & { row: DecisionRow }) {
  const r = props.row;
  return (
    <DetailFrame {...props} code={r.code} title={r.title} statusText={statusLabel(r.status, 'decision')} statuses={STATUS_OPTIONS} current={r.status}>
      <dt className="text-hub-muted">Date</dt><dd>{decisionDateLabel(r.decided_on)}</dd>
      <dt className="text-hub-muted">Décideur</dt><dd>{r.decider || '—'}</dd>
      <dt className="text-hub-muted">Contexte</dt><dd className="whitespace-pre-wrap">{r.description || '—'}</dd>
      <dt className="text-hub-muted">Alternatives envisagées</dt><dd className="whitespace-pre-wrap">{r.alternatives || '—'}</dd>
      <dt className="text-hub-muted">Justification</dt><dd className="whitespace-pre-wrap">{r.rationale || '—'}</dd>
    </DetailFrame>
  );
}

export function DecisionFormView(props: {
  heading: string; values: DecisionForm; errors: DecisionFormErrors; busy: boolean; error: string;
  onChange: (key: keyof DecisionForm, value: string) => void; onSubmit: () => void; onCancel: () => void;
  askAbandon: boolean; onConfirmAbandon: () => void; onKeepEditing: () => void;
}) {
  const v = props.values;
  return (
    <form className="max-w-xl space-y-3" onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
      <h3 className="text-lg font-semibold">{props.heading}</h3>
      <TextField id="dc-title" label="Titre" hint="Obligatoire, 200 caractères au plus." value={v.title} error={props.errors.title} onChange={(x) => props.onChange('title', x)} />
      <div className="grid grid-cols-2 gap-3">
        <TextField id="dc-date" label="Date de la décision" type="date" hint="Facultative." value={v.decidedOn} error={props.errors.decidedOn} onChange={(x) => props.onChange('decidedOn', x)} />
        <TextField id="dc-decider" label="Décideur" hint="Texte libre, 200 caractères au plus." value={v.decider} error={props.errors.decider} onChange={(x) => props.onChange('decider', x)} />
      </div>
      <TextAreaField id="dc-description" label="Contexte" rows={4} value={v.description} error={props.errors.description} onChange={(x) => props.onChange('description', x)} />
      <TextAreaField id="dc-alternatives" label="Alternatives envisagées" rows={4} hint="Texte libre, 10 000 caractères au plus." value={v.alternatives} error={props.errors.alternatives} onChange={(x) => props.onChange('alternatives', x)} />
      <TextAreaField id="dc-rationale" label="Justification" rows={4} hint="Texte libre, 10 000 caractères au plus." value={v.rationale} error={props.errors.rationale} onChange={(x) => props.onChange('rationale', x)} />
      {props.error && <p role="alert" className="text-sm text-hub-bad">{props.error}</p>}
      <FormButtons busy={props.busy} askAbandon={props.askAbandon} onCancel={props.onCancel} onConfirmAbandon={props.onConfirmAbandon} onKeepEditing={props.onKeepEditing} />
    </form>
  );
}
