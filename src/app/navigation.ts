// Navigation de l'application (lots M3a, M3b et M4, décision D33). Logique pure : la liste des écrans et le choix de l'écran affiché.
// Une entrée n'est ajoutée que quand son écran existe : on n'affiche pas d'écran vide.

import type { ItemKind } from '../domain/kinds.ts';

export type ScreenId = 'projects' | 'stakeholders' | 'needs' | 'requirements' | 'decisions' | 'risks' | 'technical';

export interface ScreenInfo {
  id: ScreenId;
  label: string;
}

export const SCREENS: readonly ScreenInfo[] = [
  { id: 'projects', label: 'Projets' },
  { id: 'stakeholders', label: 'Parties prenantes' },
  { id: 'needs', label: 'Besoins' },
  { id: 'requirements', label: 'Exigences' },
  { id: 'decisions', label: 'Décisions' },
  { id: 'risks', label: 'Risques' },
  { id: 'technical', label: 'Technique' },
];

/**
 * Types d'éléments qui ont un écran. Sert à ne pas annoncer, dans les listes de liens, des types que l'on ne peut pas encore créer
 * (« User story » avant M5). À compléter avec chaque nouveau registre.
 */
export const KINDS_WITH_SCREEN: readonly ItemKind[] = ['stakeholder', 'need', 'requirement', 'decision', 'risk'];

/** Écran affiché au démarrage : les projets tant qu'il n'y en a aucun d'actif, sinon les parties prenantes (le travail courant). */
export function startScreen(activeProjectId: number | null): ScreenId {
  return activeProjectId === null ? 'projects' : 'stakeholders';
}

export function isScreenId(value: string): value is ScreenId {
  return SCREENS.some((s) => s.id === value);
}
