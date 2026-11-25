// Logique pure de l'écran « User stories » (lot M5) : filtres, formulaire, validation. Sans base ni React.
import { MAX_TITLE } from '../../domain/stakeholders.ts';
import { normalizeStoryFields } from '../../domain/stories.ts';
import type { StoryFields } from '../../domain/stories.ts';
import { kindInfo, statusLabel } from '../../domain/kinds.ts';
import { emptyListText, titleProblem } from '../../shared/register-logic.ts';

/** Statuts d'une user story, dans l'ordre du cycle de vie (décision D63). Libellés accordés au féminin. */
export const STORY_STATUSES: readonly string[] = kindInfo('story').statuses;

export const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = STORY_STATUSES.map((s) => ({ value: s, label: statusLabel(s, 'story') }));

export const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [{ value: 'all', label: 'Toutes' }, ...STATUS_OPTIONS];

export const emptyStoriesMessage = (total: number, filter: string): string =>
  emptyListText(total, filter === 'all' ? null : statusLabel(filter, 'story'), 'Aucune user story', 'Créez la première avec « Nouvelle user story ».', 'Toutes');

export interface StoryForm {
  title: string;
  description: string;
  role: string;
  goal: string;
  benefit: string;
  criteria: string;
}

export const EMPTY_STORY_FORM: StoryForm = { title: '', description: '', role: '', goal: '', benefit: '', criteria: '' };

export type StoryFormErrors = Partial<Record<keyof StoryForm, string>>;

export type StoryFormResult =
  | { ok: true; title: string; description: string; fields: StoryFields }
  | { ok: false; errors: StoryFormErrors };

/** Valide le formulaire avec les mêmes règles que le dépôt, champ par champ, pour afficher chaque message à sa place. */
export function validateStoryForm(values: StoryForm): StoryFormResult {
  const errors: StoryFormErrors = {};
  const t = titleProblem(values.title, 'de la user story', MAX_TITLE);
  if (t) errors.title = t;
  for (const key of ['role', 'goal', 'benefit', 'criteria'] as const) {
    try {
      normalizeStoryFields({ [key]: values[key] });
    } catch (e) {
      errors[key] = e instanceof Error ? e.message : String(e);
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const fields = normalizeStoryFields({ role: values.role, goal: values.goal, benefit: values.benefit, criteria: values.criteria });
  return { ok: true, title: values.title.trim(), description: values.description, fields };
}
