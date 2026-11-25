// Zone « Liens » d'une fiche (lot M3b), conteneur : lit les liens de l'élément, propose ceux que la couche domain autorise (décisions D48 et D49),
// crée et retire par les dépôts. Placée dans src/app/ parce que les écrans de registre ne peuvent pas s'importer entre eux (règle R1) :
// l'application l'assemble dans chaque fiche.
import { useEffect, useState } from 'react';
import { createLink, deleteLink, linkCandidates, linkedItems } from '../data/repositories/links.ts';
import type { LinkCandidate, LinkedItem } from '../data/repositories/links.ts';
import { kindInfo, statusLabel } from '../domain/kinds.ts';
import type { ItemKind } from '../domain/kinds.ts';
import { linkLabel, linkOptionsFor } from '../domain/links.ts';
import type { LinkOption } from '../domain/links.ts';
import { LinksView } from '../shared/links-ui.tsx';

export function LinksSection(props: { itemId: number; kind: ItemKind; onChanged: () => void }) {
  const options: LinkOption[] = linkOptionsFor(props.kind);
  const [rows, setRows] = useState<LinkedItem[]>([]);
  const [optionKey, setOptionKey] = useState(options.length > 0 ? options[0].key : '');
  const [candidates, setCandidates] = useState<LinkCandidate[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<{ linkId: number; message: string } | null>(null);

  const option = options.find((o) => o.key === optionKey) ?? null;

  useEffect(() => {
    let dead = false;
    linkedItems(props.itemId).then((r) => { if (!dead) setRows(r); }).catch((e) => { if (!dead) setError(e instanceof Error ? e.message : String(e)); });
    return () => { dead = true; };
  }, [props.itemId, version]);

  // Dépend de la clé de l'option, pas de l'objet : la liste d'options est recalculée à chaque rendu.
  useEffect(() => {
    let dead = false;
    const wanted = linkOptionsFor(props.kind).find((o) => o.key === optionKey);
    if (!wanted) { setCandidates([]); return; }
    linkCandidates(props.itemId, wanted.type, wanted.direction).then((c) => { if (!dead) setCandidates(c); }).catch((e) => { if (!dead) setError(e instanceof Error ? e.message : String(e)); });
    return () => { dead = true; };
  }, [props.itemId, props.kind, optionKey, version]);

  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError('');
    try {
      await fn();
      setVersion((v) => v + 1);
      props.onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const text = (r: LinkedItem) => `${linkLabel(r.link_type, r.direction)} ${r.other_code}`;

  return (
    <LinksView
      rows={rows.map((r) => ({ linkId: r.link_id, label: linkLabel(r.link_type, r.direction), otherCode: r.other_code, otherTitle: r.other_title, otherStatus: statusLabel(r.other_status) }))}
      options={options.map((o) => ({ key: o.key, label: `${o.label} (${o.otherKinds.map((k) => kindInfo(k).label).join(' ou ')})` }))}
      optionKey={optionKey}
      candidates={candidates.map((c) => ({ id: c.id, label: `${c.code} · ${c.title} (${statusLabel(c.status)})` }))}
      candidateId={candidateId}
      busy={busy}
      error={error}
      confirmRemove={confirmRemove}
      onOption={(key) => { setOptionKey(key); setCandidateId(''); setError(''); }}
      onCandidate={(id) => { setCandidateId(id); setError(''); }}
      onAdd={() => {
        if (!option || candidateId === '') return;
        const other = Number(candidateId);
        void run(async () => {
          await createLink({ type: option.type, fromId: option.direction === 'out' ? props.itemId : other, toId: option.direction === 'out' ? other : props.itemId });
          setCandidateId('');
        });
      }}
      onAskRemove={(linkId) => {
        const r = rows.find((x) => x.link_id === linkId);
        if (r) setConfirmRemove({ linkId, message: `Retirer le lien « ${text(r)} » ? Les deux éléments sont conservés.` });
      }}
      onConfirmRemove={() => {
        if (!confirmRemove) return;
        const id = confirmRemove.linkId;
        void run(async () => { await deleteLink(id); setConfirmRemove(null); });
      }}
      onCancelRemove={() => setConfirmRemove(null)}
    />
  );
}
