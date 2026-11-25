// Décisions (lot M4, décisions D53 et D54) : champs propres au type et règles de saisie.
// Couche « domain » : pure, sans accès à la base ni à l'interface (règle R9 de scripts/check-architecture.mjs).
// Syntaxe volontairement « effaçable » (ni enum ni propriété de paramètre) : ce fichier s'exécute tel quel sous Node pour les tests.

export const MAX_DECIDER_LENGTH = 200;
/** Longueur maximale des alternatives et de la justification (textes libres). */
export const MAX_DECISION_TEXT_LENGTH = 10000;

export interface DecisionFields {
  /** Jour de la décision au format AAAA-MM-JJ, sans heure ni fuseau ; chaîne vide si inconnu. */
  decidedOn: string;
  decider: string;
  alternatives: string;
  rationale: string;
}

export const DEFAULT_DECISION_FIELDS: DecisionFields = { decidedOn: '', decider: '', alternatives: '', rationale: '' };

/** Vrai pour un vrai jour du calendrier au format AAAA-MM-JJ (le 30 février est refusé). La chaîne vide n'est pas une date. */
export function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2999 || mo < 1 || mo > 12 || d < 1) return false;
  const days = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= days[mo - 1];
}

/** Date d'affichage d'un jour AAAA-MM-JJ (décisions, exécutions de tests) : « JJ/MM/AAAA » ; « — » si la date n'est pas renseignée ; la valeur telle quelle si elle est illisible. */
export function dayLabel(value: string): string {
  if (value === '') return '—';
  if (!isCalendarDate(value)) return `Invalide (${value})`;
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

/** Complète avec les valeurs par défaut, nettoie les espaces (sauf dans les textes libres) et refuse ce qui n'est pas valide. */
export function normalizeDecisionFields(input: Partial<DecisionFields>): DecisionFields {
  const decidedOn = (input.decidedOn ?? DEFAULT_DECISION_FIELDS.decidedOn).trim();
  const decider = (input.decider ?? DEFAULT_DECISION_FIELDS.decider).trim();
  const alternatives = input.alternatives ?? DEFAULT_DECISION_FIELDS.alternatives;
  const rationale = input.rationale ?? DEFAULT_DECISION_FIELDS.rationale;
  if (decidedOn !== '' && !isCalendarDate(decidedOn)) throw new Error(`La date de la décision doit être un jour valide au format AAAA-MM-JJ (reçu : « ${decidedOn} »).`);
  if (decider.length > MAX_DECIDER_LENGTH) throw new Error(`Le décideur est limité à ${MAX_DECIDER_LENGTH} caractères.`);
  if (alternatives.length > MAX_DECISION_TEXT_LENGTH) throw new Error(`Les alternatives sont limitées à ${MAX_DECISION_TEXT_LENGTH} caractères.`);
  if (rationale.length > MAX_DECISION_TEXT_LENGTH) throw new Error(`La justification est limitée à ${MAX_DECISION_TEXT_LENGTH} caractères.`);
  return { decidedOn, decider, alternatives, rationale };
}

/** Noms (techniques) des champs qui diffèrent : sert au journal, qui ne garde jamais de contenu. */
export function changedDecisionFields(before: DecisionFields, after: DecisionFields): Array<keyof DecisionFields> {
  const names: Array<keyof DecisionFields> = ['decidedOn', 'decider', 'alternatives', 'rationale'];
  return names.filter((n) => before[n] !== after[n]);
}
