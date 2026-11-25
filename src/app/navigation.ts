// Navigation de l'application (lots M3a et M3b, décision D33). Logique pure : la liste des écrans et le choix de l'écran affiché.
// Une entrée n'est ajoutée que quand son écran existe : on n'affiche pas d'écran vide.

export type ScreenId = 'projects' | 'stakeholders' | 'needs' | 'requirements' | 'technical';

export interface ScreenInfo {
  id: ScreenId;
  label: string;
}

export const SCREENS: readonly ScreenInfo[] = [
  { id: 'projects', label: 'Projets' },
  { id: 'stakeholders', label: 'Parties prenantes' },
  { id: 'needs', label: 'Besoins' },
  { id: 'requirements', label: 'Exigences' },
  { id: 'technical', label: 'Technique' },
];

/** Écran affiché au démarrage : les projets tant qu'il n'y en a aucun d'actif, sinon les parties prenantes (le travail courant). */
export function startScreen(activeProjectId: number | null): ScreenId {
  return activeProjectId === null ? 'projects' : 'stakeholders';
}

export function isScreenId(value: string): value is ScreenId {
  return SCREENS.some((s) => s.id === value);
}
