// Écran « Risques » (lot M4), versions d'affichage pures : elles reçoivent tout par propriétés.
// Le conteneur (RisksScreen.tsx) les alimente. Le cadre de fiche, l'en-tête et l'écran « sans projet » viennent de shared/ui.tsx (décision D59).
import { DetailFrame, EmptyListNotice, FormButtons, ListControls, NoProjectView, RegisterHeader, SelectField, TextAreaField, TextField } from '../../shared/ui.tsx';
import type { DetailActions, ListExtras } from '../../shared/ui.tsx';
import { statusLabel } from '../../domain/kinds.ts';
import { levelLabel } from '../../domain/stakeholders.ts';
import { LEVEL_OPTIONS, STATUS_FILTER_OPTIONS, STATUS_OPTIONS, emptyRisksMessage } from './logic.ts';
import type { RiskForm, RiskFormErrors } from './logic.ts';

export { NoProjectView };

export interface RiskRow {
  id: number;
  code: string;
  title: string;
  description: string;
  status: string;
  probability: string;
  impact: string;
  mitigation: string;
  owner: string;
}

export function RiskListView(props: { projectName: string; rows: RiskRow[]; total: number; filter: string; onFilter: (f: string) => void; onNew: () => void; onOpen: (id: number) => void } & ListExtras) {
  return (
    <div className="space-y-3">
      <RegisterHeader projectName={props.projectName} total={props.total} singular="risque" plural="risques" newLabel="Nouveau risque" onNew={props.onNew} />
      <ListControls options={STATUS_FILTER_OPTIONS} filter={props.filter} onFilter={props.onFilter} counts={props.counts} query={props.query} onQuery={props.onQuery} sort={props.sort} onSort={props.onSort} />
      {props.rows.length === 0 ? (
        <EmptyListNotice query={props.query} total={props.total} filter={props.filter} options={STATUS_FILTER_OPTIONS} fallback={emptyRisksMessage(props.total, props.filter)} />
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-hub-muted"><tr><th className="py-1 pr-3">Code</th><th className="pr-3">Titre</th><th className="pr-3">Probabilité</th><th className="pr-3">Impact</th><th>Statut</th></tr></thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.id} className="border-t border-hub-line">
                <td className="py-1 pr-3 whitespace-nowrap">{r.code}</td>
                <td className="pr-3"><button type="button" className="text-left text-hub-accent underline" onClick={() => props.onOpen(r.id)}>{r.title}</button></td>
                <td className="pr-3">{levelLabel(r.probability)}</td>
                <td className="pr-3">{levelLabel(r.impact)}</td>
                <td>{statusLabel(r.status, 'risk')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function RiskDetailView(props: DetailActions & { row: RiskRow }) {
  const r = props.row;
  return (
    <DetailFrame {...props} code={r.code} title={r.title} statusText={statusLabel(r.status, 'risk')} statuses={STATUS_OPTIONS} current={r.status}>
      <dt className="text-hub-muted">Probabilité</dt><dd>{levelLabel(r.probability)}</dd>
      <dt className="text-hub-muted">Impact</dt><dd>{levelLabel(r.impact)}</dd>
      <dt className="text-hub-muted">Responsable</dt><dd>{r.owner || '—'}</dd>
      <dt className="text-hub-muted">Description</dt><dd className="whitespace-pre-wrap">{r.description || '—'}</dd>
      <dt className="text-hub-muted">Plan de traitement</dt><dd className="whitespace-pre-wrap">{r.mitigation || '—'}</dd>
    </DetailFrame>
  );
}

export function RiskFormView(props: {
  heading: string; values: RiskForm; errors: RiskFormErrors; busy: boolean; error: string;
  onChange: (key: keyof RiskForm, value: string) => void; onSubmit: () => void; onCancel: () => void;
  askAbandon: boolean; onConfirmAbandon: () => void; onKeepEditing: () => void;
}) {
  const v = props.values;
  return (
    <form className="max-w-xl space-y-3" onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
      <h3 className="text-lg font-semibold">{props.heading}</h3>
      <TextField id="rk-title" label="Titre" hint="Obligatoire, 200 caractères au plus." value={v.title} error={props.errors.title} onChange={(x) => props.onChange('title', x)} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField id="rk-probability" label="Probabilité" value={v.probability} options={LEVEL_OPTIONS} error={props.errors.probability} onChange={(x) => props.onChange('probability', x)} />
        <SelectField id="rk-impact" label="Impact" value={v.impact} options={LEVEL_OPTIONS} error={props.errors.impact} onChange={(x) => props.onChange('impact', x)} />
      </div>
      <TextField id="rk-owner" label="Responsable" hint="Texte libre, 200 caractères au plus." value={v.owner} error={props.errors.owner} onChange={(x) => props.onChange('owner', x)} />
      <TextAreaField id="rk-description" label="Description" rows={4} value={v.description} error={props.errors.description} onChange={(x) => props.onChange('description', x)} />
      <TextAreaField id="rk-mitigation" label="Plan de traitement" rows={4} hint="Texte libre, 10 000 caractères au plus." value={v.mitigation} error={props.errors.mitigation} onChange={(x) => props.onChange('mitigation', x)} />
      {props.error && <p role="alert" className="text-sm text-hub-bad">{props.error}</p>}
      <FormButtons busy={props.busy} askAbandon={props.askAbandon} onCancel={props.onCancel} onConfirmAbandon={props.onConfirmAbandon} onKeepEditing={props.onKeepEditing} />
    </form>
  );
}
