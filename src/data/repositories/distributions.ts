// Dépôt des diffusions (lot F8, décisions F8-D03 à F8-D11). BA-Mentor n'envoie aucun message : ce dépôt tient le registre d'une diffusion
// préparée puis déclarée envoyée, et des réponses saisies à la main. Lecture par query() ; écriture par mutate() avec journal.
// Chaque geste est une écriture GARDÉE par l'état attendu : si l'état a changé (deux fenêtres), rien n'est écrit et on refuse (DistributionStateError).
// Les lignes de destinataires (table d'extension) s'écrivent dans la même transaction qu'une écriture journalisée de la diffusion.
import { query, queryOne } from '../db.ts';
import type { Row } from '../db.ts';
import { mutate } from '../mutate.ts';
import type { WriteOp } from '../mutate.ts';
import {
  canDiffuse, checkRepliedOn, checkSentOn, dayOf, isRole, isVerdict, normalizeDue, normalizeMessage, normalizeReplyComment, normalizeSubject,
} from '../../domain/distribution.ts';
import type { RecipientRole, Verdict } from '../../domain/distribution.ts';

export class DistributionStateError extends Error {
  constructor() {
    super("Action impossible : l'état de cette diffusion a changé. Rouvrez le document.");
    this.name = 'DistributionStateError';
  }
}

export interface RecipientRow extends Row {
  id: number;
  distribution_id: number;
  stakeholder_id: number | null;
  name: string;
  email: string;
  role: string;
  verdict: string | null;
  replied_on: string | null;
  reply_comment: string | null;
}

export interface DistributionRow extends Row {
  id: number;
  document_id: number;
  subject: string;
  message: string;
  due_on: string | null;
  prepared_on: string;
  sent_on: string | null;
  created_at: string;
  updated_at: string;
}

/** Diffusion et ses destinataires. N'étend pas « Row » : une ligne de base ne porte que des valeurs simples, pas une liste. */
export interface DistributionWithRecipients {
  id: number;
  document_id: number;
  subject: string;
  message: string;
  due_on: string | null;
  prepared_on: string;
  sent_on: string | null;
  created_at: string;
  updated_at: string;
  recipients: RecipientRow[];
}

export interface Candidate extends Row {
  id: number;
  code: string;
  name: string;
  email: string;
}

export interface Candidates {
  /** Parties prenantes actives avec une adresse (F8-D04). */
  available: Candidate[];
  /** Parties prenantes actives sans adresse : non proposées, comptées pour l'écran. */
  excluded: number;
}

export interface DistributionInput {
  subject: string;
  message: string;
  dueOn: string | null;
  recipients: Array<{ stakeholderId: number; role: RecipientRole }>;
}

const nowIso = (): string => new Date().toISOString();
const NOT_REPLACED = 'NOT EXISTS (SELECT 1 FROM documents r WHERE r.replaces_id = documents.id)';

// ------------------------------------------------------------------ lecture

/** Diffusions d'un document, la plus récente d'abord, avec leurs destinataires (ordre de saisie). */
export async function listDistributions(documentId: number): Promise<DistributionWithRecipients[]> {
  const rows = await query<DistributionRow>('SELECT * FROM distributions WHERE document_id = ? ORDER BY id DESC', [documentId]);
  const out: DistributionWithRecipients[] = [];
  for (const d of rows) {
    const recipients = await query<RecipientRow>('SELECT * FROM distribution_recipients WHERE distribution_id = ? ORDER BY id', [d.id]);
    out.push({ ...d, recipients });
  }
  return out;
}

export async function getDistribution(id: number): Promise<DistributionWithRecipients | null> {
  const d = await queryOne<DistributionRow>('SELECT * FROM distributions WHERE id = ?', [id]);
  if (!d) return null;
  const recipients = await query<RecipientRow>('SELECT * FROM distribution_recipients WHERE distribution_id = ? ORDER BY id', [id]);
  return { ...d, recipients };
}

/** Destinataires possibles d'un projet (F8-D04) : parties prenantes ACTIVES ayant une adresse ; les actives sans adresse sont comptées. */
export async function listCandidates(projectId: number): Promise<Candidates> {
  const available = await query<Candidate>(
    `SELECT i.id, i.code, i.title AS name, d.email FROM items i JOIN stakeholder_details d ON d.item_id = i.id
     WHERE i.project_id = ? AND i.kind = 'stakeholder' AND i.status = 'active' AND d.email <> '' ORDER BY i.number`,
    [projectId],
  );
  const n = await queryOne<{ n: number }>(
    `SELECT count(*) AS n FROM items i JOIN stakeholder_details d ON d.item_id = i.id
     WHERE i.project_id = ? AND i.kind = 'stakeholder' AND i.status = 'active' AND d.email = ''`,
    [projectId],
  );
  return { available, excluded: n?.n ?? 0 };
}

