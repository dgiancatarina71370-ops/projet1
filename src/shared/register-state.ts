// Transitions d'état des écrans de registre (lot M8b, décision D100). Couche « shared », logique PURE (sans React, sans base).
// Reprend à l'identique le comportement des huit écrans d'origine : changer de mode, ouvrir une fiche, ouvrir et quitter un formulaire,
// confirmer une suppression, enregistrer. Le composant React (register-screen.tsx) ne fait que brancher ces transitions sur `useReducer`.
// Ce qui reste hors de ce fichier : les listes chargées, le filtre, la demande d'ouverture et les appels à la base.
import { isDirty } from './register-logic.ts';

export type Mode = { kind: 'list' } | { kind: 'detail'; id: number } | { kind: 'form'; id: number | null };

export interface RegisterState<F extends object> {
  mode: Mode;
  values: F;
  /** État du formulaire à l'ouverture : sert à savoir s'il a été modifié. */
  initial: F;
  errors: Partial<Record<keyof F, string>>;
  busy: boolean;
  error: string;
  /** Message de confirmation de suppression (null : aucune demande en cours). */
  confirmDelete: string | null;
  /** Question « abandonner la saisie ? » affichée dans le formulaire. */
  askAbandon: boolean;
}

export function initialState<F extends object>(empty: F): RegisterState<F> {
  return { mode: { kind: 'list' }, values: empty, initial: empty, errors: {}, busy: false, error: '', confirmDelete: null, askAbandon: false };
}

export type RegisterAction<F extends object> =
  /** Le projet actif change : retour à la liste, sans confirmation de suppression ni erreur. Le formulaire et la question d'abandon ne sont pas touchés. */
  | { type: 'projectChanged' }
  /** Ouverture d'une fiche (clic dans la liste, ou demande venue de la traçabilité). */
  | { type: 'open'; id: number }
  /** Retour à la liste depuis une fiche : efface aussi la confirmation de suppression. */
  | { type: 'backToList' }
  /** Retour à la liste depuis le message « n'existe plus » : ne touche à rien d'autre. */
  | { type: 'leaveMissing' }
  | { type: 'openForm'; id: number | null; start: F }
  | { type: 'change'; key: keyof F; value: string }
  | { type: 'cancelForm' }
  | { type: 'leaveForm' }
  | { type: 'keepEditing' }
  | { type: 'invalid'; errors: Partial<Record<keyof F, string>> }
  | { type: 'valid' }
  | { type: 'runStart' }
  | { type: 'runEnd' }
  /** Échec d'une action : le message s'affiche (l'état « occupé » est géré par runStart et runEnd). */
  | { type: 'fail'; message: string }
  | { type: 'askDelete'; message: string }
  | { type: 'cancelDelete' }
  /** Enregistrement réussi : la fiche enregistrée s'ouvre. */
  | { type: 'saved'; id: number }
  /** Suppression réussie : retour à la liste, confirmation effacée. */
  | { type: 'deleted' };

export function registerReducer<F extends object>(state: RegisterState<F>, action: RegisterAction<F>): RegisterState<F> {
  switch (action.type) {
    case 'projectChanged':
      return { ...state, mode: { kind: 'list' }, confirmDelete: null, error: '' };
    case 'open':
      return { ...state, confirmDelete: null, error: '', mode: { kind: 'detail', id: action.id } };
    case 'backToList':
      return { ...state, confirmDelete: null, mode: { kind: 'list' } };
    case 'leaveMissing':
      return { ...state, mode: { kind: 'list' } };
    case 'openForm':
      return { ...state, values: action.start, initial: action.start, errors: {}, error: '', askAbandon: false, mode: { kind: 'form', id: action.id } };
    case 'change':
      return { ...state, values: { ...state.values, [action.key]: action.value } as F };
    case 'cancelForm':
      return isDirty(state.initial, state.values) ? { ...state, askAbandon: true } : leaveForm(state);
    case 'leaveForm':
      return leaveForm(state);
    case 'keepEditing':
      return { ...state, askAbandon: false };
    case 'invalid':
      return { ...state, errors: action.errors };
    case 'valid':
      return { ...state, errors: {} };
    case 'runStart':
      return { ...state, busy: true, error: '' };
    case 'runEnd':
      return { ...state, busy: false };
    case 'fail':
      return { ...state, error: action.message };
    case 'askDelete':
      return { ...state, confirmDelete: action.message };
    case 'cancelDelete':
      return { ...state, confirmDelete: null };
    case 'saved':
      return { ...state, mode: { kind: 'detail', id: action.id } };
    case 'deleted':
      return { ...state, confirmDelete: null, mode: { kind: 'list' } };
  }
}

/** Quitter le formulaire : retour à la fiche si on modifiait un élément, à la liste si on en créait un. */
function leaveForm<F extends object>(state: RegisterState<F>): RegisterState<F> {
  const mode: Mode = state.mode.kind === 'form' && state.mode.id !== null ? { kind: 'detail', id: state.mode.id } : { kind: 'list' };
  return { ...state, askAbandon: false, mode };
}
