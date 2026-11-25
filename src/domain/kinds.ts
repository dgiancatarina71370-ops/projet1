// Types d'éléments du projet (lot M1, décision D16).
// Couche « domain » : pure, sans accès à la base ni à l'interface (règle R9 de scripts/check-architecture.mjs).
// Syntaxe volontairement « effaçable » (ni enum ni propriété de paramètre) : ce fichier s'exécute tel quel sous Node pour les tests.

export type ItemKind = 'stakeholder' | 'need' | 'requirement' | 'decision' | 'risk' | 'story' | 'test';

export interface KindInfo {
  kind: ItemKind;
  /** Libellé au singulier, affiché à l'utilisateur. */
  label: string;
  /** Préfixe du code lisible : EX-001, DEC-001… (décision D18). */
  prefix: string;
  /** Statuts admis pour ce type. Le premier est le statut de création. */
  statuses: readonly string[];
}

// Provisoire (M1) : les types sans lot propre partagent les trois statuts des livrables.
// Chaque lot métier précise les statuts de son type : cette liste est la seule à modifier, aucune migration n'est nécessaire (décision D17).
const COMMON_STATUSES: readonly string[] = ['draft', 'validated', 'archived'];
// Partie prenante (lot M3a, décision D37) : active tant qu'elle compte pour le projet, archivée ensuite. Le premier statut est celui de création.
const STAKEHOLDER_STATUSES: readonly string[] = ['active', 'archived'];

export const KINDS: readonly KindInfo[] = [
  { kind: 'stakeholder', label: 'Partie prenante', prefix: 'PP', statuses: STAKEHOLDER_STATUSES },
  { kind: 'need', label: 'Besoin', prefix: 'BES', statuses: COMMON_STATUSES },
  { kind: 'requirement', label: 'Exigence', prefix: 'EX', statuses: COMMON_STATUSES },
  { kind: 'decision', label: 'Décision', prefix: 'DEC', statuses: COMMON_STATUSES },
  { kind: 'risk', label: 'Risque', prefix: 'RIS', statuses: COMMON_STATUSES },
  { kind: 'story', label: 'User story', prefix: 'US', statuses: COMMON_STATUSES },
  { kind: 'test', label: 'Test', prefix: 'TEST', statuses: COMMON_STATUSES },
];

export function isKind(value: unknown): value is ItemKind {
  return typeof value === 'string' && KINDS.some((k) => k.kind === value);
}

export function kindInfo(kind: ItemKind): KindInfo {
  const info = KINDS.find((k) => k.kind === kind);
  if (!info) throw new Error(`Type d'élément inconnu : ${String(kind)}.`);
  return info;
}

export function isValidStatus(kind: ItemKind, status: string): boolean {
  return kindInfo(kind).statuses.includes(status);
}

export function initialStatus(kind: ItemKind): string {
  return kindInfo(kind).statuses[0];
}