// ------------------------------------------------------------------ écriture : préparation

interface Checked {
  subject: string;
  message: string;
  dueOn: string | null;
  recipients: Array<{ stakeholderId: number; role: RecipientRole }>;
}

function checkInput(input: DistributionInput, preparedOn: string): Checked {
  const subject = normalizeSubject(input.subject);
  const message = normalizeMessage(input.message);
  const dueOn = normalizeDue(input.dueOn, preparedOn);
  if (input.recipients.length === 0) throw new Error('Choisissez au moins un destinataire.');
  const seen = new Set<number>();
  for (const r of input.recipients) {
    if (!isRole(r.role)) throw new Error('Rôle de destinataire inconnu.');
    if (seen.has(r.stakeholderId)) throw new Error('Un destinataire ne peut figurer qu\'une fois dans une diffusion.');
    seen.add(r.stakeholderId);
  }
  return { subject, message, dueOn, recipients: input.recipients };
}

/** Insère un destinataire en recopiant nom et adresse (F8-D10), sous les gardes : partie prenante active du projet, avec adresse, diffusion toujours dans l'état voulu. */
function recipientInsert(stakeholderId: number, role: RecipientRole, guard: { distributionSql: string; params: Array<number | string> }): WriteOp {
  return {
    sql: `INSERT INTO distribution_recipients (distribution_id, stakeholder_id, name, email, role)
SELECT x.id, i.id, i.title, d.email, ? FROM distributions x
JOIN documents doc ON doc.id = x.document_id
JOIN items i ON i.id = ? AND i.project_id = doc.project_id AND i.kind = 'stakeholder' AND i.status = 'active'
JOIN stakeholder_details d ON d.item_id = i.id AND d.email <> ''
WHERE ${guard.distributionSql}`,
    params: [role, stakeholderId, ...guard.params],
    extension: true,
  };
}

/** Vérifie avant toute écriture que chaque destinataire choisi est encore proposable (active, avec adresse, du projet du document). */
async function assertRecipientsAvailable(projectId: number, recipients: Checked['recipients']): Promise<void> {
  const { available } = await listCandidates(projectId);
  const ok = new Set(available.map((c) => c.id));
  if (recipients.some((r) => !ok.has(r.stakeholderId))) {
    throw new Error("Un destinataire choisi n'est plus disponible (partie prenante archivée, sans adresse ou d'un autre projet). Rouvrez la préparation.");
  }
}

/** Prépare une diffusion pour un document (F8-D03 : brouillon ou validé non remplacé). Retourne son identifiant. */
export async function prepareDistribution(documentId: number, input: DistributionInput, today: string = dayOf(new Date())): Promise<number> {
  const doc = await queryOne<{ id: number; project_id: number }>(
    `SELECT id, project_id FROM documents WHERE id = ? AND status IN ('draft','validated') AND ${NOT_REPLACED}`,
    [documentId],
  );
  if (!doc) throw new Error('Ce document ne peut plus être diffusé : seuls un brouillon ou un document validé non remplacé le peuvent.');
  const c = checkInput(input, today);
  await assertRecipientsAvailable(doc.project_id, c.recipients);
  const t = nowIso();
  const ops: WriteOp[] = [
    {
      sql: `INSERT INTO distributions (document_id, subject, message, due_on, prepared_on, sent_on, created_at, updated_at)
SELECT id, ?, ?, ?, ?, NULL, ?, ? FROM documents WHERE id = ? AND status IN ('draft','validated') AND ${NOT_REPLACED}`,
      params: [c.subject, c.message, c.dueOn, today, t, t, documentId],
      activity: { objectType: 'distribution', action: 'created', objectId: 'inserted', projectId: doc.project_id },
    },
  ];
  // « inserted » : l'identifiant de la diffusion est le plus grand de la table, dans cette transaction (le journal a déjà pris last_insert_rowid).
  const guard = { distributionSql: 'x.id = (SELECT max(id) FROM distributions) AND x.created_at = ? AND x.document_id = ?', params: [t, documentId] };
  for (const r of c.recipients) ops.push(recipientInsert(r.stakeholderId, r.role, guard));
  const results = await mutate(ops);
  if (results[0].changes === 0) throw new Error('Ce document ne peut plus être diffusé.');
  const inserted = results.slice(1).reduce((n, r) => n + r.changes, 0);
  if (inserted !== c.recipients.length) {
    // Un destinataire n'est plus valable (archivé, adresse retirée…) : on défait la préparation entière plutôt que d'en garder une partielle.
    const id = await queryOne<{ id: number }>('SELECT max(id) AS id FROM distributions WHERE document_id = ? AND created_at = ?', [documentId, t]);
    if (id?.id != null) await removeRow(id.id, doc.project_id);
    throw new Error('Un destinataire choisi n\'est plus disponible (partie prenante archivée ou sans adresse). Rouvrez la préparation.');
  }
  const created = await queryOne<{ id: number }>('SELECT max(id) AS id FROM distributions WHERE document_id = ? AND created_at = ?', [documentId, t]);
  return created!.id;
}

