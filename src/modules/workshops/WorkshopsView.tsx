// Écran « Ateliers » (lot M7), versions d'affichage pures : elles reçoivent tout par propriétés.
// Le conteneur (WorkshopsScreen.tsx) les alimente. Le cadre de fiche, l'en-tête et l'écran « sans projet » viennent de shared/ui.tsx (décision D59).
import { DetailFrame, FormButtons, NoProjectView, RegisterHeader, StatusFilterBar, TextAreaField, TextField } from '../../shared/ui.tsx';
import type { DetailActions } from '../../shared/ui.tsx';
import { dayLabel } from '../../domain/decisions.ts';
import { statusLabel } from '../../domain/kinds.ts';
import { STATUS_FILTER_OPTIONS, STATUS_OPTIONS, emptyWorkshopsMessage } from './logic.ts';
import type { WorkshopForm, WorkshopFormErrors } from './logic.ts';

export { NoProjectView };

export interface WorkshopRow {
  id: number;
  code: string;
  title: string;
  description: string;
  status: string;
  held_on: string;
  place: string;
  objective: string;
  notes: string;
  follow_up: string;
}

export function WorkshopListView(props: { projectName: string; rows: WorkshopRow[]; total: number; filter: string; onFilter: (f: string) => void; onNew: () => void; onOpen: (id: number) => void }) {
  return (
    <div className="space-y-3">
      <RegisterHeader projectName={props.projectName} total={props.total} singular="atelier" plural="ateliers" newLabel="Nouvel atelier" onNew={props.onNew} />
      <StatusFilterBar options={STATUS_FILTER_OPTIONS} value={props.filter} onChange={props.onFilter} />
      {props.rows.length === 0 ? (
        <p className="text-sm text-hub-muted">{emptyWorkshopsMessage(props.total, props.filter)}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-hub-muted"><tr><th className="py-1 pr-3">Code</th><th className="pr-3">Titre</th><th className="pr-3">Date</th><th className="pr-3">Lieu ou format</th><th>Statut</th></tr></thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.id} className="border-t border-hub-line">
                <td className="py-1 pr-3 whitespace-nowrap">{r.code}</td>
                <td className="pr-3"><button type="button" className="text-left text-hub-accent underline" onClick={() => props.onOpen(r.id)}>{r.title}</button></td>
                <td className="pr-3 whitespace-nowrap">{dayLabel(r.held_on)}</td>
                <td className="pr-3">{r.place || '—'}</td>
                <td>{statusLabel(r.status, 'workshop')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function WorkshopDetailView(props: DetailActions & { row: WorkshopRow; onExportReport?: () => void }) {
  const r = props.row;
  return (
    <div className="space-y-3">
    <DetailFrame {...props} code={r.code} title={r.title} statusText={statusLabel(r.status, 'workshop')} statuses={STATUS_OPTIONS} current={r.status}>
      <dt className="text-hub-muted">Date</dt><dd>{dayLabel(r.held_on)}</dd>
      <dt className="text-hub-muted">Lieu ou format</dt><dd>{r.place || '—'}</dd>
      <dt className="text-hub-muted">Objectif</dt><dd className="whitespace-pre-wrap">{r.objective || '—'}</dd>
      <dt className="text-hub-muted">Description</dt><dd className="whitespace-pre-wrap">{r.description || '—'}</dd>
      <dt className="text-hub-muted">Notes</dt><dd className="whitespace-pre-wrap">{r.notes || '—'}</dd>
      <dt className="text-hub-muted">Points ouverts et actions</dt><dd className="whitespace-pre-wrap">{r.follow_up || '—'}</dd>
    </DetailFrame>
    {props.onExportReport && (
      <div>
        <button type="button" className="rounded border border-hub-line px-3 py-1 text-sm" onClick={props.onExportReport}>Exporter le compte rendu</button>
      </div>
    )}
    </div>
  );
}

export function WorkshopFormView(props: {
  heading: string; values: WorkshopForm; errors: WorkshopFormErrors; busy: boolean; error: string;
  onChange: (key: keyof WorkshopForm, value: string) => void; onSubmit: () => void; onCancel: () => void;
  askAbandon: boolean; onConfirmAbandon: () => void; onKeepEditing: () => void;
}) {
  const v = props.values;
  return (
    <form className="max-w-xl space-y-3" onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
      <h3 className="text-lg font-semibold">{props.heading}</h3>
      <TextField id="al-title" label="Titre" hint="Obligatoire, 200 caractères au plus." value={v.title} error={props.errors.title} onChange={(x) => props.onChange('title', x)} />
      <div className="grid grid-cols-2 gap-3">
        <TextField id="al-date" label="Date de l'atelier" type="date" hint="Facultative." value={v.heldOn} error={props.errors.heldOn} onChange={(x) => props.onChange('heldOn', x)} />
        <TextField id="al-place" label="Lieu ou format" hint="Salle, visio… 200 caractères au plus." value={v.place} error={props.errors.place} onChange={(x) => props.onChange('place', x)} />
      </div>
      <TextAreaField id="al-objective" label="Objectif" rows={3} hint="2 000 caractères au plus." value={v.objective} error={props.errors.objective} onChange={(x) => props.onChange('objective', x)} />
      <TextAreaField id="al-description" label="Description" rows={3} value={v.description} error={props.errors.description} onChange={(x) => props.onChange('description', x)} />
      <TextAreaField id="al-notes" label="Notes" rows={6} hint="Texte libre, 10 000 caractères au plus." value={v.notes} error={props.errors.notes} onChange={(x) => props.onChange('notes', x)} />
      <TextAreaField id="al-followup" label="Points ouverts et actions" rows={4} hint="Texte libre, non suivi ; 10 000 caractères au plus." value={v.followUp} error={props.errors.followUp} onChange={(x) => props.onChange('followUp', x)} />
      {props.error && <p role="alert" className="text-sm text-hub-bad">{props.error}</p>}
      <FormButtons busy={props.busy} askAbandon={props.askAbandon} onCancel={props.onCancel} onConfirmAbandon={props.onConfirmAbandon} onKeepEditing={props.onKeepEditing} />
    </form>
  );
}
