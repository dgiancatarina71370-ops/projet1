// Logique pure de l'écran « Documents » (lot F5) : lignes de la liste, filtre des versions remplacées, détail, messages. Sans base ni React.
import { KINDS, statusLabel } from '../../domain/kinds.ts';
import type { ItemKind } from '../../domain/kinds.ts';
import { availableActions, displayState, documentStatusLabel, hasDifferences, modelOfSeries, originLabel, parseOptions, parseSnapshot } from '../../domain/documents.ts';
import type { Comparison, DocumentAction, SnapshotItem } from '../../domain/documents.ts';
import { formatLocal } from '../../shared/format.ts';

/** Ce que la liste reçoit de la base pour un document (champs lus par le dépôt). */
export interface DocumentInput {
  id: number;
  name: string;
  status: string;
  version: number;
  series_key: string | null;
  replaces_id: number | null;
  replaced_by_id: number | null;
  replaced_by_version: number | null;
  updated_at: string;
  validated_at?: string | null;
  archived_at?: string | null;
  validation_comment?: string | null;
}

export interface DocumentLine {
  id: number;
  name: string;
  /** « v2 » pour un document généré ; vide pour un document importé de la V1 (il n'a pas de série). */
  version: string;
  state: string;
  origin: string;
  when: string;
  replaced: boolean;
}

export function documentLine(d: DocumentInput): DocumentLine {
  const generated = d.series_key !== null;
  return {
    id: d.id,
    name: d.name,
    version: generated ? `v${d.version}` : '',
    state: displayState(d.status, d.replaced_by_id),
    origin: originLabel(generated),
    when: formatLocal(Date.parse(d.updated_at)),
    replaced: d.replaced_by_id !== null,
  };
}

/**
 * Liste affichée (F5-D11, F6-D08) : un document est visible s'il est non remplacé ou si la case « remplacées » est cochée,
 * et s'il est non archivé ou si la case « archivés » est cochée. L'ordre reçu est conservé.
 * Sans troisième argument, les archivés restent visibles (comportement de F5).
 */
export function visibleDocuments<T extends { status?: string; replaced_by_id: number | null }>(docs: readonly T[], showReplaced: boolean, showArchived = true): T[] {
  return docs.filter((d) => (showReplaced || d.replaced_by_id === null) && (showArchived || d.status !== 'archived' || d.replaced_by_id !== null));
}

/** Nombre de versions remplacées que la case permet de voir (affiché à côté de la case). */
export function replacedCount(docs: readonly { replaced_by_id: number | null }[]): number {
  return docs.filter((d) => d.replaced_by_id !== null).length;
}

/** Nombre de documents archivés non remplacés que la case « archivés » permet de voir (F6-D08) ; un archivé remplacé compte parmi les remplacés. */
export function archivedCount(docs: readonly { status: string; replaced_by_id: number | null }[]): number {
  return docs.filter((d) => d.status === 'archived' && d.replaced_by_id === null).length;
}

export function emptyDocumentsText(total: number): string {
  return total === 0 ? 'Aucun document dans ce projet. Enregistrez un livrable depuis l’écran Livrables.' : 'Aucun document à afficher.';
}

export interface DetailInput extends DocumentInput {
  kind: string;
  template_ref: string | null;
  replaces_version: number | null;
  options_json: string | null;
  items_snapshot: string | null;
}

export interface SnapshotRow {
  code: string;
  title: string;
  status: string;
}

/** Type d'élément d'après le préfixe du code (EX-001 → exigence), pour accorder le libellé du statut. null si le code est inconnu. */
export function kindOfCode(code: string): ItemKind | null {
  const m = /^([A-Z]+)-\d+$/.exec(code);
  if (!m) return null;
  return KINDS.find((k) => k.prefix === m[1])?.kind ?? null;
}

export function snapshotRows(items: readonly SnapshotItem[]): SnapshotRow[] {
  return items.map((i) => {
    const kind = kindOfCode(i.code);
    return { code: i.code, title: i.title, status: kind === null ? i.status : statusLabel(i.status, kind) };
  });
}

export interface DocumentDetailView {
  title: string;
  /** Lignes d'en-tête « libellé : valeur », dans l'ordre d'affichage. */
  facts: Array<{ label: string; value: string }>;
  /** Liste figée ; null : document sans liste (importé de la V1). */
  items: SnapshotRow[] | null;
  noItemsText: string;
  /** Gestes proposés (F6) : un geste non permis n'est pas affiché. */
  actions: DocumentAction[];
  /** La comparaison n'est proposée que pour un document généré (F6-D06). */
  canCompare: boolean;
}

export function replacementText(replacesVersion: number | null, replacedByVersion: number | null): string {
  if (replacedByVersion !== null) return `Remplacée par la version ${replacedByVersion}`;
  if (replacesVersion !== null) return `Remplace la version ${replacesVersion}`;
  return '';
}

function optionsText(modelId: string, includeArchived: boolean): string {
  if (modelId === 'traceability') return 'Sans objet : la matrice ignore toujours les éléments archivés ou rejetés';
  return includeArchived ? 'Éléments archivés ou rejetés inclus' : 'Éléments archivés ou rejetés exclus';
}

