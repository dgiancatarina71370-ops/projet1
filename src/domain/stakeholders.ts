// Parties prenantes (lot M3a, décisions D36 et D37) : champs propres au type, niveaux, règles de saisie et libellés.
// Couche « domain » : pure, sans accès à la base ni à l'interface (règle R9 de scripts/check-architecture.mjs).
// Syntaxe volontairement « effaçable » (ni enum ni propriété de paramètre) : ce fichier s'exécute tel quel sous Node pour les tests.

export type Level = 'low' | 'medium' | 'high';

export const LEVELS: readonly Level[] = ['low', 'medium', 'high'];

const LEVEL_LABELS: Record<Level, string> = { low: 'Faible', medium: 'Moyen', high: 'Élevé' };

export const MAX_FIELD_LENGTH = 200;
/** Longueur maximale d'un titre d'élément : identique à MAX_TITLE_LENGTH du dépôt des éléments (vérifié par un test). */
export const MAX_TITLE = 200;

export const STATUS_LABELS: Record<string, string> = { active: 'Actif', archived: 'Archivé' };

export interface StakeholderFields {
  organisation: string;
  role: string;
  influence: Level;
  interest: Level;
}

export const DEFAULT_FIELDS: StakeholderFields = { organisation: '', role: '', influence: 'medium', interest: 'medium' };

export function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

export function levelLabel(level: string): string {
  return isLevel(level) ? LEVEL_LABELS[level] : `Inconnu (${level})`;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? `Inconnu (${status})`;
}

/** Complète avec les valeurs par défaut, nettoie les espaces et refuse ce qui n'est pas valide. */
export function normalizeFields(input: Partial<StakeholderFields>): StakeholderFields {
  const organisation = (input.organisation ?? DEFAULT_FIELDS.organisation).trim();
  const role = (input.role ?? DEFAULT_FIELDS.role).trim();
  const influence = input.influence ?? DEFAULT_FIELDS.influence;
  const interest = input.interest ?? DEFAULT_FIELDS.interest;
  if (organisation.length > MAX_FIELD_LENGTH) throw new Error(`L'organisation est limitée à ${MAX_FIELD_LENGTH} caractères.`);
  if (role.length > MAX_FIELD_LENGTH) throw new Error(`Le rôle est limité à ${MAX_FIELD_LENGTH} caractères.`);
  if (!isLevel(influence)) throw new Error(`Niveau d'influence inconnu : « ${String(influence)} ».`);
  if (!isLevel(interest)) throw new Error(`Niveau d'intérêt inconnu : « ${String(interest)} ».`);
  return { organisation, role, influence, interest };
}

/** Noms (techniques) des champs qui diffèrent : sert au journal, qui ne garde jamais de contenu. */
export function changedFields(before: StakeholderFields, after: StakeholderFields): Array<keyof StakeholderFields> {
  const names: Array<keyof StakeholderFields> = ['organisation', 'role', 'influence', 'interest'];
  return names.filter((n) => before[n] !== after[n]);
}
