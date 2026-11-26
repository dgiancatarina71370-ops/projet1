// Écran « Ateliers » (lot M7) : point d'entrée unique du registre. Même mécanique que les écrans précédents, avec les champs propres de l'atelier.
import { useCallback, useEffect, useState } from 'react';
import { changeItemStatus, deleteItem } from '../../data/repositories/items.ts';
import { createWorkshop, listWorkshops, updateWorkshop } from '../../data/repositories/workshops.ts';
import type { Workshop } from '../../data/repositories/workshops.ts';
import { linksOfItem } from '../../data/repositories/links.ts';
import { useOpenRequest } from '../../shared/use-open-request.ts';
import { Card } from '../../shared/ui.tsx';
import type { LinksSlot } from '../../shared/ui.tsx';
import { deletionMessage, filterByStatus, isDirty } from '../../shared/register-logic.ts';
import { WorkshopDetailView, WorkshopFormView, WorkshopListView, NoProjectView } from './WorkshopsView.tsx';
import { EMPTY_WORKSHOP_FORM, validateWorkshopForm } from './logic.ts';
import type { WorkshopForm, WorkshopFormErrors } from './logic.ts';

type Mode = { kind: 'list' } | { kind: 'detail'; id: number } | { kind: 'form'; id: number | null };

export function WorkshopsScreen(props: { projectId: number | null; projectName: string; onGoToProjects: () => void; onChanged: () => void; renderLinks?: LinksSlot; openId?: number | null; onOpenHandled?: () => void; onExportReport?: (workshopId: number) => void }) {
  const { projectId } = props;
  const [rows, setRows] = useState<Workshop[]>([]);
  const [filter, setFilter] = useState('all');
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [values, setValues] = useState<WorkshopForm>(EMPTY_WORKSHOP_FORM);
  const [initial, setInitial] = useState<WorkshopForm>(EMPTY_WORKSHOP_FORM);
  const [errors, setErrors] = useState<WorkshopFormErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [askAbandon, setAskAbandon] = useState(false);

  const reload = useCallback(async () => {
    if (projectId === null) { setRows([]); return; }
    try {
      setRows(await listWorkshops(projectId));
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

  // Ouverture demandée depuis la traçabilité (D76) : fiche ouverte dès que la liste est chargée.
  useOpenRequest(props.openId, rows.map((r) => r.id), (id) => { setConfirmDelete(null); setError(''); setMode({ kind: 'detail', id }); }, props.onOpenHandled);

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

  if (projectId === null) return <Card title="Ateliers"><NoProjectView what="Les ateliers" onGoToProjects={props.onGoToProjects} /></Card>;

  const current = mode.kind === 'detail' ? rows.find((r) => r.id === mode.id) ?? null : null;
  const openForm = (row: Workshop | null) => {
    const start: WorkshopForm = row ? { title: row.title, description: row.description, heldOn: row.held_on, place: row.place, objective: row.objective, notes: row.notes, followUp: row.follow_up } : EMPTY_WORKSHOP_FORM;
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
    const r = validateWorkshopForm(values);
    if (!r.ok) { setErrors(r.errors); return; }
    setErrors({});
    if (mode.kind !== 'form') return;
    const id = mode.id;
    let savedId: number | null = id;
    const ok = await run(async () => {
      if (id === null) savedId = (await createWorkshop({ projectId, title: r.title, description: r.description, ...r.fields })).id;
      else await updateWorkshop(id, { title: r.title, description: r.description, fields: r.fields });
    });
    if (ok && savedId !== null) setMode({ kind: 'detail', id: savedId });
  };

  return (
    <Card title="Ateliers">
      {loadError && <p role="alert" className="mb-2 text-sm text-hub-bad">{loadError}</p>}
      {mode.kind === 'list' && (
        <WorkshopListView
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
          <WorkshopDetailView
            row={current}
            onExportReport={props.onExportReport ? () => props.onExportReport?.(current.id) : undefined}
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
          {props.renderLinks?.(current.id, 'workshop')}
        </div>
      )}
      {mode.kind === 'detail' && !current && (
        <div className="space-y-2 text-sm">
          <p>Cet atelier n'existe plus.</p>
          <button type="button" className="text-hub-accent underline" onClick={() => setMode({ kind: 'list' })}>← Retour à la liste</button>
        </div>
      )}
      {mode.kind === 'form' && (
        <WorkshopFormView
          heading={mode.id === null ? 'Nouvel atelier' : 'Modifier l\'atelier'}
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
