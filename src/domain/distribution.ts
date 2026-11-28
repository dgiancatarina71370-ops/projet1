// Diffusion manuelle d'un document (lot F8, décisions F8-D03 à F8-D09). Couche « domain » : pure, sans base ni interface (règle R9).
// BA-Mentor n'envoie aucun message : une diffusion est une préparation et un suivi tenus par le BA. « Envoyé » est une déclaration, pas une preuve.
// Syntaxe volontairement « effaçable » : ce fichier s'exécute tel quel sous Node pour les tests.

// ------------------------------------------------------------------ rôles, réponses, statuts

export type RecipientRole = 'validate' | 'inform';
export const RECIPIENT_ROLES: readonly RecipientRole[] = ['validate', 'inform'];
const ROLE_LABELS: Record<RecipientRole, string> = { validate: 'À valider', inform: 'Pour information' };

export function isRole(value: unknown): value is RecipientRole {
  return typeof value === 'string' && (RECIPIENT_ROLES as readonly string[]).includes(value);
}
export function roleLabel(role: string): string {
  return isRole(role) ? ROLE_LABELS[role] : `Inconnu (${role})`;
}

export type Verdict = 'approved' | 'approved_with_reserves' | 'rejected';
export const VERDICTS: readonly Verdict[] = ['approved', 'approved_with_reserves', 'rejected'];
const VERDICT_LABELS: Record<Verdict, string> = { approved: 'Validé', approved_with_reserves: 'Validé avec réserves', rejected: 'Refusé' };

export function isVerdict(value: unknown): value is Verdict {
  return typeof value === 'string' && (VERDICTS as readonly string[]).includes(value);
}
export function verdictLabel(verdict: string): string {
  return isVerdict(verdict) ? VERDICT_LABELS[verdict] : `Inconnu (${verdict})`;
}

export type RecipientStatus = 'to_send' | 'sent' | 'replied' | 'no_reply';
const STATUS_LABELS: Record<RecipientStatus, string> = { to_send: 'À envoyer', sent: 'Envoyé', replied: 'Réponse reçue', no_reply: 'Sans réponse' };
export const recipientStatusLabel = (s: RecipientStatus): string => STATUS_LABELS[s];

// ------------------------------------------------------------------ limites et textes

export const MAX_SUBJECT = 200;
export const MAX_MESSAGE = 4000;
export const MAX_REPLY_COMMENT = 500;

export function normalizeSubject(value: string): string {
  const v = value.trim();
  if (v === '') throw new Error("L'objet est obligatoire.");
  if (v.length > MAX_SUBJECT) throw new Error(`L'objet est limité à ${MAX_SUBJECT} caractères.`);
  return v;
}

export function normalizeMessage(value: string): string {
  const v = value.trim();
  if (v === '') throw new Error('Le message est obligatoire.');
  if (v.length > MAX_MESSAGE) throw new Error(`Le message est limité à ${MAX_MESSAGE} caractères.`);
  return v;
}

/** Commentaire de réponse : facultatif, nettoyé, vide = aucun. */
export function normalizeReplyComment(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (v === '') return null;
  if (v.length > MAX_REPLY_COMMENT) throw new Error(`Le commentaire est limité à ${MAX_REPLY_COMMENT} caractères.`);
  return v;
}

// ------------------------------------------------------------------ dates (« AAAA-MM-JJ », jour local)

