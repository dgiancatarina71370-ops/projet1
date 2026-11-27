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
export function mentionLine(version: number, status: string, replacedByVersion: number | null = null): string {
  const base = `**Document :** version ${version}, ${documentStatusLabel(status).toLowerCase()}`;
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
