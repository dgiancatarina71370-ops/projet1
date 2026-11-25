// Liens entre éléments (décision D19, « remplace » ajouté par D58) : neuf types, avec les seuls couples de types autorisés.
// La matrice est une DONNÉE : ajouter un lien (par exemple Décision vers Décision, ou Risque vers Risque) = ajouter une ligne ici
// et un test. Aucune migration : le type de lien est un simple texte en base (décision D17).
import { isKind, kindInfo } from './kinds.ts';
import type { ItemKind } from './kinds.ts';

export type LinkType = 'expresses' | 'derives' | 'refines' | 'implements' | 'verifies' | 'concerns' | 'threatens' | 'mitigates' | 'supersedes';

export interface LinkRule {
  type: LinkType;
  /** Libellé du lien, lu de la source vers la cible : « Test vérifie Exigence ». */
  label: string;
  /** Libellé lu de la cible vers la source (lot M3b) : « Exigence vérifiée par Test ». */
  inverseLabel: string;
  from: readonly ItemKind[];
  to: readonly ItemKind[];
}

export const LINK_RULES: readonly LinkRule[] = [
  { type: 'expresses', label: 'exprime', inverseLabel: 'exprimé par', from: ['stakeholder'], to: ['need'] },
  { type: 'derives', label: 'dérive en', inverseLabel: 'dérive de', from: ['need'], to: ['requirement'] },
  { type: 'refines', label: 'raffine', inverseLabel: 'raffiné par', from: ['requirement'], to: ['requirement'] },
  { type: 'implements', label: 'implémente', inverseLabel: 'implémenté par', from: ['story'], to: ['requirement'] },
  { type: 'verifies', label: 'vérifie', inverseLabel: 'vérifié par', from: ['test'], to: ['requirement', 'story'] },
  { type: 'concerns', label: 'concerne', inverseLabel: 'concerné par', from: ['decision'], to: ['need', 'requirement', 'risk', 'story'] },
  { type: 'threatens', label: 'menace', inverseLabel: 'menacé par', from: ['risk'], to: ['need', 'requirement'] },
  { type: 'mitigates', label: 'atténue', inverseLabel: 'atténué par', from: ['requirement', 'decision'], to: ['risk'] },
  // Lot M4, décision D58 : une décision en remplace une autre. Peut former une boucle : refusée comme « raffine » (D50).
  { type: 'supersedes', label: 'remplace', inverseLabel: 'remplacé par', from: ['decision'], to: ['decision'] },
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

// ------------------------------------------------------------------ interface des liens (lot M3b, décisions D48 à D50)

/**
 * Types de liens proposés dans l'interface (décisions D48, D57 et D66 : les neuf types de la matrice sont désormais exposés). Exposer un autre type plus tard (Décision vers Décision, Risque vers Risque…)
 * = l'ajouter ici, après l'avoir ajouté à LINK_RULES : ni refonte ni migration.
 */
export const EXPOSED_LINK_TYPES: readonly LinkType[] = ['expresses', 'derives', 'refines', 'implements', 'verifies', 'concerns', 'threatens', 'mitigates', 'supersedes'];

/** Sens d'un lien vu depuis un élément : « out » part de lui, « in » arrive sur lui. */
export type Direction = 'out' | 'in';

export interface LinkOption {
  /** Identifiant stable de l'option, utilisable comme valeur de liste : « derives:in ». */
  key: string;
  type: LinkType;
  direction: Direction;
  /** Libellé lu depuis l'élément courant : « dérive en » (sortant) ou « dérive de » (entrant). */
  label: string;
  /** Types d'éléments que l'on peut relier à l'élément courant avec cette option. */
  otherKinds: readonly ItemKind[];
}

/** Liens que l'interface propose d'ajouter depuis un élément de ce type, dans les deux sens. Un lien qui boucle sur le même type (« raffine ») donne les deux options. */
export function linkOptionsFor(kind: ItemKind): LinkOption[] {
  const options: LinkOption[] = [];
  for (const type of EXPOSED_LINK_TYPES) {
    const rule = linkRule(type);
    if (rule.from.includes(kind)) options.push({ key: `${type}:out`, type, direction: 'out', label: rule.label, otherKinds: rule.to });
    if (rule.to.includes(kind)) options.push({ key: `${type}:in`, type, direction: 'in', label: rule.inverseLabel, otherKinds: rule.from });
  }
  return options;
}

/**
 * Texte d'une option de la liste « Ajouter un lien » : « concerne (Besoin ou Exigence) ». Seuls les types listés dans `shown` sont annoncés
 * (ceux qui ont un écran, donc que l'on peut créer) ; si aucun ne l'est, le libellé seul.
 */
export function optionText(option: LinkOption, shown: readonly ItemKind[]): string {
  const kinds = option.otherKinds.filter((k) => shown.includes(k)).map((k) => kindInfo(k).label);
  return kinds.length === 0 ? option.label : `${option.label} (${kinds.join(' ou ')})`;
}

/** Libellé d'un lien existant, lu depuis l'élément courant. */
export function linkLabel(type: string, direction: Direction): string {
  if (!isLinkType(type)) return `type inconnu (${type})`;
  const rule = linkRule(type);
  return direction === 'out' ? rule.label : rule.inverseLabel;
}

/** Vrai si ce type de lien peut relier deux éléments du même type, donc former une boucle (aujourd'hui : « raffine »). */
export function canLoop(type: LinkType): boolean {
  const rule = linkRule(type);
  return rule.from.some((k) => rule.to.includes(k));
}

export type Edge = readonly [number, number];

/**
 * Décision D50 : ajouter le lien « from vers to » crée-t-il une boucle ? Il y en a une si « to » mène déjà à « from » en suivant les liens existants.
 * Retourne le chemin existant de « to » à « from » (extrémités comprises), ou null s'il n'y a pas de boucle. Un lien de « from » vers lui-même est une boucle.
 */
export function findPath(edges: readonly Edge[], start: number, goal: number): number[] | null {
  if (start === goal) return [start];
  const next = new Map<number, number[]>();
  for (const [a, b] of edges) next.set(a, [...(next.get(a) ?? []), b]);
  const seen = new Set<number>([start]);
  const queue: number[][] = [[start]];
  while (queue.length > 0) {
    const path = queue.shift() as number[];
    for (const n of next.get(path[path.length - 1]) ?? []) {
      if (n === goal) return [...path, n];
      if (!seen.has(n)) {
        seen.add(n);
        queue.push([...path, n]);
      }
    }
  }
  return null;
}

/** Une boucle quelconque dans ces liens (pour le contrôle d'intégrité), sous la forme du chemin fermé, ou null. */
export function findAnyCycle(edges: readonly Edge[]): number[] | null {
  for (const [a, b] of edges) {
    const back = findPath(edges, b, a);
    if (back) return [a, ...back];
  }
  return null;
}
