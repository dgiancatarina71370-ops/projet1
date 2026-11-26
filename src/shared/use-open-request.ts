// Crochet React de l'ouverture de fiche demandée depuis un autre écran (lot M6, D76). La règle de décision est dans open-request.ts.
import { useEffect } from 'react';
import { shouldOpen } from './open-request.ts';

export function useOpenRequest(openId: number | null | undefined, ids: readonly number[], onOpen: (id: number) => void, onHandled?: () => void): void {
  const key = ids.join(',');
  useEffect(() => {
    if (!shouldOpen(openId, ids)) return;
    onOpen(openId);
    onHandled?.();
    // onOpen et onHandled changent à chaque rendu : seules la demande et la liste chargée relancent l'effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, key]);
}
