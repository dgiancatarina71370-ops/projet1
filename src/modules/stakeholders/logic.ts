// Logique pure de l'écran des parties prenantes (lot M3a) : filtre, formulaire, validation. Aucune dépendance à la base ni à React :
// elle se teste sans interface (le comportement des écrans eux-mêmes se vérifie à la recette sur clé).
import { LEVELS, MAX_TITLE, levelLabel, normalizeFields, statusLabel } from '../../domain/stakeholders.ts';
import type { Level, StakeholderFields } from '../../domain/stakeholders.ts';
import { deletionMessage, filterByStatus, isDirty } from '../../shared/register-logic.ts';

// Logique commune aux registres (décision D44) : réexportée ici pour que l'écran garde ses points d'entrée.
export { deletionMessage, filterByStatus, isDirty };

export type StatusFilter = 'all' | 'active' | 'archived';

export const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: statusLabel('active') },
  { value: 'archived', label: statusLabel('archived') },
];

export const LEVEL_OPTIONS: ReadonlyArray<{ value: Level; label: string }> = LEVELS.map((l) => ({ value: l, label: levelLabel(l) }));

export function emptyListMessage(total: number, filter: StatusFilter): string {
  if (total === 0) return 'Aucune partie prenante dans ce projet. Créez la première avec « Nouvelle partie prenante ».';
  return `Aucune partie prenante « ${filter === 'all' ? 'Tous' : statusLabel(filter)} » : ${total} au total dans ce projet.`;
}

export interface FormValues {
  title: string;
  description: string;
  organisation: string;
  role: string;
  influence: string;
  interest: string;
}

export const EMPTY_FORM: FormValues = { title: '', description: '', organisation: '', role: '', influence: 'medium', interest: 'medium' };

export function formFrom(s: { title: string; description: string; organisation: string; role: string; influence: string; interest: string }): FormValues {
  return { title: s.title, description: s.description, organisation: s.organisation, role: s.role, influence: s.influence, interest: s.interest };
}

export type FormErrors = Partial<Record<keyof FormValues, string>>;

export type FormResult =
  | { ok: true; title: string; description: string; fields: StakeholderFields }
  | { ok: false; errors: FormErrors };

/** Valide le formulaire avec les mêmes règles que le dépôt, champ par champ, pour afficher chaque message à sa place. */
export function validateForm(values: FormValues): FormResult {
  const errors: FormErrors = {};
  const title = values.title.trim();
  if (title === '') errors.title = 'Le nom est obligatoire.';
  else if (title.length > MAX_TITLE) errors.title = `Le nom est limité à ${MAX_TITLE} caractères.`;
  let fields: StakeholderFields = { organisation: '', role: '', influence: 'medium', interest: 'medium' };
  for (const key of ['organisation', 'role', 'influence', 'interest'] as const) {
    try {
      fields = normalizeFields({ ...fields, [key]: values[key] } as Partial<StakeholderFields>);
    } catch (e) {
      errors[key] = e instanceof Error ? e.message : String(e);
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, title, description: values.description, fields: normalizeFields({ organisation: values.organisation, role: values.role, influence: values.influence as Level, interest: values.interest as Level }) };
}
