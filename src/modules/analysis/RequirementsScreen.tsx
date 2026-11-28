// Écran « Exigences » (converti au lot M8b) : la mécanique commune est dans shared/register-screen.tsx ; ce fichier fournit la configuration propre à ce type.
import { commonItemOps } from '../../data/repositories/register-ops.ts';
import { createRequirement, listRequirements, updateRequirement } from '../../data/repositories/requirements.ts';
import type { Requirement } from '../../data/repositories/requirements.ts';
import { RegisterScreen } from '../../shared/register-screen.tsx';
import type { RegisterConfig } from '../../shared/register-screen.tsx';
import type { HistorySlot, LinksSlot } from '../../shared/ui.tsx';
import { RequirementDetailView, RequirementFormView, RequirementListView } from './AnalysisView.tsx';
import { EMPTY_REQUIREMENT_FORM, validateRequirementForm } from './logic.ts';
import type { RequirementForm, RequirementFormResult } from './logic.ts';

type Valid = Extract<RequirementFormResult, { ok: true }>;

const CONFIG: RegisterConfig<Requirement, RequirementForm, Valid> = {
  title: 'Exigences',
  what: 'Les exigences',
  kind: 'requirement',
  gone: "Cette exigence n'existe plus.",
  createHeading: 'Nouvelle exigence',
  editHeading: "Modifier l'exigence",
  emptyForm: EMPTY_REQUIREMENT_FORM,
  formFrom: (row) => ({ title: row.title, description: row.description, nature: row.nature, priority: row.priority, criteria: row.criteria }),
  validate: validateRequirementForm,
  ops: {
    list: listRequirements,
    create: async (projectId, v) => (await createRequirement({ projectId, title: v.title, description: v.description, ...v.fields })).id,
    update: (id, v) => updateRequirement(id, { title: v.title, description: v.description, fields: v.fields }),
    ...commonItemOps,
  },
  ListView: RequirementListView,
  DetailView: RequirementDetailView,
  FormView: RequirementFormView,
};

export function RequirementsScreen(props: { projectId: number | null; projectName: string; onGoToProjects: () => void; onChanged: () => void; renderLinks?: LinksSlot; renderHistory?: HistorySlot; openId?: number | null; onOpenHandled?: () => void }) {
  return <RegisterScreen config={CONFIG} {...props} />;
}
