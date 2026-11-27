// Documents versionnés et figés (lot F5, décisions F5-D03 à F5-D09).
// Couche « domain » : pure, sans accès à la base ni à l'interface (règle R9 de scripts/check-architecture.mjs).
// Syntaxe volontairement « effaçable » (ni enum ni propriété de paramètre) : ce fichier s'exécute tel quel sous Node pour les tests.

/** Valeur de `kind` d'un document créé par l'application (les documents importés de la V1 gardent le leur). */
export const GENERATED_KIND = 'generated';

/** Clé de série (F5-D03) : le modèle de livrable ; pour un compte rendu, un modèle par atelier (identifiant jamais réutilisé). */
export function seriesKey(modelId: string, workshopId: number | null): string {
  if (modelId === 'workshop-report') {
    if (workshopId === null || !Number.isInteger(workshopId) || workshopId <= 0) throw new Error('Un compte rendu d\'atelier exige un atelier.');
    return `workshop-report:${workshopId}`;
  }
  return modelId;
}

/** Modèle de livrable d'une clé de série. */
export function modelOfSeries(key: string): string {
  const i = key.indexOf(':');
  return i === -1 ? key : key.slice(0, i);
}

export interface SnapshotItem {
  code: string;
  title: string;
  status: string;
}

/** Texte JSON de la liste figée, triée par code puis titre (même entrée : même texte, octet pour octet). */
export function serializeSnapshot(items: readonly SnapshotItem[]): string {
  const num = (code: string): number => {
    const m = /(\d+)$/.exec(code);
    return m ? Number(m[1]) : 0;
  };
  const sorted = [...items].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) || num(a.code) - num(b.code) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  return JSON.stringify(sorted.map((i) => ({ code: i.code, title: i.title, status: i.status })));
}

/** Relit une liste figée. Texte absent, illisible ou de forme inattendue : null (jamais d'erreur, l'écran dit « pas de liste figée »). */
export function parseSnapshot(text: string | null): SnapshotItem[] | null {
  if (text === null || text === '') return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;
  const out: SnapshotItem[] = [];
  for (const v of value) {
    if (typeof v !== 'object' || v === null) return null;
    const r = v as Record<string, unknown>;
    if (typeof r.code !== 'string' || typeof r.title !== 'string' || typeof r.status !== 'string') return null;
    out.push({ code: r.code, title: r.title, status: r.status });
  }
  return out;
}

export interface GeneratedOptions {
  includeArchived: boolean;
  workshopId: number | null;
}

export function serializeOptions(options: GeneratedOptions): string {
  return JSON.stringify({ includeArchived: options.includeArchived, workshopId: options.workshopId });
}

export function parseOptions(text: string | null): GeneratedOptions | null {
  if (text === null || text === '') return null;
  try {
    const v = JSON.parse(text) as Record<string, unknown>;
    if (typeof v !== 'object' || v === null || typeof v.includeArchived !== 'boolean') return null;
    const w = v.workshopId;
    return { includeArchived: v.includeArchived, workshopId: typeof w === 'number' ? w : null };
  } catch {
    return null;
  }
}

const STATUS_LABELS: Record<string, string> = { draft: 'Brouillon', validated: 'Validé', archived: 'Archivé' };

/** Libellé du statut stocké d'un document. */
export function documentStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * État affiché (F5-D04) : « Remplacé » n'est pas stocké ; un document l'est dès qu'un autre le désigne comme sa version précédente.
 * Un document remplacé n'est jamais modifié.
 */
export function displayState(status: string, replacedById: number | null): string {
  return replacedById !== null ? 'Remplacé' : documentStatusLabel(status);
}

export const originLabel = (isGenerated: boolean): string => (isGenerated ? 'Généré' : 'Importé V1');

/**
 * Ligne de mention dans un export (F5-D08) : version et statut du document au moment de l'export.
 * Une version remplacée le dit, pour qu'un ancien fichier ne passe pas pour la version courante.
 */
export function mentionLine(version: number, status: string, replacedByVersion: number | null = null, validatedOn: string | null = null): string {
  // F6-D10 : un document validé porte la date de validation (« validé le 27/11/2026 ») quand elle est connue.
  const state = status === 'validated' && validatedOn !== null ? `${documentStatusLabel(status).toLowerCase()} le ${validatedOn}` : documentStatusLabel(status).toLowerCase();
  const base = `**Document :** version ${version}, ${state}`;
  return replacedByVersion === null ? base : `${base}, remplacée par la version ${replacedByVersion}`;
}

/**
 * Ajoute la mention sous le titre du document exporté. Le Markdown stocké n'est jamais modifié : seule la copie exportée la porte.
 * Si le texte ne commence pas par un titre « # », la mention est placée en tête.
 */
