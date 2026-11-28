// Section « Diffusion » (lot F8), conteneur : charge les diffusions du document, prépare, déclare l'envoi, saisit les réponses.
// Chaque geste est une écriture gardée (dépôt distributions.ts) ; l'écran relit la base après chaque geste. Aucun message n'est envoyé.
import { useEffect, useState } from 'react';
import {
  cancelSent, deleteDistribution, listCandidates, listDistributions, markSent, prepareDistribution, removeReply, saveReply, updatePreparation,
} from '../../data/repositories/distributions.ts';
import type { Candidates, DistributionWithRecipients } from '../../data/repositories/distributions.ts';
import type { DocumentDetail } from '../../data/repositories/documents.ts';
import { canDiffuse, dayOf, isVerdict, proposeMessage, proposeSubject } from '../../domain/distribution.ts';
import type { RecipientRole } from '../../domain/distribution.ts';
import { DiffusionView } from './DiffusionView.tsx';
import type { DiffusionForm, ReplyForm } from './DiffusionView.tsx';
import {
  cancelledMessage, chosenRoles, deletedMessage, distributionLine, picksToRecipients, preparedMessage, replyRemovedMessage, replySavedMessage, sentMessage, updatedMessage,
} from './diffusion-logic.ts';

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function DiffusionSection(props: { detail: DocumentDetail }) {
  const doc = props.detail;
  const [list, setList] = useState<DistributionWithRecipients[]>([]);
  const [cands, setCands] = useState<Candidates>({ available: [], excluded: 0 });
  const [form, setForm] = useState<DiffusionForm | null>(null);
  const [touched, setTouched] = useState(false);
  const [sendForm, setSendForm] = useState<{ id: number; date: string; error: string } | null>(null);
  const [replyForm, setReplyForm] = useState<ReplyForm | null>(null);
  const [askDeleteId, setAskDeleteId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ level: 'ok' | 'error'; text: string } | null>(null);
  const [tick, setTick] = useState(0);

  const diffusable = canDiffuse(doc.status, doc.replaced_by_id !== null);
  const today = dayOf(new Date());

  useEffect(() => {
    setForm(null); setSendForm(null); setReplyForm(null); setAskDeleteId(null); setMessage(null);
  }, [doc.id]);

  useEffect(() => {
    let dead = false;
    Promise.all([listDistributions(doc.id), listCandidates(doc.project_id)])
      .then(([l, c]) => { if (!dead) { setList(l); setCands(c); } })
      .catch((e) => { if (!dead) setMessage({ level: 'error', text: errorText(e) }); });
    return () => { dead = true; };
  }, [doc.id, doc.project_id, doc.status, doc.replaced_by_id, tick]);

  const proposal = (picks: Record<number, RecipientRole | ''>, dueOn: string) => {
    const roles = chosenRoles(picks);
    const p = {
      documentName: doc.name,
      version: doc.series_key === null ? null : doc.version,
      status: doc.status,
      validatedOn: doc.validated_at === null ? null : dayOf(new Date(doc.validated_at)),
      dueOn: dueOn === '' ? null : dueOn,
      roles: roles.length === 0 ? (['validate'] as RecipientRole[]) : roles,
    };
    return { subject: proposeSubject(p), message: proposeMessage(p) };
  };

  const act = async (what: () => Promise<string>, after?: () => void) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await what();
      after?.();
      setMessage({ level: 'ok', text });
    } catch (e) {
      setMessage({ level: 'error', text: errorText(e) });
    } finally {
      setTick((n) => n + 1);
      setBusy(false);
    }
  };

  const openNew = () => {
    const picks: Record<number, RecipientRole | ''> = {};
    setTouched(false);
    setForm({ id: null, ...proposal(picks, ''), dueOn: '', picks, error: '' });
  };
  const patchForm = (patch: Partial<DiffusionForm>) => {
    if (form === null) return;
    const next = { ...form, ...patch, error: '' };
    if ('subject' in patch || 'message' in patch) setTouched(true);
    else if (!touched && ('dueOn' in patch)) Object.assign(next, proposal(next.picks, next.dueOn));
    setForm(next);
  };
  const pick = (id: number, role: RecipientRole | '') => {
    if (form === null) return;
    const picks = { ...form.picks, [id]: role };
    const next = { ...form, picks, error: '' };
    if (!touched) Object.assign(next, proposal(picks, form.dueOn));
    setForm(next);
  };
  const edit = (id: number) => {
    const d = list.find((x) => x.id === id);
    if (!d) return;
    const picks: Record<number, RecipientRole | ''> = {};
    for (const r of d.recipients) if (r.stakeholder_id !== null && (r.role === 'validate' || r.role === 'inform')) picks[r.stakeholder_id] = r.role;
    setTouched(true);
    setForm({ id, subject: d.subject, message: d.message, dueOn: d.due_on ?? '', picks, error: '' });
  };
  const saveForm = async () => {
    if (form === null) return;
    setBusy(true);
    try {
      const input = { subject: form.subject, message: form.message, dueOn: form.dueOn === '' ? null : form.dueOn, recipients: picksToRecipients(form.picks) };
      if (form.id === null) { await prepareDistribution(doc.id, input, today); setMessage({ level: 'ok', text: preparedMessage }); }
      else { await updatePreparation(form.id, input, today); setMessage({ level: 'ok', text: updatedMessage }); }
      setForm(null);
    } catch (e) {
      setForm({ ...form, error: errorText(e) });
    } finally {
      setTick((n) => n + 1);
      setBusy(false);
    }
  };
  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ level: 'ok', text: `${what} copié dans le presse-papiers.` });
    } catch {
      setMessage({ level: 'error', text: 'Copie impossible ici : sélectionnez le texte à la main et copiez-le.' });
    }
  };
  const confirmSend = async () => {
    if (sendForm === null) return;
    setBusy(true);
    try {
      await markSent(sendForm.id, sendForm.date === '' ? null : sendForm.date, today);
      setSendForm(null);
      setMessage({ level: 'ok', text: sentMessage });
    } catch (e) {
      setSendForm({ ...sendForm, error: errorText(e) });
    } finally {
      setTick((n) => n + 1);
      setBusy(false);
    }
  };
  const saveReplyForm = async () => {
    if (replyForm === null) return;
    if (!isVerdict(replyForm.verdict)) { setReplyForm({ ...replyForm, error: 'Choisissez une réponse.' }); return; }
    setBusy(true);
    try {
      await saveReply(replyForm.recipientId, replyForm.verdict, replyForm.repliedOn, replyForm.comment, today);
      setReplyForm(null);
      setMessage({ level: 'ok', text: replySavedMessage });
    } catch (e) {
      setReplyForm({ ...replyForm, error: errorText(e) });
    } finally {
      setTick((n) => n + 1);
      setBusy(false);
    }
  };

  return (
    <DiffusionView
      canDiffuse={diffusable}
      isDraft={doc.status === 'draft'}
      lines={list.map((d) => distributionLine(d, today))}
      candidates={cands.available}
      excluded={cands.excluded}
      form={form}
      sendForm={sendForm}
      replyForm={replyForm}
      askDeleteId={askDeleteId}
      busy={busy}
      message={message}
      onNew={openNew}
      onForm={patchForm}
      onPick={pick}
      onSaveForm={() => void saveForm()}
      onCancelForm={() => setForm(null)}
      onEdit={edit}
      onAskDelete={setAskDeleteId}
      onDelete={(id) => void act(async () => { await deleteDistribution(id); return deletedMessage; }, () => setAskDeleteId(null))}
      onStartSend={(id) => setSendForm({ id, date: today, error: '' })}
      onSendForm={(p) => { if (sendForm !== null) setSendForm({ ...sendForm, ...p, error: '' }); }}
      onConfirmSend={() => void confirmSend()}
      onCancelSend={() => setSendForm(null)}
      onCancelSent={(id) => void act(async () => { await cancelSent(id); return cancelledMessage; })}
      onCopy={(w, t) => void copy(w, t)}
      onStartReply={(_id, recipientId) => setReplyForm({ recipientId, verdict: '', repliedOn: today, comment: '', error: '' })}
      onReplyForm={(p) => { if (replyForm !== null) setReplyForm({ ...replyForm, ...p, error: '' }); }}
      onSaveReply={() => void saveReplyForm()}
      onCancelReply={() => setReplyForm(null)}
      onRemoveReply={(rid) => void act(async () => { await removeReply(rid); return replyRemovedMessage; })}
    />
  );
}
