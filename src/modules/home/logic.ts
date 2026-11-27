// Logique pure de l'écran « Accueil » (lot F3) : libellés, phrases, lignes de modification. Sans base ni React.
import { isKind, kindInfo, statusLabel } from '../../domain/kinds.ts';
import type { ItemKind } from '../../domain/kinds.ts';
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

/** Libellé de suppression, accordé au genre du type. */
const DELETED_LABELS: Record<ItemKind, string> = {
  stakeholder: 'Partie prenante supprimée',
  need: 'Besoin supprimé',
  requirement: 'Exigence supprimée',
  decision: 'Décision supprimée',
  risk: 'Risque supprimé',
  story: 'User story supprimée',
  test: 'Test supprimé',
  workshop: 'Atelier supprimé',
};

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

function statusText(detail: string | null, kind: ItemKind | null): string {
  const parts = (detail ?? '').split('>');
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') return 'statut modifié';
  return `statut : ${statusLabel(parts[0], kind ?? undefined)} → ${statusLabel(parts[1], kind ?? undefined)}`;
}

function verb(action: string, detail: string | null, kind: ItemKind | null): string {
  if (action === 'created') return 'créé';
  if (action === 'status_changed') return statusText(detail, kind);
  if (action === 'updated') return 'modifié';
  return action;
}

export function activityLine(a: ActivityInput): ActivityLine {
  const when = activityWhen(a.at);
  if (a.action === 'deleted') {
    return { id: a.id, itemId: null, when, text: isKind(a.detail) ? DELETED_LABELS[a.detail] : 'Élément supprimé', code: null, title: null, kind: null };
  }
  const kind: ItemKind | null = isKind(a.kind) ? a.kind : null;
  // Élément supprimé depuis : le journal garde l'événement, mais plus le code ni le titre.
  if (a.code === null || kind === null) return { id: a.id, itemId: null, when, text: `${verb(a.action, a.detail, null)} (élément supprimé depuis)`, code: null, title: null, kind: null };
  return { id: a.id, itemId: a.object_id, when, text: verb(a.action, a.detail, kind), code: a.code, title: a.title, kind };
}

/** Libellé du type, pour l'infobulle d'une ligne. */
export const kindLabel = (kind: ItemKind): string => kindInfo(kind).label;
