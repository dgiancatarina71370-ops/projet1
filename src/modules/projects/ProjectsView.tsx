// Écran « Projets » (lot M3a), version d'affichage pure.
import { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_SECONDARY, ConfirmBar, Field, INPUT_CLASS } from '../../shared/ui.tsx';
import { kindLabel } from './logic.ts';

export interface ProjectRow {
  id: number;
  parent_id: number | null;
  kind: string;
  name: string;
}

export function ProjectsView(props: {
  rows: ProjectRow[];
  activeId: number | null;
  newName: string;
  newError: string;
  renamingId: number | null;
  renameValue: string;
  renameError: string;
  confirmDelete: { id: number; message: string } | null;
  busy: boolean;
  error: string;
  onNewName: (v: string) => void;
  onCreate: () => void;
  onActivate: (id: number) => void;
  onStartRename: (id: number) => void;
  onRenameValue: (v: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onAskDelete: (id: number) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <div className="space-y-4">
      <form className="max-w-xl" onSubmit={(e) => { e.preventDefault(); props.onCreate(); }}>
        <Field label="Nouveau projet" htmlFor="pr-new" error={props.newError} hint="Donnez-lui un nom (200 caractères au plus).">
          <div className="flex gap-2">
            <input id="pr-new" className={INPUT_CLASS} value={props.newName} onChange={(e) => props.onNewName(e.target.value)} />
            <button type="submit" className={BUTTON_PRIMARY} disabled={props.busy}>Créer</button>
          </div>
        </Field>
      </form>
      {props.error && <p role="alert" className="text-sm text-hub-bad">{props.error}</p>}
      {props.rows.length === 0 ? (
        <p className="text-sm text-hub-muted">Aucun projet. Créez le premier avec le formulaire ci-dessus.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {props.rows.map((p) => (
            <li key={p.id} className="space-y-2 rounded border border-hub-line px-3 py-2">
              {props.renamingId === p.id ? (
                <form className="flex flex-wrap items-start gap-2" onSubmit={(e) => { e.preventDefault(); props.onSaveRename(); }}>
                  <div className="min-w-[16rem] flex-1">
                    <Field label={`Nouveau nom de « ${p.name} »`} htmlFor={`pr-rename-${p.id}`} error={props.renameError}>
                      <input id={`pr-rename-${p.id}`} className={INPUT_CLASS} value={props.renameValue} onChange={(e) => props.onRenameValue(e.target.value)} />
                    </Field>
                  </div>
                  <button type="submit" className={`${BUTTON_PRIMARY} mt-6`} disabled={props.busy}>Enregistrer</button>
                  <button type="button" className={`${BUTTON_SECONDARY} mt-6`} disabled={props.busy} onClick={props.onCancelRename}>Annuler</button>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="text-hub-muted">{kindLabel(p.kind)} · </span>{p.name}
                    {p.id === props.activeId && <span className="ml-2 rounded border border-hub-accent px-1.5 text-xs text-hub-accent">actif</span>}
                  </span>
                  <span className="flex gap-2">
                    {p.kind === 'project' && p.id !== props.activeId && (
                      <button type="button" className={BUTTON_SECONDARY} disabled={props.busy} onClick={() => props.onActivate(p.id)}>Activer</button>
                    )}
                    <button type="button" className={BUTTON_SECONDARY} disabled={props.busy} onClick={() => props.onStartRename(p.id)}>Renommer</button>
                    <button type="button" className={BUTTON_DANGER} disabled={props.busy} onClick={() => props.onAskDelete(p.id)}>Supprimer…</button>
                  </span>
                </div>
              )}
              {props.confirmDelete?.id === p.id && (
                <ConfirmBar message={props.confirmDelete.message} confirmLabel="Supprimer définitivement" busy={props.busy} onConfirm={props.onConfirmDelete} onCancel={props.onCancelDelete} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
