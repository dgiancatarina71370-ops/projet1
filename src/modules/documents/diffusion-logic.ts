// Logique pure de la section « Diffusion » du détail d'un document (lot F8). Sans base ni React ; l'horloge (« today ») est toujours passée en paramètre.
import { dayText, recipientStatus, recipientStatusLabel, roleLabel, verdictLabel } from '../../domain/distribution.ts';
import type { RecipientRole, RecipientStatus } from '../../domain/distribution.ts';

export const DIFFUSION_BANNER = "BA-Mentor n'envoie aucun message : copiez, puis envoyez depuis votre messagerie.";
export const DRAFT_NOTICE = 'Diffusion non officielle : ce document est un brouillon.';
export const REPLY_REMINDER = 'Une réponse ne change pas l’état du document : seule votre validation le fait.';
export const NO_ADDRESS_TEXT = 'Aucune partie prenante active n’a d’adresse e-mail. Ajoutez-en dans la fiche partie prenante.';
export const NOT_DIFFUSABLE_TEXT = 'Ce document ne reçoit plus de nouvelle diffusion (archivé ou remplacé). Ses diffusions passées restent consultables.';

export const excludedText = (n: number): string => (n === 1 ? '1 partie prenante active n’a pas d’adresse et n’est pas proposée.' : `${n} parties prenantes actives n’ont pas d’adresse et ne sont pas proposées.`);

export interface DistributionInput {
  id: number;
  subject: string;
  message: string;
  due_on: string | null;
  prepared_on: string;
  sent_on: string | null;
  recipients: Array<{ id: number; name: string; email: string; role: string; verdict: string | null; replied_on: string | null; reply_comment: string | null }>;
}

export interface RecipientLine {
  id: number;
  name: string;
  email: string;
  roleText: string;
  status: RecipientStatus;
  statusText: string;
  /** « Validé avec réserves le 25/11/2026 — Voir point 3 » ; vide sans réponse. */
  replyText: string;
  hasReply: boolean;
}

export interface DistributionLine {
  id: number;
  subject: string;
  message: string;
  title: string;
  stateText: string;
  dueText: string | null;
  overdueNote: string | null;
  sent: boolean;
  /** Modifier et supprimer : tant que la diffusion est préparée (F8-D06). */
  canEdit: boolean;
  canMarkSent: boolean;
  /** Annuler l'envoi : envoyée et aucune réponse saisie (F8-D06). */
  canCancel: boolean;
  canReply: boolean;
  addresses: string;
  recipients: RecipientLine[];
}

/** Adresses prêtes à coller dans le champ « À » : séparées par « ; » (séparateur courant des messageries ; à confirmer à la recette). */
export const addressList = (rs: ReadonlyArray<{ email: string }>): string => rs.map((r) => r.email).join('; ');

export function recipientLine(d: Pick<DistributionInput, 'sent_on' | 'due_on'>, r: DistributionInput['recipients'][number], today: string): RecipientLine {
  const status = recipientStatus(d, r, today);
  let replyText = '';
  if (r.verdict !== null) {
    replyText = verdictLabel(r.verdict) + (r.replied_on !== null ? ` le ${dayText(r.replied_on)}` : '') + (r.reply_comment ? ` — ${r.reply_comment}` : '');
  }
  return { id: r.id, name: r.name, email: r.email, roleText: roleLabel(r.role), status, statusText: recipientStatusLabel(status), replyText, hasReply: r.verdict !== null };
}

export function distributionLine(d: DistributionInput, today: string): DistributionLine {
  const sent = d.sent_on !== null;
  const recipients = d.recipients.map((r) => recipientLine(d, r, today));
  const noReply = recipients.filter((r) => r.status === 'no_reply').length;
  const anyReply = recipients.some((r) => r.hasReply);
  return {
    id: d.id,
    subject: d.subject,
    message: d.message,
    title: `Diffusion du ${dayText(d.prepared_on)}`,
    stateText: sent ? `Envoyée le ${dayText(d.sent_on as string)} (date déclarée)` : 'Préparée, non envoyée',
    dueText: d.due_on === null ? null : `Réponse souhaitée avant le ${dayText(d.due_on)}`,
    overdueNote: noReply === 0 ? null : noReply === 1 ? 'Échéance dépassée : 1 destinataire n’a pas répondu.' : `Échéance dépassée : ${noReply} destinataires n’ont pas répondu.`,
    sent,
    canEdit: !sent,
    canMarkSent: !sent && d.recipients.length > 0,
    canCancel: sent && !anyReply,
    canReply: sent,
    addresses: addressList(d.recipients),
    recipients,
  };
}

/** Rôles choisis, sans les cases vides. */
export function chosenRoles(picks: Record<number, RecipientRole | ''>): RecipientRole[] {
  return Object.values(picks).filter((r): r is RecipientRole => r === 'validate' || r === 'inform');
}

export function picksToRecipients(picks: Record<number, RecipientRole | ''>): Array<{ stakeholderId: number; role: RecipientRole }> {
  return Object.entries(picks).filter(([, r]) => r === 'validate' || r === 'inform').map(([id, role]) => ({ stakeholderId: Number(id), role: role as RecipientRole }));
}

export const sentMessage = 'Envoi déclaré. BA-Mentor n’a envoyé aucun message.';
export const preparedMessage = 'Diffusion préparée.';
export const updatedMessage = 'Préparation enregistrée.';
export const deletedMessage = 'Diffusion supprimée.';
export const cancelledMessage = 'Envoi déclaré annulé : la diffusion est de nouveau préparée.';
export const replySavedMessage = 'Réponse enregistrée. L’état du document n’a pas changé.';
export const replyRemovedMessage = 'Réponse retirée.';
