// Libellés du journal d'activité (lots F3 et F4) : fonctions pures, partagées par l'écran Accueil et l'écran Journal.
// Déplacés ici depuis src/modules/home/logic.ts : un module n'importe pas un autre module (règle R1). Aucun accès à la base.
import { isKind, statusLabel } from './kinds.ts';
import type { ItemKind } from './kinds.ts';
import { isLinkType, linkRule } from './links.ts';

/** Libellé de suppression, accordé au genre du type. */
const DELETED_LABELS: Record<ItemKind, string> = {
  stakeholder: 'Partie prenante supprimée',
  need: 'Besoin supprimé',
  requirement: 'Exigence supprimée',
  decision: 'Décision supprimée',
  risk: 'Risque supprimé',
  story: 'User story supprimée',
  test: 'Test supprimé',
  workshop: 'Atelier supprimé',
};

/** « Exigence supprimée » d'après le détail du journal (le type de l'élément) ; « Élément supprimé » si le type est inconnu. */
export function deletedLabel(detail: string | null): string {
  return isKind(detail) ? DELETED_LABELS[detail] : 'Élément supprimé';
}

/** « Brouillon → Validé » d'après le détail « draft>validated » ; null si le détail est absent ou mal formé. */
export function statusTransition(detail: string | null, kind: ItemKind | null): string | null {
  const parts = (detail ?? '').split('>');
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') return null;
  return `${statusLabel(parts[0], kind ?? undefined)} → ${statusLabel(parts[1], kind ?? undefined)}`;
}

/** Verbe court d'une entrée (accueil) : « créé », « modifié », « statut : Brouillon → Validé ». */
export function actionVerb(action: string, detail: string | null, kind: ItemKind | null): string {
  if (action === 'created') return 'créé';
  if (action === 'status_changed') {
    const t = statusTransition(detail, kind);
    return t === null ? 'statut modifié' : `statut : ${t}`;
  }
  if (action === 'updated') return 'modifié';
  return action;
}

// ------------------------------------------------------------------ écran Journal (lot F4)

export interface FilterOption {
  value: string;
  label: string;
}

/** Groupes de types d'objet du filtre (F4-D04) : un groupe peut couvrir plusieurs types du journal. */
export const OBJECT_GROUPS: ReadonlyArray<FilterOption & { types: readonly string[] }> = [
  { value: 'all', label: 'Tous', types: [] },
  { value: 'item', label: 'Éléments', types: ['item'] },
  { value: 'link', label: 'Liens', types: ['link'] },
  { value: 'document', label: 'Documents', types: ['document', 'document_send', 'distribution'] },
  { value: 'project', label: 'Projet', types: ['project', 'folder'] },
];

/** Types du journal du groupe choisi ; liste vide = aucun filtre (« Tous » ou valeur inconnue). */
export function objectGroupTypes(group: string): readonly string[] {
  return OBJECT_GROUPS.find((g) => g.value === group)?.types ?? [];
}

/** Actions du filtre (F4-D05). */
export const ACTION_OPTIONS: readonly FilterOption[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'created', label: 'Créé' },
  { value: 'updated', label: 'Modifié' },
  { value: 'status_changed', label: 'Statut changé' },
  { value: 'deleted', label: 'Supprimé' },
  { value: 'imported', label: 'Importé' },
];

export const ACTION_LABELS: Record<string, string> = Object.fromEntries(ACTION_OPTIONS.filter((o) => o.value !== 'all').map((o) => [o.value, o.label]));

export const actionLabel = (action: string): string => ACTION_LABELS[action] ?? action;

const OBJECT_TYPE_LABELS: Record<string, string> = {
  item: 'Élément',
  link: 'Lien',
  document: 'Document',
  document_send: 'Document',
  distribution: 'Document',
  project: 'Projet',
  folder: 'Projet',
};

export const objectTypeLabel = (type: string): string => OBJECT_TYPE_LABELS[type] ?? type;

/** Noms de champs écrits au journal par les modifications (« updated »), avec le libellé de l'écran de saisie. */
const FIELD_LABELS: Record<string, string> = {
  title: 'Titre',
  description: 'Description',
  nature: 'Nature',
  priority: 'Priorité',
  criteria: 'Critères d\'acceptation',
  decidedOn: 'Date de la décision',
  decider: 'Décideur',
  alternatives: 'Alternatives envisagées',
  rationale: 'Justification',
  goal: 'Je veux',
  benefit: 'Afin de',
  testType: 'Type de test',
  preconditions: 'Préconditions',
  steps: 'Étapes',
  expected: 'Résultat attendu',
  lastRunOn: 'Dernière exécution',
  probability: 'Probabilité',
  impact: 'Impact',
  mitigation: 'Plan de traitement',
  owner: 'Responsable',
  organisation: 'Organisation',
  influence: 'Influence',
  interest: 'Intérêt',
  heldOn: 'Date de l\'atelier',
  place: 'Lieu ou format',
  objective: 'Objectif',
  notes: 'Notes',
  followUp: 'Points ouverts et actions',
  name: 'Nom',
  email: 'E-mail',
  subject: 'Objet',
  message: 'Message',
  due_on: 'Échéance',
  recipients: 'Destinataires',
};

/** « role » s'appelle « En tant que » dans une user story et « Rôle dans le projet » pour une partie prenante. */
export function fieldLabel(name: string, kind: ItemKind | null): string {
  if (name === 'role') return kind === 'story' ? 'En tant que' : 'Rôle dans le projet';
  return FIELD_LABELS[name] ?? name;
}

/** « Champs : Titre, Priorité » d'après le détail « title,priority » ; un nom inconnu reste tel quel, jamais d'erreur. */
export function fieldsText(detail: string | null, kind: ItemKind | null): string {
  const names = (detail ?? '').split(',').map((n) => n.trim()).filter((n) => n !== '');
  if (names.length === 0) return '';
  return `Champs : ${names.map((n) => fieldLabel(n, kind)).join(', ')}`;
}

/** Libellé lisible d'un type de lien (« dérive en ») ; « type inconnu » pour une valeur inattendue. */
export function linkTypeLabel(type: string | null): string {
  if (type === null || !isLinkType(type)) return type === null ? '' : `type inconnu (${type})`;
  return linkRule(type).label;
}
