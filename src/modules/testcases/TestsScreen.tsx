// Écran « Tests » (converti au lot M8b) : la mécanique commune est dans shared/register-screen.tsx ; ce fichier fournit la configuration propre à ce type.
import { commonItemOps } from '../../data/repositories/register-ops.ts';
import { createTestCase, listTestCases, updateTestCase } from '../../data/repositories/testcases.ts';
import type { TestCase } from '../../data/repositories/testcases.ts';
import { RegisterScreen } from '../../shared/register-screen.tsx';
import type { RegisterConfig } from '../../shared/register-screen.tsx';
import type { HistorySlot, LinksSlot } from '../../shared/ui.tsx';
import { TestDetailView, TestFormView, TestListView } from './TestsView.tsx';
import { EMPTY_TEST_FORM, validateTestForm } from './logic.ts';
import type { TestForm, TestFormResult } from './logic.ts';

type Valid = Extract<TestFormResult, { ok: true }>;

const CONFIG: RegisterConfig<TestCase, TestForm, Valid> = {
  title: 'Tests',
  what: 'Les tests',
  kind: 'test',
  gone: "Ce test n'existe plus.",
  createHeading: 'Nouveau test',
  editHeading: "Modifier le test",
  emptyForm: EMPTY_TEST_FORM,
  formFrom: (row) => ({ title: row.title, description: row.description, testType: row.test_type, preconditions: row.preconditions, steps: row.steps, expected: row.expected, lastRunOn: row.last_run_on }),
  validate: validateTestForm,
  ops: {
    list: listTestCases,
    create: async (projectId, v) => (await createTestCase({ projectId, title: v.title, description: v.description, ...v.fields })).id,
    update: (id, v) => updateTestCase(id, { title: v.title, description: v.description, fields: v.fields }),
    ...commonItemOps,
  },
  ListView: TestListView,
  DetailView: TestDetailView,
  FormView: TestFormView,
};

export function TestsScreen(props: { projectId: number | null; projectName: string; onGoToProjects: () => void; onChanged: () => void; renderLinks?: LinksSlot; renderHistory?: HistorySlot; openId?: number | null; onOpenHandled?: () => void }) {
  return <RegisterScreen config={CONFIG} {...props} />;
}
