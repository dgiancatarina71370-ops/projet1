// Logique pure des écrans « Besoins » et « Exigences » (lot M3b) : filtres, formulaires, validation. Sans base ni React.
import { MAX_TITLE } from '../../domain/stakeholders.ts';
import { NATURES, PRIORITIES, natureLabel, normalizeRequirementFields, priorityLabel } from '../../domain/requirements.ts';
import type { Nature, Priority, RequirementFields } from '../../domain/requirements.ts';
import { KINDS, statusLabel } from '../../domain/kinds.ts';
import { emptyListText, titleProblem } from '../../shared/register-logic.ts';

/** Statuts d'un besoin ou d'une exigence, dans l'ordre du cycle de vie (décisions D37 et D47). */
export const ANALYSIS_STATUSES: readonly string[] = (KINDS.find((k) => k.kind === 'need') as { statuses: readonly string[] }).statuses;

export const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = ANALYSIS_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }));

export const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [{ value: 'all', label: 'Tous' }, ...STATUS_OPTIONS];

export const NATURE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = NATURES.map((n) => ({ value: n, label: natureLabel(n) }));
export const PRIORITY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }));

function filterLabel(filter: string): string | null {
  return filter === 'all' ? null : statusLabel(filter);
}

export const emptyNeedsMessage = (total: number, filter: string): string =>
  emptyListText(total, filterLabel(filter), 'Aucun besoin', 'Créez le premier avec « Nouveau besoin ».');

export const emptyRequirementsMessage = (total: number, filter: string): string =>
  emptyListText(total, filterLabel(filter), 'Aucune exigence', 'Créez la première avec « Nouvelle exigence ».');

// ------------------------------------------------------------------ besoin

export interface NeedForm {
  title: string;
  description: string;
}

export const EMPTY_NEED_FORM: NeedForm = { title: '', description: '' };

export type NeedFormErrors = Partial<Record<keyof NeedForm, string>>;

export type NeedFormResult = { ok: true; title: string; description: string } | { ok: false; errors: NeedFormErrors };

const titleError = (title: string, noun: string): string | null => titleProblem(title, noun, MAX_TITLE);

export function validateNeedForm(values: NeedForm): NeedFormResult {
  const errors: NeedFormErrors = {};
  const t = titleError(values.title, 'du besoin');
  if (t) errors.title = t;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, title: values.title.trim(), description: values.description };
}

// ------------------------------------------------------------------ exigence

export interface RequirementForm {
  title: string;
  description: string;
  nature: string;
  priority: string;
  criteria: string;
}

export const EMPTY_REQUIREMENT_FORM: RequirementForm = { title: '', description: '', nature: 'functional', priority: 'should', criteria: '' };

export type RequirementFormErrors = Partial<Record<keyof RequirementForm, string>>;

export type RequirementFormResult =
  | { ok: true; title: string; description: string; fields: RequirementFields }
  | { ok: false; errors: RequirementFormErrors };

/** Valide le formulaire avec les mêmes règles que le dépôt, champ par champ, pour afficher chaque message à sa place. */
export function validateRequirementForm(values: RequirementForm): RequirementFormResult {
  const errors: RequirementFormErrors = {};
  const t = titleError(values.title, 'de l\'exigence');
  if (t) errors.title = t;
  let fields: RequirementFields = { nature: 'functional', priority: 'should', criteria: '' };
  for (const key of ['nature', 'priority', 'criteria'] as const) {
    try {
      fields = normalizeRequirementFields({ ...fields, [key]: values[key] } as Partial<RequirementFields>);
    } catch (e) {
      errors[key] = e instanceof Error ? e.message : String(e);
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, title: values.title.trim(), description: values.description, fields: normalizeRequirementFields({ nature: values.nature as Nature, priority: values.priority as Priority, criteria: values.criteria }) };
}
