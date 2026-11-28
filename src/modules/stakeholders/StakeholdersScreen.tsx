// Écran « Parties prenantes » (lot M3a, converti au lot M8b) : la mécanique commune est dans shared/register-screen.tsx.
// Deux écarts propres à ce type, conservés (D104) et absorbés par de petits adaptateurs ci-dessous, sans toucher aux vues :
// la fiche propose « Archiver / Réactiver » (deux statuts seulement) au lieu d'un changement de statut libre, et le filtre n'a que trois valeurs.
import { commonItemOps } from '../../data/repositories/register-ops.ts';
import { createStakeholder, listStakeholders, updateStakeholder } from '../../data/repositories/stakeholders.ts';
import { RegisterScreen } from '../../shared/register-screen.tsx';
import type { RegisterConfig, RegisterListProps } from '../../shared/register-screen.tsx';
import type { DetailActions, HistorySlot, LinksSlot } from '../../shared/ui.tsx';
import { StakeholderDetailView, StakeholderFormView, StakeholderListView } from './StakeholdersView.tsx';
import type { StakeholderRow } from './StakeholdersView.tsx';
import { EMPTY_FORM, formFrom, validateForm } from './logic.ts';
import type { FormResult, FormValues, StatusFilter } from './logic.ts';

type Valid = Extract<FormResult, { ok: true }>;

function ListAdapter(props: RegisterListProps<StakeholderRow>) {
  return <StakeholderListView {...props} filter={props.filter as StatusFilter} onFilter={(f) => props.onFilter(f)} />;
}

function DetailAdapter(props: DetailActions & { row: StakeholderRow }) {
  const { onChangeStatus, ...rest } = props;
  return <StakeholderDetailView {...rest} onToggleArchive={() => onChangeStatus(props.row.status === 'archived' ? 'active' : 'archived')} />;
}

const CONFIG: RegisterConfig<StakeholderRow, FormValues, Valid> = {
  title: 'Parties prenantes',
  what: 'Les parties prenantes',
  kind: 'stakeholder',
  gone: "Cette partie prenante n'existe plus.",
  createHeading: 'Nouvelle partie prenante',
  editHeading: 'Modifier la partie prenante',
  emptyForm: EMPTY_FORM,
  formFrom,
  validate: validateForm,
  ops: {
    list: listStakeholders,
    create: async (projectId, v) => (await createStakeholder({ projectId, title: v.title, description: v.description, ...v.fields })).id,
    update: (id, v) => updateStakeholder(id, { title: v.title, description: v.description, fields: v.fields }),
    ...commonItemOps,
  },
  ListView: ListAdapter,
  DetailView: DetailAdapter,
  FormView: StakeholderFormView,
};

export function StakeholdersScreen(props: { projectId: number | null; projectName: string; onGoToProjects: () => void; onChanged: () => void; renderLinks?: LinksSlot; renderHistory?: HistorySlot; openId?: number | null; onOpenHandled?: () => void }) {
  return <RegisterScreen config={CONFIG} {...props} />;
}
