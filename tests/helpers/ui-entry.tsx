// Point d'entrée des tests d'interface (lot M3a) : rend les écrans d'affichage en HTML statique, sans navigateur.
// Il est compilé par esbuild au moment du test (tests/ui-m3a.test.ts). Aucune interaction n'est simulée : le comportement des clics et des saisies
// se vérifie à la recette sur clé. Ces rendus contrôlent la structure, les textes, les états vides et les messages d'erreur.
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell } from '../../src/app/Shell.tsx';
import { statusCounts } from '../../src/shared/register-logic.ts';
import { ProjectsView } from '../../src/modules/projects/ProjectsView.tsx';
import { LinksView } from '../../src/shared/links-ui.tsx';
import type { LinkCandidateView, LinkOptionView, LinkRowView } from '../../src/shared/links-ui.tsx';
import { DecisionDetailView, DecisionFormView, DecisionListView } from '../../src/modules/decisions/DecisionsView.tsx';
import type { DecisionRow } from '../../src/modules/decisions/DecisionsView.tsx';
import { StoryDetailView, StoryFormView, StoryListView } from '../../src/modules/stories/StoriesView.tsx';
import type { StoryRow } from '../../src/modules/stories/StoriesView.tsx';
import { TestDetailView, TestFormView, TestListView } from '../../src/modules/testcases/TestsView.tsx';
import type { TestRow } from '../../src/modules/testcases/TestsView.tsx';
import { DeliverablesView } from '../../src/modules/deliverables/DeliverablesView.tsx';
import type { DeliverablesViewProps } from '../../src/modules/deliverables/DeliverablesView.tsx';
import { DiffusionView } from '../../src/modules/documents/DiffusionView.tsx';
import type { DiffusionViewProps } from '../../src/modules/documents/DiffusionView.tsx';
import { DocumentsView } from '../../src/modules/documents/DocumentsView.tsx';
import type { DocumentsViewProps } from '../../src/modules/documents/DocumentsView.tsx';
import { WorkshopDetailView, WorkshopFormView, WorkshopListView } from '../../src/modules/workshops/WorkshopsView.tsx';
import type { WorkshopRow } from '../../src/modules/workshops/WorkshopsView.tsx';
import { TraceabilityPageView } from '../../src/modules/traceability/TraceabilityView.tsx';
import type { Traceability } from '../../src/domain/traceability.ts';
import { RiskDetailView, RiskFormView, RiskListView } from '../../src/modules/risks/RisksView.tsx';
import type { RiskRow } from '../../src/modules/risks/RisksView.tsx';
import { NeedDetailView, NeedFormView, NeedListView, NoProjectView as AnalysisNoProject, RequirementDetailView, RequirementFormView, RequirementListView } from '../../src/modules/analysis/AnalysisView.tsx';
import type { NeedRow, RequirementRow } from '../../src/modules/analysis/AnalysisView.tsx';
import { HomeView } from '../../src/modules/home/HomeView.tsx';
import type { HomeViewProps } from '../../src/modules/home/HomeView.tsx';
import { JournalView } from '../../src/modules/journal/JournalView.tsx';
import type { JournalViewProps } from '../../src/modules/journal/JournalView.tsx';
import { AboutPanel } from '../../src/app/AboutPanel.tsx';
import { HistoryView } from '../../src/shared/history-ui.tsx';
import type { HistoryLineView } from '../../src/shared/history-ui.tsx';
import { NoProjectView, StakeholderDetailView, StakeholderFormView, StakeholderListView } from '../../src/modules/stakeholders/StakeholdersView.tsx';

const noop = (): void => undefined;

/** Propriétés de recherche, de tri et de compteurs des listes (lot F2) : compteurs calculés sur les lignes reçues, recherche vide par défaut. */
const extras = (rows: ReadonlyArray<{ status: string }>, query = '') => ({ counts: statusCounts(rows), query, onQuery: noop, sort: 'code-asc' as const, onSort: noop });

const detailProps = (p: { confirm: string | null; error: string }) => ({
  busy: false, error: p.error, confirmDelete: p.confirm,
  onEdit: noop, onChangeStatus: noop, onAskDelete: noop, onConfirmDelete: noop, onCancelDelete: noop, onBack: noop,
});

/** Accueil (lot F3) : les rappels sont des fonctions vides, aucun clic n'est simulé. */
const homeProps = (p: Omit<HomeViewProps, 'onOpenTraceability' | 'onOpenOrphans' | 'onOpenRegister' | 'onOpenItem'>): HomeViewProps => ({ ...p, onOpenTraceability: noop, onOpenOrphans: noop, onOpenRegister: noop, onOpenItem: noop });

