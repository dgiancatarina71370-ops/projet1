// Section « Diffusion » (lot F8), version d'affichage pure : tout arrive par propriétés. Le conteneur (DiffusionSection.tsx) l'alimente.
// BA-Mentor n'envoie aucun message : les boutons « Copier » mettent du texte dans le presse-papiers, rien ne part.
import { VERDICTS, RECIPIENT_ROLES, roleLabel, verdictLabel } from '../../domain/distribution.ts';
import type { RecipientRole } from '../../domain/distribution.ts';
import { DIFFUSION_BANNER, DRAFT_NOTICE, NOT_DIFFUSABLE_TEXT, NO_ADDRESS_TEXT, REPLY_REMINDER, excludedText } from './diffusion-logic.ts';
import type { DistributionLine } from './diffusion-logic.ts';

export interface DiffusionForm {
  /** null = nouvelle diffusion. */
  id: number | null;
  subject: string;
  message: string;
  dueOn: string;
  picks: Record<number, RecipientRole | ''>;
  error: string;
}

export interface ReplyForm {
  recipientId: number;
  verdict: string;
  repliedOn: string;
  comment: string;
  error: string;
}

export interface DiffusionViewProps {
  canDiffuse: boolean;
  isDraft: boolean;
  lines: DistributionLine[];
  candidates: Array<{ id: number; code: string; name: string; email: string }>;
  excluded: number;
  form: DiffusionForm | null;
  sendForm: { id: number; date: string; error: string } | null;
  replyForm: ReplyForm | null;
  askDeleteId: number | null;
  busy: boolean;
  message: { level: 'ok' | 'error'; text: string } | null;
  onNew: () => void;
  onForm: (patch: Partial<DiffusionForm>) => void;
  onPick: (stakeholderId: number, role: RecipientRole | '') => void;
  onSaveForm: () => void;
  onCancelForm: () => void;
  onEdit: (id: number) => void;
  onAskDelete: (id: number | null) => void;
  onDelete: (id: number) => void;
  onStartSend: (id: number) => void;
  onSendForm: (patch: { date: string }) => void;
  onConfirmSend: () => void;
  onCancelSend: () => void;
  onCancelSent: (id: number) => void;
  onCopy: (what: string, text: string) => void;
  onStartReply: (id: number, recipientId: number) => void;
  onReplyForm: (patch: Partial<ReplyForm>) => void;
  onSaveReply: () => void;
  onCancelReply: () => void;
  onRemoveReply: (recipientId: number) => void;
}

const btn = 'rounded border border-hub-line px-3 py-1 disabled:opacity-50';
const input = 'mt-1 w-full rounded border border-hub-line bg-hub-bg p-2';

