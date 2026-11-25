// Logique pure de l'écran « Risques » (lot M4) : filtres, formulaire, validation. Sans base ni React.
import { MAX_TITLE, LEVELS, levelLabel } from '../../domain/stakeholders.ts';
import { normalizeRiskFields } from '../../domain/risks.ts';
import type { RiskFields } from '../../domain/risks.ts';
import type { Level } from '../../domain/stakeholders.ts';
import { kindInfo, statusLabel } from '../../domain/kinds.ts';
import { emptyListText, titleProblem } from '../../shared/register-logic.ts';

/** Statuts d'un risque, dans l'ordre du cycle de vie (décision D56). */
export const RISK_STATUSES: readonly string[] = kindInfo('risk').statuses;

export const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = RISK_STATUSES.map((s) => ({ value: s, label: statusLabel(s, 'risk') }));

export const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [{ value: 'all', label: 'Tous' }, ...STATUS_OPTIONS];

export const LEVEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = LEVELS.map((l) => ({ value: l, label: levelLabel(l) }));

export const emptyRisksMessage = (total: number, filter: string): string =>
  emptyListText(total, filter === 'all' ? null : statusLabel(filter, 'risk'), 'Aucun risque', 'Créez le premier avec « Nouveau risque ».');

export interface RiskForm {
  title: string;
  description: string;
  probability: string;
  impact: string;
  mitigation: string;
  owner: string;
}

export const EMPTY_RISK_FORM: RiskForm = { title: '', description: '', probability: 'medium', impact: 'medium', mitigation: '', owner: '' };

export type RiskFormErrors = Partial<Record<keyof RiskForm, string>>;

export type RiskFormResult =
  | { ok: true; title: string; description: string; fields: RiskFields }
  | { ok: false; errors: RiskFormErrors };

/** Valide le formulaire avec les mêmes règles que le dépôt, champ par champ, pour afficher chaque message à sa place. */
export function validateRiskForm(values: RiskForm): RiskFormResult {
  const errors: RiskFormErrors = {};
  const t = titleProblem(values.title, 'du risque', MAX_TITLE);
  if (t) errors.title = t;
  for (const key of ['probability', 'impact', 'mitigation', 'owner'] as const) {
    try {
      normalizeRiskFields({ [key]: values[key] } as Partial<RiskFields>);
    } catch (e) {
      errors[key] = e instanceof Error ? e.message : String(e);
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const fields = normalizeRiskFields({ probability: values.probability as Level, impact: values.impact as Level, mitigation: values.mitigation, owner: values.owner });
  return { ok: true, title: values.title.trim(), description: values.description, fields };
}