export const render = {
  diffusion: (p: Partial<DiffusionViewProps>): string =>
    renderToStaticMarkup(
      <DiffusionView
        canDiffuse isDraft={false} lines={[]} candidates={[]} excluded={0} form={null} sendForm={null} replyForm={null} askDeleteId={null} busy={false} message={null}
        onNew={noop} onForm={noop} onPick={noop} onSaveForm={noop} onCancelForm={noop} onEdit={noop} onAskDelete={noop} onDelete={noop} onStartSend={noop} onSendForm={noop}
        onConfirmSend={noop} onCancelSend={noop} onCancelSent={noop} onCopy={noop} onStartReply={noop} onReplyForm={noop} onSaveReply={noop} onCancelReply={noop} onRemoveReply={noop}
        {...p}
      />,
    ),
  history: (p: { lines: HistoryLineView[]; countText: string; emptyText: string; limitNote: string; moreLabel: string | null; busy?: boolean; error?: string }): string =>
    renderToStaticMarkup(<HistoryView lines={p.lines} countText={p.countText} emptyText={p.emptyText} limitNote={p.limitNote} moreLabel={p.moreLabel} busy={p.busy ?? false} error={p.error ?? ''} onMore={noop} />),
  journal: (p: Omit<JournalViewProps, 'onGroup' | 'onAction' | 'onPrevious' | 'onNext' | 'onOpenItem'>): string => renderToStaticMarkup(<JournalView {...p} onGroup={noop} onAction={noop} onPrevious={noop} onNext={noop} onOpenItem={noop} />),
  about: (p: { version: string; buildDate: string; dataDir: string; schema: number | null }): string => renderToStaticMarkup(<AboutPanel {...p} />),
  home: (p: Omit<HomeViewProps, 'onOpenTraceability' | 'onOpenOrphans' | 'onOpenRegister' | 'onOpenItem'>): string => renderToStaticMarkup(<HomeView {...homeProps(p)} />),
  analysisNoProject: (what: string): string => renderToStaticMarkup(<AnalysisNoProject what={what} onGoToProjects={noop} />),
  needList: (p: { rows: NeedRow[]; total: number; filter: string; query?: string }): string =>
    renderToStaticMarkup(<NeedListView projectName="Mon projet" rows={p.rows} total={p.total} filter={p.filter} onFilter={noop} onNew={noop} onOpen={noop} {...extras(p.rows, p.query)} />),
  needDetail: (p: { row: NeedRow; confirm: string | null; error: string }): string =>
    renderToStaticMarkup(<NeedDetailView row={p.row} {...detailProps(p)} />),
  needForm: (p: { errors: Record<string, string>; askAbandon: boolean; title: string }): string =>
    renderToStaticMarkup(
      <NeedFormView heading="Nouveau besoin" values={{ title: p.title, description: '' }} errors={p.errors} busy={false} error="" onChange={noop} onSubmit={noop} onCancel={noop} askAbandon={p.askAbandon} onConfirmAbandon={noop} onKeepEditing={noop} />,
    ),
  reqList: (p: { rows: RequirementRow[]; total: number; filter: string; query?: string }): string =>
    renderToStaticMarkup(<RequirementListView projectName="Mon projet" rows={p.rows} total={p.total} filter={p.filter} onFilter={noop} onNew={noop} onOpen={noop} {...extras(p.rows, p.query)} />),
  reqDetail: (p: { row: RequirementRow; confirm: string | null; error: string }): string =>
    renderToStaticMarkup(<RequirementDetailView row={p.row} {...detailProps(p)} />),
  reqForm: (p: { errors: Record<string, string>; askAbandon: boolean; title: string; nature: string; priority: string; criteria: string }): string =>
    renderToStaticMarkup(
      <RequirementFormView heading="Nouvelle exigence" values={{ title: p.title, description: '', nature: p.nature, priority: p.priority, criteria: p.criteria }} errors={p.errors} busy={false} error="" onChange={noop} onSubmit={noop} onCancel={noop} askAbandon={p.askAbandon} onConfirmAbandon={noop} onKeepEditing={noop} />,
    ),
  decList: (p: { rows: DecisionRow[]; total: number; filter: string; query?: string }): string =>
    renderToStaticMarkup(<DecisionListView projectName="Mon projet" rows={p.rows} total={p.total} filter={p.filter} onFilter={noop} onNew={noop} onOpen={noop} {...extras(p.rows, p.query)} />),
  decDetail: (p: { row: DecisionRow; confirm: string | null; error: string }): string =>
    renderToStaticMarkup(<DecisionDetailView row={p.row} {...detailProps(p)} />),
  decForm: (p: { errors: Record<string, string>; askAbandon: boolean; values: { title: string; description: string; decidedOn: string; decider: string; alternatives: string; rationale: string } }): string =>
    renderToStaticMarkup(
      <DecisionFormView heading="Nouvelle décision" values={p.values} errors={p.errors} busy={false} error="" onChange={noop} onSubmit={noop} onCancel={noop} askAbandon={p.askAbandon} onConfirmAbandon={noop} onKeepEditing={noop} />,
    ),
  riskList: (p: { rows: RiskRow[]; total: number; filter: string; query?: string }): string =>
    renderToStaticMarkup(<RiskListView projectName="Mon projet" rows={p.rows} total={p.total} filter={p.filter} onFilter={noop} onNew={noop} onOpen={noop} {...extras(p.rows, p.query)} />),
  riskDetail: (p: { row: RiskRow; confirm: string | null; error: string }): string =>
    renderToStaticMarkup(<RiskDetailView row={p.row} {...detailProps(p)} />),
  riskForm: (p: { errors: Record<string, string>; askAbandon: boolean; values: { title: string; description: string; probability: string; impact: string; mitigation: string; owner: string } }): string =>
    renderToStaticMarkup(
      <RiskFormView heading="Nouveau risque" values={p.values} errors={p.errors} busy={false} error="" onChange={noop} onSubmit={noop} onCancel={noop} askAbandon={p.askAbandon} onConfirmAbandon={noop} onKeepEditing={noop} />,
    ),
  storyList: (p: { rows: StoryRow[]; total: number; filter: string; query?: string }): string =>
    renderToStaticMarkup(<StoryListView projectName="Mon projet" rows={p.rows} total={p.total} filter={p.filter} onFilter={noop} onNew={noop} onOpen={noop} {...extras(p.rows, p.query)} />),
  storyDetail: (p: { row: StoryRow; confirm: string | null; error: string }): string =>
    renderToStaticMarkup(<StoryDetailView row={p.row} {...detailProps(p)} />),
  storyForm: (p: { errors: Record<string, string>; askAbandon: boolean; values: { title: string; description: string; role: string; goal: string; benefit: string; criteria: string } }): string =>
    renderToStaticMarkup(
      <StoryFormView heading="Nouvelle user story" values={p.values} errors={p.errors} busy={false} error="" onChange={noop} onSubmit={noop} onCancel={noop} askAbandon={p.askAbandon} onConfirmAbandon={noop} onKeepEditing={noop} />,
    ),
  testList: (p: { rows: TestRow[]; total: number; filter: string; query?: string }): string =>
    renderToStaticMarkup(<TestListView projectName="Mon projet" rows={p.rows} total={p.total} filter={p.filter} onFilter={noop} onNew={noop} onOpen={noop} {...extras(p.rows, p.query)} />),
  testDetail: (p: { row: TestRow; confirm: string | null; error: string }): string =>
    renderToStaticMarkup(<TestDetailView row={p.row} {...detailProps(p)} />),
  testForm: (p: { errors: Record<string, string>; askAbandon: boolean; values: { title: string; description: string; testType: string; preconditions: string; steps: string; expected: string; lastRunOn: string } }): string =>
    renderToStaticMarkup(
      <TestFormView heading="Nouveau test" values={p.values} errors={p.errors} busy={false} error="" onChange={noop} onSubmit={noop} onCancel={noop} askAbandon={p.askAbandon} onConfirmAbandon={noop} onKeepEditing={noop} />,
    ),
  wsList: (p: { rows: WorkshopRow[]; total: number; filter: string; query?: string }): string =>
    renderToStaticMarkup(<WorkshopListView projectName="Mon projet" rows={p.rows} total={p.total} filter={p.filter} onFilter={noop} onNew={noop} onOpen={noop} {...extras(p.rows, p.query)} />),
  wsDetail: (p: { row: WorkshopRow; confirm: string | null; error: string; withExport?: boolean }): string =>
    renderToStaticMarkup(<WorkshopDetailView row={p.row} onExportReport={p.withExport ? noop : undefined} {...detailProps(p)} />),
  deliverables: (p: Omit<DeliverablesViewProps, 'onModel' | 'onWorkshop' | 'onIncludeArchived' | 'onSave' | 'onOpenDocument'>): string =>
    renderToStaticMarkup(<DeliverablesView {...p} onModel={noop} onWorkshop={noop} onIncludeArchived={noop} onSave={noop} onOpenDocument={noop} />),
  documents: (p: Omit<DocumentsViewProps, 'onShowReplaced' | 'onShowArchived' | 'onSelect' | 'onAskWhere' | 'onExport' | 'onStartValidate' | 'onCancelValidate' | 'onComment' | 'onConfirmValidate' | 'onArchive' | 'onUnarchive' | 'onCompare' | 'archivedCount' | 'showArchived' | 'validating' | 'comment' | 'comparison' | 'detail'> & Partial<Pick<DocumentsViewProps, 'archivedCount' | 'showArchived' | 'validating' | 'comment' | 'comparison'>> & { detail: (Omit<NonNullable<DocumentsViewProps['detail']>, 'actions' | 'canCompare'> & Partial<Pick<NonNullable<DocumentsViewProps['detail']>, 'actions' | 'canCompare'>>) | null }): string =>
    renderToStaticMarkup(
      <DocumentsView
        archivedCount={0}
        showArchived={false}
        validating={false}
        comment=""
        comparison={null}
        {...p}
        detail={p.detail === null ? null : { actions: [], canCompare: false, ...p.detail }}
        onShowReplaced={noop}
        onShowArchived={noop}
        onSelect={noop}
        onAskWhere={noop}
        onExport={noop}
        onStartValidate={noop}
        onCancelValidate={noop}
        onComment={noop}
        onConfirmValidate={noop}
        onArchive={noop}
        onUnarchive={noop}
        onCompare={noop}
      />,
    ),
  wsForm: (p: { errors: Record<string, string>; askAbandon: boolean; values: { title: string; description: string; heldOn: string; place: string; objective: string; notes: string; followUp: string } }): string =>
    renderToStaticMarkup(
      <WorkshopFormView heading="Nouvel atelier" values={p.values} errors={p.errors} busy={false} error="" onChange={noop} onSubmit={noop} onCancel={noop} askAbandon={p.askAbandon} onConfirmAbandon={noop} onKeepEditing={noop} />,
    ),
  trace: (p: { data: Traceability; tab: string; filter: string; error: string }): string =>
    renderToStaticMarkup(<TraceabilityPageView projectName="Mon projet" summary={p.data.summary} ignored={p.data.ignored} rows={p.data.matrix} orphans={p.data.orphans} tab={p.tab} onTab={noop} filter={p.filter} onFilter={noop} onOpen={noop} error={p.error} />),
  links: (p: { rows: LinkRowView[]; options: LinkOptionView[]; optionKey: string; candidates: LinkCandidateView[]; candidateId: string; error: string; confirmRemove: { linkId: number; message: string } | null }): string =>
    renderToStaticMarkup(
      <LinksView rows={p.rows} options={p.options} optionKey={p.optionKey} candidates={p.candidates} candidateId={p.candidateId} busy={false} error={p.error} confirmRemove={p.confirmRemove} onOption={noop} onCandidate={noop} onAdd={noop} onAskRemove={noop} onConfirmRemove={noop} onCancelRemove={noop} />,
    ),
  shell: (p: { navigable: boolean; screen: 'home' | 'journal' | 'about' | 'projects' | 'stakeholders' | 'needs' | 'requirements' | 'decisions' | 'risks' | 'workshops' | 'deliverables' | 'documents' | 'stories' | 'tests' | 'traceability' | 'technical'; projects: Array<{ id: number; name: string }>; activeId: number | null }): string =>
    renderToStaticMarkup(
      <Shell intro="Introduction" navigable={p.navigable} screen={p.screen} onNavigate={noop} projects={p.projects} activeId={p.activeId} onSelectProject={noop} footer="Signature">
        <p>Contenu</p>
      </Shell>,
    ),
  noProject: (): string => renderToStaticMarkup(<NoProjectView onGoToProjects={noop} />),
  list: (p: { rows: Array<{ id: number; code: string; title: string; description: string; status: string; organisation: string; role: string; influence: string; interest: string }>; total: number; filter: 'all' | 'active' | 'archived'; query?: string }): string =>
    renderToStaticMarkup(<StakeholderListView projectName="Mon projet" rows={p.rows} total={p.total} filter={p.filter} onFilter={noop} onNew={noop} onOpen={noop} {...extras(p.rows, p.query)} />),
  detail: (p: { archived: boolean; confirm: string | null; error: string; email?: string }): string =>
    renderToStaticMarkup(
      <StakeholderDetailView
        row={{ id: 1, code: 'PP-001', title: 'Responsable <CRP>', description: '', status: p.archived ? 'archived' : 'active', organisation: '', role: 'Sponsor', influence: 'high', interest: 'low', email: p.email }}
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
  form: (p: { errors: Record<string, string>; askAbandon: boolean; title: string; email?: string }): string =>
    renderToStaticMarkup(
      <StakeholderFormView
        heading="Nouvelle partie prenante"
        values={{ title: p.title, description: '', organisation: '', role: '', influence: 'medium', interest: 'high', email: p.email ?? '' }}
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
  projects: (p: { rows: Array<{ id: number; parent_id: number | null; kind: string; name: string }>; activeId: number | null; renamingId: number | null; confirm: { id: number; message: string } | null; newError: string; sampleExists?: boolean; info?: string }): string =>
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
        info={p.info ?? ''}
        sampleExists={p.sampleExists ?? false}
        onCreateSample={noop}
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
