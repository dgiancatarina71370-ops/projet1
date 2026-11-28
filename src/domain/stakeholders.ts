// Parties prenantes (lot M3a, décisions D36 et D37) : champs propres au type, niveaux, règles de saisie et libellés.
// Couche « domain » : pure, sans accès à la base ni à l'interface (règle R9 de scripts/check-architecture.mjs).
// Syntaxe volontairement « effaçable » (ni enum ni propriété de paramètre) : ce fichier s'exécute tel quel sous Node pour les tests.

import { statusLabel } from './kinds.ts';

export { statusLabel };

export type Level = 'low' | 'medium' | 'high';

export const LEVELS: readonly Level[] = ['low', 'medium', 'high'];

const LEVEL_LABELS: Record<Level, string> = { low: 'Faible', medium: 'Moyen', high: 'Élevé' };

export const MAX_FIELD_LENGTH = 200;
/** Longueur maximale d'un titre d'élément : identique à MAX_TITLE_LENGTH du dépôt des éléments (vérifié par un test). */
export const MAX_TITLE = 200;


export interface StakeholderFields {
  organisation: string;
  role: string;
  influence: Level;
  interest: Level;
  /** Adresse e-mail (lot F8, F8-D02) : facultative, vide par défaut. */
  email: string;
}

export const DEFAULT_FIELDS: StakeholderFields = { organisation: '', role: '', influence: 'medium', interest: 'medium', email: '' };

/** Longueur maximale d'une adresse e-mail (F8-D02). */
export const MAX_EMAIL = 254;

export const INVALID_EMAIL = 'Adresse e-mail non valide.';

/**
 * Contrôle de FORME d'une adresse (F8-D02) : un seul @, du texte avant et après, aucun espace, un point dans la partie après le @, ni au début ni à la fin de cette partie.
 * Ce n'est pas la norme complète : une adresse fausse mais bien formée passe.
 */
export function isEmailShaped(value: string): boolean {
  if (value.length === 0 || value.length > MAX_EMAIL || /\s/.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (local.length === 0 || domain.length === 0) return false;
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

/** Adresse nettoyée (espaces aux deux bouts retirés) ; vide permis ; refuse une valeur mal formée. */
export function normalizeEmail(value: string | undefined): string {
  const email = (value ?? '').trim();
  if (email === '') return '';
  if (!isEmailShaped(email)) throw new Error(INVALID_EMAIL);
  return email;
}

export function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

export function levelLabel(level: string): string {
  return isLevel(level) ? LEVEL_LABELS[level] : `Inconnu (${level})`;
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
  const email = normalizeEmail(input.email);
  return { organisation, role, influence, interest, email };
}

/** Noms (techniques) des champs qui diffèrent : sert au journal, qui ne garde jamais de contenu. */
export function changedFields(before: StakeholderFields, after: StakeholderFields): Array<keyof StakeholderFields> {
  const names: Array<keyof StakeholderFields> = ['organisation', 'role', 'influence', 'interest', 'email'];
  return names.filter((n) => before[n] !== after[n]);
}
