// Risques (lot M4, décisions D55 et D56) : champs propres au type et règles de saisie.
// Pas de score ni de matrice calculés (décision D55, par cohérence avec D42) : probabilité et impact restent deux niveaux lisibles côte à côte.
// Couche « domain » : pure, sans accès à la base ni à l'interface (règle R9). Syntaxe volontairement « effaçable » (voir kinds.ts).
import { isLevel } from './stakeholders.ts';
import type { Level } from './stakeholders.ts';

export const MAX_OWNER_LENGTH = 200;
export const MAX_MITIGATION_LENGTH = 10000;

export interface RiskFields {
  probability: Level;
  impact: Level;
  mitigation: string;
  owner: string;
}

export const DEFAULT_RISK_FIELDS: RiskFields = { probability: 'medium', impact: 'medium', mitigation: '', owner: '' };

/** Complète avec les valeurs par défaut et refuse ce qui n'est pas valide. Le plan de traitement garde ses retours à la ligne. */
export function normalizeRiskFields(input: Partial<RiskFields>): RiskFields {
  const probability = input.probability ?? DEFAULT_RISK_FIELDS.probability;
  const impact = input.impact ?? DEFAULT_RISK_FIELDS.impact;
  const mitigation = input.mitigation ?? DEFAULT_RISK_FIELDS.mitigation;
  const owner = (input.owner ?? DEFAULT_RISK_FIELDS.owner).trim();
  if (!isLevel(probability)) throw new Error(`Niveau de probabilité inconnu : « ${String(probability)} ».`);
  if (!isLevel(impact)) throw new Error(`Niveau d'impact inconnu : « ${String(impact)} ».`);
  if (mitigation.length > MAX_MITIGATION_LENGTH) throw new Error(`Le plan de traitement est limité à ${MAX_MITIGATION_LENGTH} caractères.`);
  if (owner.length > MAX_OWNER_LENGTH) throw new Error(`Le responsable est limité à ${MAX_OWNER_LENGTH} caractères.`);
  return { probability, impact, mitigation, owner };
}

/** Noms (techniques) des champs qui diffèrent : sert au journal, qui ne garde jamais de contenu. */
export function changedRiskFields(before: RiskFields, after: RiskFields): Array<keyof RiskFields> {
  const names: Array<keyof RiskFields> = ['probability', 'impact', 'mitigation', 'owner'];
  return names.filter((n) => before[n] !== after[n]);
}
