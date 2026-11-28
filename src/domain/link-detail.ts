// Détail d'une ligne de journal pour un lien (lot F7, décision F7-D03). Fonctions pures, sans base.
// Ancien format (jusqu'à la 0.16.0) : « type » seul. Nouveau format (0.17.0) : « type:identifiant de l'origine>identifiant de la cible ».
// Seuls des identifiants sont écrits : ni code ni titre (le journal n'en garde jamais). Les deux formats se lisent partout.

export interface LinkDetail {
  /** Type de lien tel qu'écrit (« derives »), ou le texte brut si le détail est inattendu. */
  type: string;
  /** Identifiants des deux extrémités : renseignés seulement dans le nouveau format. */
  fromId: number | null;
  toId: number | null;
}

const NEW_FORMAT = /^([^:>]+):(\d+)>(\d+)$/;

/** Nouveau format : « derives:12>34 ». */
export function formatLinkDetail(type: string, fromId: number, toId: number): string {
  return `${type}:${fromId}>${toId}`;
}

/** Lit un détail de lien, ancien ou nouveau format. Null si le détail est absent ou vide ; une valeur inattendue est rendue telle quelle comme type, sans erreur. */
export function parseLinkDetail(detail: string | null): LinkDetail | null {
  if (detail === null || detail === '') return null;
  const m = NEW_FORMAT.exec(detail);
  if (m) return { type: m[1], fromId: Number(m[2]), toId: Number(m[3]) };
  return { type: detail, fromId: null, toId: null };
}

/** Type de lien d'un détail, quel que soit le format ; null si le détail est absent. */
export function linkTypeOfDetail(detail: string | null): string | null {
  const p = parseLinkDetail(detail);
  return p === null ? null : p.type;
}

/**
 * Motifs LIKE qui retrouvent les lignes de lien écrites en nouveau format dont l'élément est l'origine (« :12> ») ou la cible (« >12 » en fin de texte).
 * Le deux-points et le chevron encadrent le nombre : 12 ne retient jamais 112.
 */
export function linkDetailPatterns(itemId: number): { asFrom: string; asTo: string } {
  return { asFrom: `%:${itemId}>%`, asTo: `%>${itemId}` };
}
