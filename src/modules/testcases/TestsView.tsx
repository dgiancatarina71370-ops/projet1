// Écran « Tests » (lot M5), versions d'affichage pures : elles reçoivent tout par propriétés.
// Le conteneur (TestsScreen.tsx) les alimente. Le cadre de fiche, l'en-tête et l'écran « sans projet » viennent de shared/ui.tsx (décision D59).
import { DetailFrame, FormButtons, NoProjectView, RegisterHeader, SelectField, StatusFilterBar, TextAreaField, TextField } from '../../shared/ui.tsx';
import type { DetailActions } from '../../shared/ui.tsx';
import { dayLabel } from '../../domain/decisions.ts';
import { statusLabel } from '../../domain/kinds.ts';
import { testTypeLabel } from '../../domain/testcases.ts';
import { STATUS_FILTER_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS, emptyTestsMessage } from './logic.ts';
import type { TestForm, TestFormErrors } from './logic.ts';

export { NoProjectView };

export interface TestRow {
  id: number;
  code: string;
  title: string;
  description: string;
  status: string;
  test_type: string;
  preconditions: string;
  steps: string;
  expected: string;
  last_run_on: string;
}

export function TestListView(props: { projectName: string; rows: TestRow[]; total: number; filter: string; onFilter: (f: string) => void; onNew: () => void; onOpen: (id: number) => void }) {
  return (
    <div className="space-y-3">
      <RegisterHeader projectName={props.projectName} total={props.total} singular="test" plural="tests" newLabel="Nouveau test" onNew={props.onNew} />
      <StatusFilterBar options={STATUS_FILTER_OPTIONS} value={props.filter} onChange={props.onFilter} />
      {props.rows.length === 0 ? (
        <p className="text-sm text-hub-muted">{emptyTestsMessage(props.total, props.filter)}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-hub-muted"><tr><th className="py-1 pr-3">Code</th><th className="pr-3">Titre</th><th className="pr-3">Type</th><th className="pr-3">Dernière exécution</th><th>Statut</th></tr></thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.id} className="border-t border-hub-line">
                <td className="py-1 pr-3 whitespace-nowrap">{r.code}</td>
                <td className="pr-3"><button type="button" className="text-left text-hub-accent underline" onClick={() => props.onOpen(r.id)}>{r.title}</button></td>
                <td className="pr-3">{testTypeLabel(r.test_type)}</td>
                <td className="pr-3 whitespace-nowrap">{dayLabel(r.last_run_on)}</td>
                <td>{statusLabel(r.status, 'test')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function TestDetailView(props: DetailActions & { row: TestRow }) {
  const r = props.row;
  return (
    <DetailFrame {...props} code={r.code} title={r.title} statusText={statusLabel(r.status, 'test')} statuses={STATUS_OPTIONS} current={r.status}>
      <dt className="text-hub-muted">Type</dt><dd>{testTypeLabel(r.test_type)}</dd>
      <dt className="text-hub-muted">Dernière exécution</dt><dd>{dayLabel(r.last_run_on)}</dd>
      <dt className="text-hub-muted">Description</dt><dd className="whitespace-pre-wrap">{r.description || '—'}</dd>
      <dt className="text-hub-muted">Préconditions</dt><dd className="whitespace-pre-wrap">{r.preconditions || '—'}</dd>
      <dt className="text-hub-muted">Étapes</dt><dd className="whitespace-pre-wrap">{r.steps || '—'}</dd>
      <dt className="text-hub-muted">Résultat attendu</dt><dd className="whitespace-pre-wrap">{r.expected || '—'}</dd>
    </DetailFrame>
  );
}

export function TestFormView(props: {
  heading: string; values: TestForm; errors: TestFormErrors; busy: boolean; error: string;
  onChange: (key: keyof TestForm, value: string) => void; onSubmit: () => void; onCancel: () => void;
  askAbandon: boolean; onConfirmAbandon: () => void; onKeepEditing: () => void;
}) {
  const v = props.values;
  return (
    <form className="max-w-xl space-y-3" onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>
      <h3 className="text-lg font-semibold">{props.heading}</h3>
      <TextField id="ts-title" label="Titre" hint="Obligatoire, 200 caractères au plus." value={v.title} error={props.errors.title} onChange={(x) => props.onChange('title', x)} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField id="ts-type" label="Type" value={v.testType} options={TYPE_OPTIONS} error={props.errors.testType} onChange={(x) => props.onChange('testType', x)} />
        <TextField id="ts-lastrun" label="Dernière exécution" type="date" hint="Facultative." value={v.lastRunOn} error={props.errors.lastRunOn} onChange={(x) => props.onChange('lastRunOn', x)} />
      </div>
      <TextAreaField id="ts-description" label="Description" rows={3} value={v.description} error={props.errors.description} onChange={(x) => props.onChange('description', x)} />
      <TextAreaField id="ts-preconditions" label="Préconditions" rows={3} hint="Texte libre, 10 000 caractères au plus." value={v.preconditions} error={props.errors.preconditions} onChange={(x) => props.onChange('preconditions', x)} />
      <TextAreaField id="ts-steps" label="Étapes" rows={4} hint="Texte libre, 10 000 caractères au plus." value={v.steps} error={props.errors.steps} onChange={(x) => props.onChange('steps', x)} />
      <TextAreaField id="ts-expected" label="Résultat attendu" rows={3} hint="Texte libre, 10 000 caractères au plus." value={v.expected} error={props.errors.expected} onChange={(x) => props.onChange('expected', x)} />
      {props.error && <p role="alert" className="text-sm text-hub-bad">{props.error}</p>}
      <FormButtons busy={props.busy} askAbandon={props.askAbandon} onCancel={props.onCancel} onConfirmAbandon={props.onConfirmAbandon} onKeepEditing={props.onKeepEditing} />
    </form>
  );
}
