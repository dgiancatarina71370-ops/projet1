// Accords du français pour les messages affichés. En français, 0 et 1 sont au singulier (« 0 étape », « 1 étape », « 2 étapes »).
export function plural(n: number, one: string, many: string): string {
  return n >= 0 && n < 2 ? one : many;
}

/** « 1 étape PSPO déjà présente », « 3 étapes PSPO déjà présentes ». */
export function count(n: number, one: string, many: string): string {
  return `${n} ${plural(n, one, many)}`;
}
