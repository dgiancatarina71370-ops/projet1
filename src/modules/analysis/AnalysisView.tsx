// Écrans « Besoins » et « Exigences » (lot M3b), versions d'affichage pures : elles reçoivent tout par propriétés.
// Les conteneurs (NeedsScreen.tsx, RequirementsScreen.tsx) les alimentent. Cette séparation permet de tester leur rendu sans interface réelle.
import { DetailFrame, FormButtons, NoProjectView, RegisterHeader, SelectField, StatusFilterBar, TextAreaField, TextField } from '../../shared/ui.tsx';
import type { DetailActions } from '../../shared/ui.tsx';
import { natureLabel, priorityLabel } from '../../domain/requirements.ts';
import { statusLabel } from '../../domain/kinds.ts';
import { NATURE_OPTIONS, PRIORITY_OPTIONS, STATUS_FILTER_OPTIONS, STATUS_OPTIONS, emptyNeedsMessage, emptyRequirementsMessage } from './logic.ts';
import type { NeedForm, NeedFormErrors, RequirementForm, RequirementFormErrors } from './logic.ts';

export interface NeedRow {
  id: number;
  code: string;
  title: string;
  description: string;
  status: string;
}

export interface RequirementRow extends NeedRow {
  nature: string;
  priority: string;
  criteria: string;
}

// Écran « sans projet actif » : commun à tous les registres (shared/ui.tsx, décision D59).
export { NoProjectView };

// ------------------------------------------------------------------ besoins

