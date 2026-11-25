// Liens entre éléments (décision D19) : huit types, avec les seuls couples de types autorisés.
// La matrice est une DONNÉE : ajouter un lien (par exemple Décision vers Décision, ou Risque vers Risque) = ajouter une ligne ici
// et un test. Aucune migration : le type de lien est un simple texte en base (décision D17).
import { isKind, kindInfo } from './kinds.ts';
import type { ItemKind } from './kinds.ts';

export type LinkType = 'expresses' | 'derives' | 'refines' | 'implements' | 'verifies' | 'concerns' | 'threatens' | 'mitigates';

export interface LinkRule {
  type: LinkType;
  /** Libellé du lien, lu de la source vers la cible : « Test vérifie Exigence ». */
  label: string;
  from: readonly ItemKind[];
  to: readonly ItemKind[];
}

export const LINK_RULES: readonly LinkRule[] = [
  { type: 'expresses', label: 'exprime', from: ['stakeholder'], to: ['need'] },
  { type: 'derives', label: 'dérive en', from: ['need'], to: ['requirement'] },
  { type: 'refines', label: 'raffine', from: ['requirement'], to: ['requirement'] },
  { type: 'implements', label: 'implémente', from: ['story'], to: ['requirement'] },
  { type: 'verifies', label: 'vérifie', from: ['test'], to: ['requirement', 'story'] },
  { type: 'concerns', label: 'concerne', from: ['decision'], to: ['need', 'requirement', 'risk', 'story'] },
  { type: 'threatens', label: 'menace', from: ['risk'], to: ['need', 'requirement'] },
  { type: 'mitigates', label: 'atténue', from: ['requirement', 'decision'], to: ['risk'] },
];

export function isLinkType(value: unknown): value is LinkType {
  return typeof value === 'string' && LINK_RULES.some((r) => r.type === value);
}

export function linkRule(type: LinkType): LinkRule {
  const rule = LINK_RULES.find((r) => r.type === type);
  if (!rule) throw new Error(`Type de lien inconnu : ${String(type)}.`);
  return rule;
}

export function isLinkAllowed(type: LinkType, fromKind: ItemKind, toKind: ItemKind): boolean {
  if (!isLinkType(type) || !isKind(fromKind) || !isKind(toKind)) return false;
  const rule = linkRule(type);
  return rule.from.includes(fromKind) && rule.to.includes(toKind);
}

/** Lève une erreur en français si le lien n'est pas autorisé entre ces deux types. */
export function assertLinkAllowed(type: LinkType, fromKind: ItemKind, toKind: ItemKind): void {
  if (!isLinkType(type)) throw new Error(`Type de lien inconnu : ${String(type)}.`);
  if (isLinkAllowed(type, fromKind, toKind)) return;
  const rule = linkRule(type);
  const wanted = rule.from.map((k) => kindInfo(k).label).join(' ou ');
  const target = rule.to.map((k) => kindInfo(k).label).join(' ou ');
  throw new Error(
    `Lien refusé : « ${rule.label} » relie ${wanted} vers ${target}, pas ${kindInfo(fromKind).label} vers ${kindInfo(toKind).label}.`,
  );
}

/** Liens que l'on peut créer depuis un type donné, pour l'interface des lots suivants. */
export function linksFrom(kind: ItemKind): LinkRule[] {
  return LINK_RULES.filter((r) => r.from.includes(kind));
}
