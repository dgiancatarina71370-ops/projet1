// Écran « Décisions » (converti au lot M8b) : la mécanique commune est dans shared/register-screen.tsx ; ce fichier fournit la configuration propre à ce type.
import { commonItemOps } from '../../data/repositories/register-ops.ts';
import { createDecision, listDecisions, updateDecision } from '../../data/repositories/decisions.ts';
import type { Decision } from '../../data/repositories/decisions.ts';
import { RegisterScreen } from '../../shared/register-screen.tsx';
import type { RegisterConfig } from '../../shared/register-screen.tsx';
import type { LinksSlot } from '../../shared/ui.tsx';
import { DecisionDetailView, DecisionFormView, DecisionListView } from './DecisionsView.tsx';
import { EMPTY_DECISION_FORM, validateDecisionForm } from './logic.ts';
import type { DecisionForm, DecisionFormResult } from './logic.ts';

type Valid = Extract<DecisionFormResult, { ok: true }>;

const CONFIG: RegisterConfig<Decision, DecisionForm, Valid> = {
  title: 'Décisions',
  what: 'Les décisions',
  kind: 'decision',
  gone: "Cette décision n'existe plus.",
  createHeading: 'Nouvelle décision',
  editHeading: "Modifier la décision",
  emptyForm: EMPTY_DECISION_FORM,
  formFrom: (row) => ({ title: row.title, description: row.description, decidedOn: row.decided_on, decider: row.decider, alternatives: row.alternatives, rationale: row.rationale }),
  validate: validateDecisionForm,
  ops: {
    list: listDecisions,
    create: async (projectId, v) => (await createDecision({ projectId, title: v.title, description: v.description, ...v.fields })).id,
    update: (id, v) => updateDecision(id, { title: v.title, description: v.description, fields: v.fields }),
    ...commonItemOps,
  },
  ListView: DecisionListView,
  DetailView: DecisionDetailView,
  FormView: DecisionFormView,
};

export function DecisionsScreen(props: { projectId: number | null; projectName: string; onGoToProjects: () => void; onChanged: () => void; renderLinks?: LinksSlot; openId?: number | null; onOpenHandled?: () => void }) {
  return <RegisterScreen config={CONFIG} {...props} />;
}
