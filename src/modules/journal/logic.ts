// Logique pure de l'écran « Journal » (lot F4) : pagination, messages, mise en forme d'une ligne. Sans base ni React.
import { isKind, kindInfo } from '../../domain/kinds.ts';
import type { ItemKind } from '../../domain/kinds.ts';
import { actionLabel, deletedLabel, fieldsText, linkTypeLabel, objectTypeLabel, statusTransition } from '../../domain/activity-labels.ts';
import { isVerdict, verdictLabel } from '../../domain/distribution.ts';
import { linkTypeOfDetail } from '../../domain/link-detail.ts';
import { formatLocal } from '../../shared/format.ts';

/** Nombre de pages : au moins une, même sans entrée (jamais « Page 1 sur 0 »). */
export function pageCount(total: number, pageSize: number): number {
  return total <= 0 || pageSize <= 0 ? 1 : Math.ceil(total / pageSize);
}

/** Ramène une page demandée dans l'intervalle [1, pages]. */
export function clampPage(page: number, pages: number): number {
  if (!Number.isFinite(page) || page < 1) return 1;
  return page > pages ? pages : Math.floor(page);
}

/** « Page 2 sur 5 · 118 entrées ». */
export function pageText(page: number, pages: number, total: number): string {
  return `Page ${page} sur ${pages} · ${total} ${total > 1 ? 'entrées' : 'entrée'}`;
}

/** Message d'une liste vide : journal vide, ou filtres qui ne retiennent rien (avec le total du projet). */
export function emptyJournalText(unfilteredTotal: number): string {
  return unfilteredTotal === 0 ? 'Aucune entrée dans le journal de ce projet.' : `Aucune entrée pour ces filtres (${unfilteredTotal} au total dans ce projet).`;
}

export interface JournalRowInput {
  id: number;
  at: string;
  object_type: string;
  object_id: number | null;
  action: string;
  detail: string | null;
  item_kind: string | null;
  item_code: string | null;
  item_title: string | null;
  link_type: string | null;
  from_code: string | null;
  to_code: string | null;
  document_name: string | null;
  project_name: string | null;
}

export interface JournalLine {
  id: number;
  when: string;
  object: string;
  action: string;
  /** Texte du libellé : titre de l'élément, « BES-001 → EX-001 », nom du document, « Exigence supprimée »… */
  label: string;
  /** Code, type et identifiant de l'élément : seulement s'il existe encore (le code est alors cliquable). */
  code: string | null;
  kind: ItemKind | null;
  itemId: number | null;
  detail: string;
}

const GONE = 'supprimé depuis';

/**
 * Détail d'un document : une création de document généré s'écrit « v2 » au journal et s'affiche « Version 2 » (F5-D12) ;
 * un changement d'état s'écrit « draft>validated » et s'affiche « Brouillon → Validé » (F6-D09).
 */
function documentDetail(action: string, detail: string | null): string {
  if (action === 'status_changed') return statusTransition(detail, null) ?? 'statut modifié';
  if (action !== 'created' || detail === null) return '';
  const m = /^v(\d+)$/.exec(detail);
  return m ? `Version ${m[1]}` : '';
}

/** Détail d'une diffusion (F8-D11) : des codes (« prepared>sent », « reply:approved »), jamais d'adresse, d'objet ni de commentaire. */
export function distributionDetail(action: string, detail: string | null): string {
  if (action === 'created') return 'Diffusion préparée';
  if (action === 'deleted') return 'Diffusion supprimée';
  if (action === 'status_changed') {
    if (detail === 'prepared>sent') return 'Préparée → Envoyée';
    if (detail === 'sent>prepared') return 'Envoi annulé : Envoyée → Préparée';
    return 'statut modifié';
  }
  const m = /^reply:(.+)$/.exec(detail ?? '');
  if (m) return m[1] === 'removed' ? 'Réponse retirée' : isVerdict(m[1]) ? `Réponse : ${verdictLabel(m[1]).toLowerCase()}` : 'Réponse saisie';
  return `Diffusion modifiée : ${fieldsText(detail, null)}`;
}

function itemLine(e: JournalRowInput, base: Omit<JournalLine, 'label' | 'code' | 'kind' | 'itemId' | 'detail' | 'object'>): JournalLine {
  if (e.action === 'deleted') return { ...base, object: 'Élément', label: deletedLabel(e.detail), code: null, kind: null, itemId: null, detail: '' };
  const kind: ItemKind | null = isKind(e.item_kind) ? e.item_kind : null;
  // Élément supprimé depuis : le journal garde l'événement, mais plus le code ni le titre.
  if (e.item_code === null || kind === null) return { ...base, object: 'Élément', label: `(élément ${GONE})`, code: null, kind: null, itemId: null, detail: '' };
  let detail = '';
  if (e.action === 'status_changed') detail = statusTransition(e.detail, kind) ?? 'statut modifié';
  else if (e.action === 'updated') detail = fieldsText(e.detail, kind);
  return { ...base, object: kindInfo(kind).label, label: e.item_title ?? '', code: e.item_code, kind, itemId: e.object_id, detail };
}

/** Met en forme une entrée du journal pour l'écran (F4-D05, F4-D07). Aucune valeur inattendue ne provoque d'erreur. */
export function journalLine(e: JournalRowInput): JournalLine {
  const base = { id: e.id, when: formatLocal(Date.parse(e.at)), action: actionLabel(e.action) };
  const none = { code: null, kind: null, itemId: null } as const;
  if (e.object_type === 'item') return itemLine(e, base);
  if (e.object_type === 'link') {
    // Le détail d'un lien s'écrit « type » (jusqu'à la 0.16.0) ou « type:origine>cible » (dès la 0.17.0, F7-D03) : le Journal lit le type dans les deux (F7-D10).
    const type = linkTypeLabel(e.link_type ?? linkTypeOfDetail(e.detail));
    if (e.action === 'deleted') return { ...base, object: 'Lien', label: 'Lien supprimé', ...none, detail: type };
    if (e.from_code === null || e.to_code === null) return { ...base, object: 'Lien', label: `(lien ${GONE})`, ...none, detail: type };
    return { ...base, object: 'Lien', label: `${e.from_code} → ${e.to_code}`, ...none, detail: type };
  }
  if (e.object_type === 'document') {
    const label = e.document_name ?? (e.action === 'deleted' ? 'Document supprimé' : `(document ${GONE})`);
    return { ...base, object: 'Document', label, ...none, detail: e.action === 'imported' ? 'Importé depuis la V1' : documentDetail(e.action, e.detail) };
  }
  if (e.object_type === 'distribution') {
    const label = e.document_name ?? (e.action === 'deleted' ? 'Document diffusé' : `(document ${GONE})`);
    return { ...base, object: 'Document', label, ...none, detail: distributionDetail(e.action, e.detail) };
  }
  if (e.object_type === 'document_send') return { ...base, object: 'Document', label: 'Envoi de document', ...none, detail: e.action === 'imported' ? 'Importé depuis la V1' : '' };
  if (e.object_type === 'project' || e.object_type === 'folder') {
    const label = e.project_name ?? (e.action === 'deleted' ? 'Projet supprimé' : `(projet ${GONE})`);
    return { ...base, object: objectTypeLabel(e.object_type), label, ...none, detail: e.action === 'updated' ? fieldsText(e.detail, null) : '' };
  }
  return { ...base, object: objectTypeLabel(e.object_type), label: e.object_type, ...none, detail: e.detail ?? '' };
}
