// Codes lisibles des éléments : EX-001, DEC-014… (décision D18).
// Le numéro vient d'un compteur par projet et par type, qui ne redescend jamais : un code supprimé n'est jamais réattribué.
import { isKind, kindInfo } from './kinds.ts';
import type { ItemKind } from './kinds.ts';

/** Au moins trois chiffres ; au-delà de 999, le numéro s'allonge (EX-1000). */
export function formatCode(kind: ItemKind, number: number): string {
  if (!Number.isInteger(number) || number < 1) throw new Error(`Numéro d'élément invalide : ${String(number)}.`);
  return `${kindInfo(kind).prefix}-${String(number).padStart(3, '0')}`;
}

/** Nom du compteur dans la table « sequences » pour un projet et un type. */
export function sequenceName(projectId: number, kind: ItemKind): string {
  if (!Number.isInteger(projectId) || projectId < 1) throw new Error(`Identifiant de projet invalide : ${String(projectId)}.`);
  if (!isKind(kind)) throw new Error(`Type d'élément inconnu : ${String(kind)}.`);
  return `item:${projectId}:${kind}`;
}

/** Vrai si « code » est exactement le code que formatCode produirait pour ce type et ce numéro. */
export function codeMatches(kind: ItemKind, number: number, code: string): boolean {
  if (!isKind(kind) || !Number.isInteger(number) || number < 1) return false;
  return code === formatCode(kind, number);
}
