// Logique pure de l'écran « Tests » (lot M5) : filtres, formulaire, validation. Sans base ni React.
import { MAX_TITLE } from '../../domain/stakeholders.ts';
import { TEST_TYPES, normalizeTestFields, testTypeLabel } from '../../domain/testcases.ts';
import type { TestFields, TestType } from '../../domain/testcases.ts';
import { kindInfo, statusLabel } from '../../domain/kinds.ts';
import { emptyListText, titleProblem } from '../../shared/register-logic.ts';

/** Statuts d'un test : le dernier résultat connu (décision D65). */
export const TEST_STATUSES: readonly string[] = kindInfo('test').statuses;

export const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = TEST_STATUSES.map((s) => ({ value: s, label: statusLabel(s, 'test') }));

export const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [{ value: 'all', label: 'Tous' }, ...STATUS_OPTIONS];

export const TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = TEST_TYPES.map((t) => ({ value: t, label: testTypeLabel(t) }));

export const emptyTestsMessage = (total: number, filter: string): string =>
  emptyListText(total, filter === 'all' ? null : statusLabel(filter, 'test'), 'Aucun test', 'Créez le premier avec « Nouveau test ».');

export interface TestForm {
  title: string;
  description: string;
  testType: string;
  preconditions: string;
  steps: string;
  expected: string;
  lastRunOn: string;
}

export const EMPTY_TEST_FORM: TestForm = { title: '', description: '', testType: 'acceptance', preconditions: '', steps: '', expected: '', lastRunOn: '' };

export type TestFormErrors = Partial<Record<keyof TestForm, string>>;

export type TestFormResult =
  | { ok: true; title: string; description: string; fields: TestFields }
  | { ok: false; errors: TestFormErrors };

/** Valide le formulaire avec les mêmes règles que le dépôt, champ par champ, pour afficher chaque message à sa place. */
export function validateTestForm(values: TestForm): TestFormResult {
  const errors: TestFormErrors = {};
  const t = titleProblem(values.title, 'du test', MAX_TITLE);
  if (t) errors.title = t;
  for (const key of ['testType', 'preconditions', 'steps', 'expected', 'lastRunOn'] as const) {
    try {
      normalizeTestFields({ [key]: values[key] } as Partial<TestFields>);
    } catch (e) {
      errors[key] = e instanceof Error ? e.message : String(e);
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const fields = normalizeTestFields({ testType: values.testType as TestType, preconditions: values.preconditions, steps: values.steps, expected: values.expected, lastRunOn: values.lastRunOn });
  return { ok: true, title: values.title.trim(), description: values.description, fields };
}
