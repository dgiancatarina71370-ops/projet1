// Écran « User stories » (lot M5), versions d'affichage pures : elles reçoivent tout par propriétés.
// Le conteneur (StoriesScreen.tsx) les alimente. Le cadre de fiche, l'en-tête et l'écran « sans projet » viennent de shared/ui.tsx (décision D59).
import { DetailFrame, FormButtons, NoProjectView, RegisterHeader, StatusFilterBar, TextAreaField, TextField } from '../../shared/ui.tsx';
import type { DetailActions } from '../../shared/ui.tsx';
import { statusLabel } from '../../domain/kinds.ts';
import { STATUS_FILTER_OPTIONS, STATUS_OPTIONS, emptyStoriesMessage } from './logic.ts';
import type { StoryForm, StoryFormErrors } from './logic.ts';

export { NoProjectView };

export interface StoryRow {
  id: number;
  code: string;
  title: string;
  description: string;
  status: string;
  role: string;
  goal: string;
  benefit: string;
  criteria: string;
}

export function StoryListView(props: { projectName: string; rows: StoryRow[]; total: number; filter: string; onFilter: (f: string) => void; onNew: () => void; onOpen: (id: number) => void }) {
  return (
    <div className="space-y-3">
      <RegisterHeader projectName={props.projectName} total={props.total} singular="user story" plural="user stories" newLabel="Nouvelle user story" onNew={props.onNew} />
      <StatusFilterBar options={STATUS_FILTER_OPTIONS} value={props.filter} onChange={props.onFilter} />
      {props.rows.length === 0 ? (
        <p className="text-sm text-hub-muted">{emptyStoriesMessage(props.total, props.filter)}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-hub-muted"><tr><th className="py-1 pr-3">Code</th><th className="pr-3">Titre</th><th className="pr-3">En tant que</th><th>Statut</th></tr></thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.id} className="border-t border-hub-line">
                <td className="py-1 pr-3 whitespace-nowrap">{r.code}</td>
                <td className="pr-3"><button type="button" className="text-left text-hub-accent underline" onClick={() => props.onOpen(r.id)}>{r.title}</button></td>
                <td className="pr-3">{r.role || '—'}</td>
                <td>{statusLabel(r.status, 'story')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function StoryDetailView(props: DetailActions & { row: StoryRow }) {
  const r = props.row;
  return (
    <DetailFrame {...props} code={r.code} title={r.title} statusText={statusLabel(r.status, 'story')} statuses={STATUS_OPTIONS} current={r.status}>
      <dt className="text-hub-muted">En tant que</dt><dd>{r.role || '—'}</dd>
      <dt className="text-hub-muted">Je veux</dt><dd className="whitespace-pre-wrap">{r.goal || '—'}</dd>
      <dt className="text-hub-muted">Afin de</dt><dd className="whitespace-pre-wrap">{r.benefit || '—'}</dd>
      <dt className="text-hub-muted">Description</dt><dd className="whitespace-pre-wrap">{r.description || '—'}</dd>
      <dt className="text-hub-muted">Critères d'acceptation</dt><dd className="whitespace-pre-wrap">{r.criteria || '—'}</dd>
    </DetailFrame>
  );
}

export function StoryFormView(props: {
  heading: string; values: StoryForm; errors: StoryFormErrors; busy: boolean; error: string;
  onChange: (key: keyof StoryForm, value: string) => void; onSubmit: () => void; onCancel: () => void;
  askAbandon: boolean; onConfirmAbandon: () => void; onKeepEditing: () => void;
}) {
  const v = props.values;
  return (
    <form className="max-w-xl space-y-3" onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
      <h3 className="text-lg font-semibold">{props.heading}</h3>
      <TextField id="us-title" label="Titre" hint="Obligatoire, 200 caractères au plus." value={v.title} error={props.errors.title} onChange={(x) => props.onChange('title', x)} />
      <TextField id="us-role" label="En tant que" hint="Le rôle concerné, 200 caractères au plus." value={v.role} error={props.errors.role} onChange={(x) => props.onChange('role', x)} />
      <TextAreaField id="us-goal" label="Je veux" rows={3} hint="2 000 caractères au plus." value={v.goal} error={props.errors.goal} onChange={(x) => props.onChange('goal', x)} />
      <TextAreaField id="us-benefit" label="Afin de" rows={3} hint="2 000 caractères au plus." value={v.benefit} error={props.errors.benefit} onChange={(x) => props.onChange('benefit', x)} />
      <TextAreaField id="us-description" label="Description" rows={3} value={v.description} error={props.errors.description} onChange={(x) => props.onChange('description', x)} />
      <TextAreaField id="us-criteria" label="Critères d'acceptation" rows={5} hint="Texte libre, 10 000 caractères au plus." value={v.criteria} error={props.errors.criteria} onChange={(x) => props.onChange('criteria', x)} />
      {props.error && <p role="alert" className="text-sm text-hub-bad">{props.error}</p>}
      <FormButtons busy={props.busy} askAbandon={props.askAbandon} onCancel={props.onCancel} onConfirmAbandon={props.onConfirmAbandon} onKeepEditing={props.onKeepEditing} />
    </form>
  );
}
