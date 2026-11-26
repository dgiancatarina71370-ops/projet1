// Logique pure de l'écran « Ateliers » (lot M7) : filtres, formulaire, validation. Sans base ni React.
import { MAX_TITLE } from '../../domain/stakeholders.ts';
import { normalizeWorkshopFields } from '../../domain/workshops.ts';
import type { WorkshopFields } from '../../domain/workshops.ts';
import { kindInfo, statusLabel } from '../../domain/kinds.ts';
import { emptyListText, titleProblem } from '../../shared/register-logic.ts';

/** Statuts d'un atelier, dans l'ordre du cycle de vie (décision D81). */
export const WORKSHOP_STATUSES: readonly string[] = kindInfo('workshop').statuses;

export const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = WORKSHOP_STATUSES.map((s) => ({ value: s, label: statusLabel(s, 'workshop') }));

export const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [{ value: 'all', label: 'Tous' }, ...STATUS_OPTIONS];

export const emptyWorkshopsMessage = (total: number, filter: string): string =>
  emptyListText(total, filter === 'all' ? null : statusLabel(filter, 'workshop'), 'Aucun atelier', 'Créez le premier avec « Nouvel atelier ».');

export interface WorkshopForm {
  title: string;
  description: string;
  heldOn: string;
  place: string;
  objective: string;
  notes: string;
  followUp: string;
}

export const EMPTY_WORKSHOP_FORM: WorkshopForm = { title: '', description: '', heldOn: '', place: '', objective: '', notes: '', followUp: '' };

export type WorkshopFormErrors = Partial<Record<keyof WorkshopForm, string>>;

export type WorkshopFormResult =
  | { ok: true; title: string; description: string; fields: WorkshopFields }
  | { ok: false; errors: WorkshopFormErrors };

/** Valide le formulaire avec les mêmes règles que le dépôt, champ par champ, pour afficher chaque message à sa place. */
export function validateWorkshopForm(values: WorkshopForm): WorkshopFormResult {
  const errors: WorkshopFormErrors = {};
  const t = titleProblem(values.title, "de l'atelier", MAX_TITLE);
  if (t) errors.title = t;
  for (const key of ['heldOn', 'place', 'objective', 'notes', 'followUp'] as const) {
    try {
      normalizeWorkshopFields({ [key]: values[key] });
    } catch (e) {
      errors[key] = e instanceof Error ? e.message : String(e);
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const fields = normalizeWorkshopFields({ heldOn: values.heldOn, place: values.place, objective: values.objective, notes: values.notes, followUp: values.followUp });
  return { ok: true, title: values.title.trim(), description: values.description, fields };
}