/** Vrai pour une date réelle au format AAAA-MM-JJ (le 31/02 est refusé). */
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Jour local d'une horloge, « AAAA-MM-JJ ». Le jour du poste sert à calculer « sans réponse » : une horloge fausse fausse le statut. */
export function dayOf(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** « 2026-12-15 » devient « 15/12/2026 » ; une valeur inattendue est rendue telle quelle. */
export function dayText(value: string): string {
  return isDay(value) ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : value;
}

/** Échéance facultative (F8-D09) : une vraie date, pas avant le jour de préparation. */
export function normalizeDue(value: string | null | undefined, preparedOn: string): string | null {
  const v = (value ?? '').trim();
  if (v === '') return null;
  if (!isDay(v)) throw new Error("L'échéance n'est pas une date valide.");
  if (v < preparedOn) throw new Error("L'échéance ne peut pas précéder le jour de préparation.");
  return v;
}

/** Date d'envoi déclarée (F8-D06) : une vraie date, jamais dans le futur, pas avant le jour de préparation. */
export function checkSentOn(value: string, today: string, preparedOn: string): string {
  if (!isDay(value)) throw new Error("La date d'envoi n'est pas une date valide.");
  if (value > today) throw new Error("La date d'envoi ne peut pas être dans le futur.");
  if (value < preparedOn) throw new Error("La date d'envoi ne peut pas précéder le jour de préparation.");
  return value;
}

/** Date de réponse (F8-D08) : une vraie date, ni dans le futur, ni avant la date d'envoi. */
export function checkRepliedOn(value: string, today: string, sentOn: string): string {
  if (!isDay(value)) throw new Error('La date de la réponse n\'est pas une date valide.');
  if (value > today) throw new Error('La date de la réponse ne peut pas être dans le futur.');
  if (value < sentOn) throw new Error("La date de la réponse ne peut pas précéder la date d'envoi.");
  return value;
}

// ------------------------------------------------------------------ règles

/** Un document se diffuse s'il est brouillon ou validé et qu'aucune version suivante ne le remplace (F8-D03). */
export function canDiffuse(status: string, replaced: boolean): boolean {
  return !replaced && (status === 'draft' || status === 'validated');
}

/** Statut d'un destinataire, CALCULÉ (F8-D07) : rien n'est stocké, aucune tâche de fond. « today » vient de l'horloge du poste. */
export function recipientStatus(distribution: { sent_on: string | null; due_on: string | null }, recipient: { verdict: string | null }, today: string): RecipientStatus {
  if (distribution.sent_on === null) return 'to_send';
  if (recipient.verdict !== null) return 'replied';
  if (distribution.due_on !== null && today > distribution.due_on) return 'no_reply';
  return 'sent';
}

/** Une diffusion est « préparée » (modifiable) tant que le BA n'a pas déclaré l'envoi. */
export const isPrepared = (sentOn: string | null): boolean => sentOn === null;

// ------------------------------------------------------------------ objet et message proposés (F8-D05)

export interface ProposalInput {
  documentName: string;
  /** Version d'un document généré ; null pour un document importé de la V1. */
  version: number | null;
  /** « draft » ou « validated ». */
  status: string;
  /** Jour de validation « AAAA-MM-JJ », s'il est connu. */
  validatedOn: string | null;
  dueOn: string | null;
  roles: readonly RecipientRole[];
}

/** Objet proposé : « Nom — version 2 — pour validation » (le rôle dominant : s'il y a au moins un destinataire « à valider »). Jamais plus de 200 caractères. */
export function proposeSubject(p: ProposalInput): string {
  const tail = ` — ${p.roles.includes('validate') ? 'pour validation' : 'pour information'}`;
  const version = p.version === null ? '' : ` — version ${p.version}`;
  const room = MAX_SUBJECT - tail.length - version.length;
  const name = p.documentName.length > room ? `${p.documentName.slice(0, Math.max(0, room - 1))}…` : p.documentName;
  return `${name}${version}${tail}`;
}

/** Message proposé : texte fixe, que le BA modifie. Dit l'état du document. Ni signature ni nom d'expéditeur. Jamais plus de 4 000 caractères. */
export function proposeMessage(p: ProposalInput): string {
  const toValidate = p.roles.includes('validate');
  const toInform = p.roles.includes('inform');
  const what = p.version === null ? `« ${p.documentName} »` : `« ${p.documentName} » (version ${p.version})`;
  const lines: string[] = ['Bonjour,', ''];
  if (toValidate && toInform) lines.push(`Veuillez trouver ci-joint le document ${what}, à valider par certains destinataires et transmis pour information aux autres.`);
  else if (toValidate) lines.push(`Veuillez trouver ci-joint le document ${what}, à valider.`);
  else lines.push(`Veuillez trouver ci-joint le document ${what}, à titre d'information.`);
  lines.push('');
  lines.push(p.status === 'validated' ? `État du document : validé${p.validatedOn !== null ? ` le ${dayText(p.validatedOn)}` : ''}.` : 'État du document : brouillon, non validé.');
  if (p.dueOn !== null) lines.push(`Réponse souhaitée avant le ${dayText(p.dueOn)}.`);
  if (toValidate) lines.push('Merci de répondre par « validé », « validé avec réserves » ou « refusé », en précisant vos réserves le cas échéant.');
  lines.push('', 'Cordialement,');
  const text = lines.join('\n');
  return text.length > MAX_MESSAGE ? text.slice(0, MAX_MESSAGE) : text;
}
