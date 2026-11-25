// Logique pure de l'écran « Décisions » (lot M4) : filtres, formulaire, validation. Sans base ni React.
import { MAX_TITLE } from '../../domain/stakeholders.ts';
import { normalizeDecisionFields } from '../../domain/decisions.ts';
import type { DecisionFields } from '../../domain/decisions.ts';
import { kindInfo, statusLabel } from '../../domain/kinds.ts';
import { emptyListText, titleProblem } from '../../shared/register-logic.ts';

/** Statuts d'une décision, dans l'ordre du cycle de vie (décision D54). Libellés accordés au féminin. */
export const DECISION_STATUSES: readonly string[] = kindInfo('decision').statuses;

export const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = DECISION_STATUSES.map((s) => ({ value: s, label: statusLabel(s, 'decision') }));

export const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [{ value: 'all', label: 'Toutes' }, ...STATUS_OPTIONS];

export const emptyDecisionsMessage = (total: number, filter: string): string =>
  emptyListText(total, filter === 'all' ? null : statusLabel(filter, 'decision'), 'Aucune décision', 'Créez la première avec « Nouvelle décision ».', 'Toutes');

export interface DecisionForm {
  title: string;
  description: string;
  decidedOn: string;
  decider: string;
  alternatives: string;
  rationale: string;
}

export const EMPTY_DECISION_FORM: DecisionForm = { title: '', description: '', decidedOn: '', decider: '', alternatives: '', rationale: '' };

export type DecisionFormErrors = Partial<Record<keyof DecisionForm, string>>;

export type DecisionFormResult =
  | { ok: true; title: string; description: string; fields: DecisionFields }
  | { ok: false; errors: DecisionFormErrors };

/** Valide le formulaire avec les mêmes règles que le dépôt, champ par champ, pour afficher chaque message à sa place. */
export function validateDecisionForm(values: DecisionForm): DecisionFormResult {
  const errors: DecisionFormErrors = {};
  const t = titleProblem(values.title, 'de la décision', MAX_TITLE);
  if (t) errors.title = t;
  for (const key of ['decidedOn', 'decider', 'alternatives', 'rationale'] as const) {
    try {
      normalizeDecisionFields({ [key]: values[key] });
    } catch (e) {
      errors[key] = e instanceof Error ? e.message : String(e);
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const fields = normalizeDecisionFields({ decidedOn: values.decidedOn, decider: values.decider, alternatives: values.alternatives, rationale: values.rationale });
  return { ok: true, title: values.title.trim(), description: values.description, fields };
}