async function removeRow(id: number, projectId: number): Promise<void> {
  await mutate([{ sql: 'DELETE FROM distributions WHERE id = ? AND sent_on IS NULL', params: [id], activity: { objectType: 'distribution', action: 'deleted', objectId: id, projectId } }]);
}

async function load(id: number): Promise<{ d: DistributionRow; project_id: number }> {
  const row = await queryOne<DistributionRow & { project_id: number }>(
    'SELECT x.*, doc.project_id AS project_id FROM distributions x JOIN documents doc ON doc.id = x.document_id WHERE x.id = ?',
    [id],
  );
  if (!row) throw new DistributionStateError();
  return { d: row, project_id: row.project_id };
}

/** Modifie une diffusion encore préparée : objet, message, échéance, destinataires (F8-D06). Journal : noms des champs modifiés. */
export async function updatePreparation(id: number, input: DistributionInput, today: string = dayOf(new Date())): Promise<void> {
  const { d, project_id } = await load(id);
  if (d.sent_on !== null) throw new DistributionStateError();
  const c = checkInput(input, d.prepared_on <= today ? d.prepared_on : today);
  await assertRecipientsAvailable(project_id, c.recipients);
  const before = await getDistribution(id);
  const changed: string[] = [];
  if (c.subject !== d.subject) changed.push('subject');
  if (c.message !== d.message) changed.push('message');
  if (c.dueOn !== d.due_on) changed.push('due_on');
  const old = JSON.stringify((before?.recipients ?? []).map((r) => [r.stakeholder_id, r.role]).sort());
  const next = JSON.stringify(c.recipients.map((r) => [r.stakeholderId, r.role]).sort());
  if (old !== next) changed.push('recipients');
  if (changed.length === 0) return;
  const stamp = nowIso();
  const ops: WriteOp[] = [
    {
      sql: 'UPDATE distributions SET subject = ?, message = ?, due_on = ?, updated_at = ? WHERE id = ? AND sent_on IS NULL',
      params: [c.subject, c.message, c.dueOn, stamp, id],
      activity: { objectType: 'distribution', action: 'updated', objectId: id, projectId: project_id, detail: changed.join(',') },
    },
  ];
  if (changed.includes('recipients')) {
    ops.push({ sql: 'DELETE FROM distribution_recipients WHERE distribution_id = ? AND EXISTS (SELECT 1 FROM distributions x WHERE x.id = ? AND x.updated_at = ? AND x.sent_on IS NULL)', params: [id, id, stamp], extension: true });
    const guard = { distributionSql: 'x.id = ? AND x.updated_at = ? AND x.sent_on IS NULL', params: [id, stamp] };
    for (const r of c.recipients) ops.push(recipientInsert(r.stakeholderId, r.role, guard));
  }
  const results = await mutate(ops);
  if (results[0].changes === 0) throw new DistributionStateError();
  if (changed.includes('recipients')) {
    const inserted = results.slice(2).reduce((n, r) => n + r.changes, 0);
    if (inserted !== c.recipients.length) {
      throw new Error('Un destinataire choisi n\'est plus disponible (partie prenante archivée ou sans adresse). Rouvrez la préparation : la liste des destinataires a été vidée, choisissez-les de nouveau.');
    }
  }
}

/** Supprime une diffusion encore préparée (F8-D06) ; une diffusion envoyée ne se supprime pas. */
export async function deleteDistribution(id: number): Promise<void> {
  const { d, project_id } = await load(id);
  if (d.sent_on !== null) throw new DistributionStateError();
  const [r] = await mutate([{ sql: 'DELETE FROM distributions WHERE id = ? AND sent_on IS NULL', params: [id], activity: { objectType: 'distribution', action: 'deleted', objectId: id, projectId: project_id } }]);
  if (r.changes === 0) throw new DistributionStateError();
}

// ------------------------------------------------------------------ écriture : envoi et réponses

