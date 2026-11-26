// Ateliers (lot M7, décisions D80 et D81) : champs propres au type et règles de saisie.
// Couche « domain » : pure, sans accès à la base ni à l'interface (règle R9). Syntaxe volontairement « effaçable » (voir kinds.ts).
import { isCalendarDate } from './decisions.ts';

export const MAX_WORKSHOP_PLACE_LENGTH = 200;
export const MAX_WORKSHOP_OBJECTIVE_LENGTH = 2000;
/** Longueur maximale des notes et des points ouverts (textes libres). */
export const MAX_WORKSHOP_TEXT_LENGTH = 10000;

export interface WorkshopFields {
  /** Jour de l'atelier au format AAAA-MM-JJ, sans heure ni fuseau ; chaîne vide si inconnu. */
  heldOn: string;
  place: string;
  objective: string;
  notes: string;
  /** Points ouverts et actions : texte libre, non suivi (décision D85). */
  followUp: string;
}

export const DEFAULT_WORKSHOP_FIELDS: WorkshopFields = { heldOn: '', place: '', objective: '', notes: '', followUp: '' };

/** Complète avec les valeurs par défaut, nettoie les espaces (sauf dans les textes libres) et refuse ce qui n'est pas valide. */
export function normalizeWorkshopFields(input: Partial<WorkshopFields>): WorkshopFields {
  const heldOn = (input.heldOn ?? DEFAULT_WORKSHOP_FIELDS.heldOn).trim();
  const place = (input.place ?? DEFAULT_WORKSHOP_FIELDS.place).trim();
  const objective = input.objective ?? DEFAULT_WORKSHOP_FIELDS.objective;
  const notes = input.notes ?? DEFAULT_WORKSHOP_FIELDS.notes;
  const followUp = input.followUp ?? DEFAULT_WORKSHOP_FIELDS.followUp;
  if (heldOn !== '' && !isCalendarDate(heldOn)) throw new Error(`La date de l'atelier doit être un jour valide au format AAAA-MM-JJ (reçu : « ${heldOn} »).`);
  if (place.length > MAX_WORKSHOP_PLACE_LENGTH) throw new Error(`Le lieu ou format est limité à ${MAX_WORKSHOP_PLACE_LENGTH} caractères.`);
  if (objective.length > MAX_WORKSHOP_OBJECTIVE_LENGTH) throw new Error(`L'objectif est limité à ${MAX_WORKSHOP_OBJECTIVE_LENGTH} caractères.`);
  if (notes.length > MAX_WORKSHOP_TEXT_LENGTH) throw new Error(`Les notes sont limitées à ${MAX_WORKSHOP_TEXT_LENGTH} caractères.`);
  if (followUp.length > MAX_WORKSHOP_TEXT_LENGTH) throw new Error(`Les points ouverts et actions sont limités à ${MAX_WORKSHOP_TEXT_LENGTH} caractères.`);
  return { heldOn, place, objective, notes, followUp };
}

/** Noms (techniques) des champs qui diffèrent : sert au journal, qui ne garde jamais de contenu. */
export function changedWorkshopFields(before: WorkshopFields, after: WorkshopFields): Array<keyof WorkshopFields> {
  const names: Array<keyof WorkshopFields> = ['heldOn', 'place', 'objective', 'notes', 'followUp'];
  return names.filter((n) => before[n] !== after[n]);
}
