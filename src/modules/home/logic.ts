// Logique pure de l'écran « Accueil » (lot F3) : libellés, phrases, lignes de modification. Sans base ni React.
import { isKind, kindInfo } from '../../domain/kinds.ts';
import type { ItemKind } from '../../domain/kinds.ts';
import { actionVerb, deletedLabel } from '../../domain/activity-labels.ts';
import { formatLocal } from '../../shared/format.ts';

export type DraftKind = 'need' | 'requirement' | 'story';

/** Types comptés dans les brouillons (F3-D05) : ceux qui ont un statut « Brouillon ». */
export const DRAFT_ROWS: ReadonlyArray<{ kind: DraftKind; label: string }> = [
  { kind: 'need', label: 'Besoins' },
  { kind: 'requirement', label: 'Exigences' },
  { kind: 'story', label: 'User stories' },
];

export const DRAFT_NOTE = 'Seuls les types qui ont un statut Brouillon sont comptés : besoins, exigences et user stories.';

export interface DraftLine {
  kind: DraftKind;
  label: string;
  count: number;
}

export function draftLines(counts: Record<DraftKind, number>): DraftLine[] {
  return DRAFT_ROWS.map((r) => ({ kind: r.kind, label: r.label, count: counts[r.kind] }));
}

/** Phrase d'orphelins (F3-D04) ; le bouton vers Traçabilité n'existe que s'il y en a. */
export function orphanText(n: number): string {
  if (n <= 0) return 'Aucun orphelin : chaque élément actif de la chaîne a les liens attendus.';
  return n === 1 ? '1 orphelin' : `${n} orphelins`;
}

export const NO_ACTIVITY_TEXT = 'Aucune modification d’élément dans ce projet.';

export interface ActivityInput {
  id: number;
  object_id: number | null;
  at: string;
  action: string;
  detail: string | null;
  kind: string | null;
  code: string | null;
  title: string | null;
}

export interface ActivityLine {
  id: number;
  /** Identifiant de l'élément, seulement s'il existe encore. */
  itemId: number | null;
  when: string;
  /** Verbe ou texte de la ligne : « créé », « modifié », « statut : Brouillon → Validé », « Risque supprimé »… */
  text: string;
  /** Code, titre et type de l'élément, seulement s'il existe encore (la ligne est alors cliquable). */
  code: string | null;
  title: string | null;
  kind: ItemKind | null;
}

/** Date et heure locales d'une ligne du journal (stockée en UTC, ISO 8601). */
export function activityWhen(at: string): string {
  return formatLocal(Date.parse(at));
}

export function activityLine(a: ActivityInput): ActivityLine {
  const when = activityWhen(a.at);
  if (a.action === 'deleted') {
    return { id: a.id, itemId: null, when, text: deletedLabel(a.detail), code: null, title: null, kind: null };
  }
  const kind: ItemKind | null = isKind(a.kind) ? a.kind : null;
  // Élément supprimé depuis : le journal garde l'événement, mais plus le code ni le titre.
  if (a.code === null || kind === null) return { id: a.id, itemId: null, when, text: `${actionVerb(a.action, a.detail, null)} (élément supprimé depuis)`, code: null, title: null, kind: null };
  return { id: a.id, itemId: a.object_id, when, text: actionVerb(a.action, a.detail, kind), code: a.code, title: a.title, kind };
}

/** Libellé du type, pour l'infobulle d'une ligne. */
export const kindLabel = (kind: ItemKind): string => kindInfo(kind).label;

// Repris de src/domain/activity-labels.ts (lot F4) : les écrans Accueil et Journal partagent les mêmes libellés.
export { deletedLabel } from '../../domain/activity-labels.ts';
