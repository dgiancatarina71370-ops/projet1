// Logique pure de l'écran « Documents » (lot F5) : lignes de la liste, filtre des versions remplacées, détail, messages. Sans base ni React.
import { KINDS, statusLabel } from '../../domain/kinds.ts';
import type { ItemKind } from '../../domain/kinds.ts';
import { displayState, modelOfSeries, originLabel, parseOptions, parseSnapshot } from '../../domain/documents.ts';
import type { SnapshotItem } from '../../domain/documents.ts';
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

/** Liste affichée (F5-D11) : par défaut sans les versions remplacées ; avec la case, tout. L'ordre reçu est conservé. */
export function visibleDocuments<T extends { replaced_by_id: number | null }>(docs: readonly T[], showReplaced: boolean): T[] {
  return showReplaced ? [...docs] : docs.filter((d) => d.replaced_by_id === null);
}

/** Nombre de versions remplacées que la case permet de voir (affiché à côté de la case). */
export function replacedCount(docs: readonly { replaced_by_id: number | null }[]): number {
  return docs.filter((d) => d.replaced_by_id !== null).length;
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
  const parsed = generated ? parseSnapshot(d.items_snapshot) : null;
  return {
    title: d.name,
    facts,
    items: parsed === null ? null : snapshotRows(parsed),
    noItemsText: generated ? 'La liste figée de ce document est absente ou illisible.' : 'Ce document a été importé de la V1 : il n’a pas de liste figée.',
  };
}

export function exportedMessage(formatLabel: string, name: string, size: string, path: string): string {
  return `Export ${formatLabel} créé : ${name} (${size}). Emplacement : ${path}`;
}