export function DiffusionView(p: DiffusionViewProps) {
  return (
    <section aria-label="Diffusion" className="mb-3 space-y-3">
      <h4 className="font-semibold">Diffusion</h4>
      <p className="rounded border border-hub-line p-2 text-hub-muted">{DIFFUSION_BANNER}</p>
      {p.isDraft && p.canDiffuse && <p className="text-hub-muted">{DRAFT_NOTICE}</p>}

      {p.message && <p role={p.message.level === 'error' ? 'alert' : 'status'} className={`break-words ${p.message.level === 'error' ? 'text-hub-bad' : 'text-hub-ok'}`}>{p.message.text}</p>}

      {!p.canDiffuse && <p className="text-hub-muted">{NOT_DIFFUSABLE_TEXT}</p>}
      {p.canDiffuse && p.form === null && (
        p.candidates.length === 0
          ? <p className="text-hub-muted">{NO_ADDRESS_TEXT}</p>
          : <button type="button" disabled={p.busy} onClick={p.onNew} className={btn}>Préparer une diffusion</button>
      )}
      {p.canDiffuse && p.excluded > 0 && <p className="text-hub-muted">{excludedText(p.excluded)}</p>}

      {p.form !== null && <FormBlock {...p} form={p.form} />}

      {p.lines.length === 0 && p.form === null && <p className="text-hub-muted">Aucune diffusion pour ce document.</p>}
      {p.lines.map((l) => (
        <div key={l.id} className="space-y-2 rounded border border-hub-line p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h5 className="font-semibold">{l.title}</h5>
            <span>{l.stateText}</span>
          </div>
          {l.dueText && <p className="text-hub-muted">{l.dueText}</p>}
          {l.overdueNote && <p role="status" className="text-hub-bad">{l.overdueNote}</p>}
          <dl className="grid grid-cols-[6rem_1fr] gap-y-1">
            <dt className="text-hub-muted">Objet</dt><dd className="break-words">{l.subject}</dd>
            <dt className="text-hub-muted">Message</dt><dd className="whitespace-pre-wrap break-words">{l.message}</dd>
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-hub-muted"><tr><th className="py-1 pr-3">Destinataire</th><th className="pr-3">Rôle</th><th className="pr-3">Statut</th><th>Réponse</th></tr></thead>
              <tbody>
                {l.recipients.map((r) => (
                  <tr key={r.id} className="border-t border-hub-line align-top">
                    <td className="py-1 pr-3"><div>{r.name}</div><div className="break-all text-hub-muted">{r.email}</div></td>
                    <td className="pr-3">{r.roleText}</td>
                    <td className="pr-3">{r.statusText}</td>
                    <td>
                      {r.replyText && <div className="break-words">{r.replyText}</div>}
                      {l.canReply && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          <button type="button" disabled={p.busy} onClick={() => p.onStartReply(l.id, r.id)} className={btn}>{r.hasReply ? 'Corriger la réponse' : 'Saisir la réponse'}</button>
                          {r.hasReply && <button type="button" disabled={p.busy} onClick={() => p.onRemoveReply(r.id)} className={btn}>Retirer la réponse</button>}
                        </div>
                      )}
                      {p.replyForm !== null && p.replyForm.recipientId === r.id && <ReplyBlock {...p} reply={p.replyForm} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {l.canReply && <p className="text-hub-muted">{REPLY_REMINDER}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={p.busy} onClick={() => p.onCopy('Adresses', l.addresses)} className={btn}>Copier les adresses</button>
            <button type="button" disabled={p.busy} onClick={() => p.onCopy('Objet', l.subject)} className={btn}>Copier l’objet</button>
            <button type="button" disabled={p.busy} onClick={() => p.onCopy('Message', l.message)} className={btn}>Copier le message</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {l.canEdit && <button type="button" disabled={p.busy} onClick={() => p.onEdit(l.id)} className={btn}>Modifier la préparation</button>}
            {l.canMarkSent && <button type="button" disabled={p.busy} onClick={() => p.onStartSend(l.id)} className={btn}>Marquer comme envoyé</button>}
            {l.canCancel && <button type="button" disabled={p.busy} onClick={() => p.onCancelSent(l.id)} className={btn}>Annuler l’envoi déclaré</button>}
            {l.canEdit && <button type="button" disabled={p.busy} onClick={() => p.onAskDelete(l.id)} className={btn}>Supprimer cette diffusion</button>}
          </div>
          {p.askDeleteId === l.id && (
            <div className="space-y-2 rounded border border-hub-line p-3">
              <p>Supprimer cette diffusion préparée ? Cette action ne s’annule pas.</p>
              <div className="flex gap-2">
                <button type="button" disabled={p.busy} onClick={() => p.onDelete(l.id)} className={btn}>Confirmer la suppression</button>
                <button type="button" disabled={p.busy} onClick={() => p.onAskDelete(null)} className={btn}>Annuler</button>
              </div>
            </div>
          )}
          {p.sendForm !== null && p.sendForm.id === l.id && (
            <div className="space-y-2 rounded border border-hub-line p-3">
              <p className="text-hub-muted">Vous déclarez avoir envoyé le message depuis votre messagerie. Objet, message et destinataires seront figés.</p>
              <label className="block">Date d’envoi
                <input aria-label="Date d’envoi" type="date" value={p.sendForm.date} onChange={(e) => p.onSendForm({ date: e.target.value })} className={input} />
              </label>
              {p.sendForm.error && <p role="alert" className="text-hub-bad">{p.sendForm.error}</p>}
              <div className="flex gap-2">
                <button type="button" disabled={p.busy} onClick={p.onConfirmSend} className={btn}>Confirmer l’envoi</button>
                <button type="button" disabled={p.busy} onClick={p.onCancelSend} className={btn}>Annuler</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function FormBlock(p: DiffusionViewProps & { form: DiffusionForm }) {
  const f = p.form;
  return (
    <div className="space-y-2 rounded border border-hub-line p-3" aria-label="Préparation de la diffusion">
      <h5 className="font-semibold">{f.id === null ? 'Nouvelle diffusion' : 'Modifier la préparation'}</h5>
      <fieldset className="space-y-1">
        <legend className="text-hub-muted">Destinataires (parties prenantes actives avec adresse)</legend>
        {p.candidates.map((c) => (
          <label key={c.id} className="flex flex-wrap items-center gap-2">
            <span className="min-w-[10rem]">{c.code} · {c.name} <span className="break-all text-hub-muted">({c.email})</span></span>
            <select aria-label={`Rôle de ${c.name}`} value={f.picks[c.id] ?? ''} onChange={(e) => p.onPick(c.id, e.target.value as RecipientRole | '')} className="rounded border border-hub-line bg-hub-bg p-1">
              <option value="">Non destinataire</option>
              {RECIPIENT_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </label>
        ))}
      </fieldset>
      <label className="block">Réponse souhaitée avant le (facultatif)
        <input aria-label="Échéance" type="date" value={f.dueOn} onChange={(e) => p.onForm({ dueOn: e.target.value })} className={input} />
      </label>
      <label className="block">Objet (200 caractères au plus)
        <input aria-label="Objet" type="text" maxLength={200} value={f.subject} onChange={(e) => p.onForm({ subject: e.target.value })} className={input} />
      </label>
      <label className="block">Message (4 000 caractères au plus)
        <textarea aria-label="Message" maxLength={4000} rows={9} value={f.message} onChange={(e) => p.onForm({ message: e.target.value })} className={input} />
      </label>
      <p className="text-hub-muted">Pensez à joindre le fichier exporté à votre message : BA-Mentor ne l’envoie pas.</p>
      {f.error && <p role="alert" className="break-words text-hub-bad">{f.error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={p.busy} onClick={p.onSaveForm} className={btn}>Enregistrer la préparation</button>
        <button type="button" disabled={p.busy} onClick={p.onCancelForm} className={btn}>Annuler</button>
      </div>
    </div>
  );
}

function ReplyBlock(p: DiffusionViewProps & { reply: ReplyForm }) {
  const r = p.reply;
  return (
    <div className="mt-2 space-y-2 rounded border border-hub-line p-2" aria-label="Saisie de la réponse">
      <label className="block">Réponse
        <select aria-label="Réponse" value={r.verdict} onChange={(e) => p.onReplyForm({ verdict: e.target.value })} className={input}>
          <option value="">Choisir…</option>
          {VERDICTS.map((v) => <option key={v} value={v}>{verdictLabel(v)}</option>)}
        </select>
      </label>
      <label className="block">Date de la réponse
        <input aria-label="Date de la réponse" type="date" value={r.repliedOn} onChange={(e) => p.onReplyForm({ repliedOn: e.target.value })} className={input} />
      </label>
      <label className="block">Commentaire (500 caractères au plus, facultatif)
        <textarea aria-label="Commentaire de réponse" maxLength={500} rows={3} value={r.comment} onChange={(e) => p.onReplyForm({ comment: e.target.value })} className={input} />
      </label>
      {r.error && <p role="alert" className="break-words text-hub-bad">{r.error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={p.busy} onClick={p.onSaveReply} className={btn}>Enregistrer la réponse</button>
        <button type="button" disabled={p.busy} onClick={p.onCancelReply} className={btn}>Annuler</button>
      </div>
    </div>
  );
}
