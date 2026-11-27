// Logique pure commune aux registres (lot M3b, décision D44) : filtre par statut, saisie non enregistrée, messages. Couche « shared » : sans dépendance.

/** Filtre par statut : « all » garde tout, sinon seuls les éléments de ce statut. */
export function filterByStatus<T extends { status: string }>(list: readonly T[], filter: string): T[] {
  return filter === 'all' ? [...list] : list.filter((s) => s.status === filter);
}

/** Vrai si le formulaire diffère de son état de départ (pour prévenir avant d'abandonner une saisie). */
export function isDirty<T extends object>(initial: T, current: T): boolean {
  const a = initial as Record<string, unknown>;
  const b = current as Record<string, unknown>;
  return Object.keys(a).some((k) => a[k] !== b[k]);
}

/** Message d'une liste vide : registre vide, ou filtre qui ne retient rien. `none` est le sujet accordé (« Aucun besoin », « Aucune exigence ») ; `filterLabel` est null pour « Tous ». */
export function emptyListText(total: number, filterLabel: string | null, none: string, creationHint: string, allLabel = 'Tous'): string {
  if (total === 0) return `${none} dans ce projet. ${creationHint}`;
  return `${none} « ${filterLabel ?? allLabel} » : ${total} au total dans ce projet.`;
}

/** Message de confirmation d'une suppression : annonce les liens qui seront aussi supprimés. */
export function deletionMessage(code: string, title: string, linkCount: number): string {
  const base = `Supprimer définitivement ${code} « ${title} » ?`;
  if (linkCount === 0) return `${base} Cette action est irréversible ; l'archivage est la voie normale pour ne plus la voir.`;
  return `${base} ${linkCount === 1 ? '1 lien sera aussi supprimé' : `${linkCount} liens seront aussi supprimés`}. Cette action est irréversible ; l'archivage est la voie normale.`;
}

/** Titre d'un élément : message d'erreur à afficher, ou null s'il est valide. `noun` complète « Le titre … » (« de la décision »). */
export function titleProblem(title: string, noun: string, max: number): string | null {
  const clean = title.trim();
  if (clean === '') return `Le titre ${noun} est obligatoire.`;
  if (clean.length > max) return `Le titre ${noun} est limité à ${max} caractères.`;
  return null;
}

// ------------------------------------------------------------------ recherche, tri et compteurs (lot F2, décisions F2-D01 à F2-D04)

/** Modes de tri d'une liste de registre (F2-D02). « code-asc » est l'ordre historique : celui des dépôts (`ORDER BY number`). */
export type SortKey = 'code-asc' | 'code-desc' | 'title-asc' | 'updated-desc';

export const DEFAULT_SORT: SortKey = 'code-asc';

export const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'code-asc', label: 'Code croissant' },
  { value: 'code-desc', label: 'Code décroissant' },
  { value: 'title-asc', label: 'Titre de A à Z' },
  { value: 'updated-desc', label: 'Modifié récemment' },
];

/** Ce que la recherche et le tri exigent d'une ligne. `updated_at` est lue par tous les dépôts ; absente, elle compte comme vide. */
export interface SearchableRow {
  code: string;
  title: string;
  description: string;
  status: string;
  updated_at?: string;
}

/** Texte comparable : sans accents, sans majuscules, apostrophes typographiques ramenées à l'apostrophe droite. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .toLowerCase();
}

/** Mots de la recherche (séparés par des espaces) ; une saisie vide ou faite d'espaces ne donne aucun mot. */
export function searchWords(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter((w) => w !== '');
}

/** Vrai si une recherche est en cours (au moins un mot). */
export const isSearching = (query: string): boolean => searchWords(query).length > 0;

/** Recherche sur le code, le titre et la description (F2-D01) : l'élément doit contenir TOUS les mots, où que ce soit dans ces trois champs. Sans mot : tout est gardé. L'ordre n'est pas modifié. */
export function searchRows<T extends SearchableRow>(rows: readonly T[], query: string): T[] {
  const words = searchWords(query);
  if (words.length === 0) return [...rows];
  return rows.filter((r) => {
    const haystack = normalizeSearchText(`${r.code} ${r.title} ${r.description}`);
    return words.every((w) => haystack.includes(w));
  });
}

/** Comparaison « naturelle » des codes : préfixe puis numéro (EX-1000 vient après EX-999). Équivaut à l'ordre des dépôts (`ORDER BY number`) dans un registre. */
export function compareCodes(a: string, b: string): number {
  const pa = /^(.*?)(\d+)$/.exec(a);
  const pb = /^(.*?)(\d+)$/.exec(b);
  if (pa && pb) {
    if (pa[1] !== pb[1]) return pa[1] < pb[1] ? -1 : 1;
    const d = Number(pa[2]) - Number(pb[2]);
    if (d !== 0) return d < 0 ? -1 : 1;
    return 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

const TITLE_COLLATOR = new Intl.Collator('fr');

/** Tri (F2-D02). Ne modifie pas la liste reçue. À égalité, on retombe sur le code croissant. */
export function sortRows<T extends SearchableRow>(rows: readonly T[], sort: SortKey): T[] {
  const byCode = (a: T, b: T): number => compareCodes(a.code, b.code);
  const out = [...rows];
  switch (sort) {
    case 'code-asc':
      return out.sort(byCode);
    case 'code-desc':
      return out.sort((a, b) => byCode(b, a));
    case 'title-asc':
      return out.sort((a, b) => TITLE_COLLATOR.compare(a.title, b.title) || byCode(a, b));
    case 'updated-desc':
      return out.sort((a, b) => {
        const ua = a.updated_at ?? '';
        const ub = b.updated_at ?? '';
        return ua === ub ? byCode(a, b) : ua < ub ? 1 : -1;
      });
  }
}

/** Compteurs des boutons de filtre (F2-D03) : « all » = toutes les lignes reçues (archivées comprises), puis une entrée par statut présent. Un statut absent n'a pas d'entrée : à lire comme zéro. */
export function statusCounts(rows: readonly { status: string }[]): Record<string, number> {
  const counts: Record<string, number> = { all: rows.length };
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

/** Message d'une recherche sans résultat (F2-D04). `filterLabel` est null pour « Tous » ; `total` est le nombre d'éléments du registre dans le projet. */
export function noResultText(query: string, total: number, filterLabel: string | null): string {
  const q = query.trim();
  const where = filterLabel === null ? '' : ` parmi les éléments « ${filterLabel} »`;
  return `Aucun résultat pour « ${q} »${where} (${total} au total dans ce projet).`;
}
