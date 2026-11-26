// Écran « Besoins » (lot M3b, converti au lot M8b) : la mécanique commune est dans shared/register-screen.tsx ; ce fichier fournit la configuration propre aux besoins.
import { commonItemOps } from '../../data/repositories/register-ops.ts';
import { createItem, listItems, updateItem } from '../../data/repositories/items.ts';
import type { Item } from '../../data/repositories/items.ts';
import { RegisterScreen } from '../../shared/register-screen.tsx';
import type { RegisterConfig } from '../../shared/register-screen.tsx';
import type { LinksSlot } from '../../shared/ui.tsx';
import { NeedDetailView, NeedFormView, NeedListView } from './AnalysisView.tsx';
import { EMPTY_NEED_FORM, validateNeedForm } from './logic.ts';
import type { NeedForm, NeedFormResult } from './logic.ts';

type Valid = Extract<NeedFormResult, { ok: true }>;

const CONFIG: RegisterConfig<Item, NeedForm, Valid> = {
  title: 'Besoins',
  what: 'Les besoins',
  kind: 'need',
  gone: "Ce besoin n'existe plus.",
  createHeading: 'Nouveau besoin',
  editHeading: 'Modifier le besoin',
  emptyForm: EMPTY_NEED_FORM,
  formFrom: (row) => ({ title: row.title, description: row.description }),
  validate: validateNeedForm,
  ops: {
    list: (projectId) => listItems(projectId, 'need'),
    create: async (projectId, v) => (await createItem({ projectId, kind: 'need', title: v.title, description: v.description })).id,
    update: (id, v) => updateItem(id, { title: v.title, description: v.description }),
    ...commonItemOps,
  },
  ListView: NeedListView,
  DetailView: NeedDetailView,
  FormView: NeedFormView,
};

export function NeedsScreen(props: { projectId: number | null; projectName: string; onGoToProjects: () => void; onChanged: () => void; renderLinks?: LinksSlot; openId?: number | null; onOpenHandled?: () => void }) {
  return <RegisterScreen config={CONFIG} {...props} />;
}