export function withMention(markdown: string, line: string): string {
  const lines = markdown.split('\n');
  if (!/^# /.test(lines[0])) return `${line}\n\n${markdown}`;
  let rest = lines.slice(1);
  while (rest.length > 0 && rest[0].trim() === '') rest = rest.slice(1);
  return rest.length === 0 ? `${lines[0]}\n\n${line}\n` : `${lines[0]}\n\n${line}\n\n${rest.join('\n')}`;
}

/** Titre servant au nom du fichier et au titre du document exporté : le nom, tronqué par l'appelant, puis la version. */
export const versionedTitle = (name: string, version: number): string => `${name} v${version}`;


// ------------------------------------------------------------------ lot F6 : valider, archiver, comparer (F6-D01 à D07)

export type DocumentAction = 'validate' | 'archive' | 'unarchive';

/** Longueur maximale du commentaire de validation (F6-D01). */
export const MAX_VALIDATION_COMMENT = 500;

/**
 * Gestes permis sur un document selon son statut stocké et le fait qu'une version suivante existe (F6-D01 à D04).
 * Valider : brouillon non remplacé. Archiver : brouillon ou validé non remplacé. Désarchiver : archivé non remplacé.
 * Un document remplacé n'a aucun geste : il est déjà hors de la liste par défaut et n'est jamais modifié (F5-D04).
 */
export function availableActions(status: string, replaced: boolean): DocumentAction[] {
  if (replaced) return [];
  if (status === 'draft') return ['validate', 'archive'];
  if (status === 'validated') return ['archive'];
  if (status === 'archived') return ['unarchive'];
  return [];
}

/** Statut de retour d'un désarchivage (F6-D04) : validé si le document l'a déjà été, sinon brouillon. */
export function unarchiveTarget(validatedAt: string | null): 'validated' | 'draft' {
  return validatedAt !== null && validatedAt !== '' ? 'validated' : 'draft';
}

/** Commentaire de validation : espaces retirés, vide = absent. Plus de 500 caractères : erreur (jamais de troncature silencieuse). */
export function normalizeValidationComment(text: string | null | undefined): string | null {
  const t = (text ?? '').trim();
  if (t === '') return null;
  if ([...t].length > MAX_VALIDATION_COMMENT) throw new Error(`Le commentaire de validation est limité à ${MAX_VALIDATION_COMMENT} caractères.`);
  return t;
}

export interface StatusChange {
  code: string;
  title: string;
  from: string;
  to: string;
}

export interface TitleChange {
  code: string;
  from: string;
  to: string;
}

/** Écarts entre la liste figée d'un document et les éléments courants du même périmètre (F6-D06, D07). */
export interface Comparison {
  added: SnapshotItem[];
  removed: SnapshotItem[];
  statusChanged: StatusChange[];
  titleChanged: TitleChange[];
}

const codeNumber = (code: string): number => {
  const m = /(\d+)$/.exec(code);
  return m ? Number(m[1]) : 0;
};

/** Ordre des codes : préfixe puis numéro (EX-002 avant EX-010). */
export function compareCodes(a: string, b: string): number {
  const pa = a.replace(/\d+$/, '');
  const pb = b.replace(/\d+$/, '');
  if (pa !== pb) return pa < pb ? -1 : 1;
  return codeNumber(a) - codeNumber(b) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Compare la liste figée aux éléments courants, rapprochés par code. Tout est calculé ici, rien n'est enregistré.
 * Un élément figé qui manque au périmètre courant est « retiré » : il peut avoir été supprimé, archivé, rejeté ou être sorti du
 * périmètre, et ce texte ne prétend pas le distinguer. Statut et titre sont comparés séparément : un élément peut figurer dans les deux groupes.
 */
export function compareSnapshots(frozen: readonly SnapshotItem[], current: readonly SnapshotItem[]): Comparison {
  const before = new Map(frozen.map((i) => [i.code, i]));
  const now = new Map(current.map((i) => [i.code, i]));
  const added = current.filter((i) => !before.has(i.code)).sort((a, b) => compareCodes(a.code, b.code));
  const removed = frozen.filter((i) => !now.has(i.code)).sort((a, b) => compareCodes(a.code, b.code));
  const statusChanged: StatusChange[] = [];
  const titleChanged: TitleChange[] = [];
  for (const f of [...frozen].sort((a, b) => compareCodes(a.code, b.code))) {
    const c = now.get(f.code);
    if (c === undefined) continue;
    if (c.status !== f.status) statusChanged.push({ code: f.code, title: c.title, from: f.status, to: c.status });
    if (c.title !== f.title) titleChanged.push({ code: f.code, from: f.title, to: c.title });
  }
  return { added, removed, statusChanged, titleChanged };
}

export const hasDifferences = (c: Comparison): boolean => c.added.length + c.removed.length + c.statusChanged.length + c.titleChanged.length > 0;
