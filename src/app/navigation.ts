// Navigation de l'application (lots M3a à F5, décisions D33, D67, D70, D83 et D91). Logique pure : la liste des écrans et le choix de l'écran affiché.
// Une entrée n'est ajoutée que quand son écran existe : on n'affiche pas d'écran vide.

import type { ItemKind } from '../domain/kinds.ts';

export type ScreenId = 'home' | 'projects' | 'stakeholders' | 'needs' | 'requirements' | 'decisions' | 'risks' | 'stories' | 'tests' | 'traceability' | 'workshops' | 'deliverables' | 'documents' | 'journal' | 'technical' | 'about';

export interface ScreenInfo {
  id: ScreenId;
  label: string;
}

/** Une section du menu : un intitulé fixe (sans repli) et ses écrans. Les écrans hors section (Projets, Technique) ont un intitulé nul. */
export interface NavSection {
  title: string | null;
  screens: readonly ScreenInfo[];
}

// Menu regroupé (lot M5, décision D67, option B) : l'ordre suit la chaîne de traçabilité ; la section « Contrôle » (lot M6, D70) porte la vue calculée. Projets et Technique restent aux extrémités.
export const NAV_SECTIONS: readonly NavSection[] = [
  { title: null, screens: [{ id: 'home', label: 'Accueil' }, { id: 'projects', label: 'Projets' }] },
  { title: 'Analyse', screens: [{ id: 'workshops', label: 'Ateliers' }, { id: 'stakeholders', label: 'Parties prenantes' }, { id: 'needs', label: 'Besoins' }, { id: 'requirements', label: 'Exigences' }] },
  { title: 'Pilotage', screens: [{ id: 'decisions', label: 'Décisions' }, { id: 'risks', label: 'Risques' }, { id: 'deliverables', label: 'Livrables' }, { id: 'documents', label: 'Documents' }] },
  { title: 'Réalisation', screens: [{ id: 'stories', label: 'User stories' }, { id: 'tests', label: 'Tests' }] },
  { title: 'Contrôle', screens: [{ id: 'traceability', label: 'Traçabilité' }, { id: 'journal', label: 'Journal' }] },
  { title: null, screens: [{ id: 'technical', label: 'Technique' }, { id: 'about', label: 'À propos' }] },
];

/** Tous les écrans, dans l'ordre du menu. */
export const SCREENS: readonly ScreenInfo[] = NAV_SECTIONS.flatMap((section) => section.screens);

/**
 * Types d'éléments qui ont un écran. Sert à ne pas annoncer, dans les listes de liens, des types que l'on ne peut pas encore créer
 * (« User story » avant M5, par exemple). À compléter avec chaque nouveau registre.
 */
export const KINDS_WITH_SCREEN: readonly ItemKind[] = ['stakeholder', 'need', 'requirement', 'decision', 'risk', 'story', 'test', 'workshop'];

/** Écran de registre qui montre les éléments d'un type : sert à ouvrir une fiche depuis un autre écran (lot M6, D76). */
export function screenForKind(kind: ItemKind): ScreenId {
  switch (kind) {
    case 'stakeholder': return 'stakeholders';
    case 'need': return 'needs';
    case 'requirement': return 'requirements';
    case 'decision': return 'decisions';
    case 'risk': return 'risks';
    case 'story': return 'stories';
    case 'test': return 'tests';
    case 'workshop': return 'workshops';
  }
}

/** Écran affiché au démarrage (lot F3, F3-D02) : les projets tant qu'il n'y en a aucun d'actif, sinon l'accueil du projet actif. */
export function startScreen(activeProjectId: number | null): ScreenId {
  return activeProjectId === null ? 'projects' : 'home';
}

export function isScreenId(value: string): value is ScreenId {
  return SCREENS.some((s) => s.id === value);
}
