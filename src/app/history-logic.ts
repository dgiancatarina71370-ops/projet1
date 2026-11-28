// Logique pure de la section « Historique » d'une fiche (lot F7, décisions F7-D02, F7-D04, F7-D05). Sans base ni React.
import { actionLabel, fieldsText, statusTransition } from '../domain/activity-labels.ts';
import type { ItemKind } from '../domain/kinds.ts';
import { linkLabel } from '../domain/links.ts';
import { plural } from '../shared/plural.ts';
import { formatLocal } from '../shared/format.ts';

/** Lignes par tranche (F7-D05). Le dépôt porte la même valeur : un test les compare. */
export const HISTORY_PAGE = 10;

export const HISTORY_EMPTY = 'Aucune entrée d\'historique pour cet élément.';

/** Limite de F7-D03, toujours affichée sous la liste. */
export const HISTORY_LIMIT_NOTE = 'Les liens retirés avant la version 0.17.0, et la création de tout lien retiré depuis, n\'apparaissent pas ici ; ils restent dans le Journal du projet.';

/** Ce que la logique lit d'une ligne d'historique (forme du dépôt, sans l'importer). */
export interface HistoryRowInput {
  id: number;
  at: string;
  object_type: string;
  action: string;
  detail: string | null;
  link_type: string | null;
  direction: 'out' | 'in' | null;
  other_code: string | null;
}

export interface HistoryLine {
  id: number;
  when: string;
  text: string;
}

function linkText(e: HistoryRowInput, kind: ItemKind): string {
  const verb = e.action === 'created' ? 'Lien ajouté' : e.action === 'deleted' ? 'Lien retiré' : actionLabel(e.action);
  if (e.link_type === null || e.direction === null) return verb;
  // L'autre extrémité n'existe plus : le journal n'a gardé ni son code ni son titre (F7-D04).
  if (e.other_code === null) return `${verb} : vers un élément supprimé depuis`;
  return `${verb} : ${linkLabel(e.link_type, e.direction, kind)} ${e.other_code}`;
}

/** Texte d'une ligne d'historique, du point de vue de la fiche de type « kind ». Aucune valeur inattendue ne provoque d'erreur. */
export function historyLine(e: HistoryRowInput, kind: ItemKind): HistoryLine {
  const when = formatLocal(Date.parse(e.at));
  if (e.object_type === 'link') return { id: e.id, when, text: linkText(e, kind) };
  let text: string;
  if (e.action === 'created') text = 'Créé';
  else if (e.action === 'status_changed') text = `Statut : ${statusTransition(e.detail, kind) ?? 'modifié'}`;
  else if (e.action === 'updated') {
    const fields = fieldsText(e.detail, kind);
    text = fields === '' ? 'Modifié' : `Modifié · ${fields}`;
  } else text = actionLabel(e.action);
  return { id: e.id, when, text };
}

/** « 12 entrées », « 1 entrée ». */
export function historyCountText(total: number): string {
  return `${total} ${plural(total, 'entrée', 'entrées')}`;
}

/** Libellé du bouton, ou null s'il ne reste rien à montrer : « Afficher les 10 suivantes », « Afficher la suivante ». */
export function moreLabel(total: number, shown: number): string | null {
  const remaining = total - shown;
  if (remaining <= 0) return null;
  const n = Math.min(HISTORY_PAGE, remaining);
  return n === 1 ? 'Afficher la suivante' : `Afficher les ${n} suivantes`;
}