/** Déclare l'envoi (F8-D06) : date du jour par défaut, jamais dans le futur ni avant la préparation. BA-Mentor n'envoie rien. */
export async function markSent(id: number, sentOn: string | null = null, today: string = dayOf(new Date())): Promise<void> {
  const { d, project_id } = await load(id);
  if (d.sent_on !== null) throw new DistributionStateError();
  const day = checkSentOn(sentOn ?? today, today, d.prepared_on);
  const [r] = await mutate([
    {
      sql: `UPDATE distributions SET sent_on = ?, updated_at = ? WHERE id = ? AND sent_on IS NULL AND EXISTS (SELECT 1 FROM distribution_recipients WHERE distribution_id = ?)`,
      params: [day, nowIso(), id, id],
      activity: { objectType: 'distribution', action: 'status_changed', objectId: id, projectId: project_id, detail: 'prepared>sent' },
    },
  ]);
  if (r.changes === 0) throw new DistributionStateError();
}

/** Annule l'envoi déclaré, tant qu'aucune réponse n'est saisie (F8-D06). */
export async function cancelSent(id: number): Promise<void> {
  const { d, project_id } = await load(id);
  if (d.sent_on === null) throw new DistributionStateError();
  const [r] = await mutate([
    {
      sql: `UPDATE distributions SET sent_on = NULL, updated_at = ? WHERE id = ? AND sent_on IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM distribution_recipients WHERE distribution_id = ? AND verdict IS NOT NULL)`,
      params: [nowIso(), id, id],
      activity: { objectType: 'distribution', action: 'status_changed', objectId: id, projectId: project_id, detail: 'sent>prepared' },
    },
  ]);
  if (r.changes === 0) throw new DistributionStateError();
}

async function loadRecipient(recipientId: number): Promise<{ r: RecipientRow; d: DistributionRow; project_id: number }> {
  const r = await queryOne<RecipientRow>('SELECT * FROM distribution_recipients WHERE id = ?', [recipientId]);
  if (!r) throw new DistributionStateError();
  const { d, project_id } = await load(r.distribution_id);
  return { r, d, project_id };
}

/** Saisit ou corrige la réponse d'un destinataire (F8-D08). La réponse ne modifie jamais le document. */
export async function saveReply(recipientId: number, verdict: Verdict, repliedOn: string, comment: string | null, today: string = dayOf(new Date())): Promise<void> {
  if (!isVerdict(verdict)) throw new Error('Réponse inconnue.');
  const { r, d, project_id } = await loadRecipient(recipientId);
  if (d.sent_on === null) throw new DistributionStateError();
  const day = checkRepliedOn(repliedOn, today, d.sent_on);
  const text = normalizeReplyComment(comment);
  const stamp = nowIso();
  const [a, b] = await mutate([
    {
      sql: 'UPDATE distributions SET updated_at = ? WHERE id = ? AND sent_on IS NOT NULL',
      params: [stamp, d.id],
      activity: { objectType: 'distribution', action: 'updated', objectId: d.id, projectId: project_id, detail: `reply:${verdict}` },
    },
    {
      sql: 'UPDATE distribution_recipients SET verdict = ?, replied_on = ?, reply_comment = ? WHERE id = ? AND distribution_id = ? AND EXISTS (SELECT 1 FROM distributions x WHERE x.id = ? AND x.updated_at = ? AND x.sent_on IS NOT NULL)',
      params: [verdict, day, text, r.id, d.id, d.id, stamp],
      extension: true,
    },
  ]);
  if (a.changes === 0 || b.changes === 0) throw new DistributionStateError();
}

/** Retire la réponse d'un destinataire (erreur de saisie, F8-D08). */
export async function removeReply(recipientId: number): Promise<void> {
  const { r, d, project_id } = await loadRecipient(recipientId);
  if (d.sent_on === null || r.verdict === null) throw new DistributionStateError();
  const stamp = nowIso();
  const [a, b] = await mutate([
    {
      sql: 'UPDATE distributions SET updated_at = ? WHERE id = ? AND sent_on IS NOT NULL',
      params: [stamp, d.id],
      activity: { objectType: 'distribution', action: 'updated', objectId: d.id, projectId: project_id, detail: 'reply:removed' },
    },
    {
      sql: 'UPDATE distribution_recipients SET verdict = NULL, replied_on = NULL, reply_comment = NULL WHERE id = ? AND distribution_id = ? AND verdict IS NOT NULL AND EXISTS (SELECT 1 FROM distributions x WHERE x.id = ? AND x.updated_at = ? AND x.sent_on IS NOT NULL)',
      params: [r.id, d.id, d.id, stamp],
      extension: true,
    },
  ]);
  if (a.changes === 0 || b.changes === 0) throw new DistributionStateError();
}

export { canDiffuse };
