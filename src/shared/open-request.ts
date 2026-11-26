// Ouverture d'une fiche demandée depuis un autre écran (lot M6, décision D76, option B). Couche « shared », logique pure (sans React).
// L'application mémorise la demande « ouvrir tel élément » ; l'écran concerné, une fois sa liste chargée, ouvre la fiche puis signale qu'il a traité la demande
// (le crochet qui s'en charge est dans use-open-request.ts).

/** Vrai si la demande vise un élément présent dans la liste chargée (sinon on attend : la liste peut ne pas être encore lue). */
export function shouldOpen(openId: number | null | undefined, ids: readonly number[]): openId is number {
  return openId !== null && openId !== undefined && ids.includes(openId);
}
