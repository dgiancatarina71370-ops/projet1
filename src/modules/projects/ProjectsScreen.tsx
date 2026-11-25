// Écran « Projets » (lot M3a, décisions D34 et D41) : création avec un nom saisi, renommage, activation, suppression annoncée.
import { useState } from 'react';
import { createProject, deleteProject, projectDeletionImpact, renameProject } from '../../data/repositories/projects.ts';
import type { Project } from '../../data/repositories/projects.ts';
import { Card } from '../../shared/ui.tsx';
import { ProjectsView } from './ProjectsView.tsx';
import { projectDeletionMessage, validateName } from './logic.ts';

export function ProjectsScreen(props: {
  projects: Project[];
  activeId: number | null;
  /** Appelé après toute écriture ; `activate` demande de rendre ce projet actif (celui qu'on vient de créer). */
  onChanged: (activate?: number) => Promise<void>;
  onActivate: (id: number) => Promise<void>;
}) {
  const [newName, setNewName] = useState('');
  const [newError, setNewError] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError('');
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Projets">
      <ProjectsView
        rows={props.projects}
        activeId={props.activeId}
        newName={newName}
        newError={newError}
        renamingId={renamingId}
        renameValue={renameValue}
        renameError={renameError}
        confirmDelete={confirmDelete}
        busy={busy}
        error={error}
        onNewName={(v) => { setNewName(v); setNewError(''); }}
        onCreate={async () => {
          const msg = validateName(newName);
          if (msg) { setNewError(msg); return; }
          let id = 0;
          if (await run(async () => { id = await createProject(newName); })) {
            setNewName('');
            await props.onChanged(id);
          }
        }}
        onActivate={(id) => void run(() => props.onActivate(id))}
        onStartRename={(id) => {
          const p = props.projects.find((x) => x.id === id);
          setRenamingId(id);
          setRenameValue(p ? p.name : '');
          setRenameError('');
          setConfirmDelete(null);
        }}
        onRenameValue={(v) => { setRenameValue(v); setRenameError(''); }}
        onSaveRename={async () => {
          const msg = validateName(renameValue);
          if (msg) { setRenameError(msg); return; }
          if (renamingId !== null && (await run(async () => { await renameProject(renamingId, renameValue); }))) {
            setRenamingId(null);
            await props.onChanged();
          }
        }}
        onCancelRename={() => setRenamingId(null)}
        onAskDelete={async (id) => {
          const p = props.projects.find((x) => x.id === id);
          if (!p) return;
          setRenamingId(null);
          await run(async () => setConfirmDelete({ id, message: projectDeletionMessage(p.name, await projectDeletionImpact(id)) }));
        }}
        onConfirmDelete={async () => {
          if (!confirmDelete) return;
          const id = confirmDelete.id;
          if (await run(() => deleteProject(id))) {
            setConfirmDelete(null);
            await props.onChanged();
          }
        }}
        onCancelDelete={() => setConfirmDelete(null)}
      />
    </Card>
  );
}
