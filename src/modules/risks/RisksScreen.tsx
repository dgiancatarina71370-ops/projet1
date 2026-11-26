// Écran « Risques » (lot M4, converti au lot M8b) : la mécanique commune est dans shared/register-screen.tsx ; ce fichier fournit la configuration propre aux risques.
import { commonItemOps } from '../../data/repositories/register-ops.ts';
import { createRisk, listRisks, updateRisk } from '../../data/repositories/risks.ts';
import type { Risk } from '../../data/repositories/risks.ts';
import { RegisterScreen } from '../../shared/register-screen.tsx';
import type { RegisterConfig } from '../../shared/register-screen.tsx';
import type { LinksSlot } from '../../shared/ui.tsx';
import { RiskDetailView, RiskFormView, RiskListView } from './RisksView.tsx';
import { EMPTY_RISK_FORM, validateRiskForm } from './logic.ts';
import type { RiskForm, RiskFormResult } from './logic.ts';

type Valid = Extract<RiskFormResult, { ok: true }>;

const CONFIG: RegisterConfig<Risk, RiskForm, Valid> = {
  title: 'Risques',
  what: 'Les risques',
  kind: 'risk',
  gone: "Ce risque n'existe plus.",
  createHeading: 'Nouveau risque',
  editHeading: 'Modifier le risque',
  emptyForm: EMPTY_RISK_FORM,
  formFrom: (row) => ({ title: row.title, description: row.description, probability: row.probability, impact: row.impact, mitigation: row.mitigation, owner: row.owner }),
  validate: validateRiskForm,
  ops: {
    list: listRisks,
    create: async (projectId, v) => (await createRisk({ projectId, title: v.title, description: v.description, ...v.fields })).id,
    update: (id, v) => updateRisk(id, { title: v.title, description: v.description, fields: v.fields }),
    ...commonItemOps,
  },
  ListView: RiskListView,
  DetailView: RiskDetailView,
  FormView: RiskFormView,
};

export function RisksScreen(props: { projectId: number | null; projectName: string; onGoToProjects: () => void; onChanged: () => void; renderLinks?: LinksSlot; openId?: number | null; onOpenHandled?: () => void }) {
  return <RegisterScreen config={CONFIG} {...props} />;
}
