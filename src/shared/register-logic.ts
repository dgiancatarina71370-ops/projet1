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
