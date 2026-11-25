// Écran « Tests » (lot M5) : point d'entrée unique du registre. Même mécanique que les écrans précédents, avec les champs propres du test.
import { useCallback, useEffect, useState } from 'react';
import { changeItemStatus, deleteItem } from '../../data/repositories/items.ts';
import { createTestCase, listTestCases, updateTestCase } from '../../data/repositories/testcases.ts';
import type { TestCase } from '../../data/repositories/testcases.ts';
import { linksOfItem } from '../../data/repositories/links.ts';
import { Card } from '../../shared/ui.tsx';
import type { LinksSlot } from '../../shared/ui.tsx';
import { deletionMessage, filterByStatus, isDirty } from '../../shared/register-logic.ts';
import { NoProjectView, TestDetailView, TestFormView, TestListView } from './TestsView.tsx';
import { EMPTY_TEST_FORM, validateTestForm } from './logic.ts';
import type { TestForm, TestFormErrors } from './logic.ts';

type Mode = { kind: 'list' } | { kind: 'detail'; id: number } | { kind: 'form'; id: number | null };

export function TestsScreen(props: { projectId: number | null; projectName: string; onGoToProjects: () => void; onChanged: () => void; renderLinks?: LinksSlot }) {
  const { projectId } = props;
  const [rows, setRows] = useState<TestCase[]>([]);
  const [filter, setFilter] = useState('all');
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [values, setValues] = useState<TestForm>(EMPTY_TEST_FORM);
  const [initial, setInitial] = useState<TestForm>(EMPTY_TEST_FORM);
  const [errors, setErrors] = useState<TestFormErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [askAbandon, setAskAbandon] = useState(false);

  const reload = useCallback(async () => {
    if (projectId === null) { setRows([]); return; }
    try {
      setRows(await listTestCases(projectId));
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [projectId]);

  // Changer de projet ramène à la liste : une fiche ouverte appartient à l'ancien projet.
  useEffect(() => {
    setMode({ kind: 'list' });
    setConfirmDelete(null);
    setError('');
    void reload();
  }, [reload]);

  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await reload();
      props.onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (projectId === null) return <Card title="Tests"><NoProjectView what="Les tests" onGoToProjects={props.onGoToProjects} /></Card>;

  const current = mode.kind === 'detail' ? rows.find((r) => r.id === mode.id) ?? null : null;
  const openForm = (row: TestCase | null) => {
    const start: TestForm = row ? { title: row.title, description: row.description, testType: row.test_type, preconditions: row.preconditions, steps: row.steps, expected: row.expected, lastRunOn: row.last_run_on } : EMPTY_TEST_FORM;
    setValues(start);
    setInitial(start);
    setErrors({});
    setError('');
    setAskAbandon(false);
    setMode({ kind: 'form', id: row ? row.id : null });
  };
  const leaveForm = () => {
    setAskAbandon(false);
    setMode(mode.kind === 'form' && mode.id !== null ? { kind: 'detail', id: mode.id } : { kind: 'list' });
  };
  const cancelForm = () => {
    if (isDirty(initial, values)) setAskAbandon(true);
    else leaveForm();
  };
  const submit = async () => {
    const r = validateTestForm(values);
    if (!r.ok) { setErrors(r.errors); return; }
    setErrors({});
    if (mode.kind !== 'form') return;
    const id = mode.id;
    let savedId: number | null = id;
    const ok = await run(async () => {
      if (id === null) savedId = (await createTestCase({ projectId, title: r.title, description: r.description, ...r.fields })).id;
      else await updateTestCase(id, { title: r.title, description: r.description, fields: r.fields });
    });
    if (ok && savedId !== null) setMode({ kind: 'detail', id: savedId });
  };

  return (
    <Card title="Tests">
      {loadError && <p role="alert" className="mb-2 text-sm text-hub-bad">{loadError}</p>}
      {mode.kind === 'list' && (
        <TestListView
          projectName={props.projectName}
          rows={filterByStatus(rows, filter)}
          total={rows.length}
          filter={filter}
          onFilter={setFilter}
          onNew={() => openForm(null)}
          onOpen={(id) => { setConfirmDelete(null); setError(''); setMode({ kind: 'detail', id }); }}
        />
      )}
      {mode.kind === 'detail' && current && (
        <div className="space-y-4">
          <TestDetailView
            row={current}
            busy={busy}
            error={error}
            confirmDelete={confirmDelete}
            onEdit={() => openForm(current)}
            onChangeStatus={(s) => void run(() => changeItemStatus(current.id, s))}
            onAskDelete={async () => {
              try {
                setConfirmDelete(deletionMessage(current.code, current.title, (await linksOfItem(current.id)).length));
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
            onConfirmDelete={async () => {
              if (await run(() => deleteItem(current.id))) { setConfirmDelete(null); setMode({ kind: 'list' }); }
            }}
            onCancelDelete={() => setConfirmDelete(null)}
            onBack={() => { setConfirmDelete(null); setMode({ kind: 'list' }); }}
          />
          {props.renderLinks?.(current.id, 'test')}
        </div>
      )}
      {mode.kind === 'detail' && !current && (
        <div className="space-y-2 text-sm">
          <p>Ce test n'existe plus.</p>
          <button type="button" className="text-hub-accent underline" onClick={() => setMode({ kind: 'list' })}>← Retour à la liste</button>
        </div>
      )}
      {mode.kind === 'form' && (
        <TestFormView
          heading={mode.id === null ? 'Nouveau test' : 'Modifier le test'}
          values={values}
          errors={errors}
          busy={busy}
          error={error}
          onChange={(k, v) => setValues((old) => ({ ...old, [k]: v }))}
          onSubmit={() => void submit()}
          onCancel={cancelForm}
          askAbandon={askAbandon}
          onConfirmAbandon={leaveForm}
          onKeepEditing={() => setAskAbandon(false)}
        />
      )}
    </Card>
  );
}
