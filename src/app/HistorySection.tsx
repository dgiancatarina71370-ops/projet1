// Section « Historique » d'une fiche (lot F7), conteneur : lit le journal pour l'élément ouvert, par tranches de 10 lignes. Lecture seule.
// Placée dans src/app/ comme LinksSection : les écrans de registre ne peuvent pas s'importer entre eux (règle R1), l'application l'assemble.
// « tick » change à chaque écriture faite depuis un registre : l'historique se relit alors depuis le début (F7-D08).
import { useEffect, useState } from 'react';
import { countItemHistory, itemHistory } from '../data/repositories/journal.ts';
import type { ItemKind } from '../domain/kinds.ts';
import { HistoryView } from '../shared/history-ui.tsx';
import { HISTORY_EMPTY, HISTORY_LIMIT_NOTE, HISTORY_PAGE, historyCountText, historyLine, moreLabel } from './history-logic.ts';
import type { HistoryLine } from './history-logic.ts';

export function HistorySection(props: { itemId: number; kind: ItemKind; tick: number }) {
  const [lines, setLines] = useState<HistoryLine[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Relecture complète (changement de fiche ou écriture) : on repart de la première tranche.
  useEffect(() => {
    let dead = false;
    Promise.all([countItemHistory(props.itemId), itemHistory(props.itemId, HISTORY_PAGE, 0)])
      .then(([n, rows]) => {
        if (dead) return;
        setTotal(n);
        setLines(rows.map((r) => historyLine(r, props.kind)));
        setError('');
      })
      .catch((e) => { if (!dead) setError(e instanceof Error ? e.message : String(e)); });
    return () => { dead = true; };
  }, [props.itemId, props.kind, props.tick]);

  const more = async () => {
    setBusy(true);
    try {
      const rows = await itemHistory(props.itemId, HISTORY_PAGE, lines.length);
      setLines((old) => [...old, ...rows.map((r) => historyLine(r, props.kind))]);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <HistoryView
      lines={lines}
      countText={historyCountText(total)}
      emptyText={HISTORY_EMPTY}
      limitNote={HISTORY_LIMIT_NOTE}
      moreLabel={moreLabel(total, lines.length)}
      busy={busy}
      error={error}
      onMore={() => void more()}
    />
  );
}
