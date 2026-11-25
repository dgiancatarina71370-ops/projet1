// Logique pure de l'écran des projets et du choix du projet actif (lot M3a, décisions D34 et D41).

export interface ProjectLike {
  id: number;
  kind: string;
  name: string;
  parent_id: number | null;
}

/** Les éléments se créent dans un projet, jamais dans un dossier ni une archive : seuls les projets sont proposables. */
export function selectableProjects<T extends ProjectLike>(projects: readonly T[]): T[] {
  return projects.filter((p) => p.kind === 'project');
}

/**
 * Projet actif : le souhaité (dernier utilisé) s'il existe encore et si c'est un projet, sinon le premier projet, sinon aucun.
 * `preferred` est déjà revérifié par le dépôt, mais la liste peut avoir changé depuis (suppression) : on revérifie ici.
 */
export function chooseActiveProject(projects: readonly ProjectLike[], preferred: number | null): number | null {
  const ok = selectableProjects(projects);
  if (preferred !== null && ok.some((p) => p.id === preferred)) return preferred;
  return ok.length > 0 ? ok[0].id : null;
}

export const KIND_LABELS: Record<string, string> = { project: 'Projet', folder: 'Dossier', archive: 'Archive' };

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

export interface Impact {
  projects: number;
  documents: number;
  items: number;
  links: number;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`;

/** Message de confirmation d'une suppression de projet : dit exactement ce qui disparaîtra. */
export function projectDeletionMessage(name: string, impact: Impact): string {
  const parts: string[] = [];
  if (impact.projects > 1) parts.push(plural(impact.projects - 1, 'sous-dossier ou sous-projet', 'sous-dossiers ou sous-projets'));
  if (impact.items > 0) parts.push(plural(impact.items, 'élément', 'éléments'));
  if (impact.links > 0) parts.push(plural(impact.links, 'lien', 'liens'));
  if (impact.documents > 0) parts.push(plural(impact.documents, 'document', 'documents'));
  const what = parts.length === 0 ? 'Il est vide.' : `Seront aussi supprimés : ${parts.join(', ')}.`;
  return `Supprimer définitivement « ${name} » ? ${what} Cette action est irréversible (une sauvegarde reste possible avant, depuis l'écran Technique).`;
}

export function validateName(name: string): string | null {
  const clean = name.trim();
  if (clean === '') return 'Le nom du projet est obligatoire.';
  if (clean.length > 200) return 'Le nom du projet est limité à 200 caractères.';
  return null;
}
