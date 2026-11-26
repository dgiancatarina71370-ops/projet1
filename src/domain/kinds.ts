// Types d'éléments du projet (lot M1, décision D16).
// Couche « domain » : pure, sans accès à la base ni à l'interface (règle R9 de scripts/check-architecture.mjs).
// Syntaxe volontairement « effaçable » (ni enum ni propriété de paramètre) : ce fichier s'exécute tel quel sous Node pour les tests.

export type ItemKind = 'stakeholder' | 'need' | 'requirement' | 'decision' | 'risk' | 'story' | 'test' | 'workshop';

export interface KindInfo {
  kind: ItemKind;
  /** Libellé au singulier, affiché à l'utilisateur. */
  label: string;
  /** Préfixe du code lisible : EX-001, DEC-001… (décision D18). */
  prefix: string;
  /** Statuts admis pour ce type. Le premier est le statut de création. */
  statuses: readonly string[];
}

// Chaque type a ses statuts (liste unique à modifier, aucune migration nécessaire : décision D17). Le premier est celui de création.
// Besoin et exigence (lot M3b, décisions D37 et D47) : brouillon à la création ; les transitions sont libres (aucun workflow).
const ANALYSIS_STATUSES: readonly string[] = ['draft', 'validated', 'rejected', 'archived'];
// Décision (lot M4, décision D54) : proposée à la création ; transitions libres. « Remplacée » se précise par le lien « remplace » (D58).
const DECISION_STATUSES: readonly string[] = ['proposed', 'decided', 'superseded', 'cancelled', 'archived'];
// Risque (lot M4, décision D56) : identifié à la création ; transitions libres.
const RISK_STATUSES: readonly string[] = ['identified', 'mitigating', 'accepted', 'closed', 'archived'];
// User story (lot M5, décision D63) : brouillon à la création ; transitions libres. « Réalisée » est une simple étiquette, sans suivi de développement.
const STORY_STATUSES: readonly string[] = ['draft', 'ready', 'done', 'rejected', 'archived'];
// Test (lot M5, décision D65) : le statut porte le DERNIER résultat, sans historique d'exécutions (le centre UAT est prévu en V3).
const TEST_STATUSES: readonly string[] = ['to_run', 'passed', 'failed', 'blocked', 'archived'];
// Atelier (lot M7, décision D81) : planifié à la création ; transitions libres. Pas de statut « compte rendu » avant M8.
const WORKSHOP_STATUSES: readonly string[] = ['planned', 'held', 'archived'];
// Partie prenante (lot M3a, décision D37) : active tant qu'elle compte pour le projet, archivée ensuite. Le premier statut est celui de création.
const STAKEHOLDER_STATUSES: readonly string[] = ['active', 'archived'];

export const KINDS: readonly KindInfo[] = [
  { kind: 'stakeholder', label: 'Partie prenante', prefix: 'PP', statuses: STAKEHOLDER_STATUSES },
  { kind: 'need', label: 'Besoin', prefix: 'BES', statuses: ANALYSIS_STATUSES },
  { kind: 'requirement', label: 'Exigence', prefix: 'EX', statuses: ANALYSIS_STATUSES },
  { kind: 'decision', label: 'Décision', prefix: 'DEC', statuses: DECISION_STATUSES },
  { kind: 'risk', label: 'Risque', prefix: 'RIS', statuses: RISK_STATUSES },
  { kind: 'story', label: 'User story', prefix: 'US', statuses: STORY_STATUSES },
  { kind: 'test', label: 'Test', prefix: 'TEST', statuses: TEST_STATUSES },
  { kind: 'workshop', label: 'Atelier', prefix: 'ATL', statuses: WORKSHOP_STATUSES },
];

/**
 * Types dont les champs propres vivent dans une table d'extension : leur création passe par le dépôt du type (createStakeholder, createRequirement, createDecision, createRisk, createStory, createTestCase, createWorkshop),
 * qui écrit l'élément et ses détails ensemble. createItem le refuse pour eux : une partie prenante ou une exigence sans détails serait incohérente.
 */
export const KINDS_WITH_DETAILS: readonly ItemKind[] = ['stakeholder', 'requirement', 'decision', 'risk', 'story', 'test', 'workshop'];

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

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  validated: 'Validé',
  rejected: 'Rejeté',
  archived: 'Archivé',
  active: 'Actif',
  proposed: 'Proposée',
  decided: 'Prise',
  superseded: 'Remplacée',
  cancelled: 'Annulée',
  identified: 'Identifié',
  mitigating: 'En traitement',
  accepted: 'Accepté',
  closed: 'Clos',
  ready: 'Prête',
  done: 'Réalisée',
  to_run: 'À exécuter',
  passed: 'Réussi',
  failed: 'Échoué',
  blocked: 'Bloqué',
  planned: 'Planifié',
  held: 'Tenu',
};

// Accord au féminin : une décision ou une user story est « archivée » (et une story « rejetée »). Les autres statuts propres à ces types sont déjà au féminin.
const KIND_OVERRIDES: Partial<Record<ItemKind, Record<string, string>>> = {
  decision: { archived: 'Archivée' },
  story: { rejected: 'Rejetée', archived: 'Archivée' },
};

/** Libellé d'un statut. Le type, quand on le connaît, sert à l'accord (une décision est « archivée », un risque « archivé »). */
export function statusLabel(status: string, kind?: ItemKind): string {
  const special = kind ? KIND_OVERRIDES[kind]?.[status] : undefined;
  return special ?? STATUS_LABELS[status] ?? `Inconnu (${status})`;
}