export function detailView(d: DetailInput): DocumentDetailView {
  const generated = d.series_key !== null;
  const facts: Array<{ label: string; value: string }> = [
    { label: 'État', value: displayState(d.status, d.replaced_by_id) },
    { label: 'Origine', value: originLabel(generated) },
    { label: 'Dernière date', value: formatLocal(Date.parse(d.updated_at)) },
  ];
  if (generated) facts.splice(1, 0, { label: 'Version', value: String(d.version) });
  const link = replacementText(d.replaces_version, d.replaced_by_version);
  if (link !== '') facts.push({ label: 'Série', value: link });
  if (generated) {
    const options = parseOptions(d.options_json);
    facts.push({ label: 'Options', value: options === null ? 'Non enregistrées' : optionsText(modelOfSeries(d.series_key as string), options.includeArchived) });
  }
  const dateOf = (iso: string | null | undefined): string => (iso == null ? '' : formatLocal(Date.parse(iso)));
  if (d.validated_at != null) facts.push({ label: 'Validé le', value: dateOf(d.validated_at) });
  if (d.validation_comment != null && d.validation_comment !== '') facts.push({ label: 'Commentaire de validation', value: d.validation_comment });
  if (d.status === 'archived' && d.archived_at != null) facts.push({ label: 'Archivé le', value: dateOf(d.archived_at) });
  const parsed = generated ? parseSnapshot(d.items_snapshot) : null;
  return {
    title: d.name,
    facts,
    actions: availableActions(d.status, d.replaced_by_id !== null),
    canCompare: generated,
    items: parsed === null ? null : snapshotRows(parsed),
    noItemsText: generated ? 'La liste figée de ce document est absente ou illisible.' : 'Ce document a été importé de la V1 : il n’a pas de liste figée.',
  };
}

export function exportedMessage(formatLabel: string, name: string, size: string, path: string): string {
  return `Export ${formatLabel} créé : ${name} (${size}). Emplacement : ${path}`;
}


// ------------------------------------------------------------------ lot F6 : messages et comparaison

export const MAX_COMMENT_HINT = 'Commentaire de validation (facultatif, 500 caractères)';

export function validatedMessage(validatedAt: string): string {
  return `Document validé le ${formatLocal(Date.parse(validatedAt)).slice(0, 10)}.`;
}

export const archivedMessage = 'Document archivé. Il n’apparaît plus dans la liste ; cochez « Afficher les archivés » pour le retrouver.';

export function unarchivedMessage(target: 'validated' | 'draft'): string {
  return `Document désarchivé : il est de nouveau ${documentStatusLabel(target)}.`;
}

export const comparisonNote = 'Calculé maintenant ; rien n’est enregistré.';
export const noDifferenceText = 'Aucun écart sur les éléments listés (code, titre, statut). Les descriptions, critères et liens ne sont pas comparés.';

export interface ComparisonGroup {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface ComparisonView {
  summary: string;
  groups: ComparisonGroup[];
  note: string;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Présentation d'une comparaison (F6-D06, D07) : synthèse et un tableau par groupe non vide, groupes déjà triés par code. */
export function comparisonView(c: Comparison): ComparisonView {
  const label = (code: string, status: string): string => {
    const kind = kindOfCode(code);
    return kind === null ? status : statusLabel(status, kind);
  };
  const groups: ComparisonGroup[] = [];
  if (c.added.length > 0) groups.push({ title: 'Ajoutés', headers: ['Code', 'Titre', 'Statut'], rows: c.added.map((i) => [i.code, i.title, label(i.code, i.status)]) });
  if (c.removed.length > 0) groups.push({ title: 'Retirés', headers: ['Code', 'Titre figé', 'Statut figé'], rows: c.removed.map((i) => [i.code, i.title, label(i.code, i.status)]) });
  if (c.statusChanged.length > 0) groups.push({ title: 'Statut modifié', headers: ['Code', 'Titre', 'Changement'], rows: c.statusChanged.map((i) => [i.code, i.title, `${label(i.code, i.from)} → ${label(i.code, i.to)}`]) });
  if (c.titleChanged.length > 0) groups.push({ title: 'Titre modifié', headers: ['Code', 'Titre figé', 'Titre actuel'], rows: c.titleChanged.map((i) => [i.code, i.from, i.to]) });
  const parts = [
    c.added.length > 0 ? plural(c.added.length, 'ajouté', 'ajoutés') : '',
    c.removed.length > 0 ? plural(c.removed.length, 'retiré', 'retirés') : '',
    c.statusChanged.length > 0 ? plural(c.statusChanged.length, 'statut modifié', 'statuts modifiés') : '',
    c.titleChanged.length > 0 ? plural(c.titleChanged.length, 'titre modifié', 'titres modifiés') : '',
  ].filter((p) => p !== '');
  return { summary: hasDifferences(c) ? parts.join(', ') : noDifferenceText, groups, note: comparisonNote };
}
