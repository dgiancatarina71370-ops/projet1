// Tests (lot M5, décisions D64 et D65) : champs propres au type et règles de saisie.
// Le résultat de la dernière exécution est le statut du test (pas d'historique d'exécutions : centre UAT en V3).
// Couche « domain » : pure, sans accès à la base ni à l'interface (règle R9). Syntaxe volontairement « effaçable » (voir kinds.ts).
import { isCalendarDate } from './decisions.ts';

export type TestType = 'unit' | 'integration' | 'acceptance';

export const TEST_TYPES: readonly TestType[] = ['unit', 'integration', 'acceptance'];

const TEST_TYPE_LABELS: Record<TestType, string> = {
  unit: 'Unitaire',
  integration: 'Intégration',
  acceptance: 'Recette (UAT)',
};

export const MAX_TEST_TEXT_LENGTH = 10000;

export interface TestFields {
  testType: TestType;
  preconditions: string;
  steps: string;
  expected: string;
  /** Jour de la dernière exécution, AAAA-MM-JJ ; chaîne vide si jamais exécuté. */
  lastRunOn: string;
}

/** Un test se crée comme test de recette : c'est le cas courant d'un BA. À préciser par l'utilisateur. */
export const DEFAULT_TEST_FIELDS: TestFields = { testType: 'acceptance', preconditions: '', steps: '', expected: '', lastRunOn: '' };

export function isTestType(value: unknown): value is TestType {
  return typeof value === 'string' && (TEST_TYPES as readonly string[]).includes(value);
}

export function testTypeLabel(value: string): string {
  return isTestType(value) ? TEST_TYPE_LABELS[value] : `Inconnu (${value})`;
}

/** Complète avec les valeurs par défaut et refuse ce qui n'est pas valide. Les textes libres gardent leurs retours à la ligne. */
export function normalizeTestFields(input: Partial<TestFields>): TestFields {
  const testType = input.testType ?? DEFAULT_TEST_FIELDS.testType;
  const preconditions = input.preconditions ?? DEFAULT_TEST_FIELDS.preconditions;
  const steps = input.steps ?? DEFAULT_TEST_FIELDS.steps;
  const expected = input.expected ?? DEFAULT_TEST_FIELDS.expected;
  const lastRunOn = (input.lastRunOn ?? DEFAULT_TEST_FIELDS.lastRunOn).trim();
  if (!isTestType(testType)) throw new Error(`Type de test inconnu : « ${String(testType)} ».`);
  if (preconditions.length > MAX_TEST_TEXT_LENGTH) throw new Error(`Les préconditions sont limitées à ${MAX_TEST_TEXT_LENGTH} caractères.`);
  if (steps.length > MAX_TEST_TEXT_LENGTH) throw new Error(`Les étapes sont limitées à ${MAX_TEST_TEXT_LENGTH} caractères.`);
  if (expected.length > MAX_TEST_TEXT_LENGTH) throw new Error(`Le résultat attendu est limité à ${MAX_TEST_TEXT_LENGTH} caractères.`);
  if (lastRunOn !== '' && !isCalendarDate(lastRunOn)) throw new Error(`La date de dernière exécution doit être un jour valide au format AAAA-MM-JJ (reçu : « ${lastRunOn} »).`);
  return { testType, preconditions, steps, expected, lastRunOn };
}

/** Noms (techniques) des champs qui diffèrent : sert au journal, qui ne garde jamais de contenu. */
export function changedTestFields(before: TestFields, after: TestFields): Array<keyof TestFields> {
  const names: Array<keyof TestFields> = ['testType', 'preconditions', 'steps', 'expected', 'lastRunOn'];
  return names.filter((n) => before[n] !== after[n]);
}