export function NeedListView(props: { projectName: string; rows: NeedRow[]; total: number; filter: string; onFilter: (f: string) => void; onNew: () => void; onOpen: (id: number) => void }) {
  return (
    <div className="space-y-3">
      <RegisterHeader projectName={props.projectName} total={props.total} singular="besoin" plural="besoins" newLabel="Nouveau besoin" onNew={props.onNew} />
      <StatusFilterBar options={STATUS_FILTER_OPTIONS} value={props.filter} onChange={props.onFilter} />
      {props.rows.length === 0 ? (
        <p className="text-sm text-hub-muted">{emptyNeedsMessage(props.total, props.filter)}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-hub-muted"><tr><th className="py-1 pr-3">Code</th><th className="pr-3">Titre</th><th>Statut</th></tr></thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.id} className="border-t border-hub-line">
                <td className="py-1 pr-3 whitespace-nowrap">{r.code}</td>
                <td className="pr-3"><button type="button" className="text-left text-hub-accent underline" onClick={() => props.onOpen(r.id)}>{r.title}</button></td>
                <td>{statusLabel(r.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export type DetailProps = DetailActions;

export function NeedDetailView(props: DetailProps & { row: NeedRow }) {
  const r = props.row;
  return (
    <DetailFrame {...props} code={r.code} title={r.title} statusText={statusLabel(r.status)} statuses={STATUS_OPTIONS} current={r.status}>
      <dt className="text-hub-muted">Description</dt><dd className="whitespace-pre-wrap">{r.description || '—'}</dd>
    </DetailFrame>
  );
}

export function NeedFormView(props: {
  heading: string; values: NeedForm; errors: NeedFormErrors; busy: boolean; error: string;
  onChange: (key: keyof NeedForm, value: string) => void; onSubmit: () => void; onCancel: () => void;
  askAbandon: boolean; onConfirmAbandon: () => void; onKeepEditing: () => void;
}) {
  return (
    <form className="max-w-xl space-y-3" onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
      <h3 className="text-lg font-semibold">{props.heading}</h3>
      <TextField id="nd-title" label="Titre" hint="Obligatoire, 200 caractères au plus." value={props.values.title} error={props.errors.title} onChange={(x) => props.onChange('title', x)} />
      <TextAreaField id="nd-description" label="Description" rows={5} value={props.values.description} error={props.errors.description} onChange={(x) => props.onChange('description', x)} />
      {props.error && <p role="alert" className="text-sm text-hub-bad">{props.error}</p>}
      <FormButtons busy={props.busy} askAbandon={props.askAbandon} onCancel={props.onCancel} onConfirmAbandon={props.onConfirmAbandon} onKeepEditing={props.onKeepEditing} />
    </form>
  );
}

// ------------------------------------------------------------------ exigences

export function RequirementListView(props: { projectName: string; rows: RequirementRow[]; total: number; filter: string; onFilter: (f: string) => void; onNew: () => void; onOpen: (id: number) => void }) {
  return (
    <div className="space-y-3">
      <RegisterHeader projectName={props.projectName} total={props.total} singular="exigence" plural="exigences" newLabel="Nouvelle exigence" onNew={props.onNew} />
      <StatusFilterBar options={STATUS_FILTER_OPTIONS} value={props.filter} onChange={props.onFilter} />
      {props.rows.length === 0 ? (
        <p className="text-sm text-hub-muted">{emptyRequirementsMessage(props.total, props.filter)}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-hub-muted"><tr><th className="py-1 pr-3">Code</th><th className="pr-3">Titre</th><th className="pr-3">Nature</th><th className="pr-3">Priorité</th><th>Statut</th></tr></thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.id} className="border-t border-hub-line">
                <td className="py-1 pr-3 whitespace-nowrap">{r.code}</td>
                <td className="pr-3"><button type="button" className="text-left text-hub-accent underline" onClick={() => props.onOpen(r.id)}>{r.title}</button></td>
                <td className="pr-3">{natureLabel(r.nature)}</td>
                <td className="pr-3">{priorityLabel(r.priority)}</td>
                <td>{statusLabel(r.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function RequirementDetailView(props: DetailProps & { row: RequirementRow }) {
  const r = props.row;
  return (
    <DetailFrame {...props} code={r.code} title={r.title} statusText={statusLabel(r.status)} statuses={STATUS_OPTIONS} current={r.status}>
      <dt className="text-hub-muted">Nature</dt><dd>{natureLabel(r.nature)}</dd>
      <dt className="text-hub-muted">Priorité</dt><dd>{priorityLabel(r.priority)}</dd>
      <dt className="text-hub-muted">Description</dt><dd className="whitespace-pre-wrap">{r.description || '—'}</dd>
      <dt className="text-hub-muted">Critères d'acceptation</dt><dd className="whitespace-pre-wrap">{r.criteria || '—'}</dd>
    </DetailFrame>
  );
}

export function RequirementFormView(props: {
  heading: string; values: RequirementForm; errors: RequirementFormErrors; busy: boolean; error: string;
  onChange: (key: keyof RequirementForm, value: string) => void; onSubmit: () => void; onCancel: () => void;
  askAbandon: boolean; onConfirmAbandon: () => void; onKeepEditing: () => void;
}) {
  const v = props.values;
  return (
    <form className="max-w-xl space-y-3" onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
      <h3 className="text-lg font-semibold">{props.heading}</h3>
      <TextField id="rq-title" label="Titre" hint="Obligatoire, 200 caractères au plus." value={v.title} error={props.errors.title} onChange={(x) => props.onChange('title', x)} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField id="rq-nature" label="Nature" value={v.nature} options={NATURE_OPTIONS} error={props.errors.nature} onChange={(x) => props.onChange('nature', x)} />
        <SelectField id="rq-priority" label="Priorité" value={v.priority} options={PRIORITY_OPTIONS} error={props.errors.priority} onChange={(x) => props.onChange('priority', x)} />
      </div>
      <TextAreaField id="rq-description" label="Description" rows={4} value={v.description} error={props.errors.description} onChange={(x) => props.onChange('description', x)} />
      <TextAreaField id="rq-criteria" label="Critères d'acceptation" rows={5} hint="Texte libre, 10 000 caractères au plus." value={v.criteria} error={props.errors.criteria} onChange={(x) => props.onChange('criteria', x)} />
      {props.error && <p role="alert" className="text-sm text-hub-bad">{props.error}</p>}
      <FormButtons busy={props.busy} askAbandon={props.askAbandon} onCancel={props.onCancel} onConfirmAbandon={props.onConfirmAbandon} onKeepEditing={props.onKeepEditing} />
    </form>
  );
}
