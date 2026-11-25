// User stories (lot M5, décision D62) : champs propres au type et règles de saisie.
// Couche « domain » : pure, sans accès à la base ni à l'interface (règle R9). Syntaxe volontairement « effaçable » (voir kinds.ts).

export const MAX_STORY_ROLE_LENGTH = 200;
/** Longueur maximale de « Je veux » et de « Afin de ». */
export const MAX_STORY_SENTENCE_LENGTH = 2000;
export const MAX_STORY_CRITERIA_LENGTH = 10000;

export interface StoryFields {
  /** « En tant que… » */
  role: string;
  /** « Je veux… » */
  goal: string;
  /** « Afin de… » */
  benefit: string;
  criteria: string;
}

export const DEFAULT_STORY_FIELDS: StoryFields = { role: '', goal: '', benefit: '', criteria: '' };

/** Complète avec les valeurs par défaut et refuse ce qui est trop long. Le rôle est nettoyé ; les textes libres gardent leurs retours à la ligne. */
export function normalizeStoryFields(input: Partial<StoryFields>): StoryFields {
  const role = (input.role ?? DEFAULT_STORY_FIELDS.role).trim();
  const goal = input.goal ?? DEFAULT_STORY_FIELDS.goal;
  const benefit = input.benefit ?? DEFAULT_STORY_FIELDS.benefit;
  const criteria = input.criteria ?? DEFAULT_STORY_FIELDS.criteria;
  if (role.length > MAX_STORY_ROLE_LENGTH) throw new Error(`Le rôle (« En tant que ») est limité à ${MAX_STORY_ROLE_LENGTH} caractères.`);
  if (goal.length > MAX_STORY_SENTENCE_LENGTH) throw new Error(`« Je veux » est limité à ${MAX_STORY_SENTENCE_LENGTH} caractères.`);
  if (benefit.length > MAX_STORY_SENTENCE_LENGTH) throw new Error(`« Afin de » est limité à ${MAX_STORY_SENTENCE_LENGTH} caractères.`);
  if (criteria.length > MAX_STORY_CRITERIA_LENGTH) throw new Error(`Les critères d'acceptation sont limités à ${MAX_STORY_CRITERIA_LENGTH} caractères.`);
  return { role, goal, benefit, criteria };
}

/** Noms (techniques) des champs qui diffèrent : sert au journal, qui ne garde jamais de contenu. */
export function changedStoryFields(before: StoryFields, after: StoryFields): Array<keyof StoryFields> {
  const names: Array<keyof StoryFields> = ['role', 'goal', 'benefit', 'criteria'];
  return names.filter((n) => before[n] !== after[n]);
}
