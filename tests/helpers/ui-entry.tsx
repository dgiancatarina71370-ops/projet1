// Point d'entrée des tests d'interface (lot M3a) : rend les écrans d'affichage en HTML statique, sans navigateur.
// Il est compilé par esbuild au moment du test (tests/ui-m3a.test.ts). Aucune interaction n'est simulée : le comportement des clics et des saisies
// se vérifie à la recette sur clé. Ces rendus contrôlent la structure, les textes, les états vides et les messages d'erreur.
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell } from '../../src/app/Shell.tsx';
import { ProjectsView } from '../../src/modules/projects/ProjectsView.tsx';
import { NoProjectView, StakeholderDetailView, StakeholderFormView, StakeholderListView } from '../../src/modules/stakeholders/StakeholdersView.tsx';

const noop = (): void => undefined;

export const render = {
  shell: (p: { navigable: boolean; screen: 'projects' | 'stakeholders' | 'technical'; projects: Array<{ id: number; name: string }>; activeId: number | null }): string =>
    renderToStaticMarkup(
      <Shell intro="Introduction" navigable={p.navigable} screen={p.screen} onNavigate={noop} projects={p.projects} activeId={p.activeId} onSelectProject={noop} footer="Signature">
        <p>Contenu</p>
      </Shell>,
    ),
  noProject: (): string => renderToStaticMarkup(<NoProjectView onGoToProjects={noop} />),
  list: (p: { rows: Array<{ id: number; code: string; title: string; description: string; status: string; organisation: string; role: string; influence: string; interest: string }>; total: number; filter: 'all' | 'active' | 'archived' }): string =>
    renderToStaticMarkup(<StakeholderListView projectName="Mon projet" rows={p.rows} total={p.total} filter={p.filter} onFilter={noop} onNew={noop} onOpen={noop} />),
  detail: (p: { archived: boolean; confirm: string | null; error: string }): string =>
    renderToStaticMarkup(
      <StakeholderDetailView
        row={{ id: 1, code: 'PP-001', title: 'Responsable <CRP>', description: '', status: p.archived ? 'archived' : 'active', organisation: '', role: 'Sponsor', influence: 'high', interest: 'low' }}
        busy={false}
        error={p.error}
        confirmDelete={p.confirm}
        onEdit={noop}
        onToggleArchive={noop}
        onAskDelete={noop}
        onConfirmDelete={noop}
        onCancelDelete={noop}
        onBack={noop}
      />,
    ),
  form: (p: { errors: Record<string, string>; askAbandon: boolean; title: string }): string =>
    renderToStaticMarkup(
      <StakeholderFormView
        heading="Nouvelle partie prenante"
        values={{ title: p.title, description: '', organisation: '', role: '', influence: 'medium', interest: 'high' }}
        errors={p.errors}
        busy={false}
        error=""
        onChange={noop}
        onSubmit={noop}
        onCancel={noop}
        askAbandon={p.askAbandon}
        onConfirmAbandon={noop}
        onKeepEditing={noop}
      />,
    ),
  projects: (p: { rows: Array<{ id: number; parent_id: number | null; kind: string; name: string }>; activeId: number | null; renamingId: number | null; confirm: { id: number; message: string } | null; newError: string }): string =>
    renderToStaticMarkup(
      <ProjectsView
        rows={p.rows}
        activeId={p.activeId}
        newName=""
        newError={p.newError}
        renamingId={p.renamingId}
        renameValue="Nom actuel"
        renameError=""
        confirmDelete={p.confirm}
        busy={false}
        error=""
        onNewName={noop}
        onCreate={noop}
        onActivate={noop}
        onStartRename={noop}
        onRenameValue={noop}
        onSaveRename={noop}
        onCancelRename={noop}
        onAskDelete={noop}
        onConfirmDelete={noop}
        onCancelDelete={noop}
      />,
    ),
};
