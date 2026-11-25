// Exigences (lot M3b, décisions D36 et D46) : champs propres au type, vocabulaire et règles de saisie.
// Couche « domain » : pure, sans accès à la base ni à l'interface (règle R9 de scripts/check-architecture.mjs).
// Syntaxe volontairement « effaçable » (ni enum ni propriété de paramètre) : ce fichier s'exécute tel quel sous Node pour les tests.

export type Nature = 'functional' | 'non_functional' | 'constraint';
export type Priority = 'must' | 'should' | 'could' | 'wont';

export const NATURES: readonly Nature[] = ['functional', 'non_functional', 'constraint'];
export const PRIORITIES: readonly Priority[] = ['must', 'should', 'could', 'wont'];

const NATURE_LABELS: Record<Nature, string> = {
  functional: 'Fonctionnelle',
  non_functional: 'Non fonctionnelle',
  constraint: 'Contrainte',
};

// Libellés validés par David (25/11/2026) : le vocabulaire MoSCoW d'origine reste visible entre parenthèses.
const PRIORITY_LABELS: Record<Priority, string> = {
  must: 'Indispensable (Must)',
  should: 'Important (Should)',
  could: 'Souhaitable (Could)',
  wont: 'Hors périmètre (Won\'t)',
};

/** Longueur maximale des critères d'acceptation (texte libre : le cadre qualité structuré viendra plus tard). */
export const MAX_CRITERIA_LENGTH = 10000;

export interface RequirementFields {
  nature: Nature;
  priority: Priority;
  criteria: string;
}

/** Valeurs de création quand rien n'est précisé : une exigence fonctionnelle d'importance moyenne. À préciser par l'utilisateur. */
export const DEFAULT_REQUIREMENT_FIELDS: RequirementFields = { nature: 'functional', priority: 'should', criteria: '' };

export function isNature(value: unknown): value is Nature {
  return typeof value === 'string' && (NATURES as readonly string[]).includes(value);
}

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value);
}

export function natureLabel(nature: string): string {
  return isNature(nature) ? NATURE_LABELS[nature] : `Inconnue (${nature})`;
}

export function priorityLabel(priority: string): string {
  return isPriority(priority) ? PRIORITY_LABELS[priority] : `Inconnue (${priority})`;
}

/** Complète avec les valeurs par défaut et refuse ce qui n'est pas valide. Les critères gardent leurs retours à la ligne. */
export function normalizeRequirementFields(input: Partial<RequirementFields>): RequirementFields {
  const nature = input.nature ?? DEFAULT_REQUIREMENT_FIELDS.nature;
  const priority = input.priority ?? DEFAULT_REQUIREMENT_FIELDS.priority;
  const criteria = input.criteria ?? DEFAULT_REQUIREMENT_FIELDS.criteria;
  if (!isNature(nature)) throw new Error(`Nature d'exigence inconnue : « ${String(nature)} ».`);
  if (!isPriority(priority)) throw new Error(`Priorité inconnue : « ${String(priority)} ».`);
  if (criteria.length > MAX_CRITERIA_LENGTH) throw new Error(`Les critères d'acceptation sont limités à ${MAX_CRITERIA_LENGTH} caractères.`);
  return { nature, priority, criteria };
}

/** Noms (techniques) des champs qui diffèrent : sert au journal, qui ne garde jamais de contenu. */
export function changedRequirementFields(before: RequirementFields, after: RequirementFields): Array<keyof RequirementFields> {
  const names: Array<keyof RequirementFields> = ['nature', 'priority', 'criteria'];
  return names.filter((n) => before[n] !== after[n]);
}
