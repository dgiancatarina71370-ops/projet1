// Lot F8 : diffusion manuelle d'un document (décisions F8-D01 à F8-D14). Base SQLite réelle (node:sqlite).
// BA-Mentor n'envoie aucun message : ces tests vérifient le registre (préparation, envoi déclaré, réponses), pas un envoi.
// Les clics, le presse-papiers, deux fenêtres ouvertes et la migration d'une vraie base sont à la recette sur clé (TESTS-F8.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migratedDb } from './helpers/setup.ts';
import { query } from '../src/data/db.ts';
import { createProject, deleteProject } from '../src/data/repositories/projects.ts';
import { changeItemStatus, deleteItem } from '../src/data/repositories/items.ts';
import { createStakeholder, getStakeholder, updateStakeholder } from '../src/data/repositories/stakeholders.ts';
import { createRequirement } from '../src/data/repositories/requirements.ts';
import { getDocument, archiveDocument, validateDocument } from '../src/data/repositories/documents.ts';
import {
  DistributionStateError, cancelSent, deleteDistribution, getDistribution, listCandidates, listDistributions, markSent, prepareDistribution,
  removeReply, saveReply, updatePreparation,
} from '../src/data/repositories/distributions.ts';
import { listJournal } from '../src/data/repositories/journal.ts';
import { saveDeliverable } from '../src/export/service.ts';
import {
  canDiffuse, checkRepliedOn, checkSentOn, dayOf, isDay, normalizeDue, normalizeReplyComment, proposeMessage, proposeSubject, recipientStatus,
} from '../src/domain/distribution.ts';
import { isEmailShaped, normalizeFields } from '../src/domain/stakeholders.ts';
import { journalLine } from '../src/modules/journal/logic.ts';
import { SCHEMA_VERSION } from '../src/data/migrations/index.ts';

const OPT = { includeArchived: false };
const TODAY = '2026-11-28';

async function setup() {
  const projectId = await createProject('Projet F8');
  await createRequirement({ projectId, title: 'Exigence' });
  const a = await createStakeholder({ projectId, title: 'Alice Test', email: 'alice@exemple.test' });
  const b = await createStakeholder({ projectId, title: 'Bruno Test', email: 'bruno@exemple.test' });
  const noMail = await createStakeholder({ projectId, title: 'Sans Adresse' });
  const doc = (await saveDeliverable(projectId, 'requirements', OPT)).id;
  return { projectId, a: a.id, b: b.id, noMail: noMail.id, doc };
}
const input = (recipients: Array<{ stakeholderId: number; role: 'validate' | 'inform' }>, extra: Record<string, unknown> = {}) =>
  ({ subject: 'Objet', message: 'Message', dueOn: null, recipients, ...extra });
const distLog = () => query<{ action: string; detail: string | null }>("SELECT action, detail FROM activity_log WHERE object_type = 'distribution' ORDER BY id");

// ------------------------------------------------------------------ domaine pur

test('domaine : e-mail — formes acceptées et refusées, espaces retirés, vide permis, 254 caractères (F8-D02)', () => {
  for (const ok of ['a@b.co', 'prenom.nom@exemple.test', 'A@B.C']) assert.equal(isEmailShaped(ok), true, ok);
  for (const bad of ['', 'sans-arobase', 'a@@b.c', 'a@b@c.d', 'a b@c.d', '@b.c', 'a@', 'a@bc', 'a@.c', 'a@b.']) assert.equal(isEmailShaped(bad), false, bad);
  assert.equal(normalizeFields({ email: '  Alice@Exemple.test  ' }).email, 'Alice@Exemple.test', 'casse conservée, espaces retirés');
  assert.equal(normalizeFields({ email: '   ' }).email, '');
  assert.throws(() => normalizeFields({ email: 'x'.repeat(250) + '@b.co' }), /Adresse e-mail non valide/);
  assert.throws(() => normalizeFields({ email: 'pas une adresse' }), /Adresse e-mail non valide/);
  const long = 'a'.repeat(240) + '@b.co';
  assert.equal(long.length <= 254, true);
  assert.equal(normalizeFields({ email: long }).email, long);
});

test('domaine : dates — jour réel, échéance, date d\'envoi, date de réponse (F8-D06, D08, D09)', () => {
  assert.equal(isDay('2026-02-28'), true);
  assert.equal(isDay('2026-02-31'), false);
  assert.equal(isDay('28/11/2026'), false);
  assert.equal(dayOf(new Date(2026, 10, 28, 23, 59)), '2026-11-28');
  assert.equal(normalizeDue(null, TODAY), null);
  assert.equal(normalizeDue('  ', TODAY), null);
  assert.equal(normalizeDue(TODAY, TODAY), TODAY);
  assert.throws(() => normalizeDue('2026-11-27', TODAY), /précéder/);
  assert.throws(() => normalizeDue('2026-13-01', TODAY), /pas une date valide/);
  assert.equal(checkSentOn(TODAY, TODAY, '2026-11-20'), TODAY);
  assert.throws(() => checkSentOn('2026-11-29', TODAY, '2026-11-20'), /futur/);
  assert.throws(() => checkSentOn('2026-11-19', TODAY, '2026-11-20'), /précéder/);
  assert.equal(checkRepliedOn('2026-11-28', TODAY, '2026-11-28'), '2026-11-28');
  assert.throws(() => checkRepliedOn('2026-11-29', TODAY, '2026-11-20'), /futur/);
  assert.throws(() => checkRepliedOn('2026-11-19', TODAY, '2026-11-20'), /précéder/);
  assert.equal(normalizeReplyComment('é'.repeat(500)), 'é'.repeat(500));
  assert.throws(() => normalizeReplyComment('é'.repeat(501)), /500/);
  assert.equal(normalizeReplyComment('  '), null);
});

test('domaine : statut calculé, quatre cas, la veille, le jour et le lendemain de l\'échéance (F8-D07)', () => {
  const none = { verdict: null };
  assert.equal(recipientStatus({ sent_on: null, due_on: null }, none, TODAY), 'to_send');
  assert.equal(recipientStatus({ sent_on: '2026-11-20', due_on: null }, none, TODAY), 'sent');
  assert.equal(recipientStatus({ sent_on: '2026-11-20', due_on: '2026-11-29' }, none, TODAY), 'sent', 'la veille de l\'échéance');
  assert.equal(recipientStatus({ sent_on: '2026-11-20', due_on: TODAY }, none, TODAY), 'sent', 'le jour de l\'échéance');
  assert.equal(recipientStatus({ sent_on: '2026-11-20', due_on: '2026-11-27' }, none, TODAY), 'no_reply', 'le lendemain');
  assert.equal(recipientStatus({ sent_on: '2026-11-20', due_on: '2026-11-27' }, { verdict: 'approved' }, TODAY), 'replied');
  assert.equal(recipientStatus({ sent_on: null, due_on: '2026-11-01' }, none, TODAY), 'to_send', 'pas d\'envoi, pas de « sans réponse »');
});

test('domaine : documents diffusables, objet et message proposés (F8-D03, D05)', () => {
  assert.equal(canDiffuse('draft', false), true);
  assert.equal(canDiffuse('validated', false), true);
  assert.equal(canDiffuse('archived', false), false);
  assert.equal(canDiffuse('draft', true), false);
  const base = { documentName: 'Exigences', version: 2, status: 'draft', validatedOn: null, dueOn: '2026-12-15', roles: ['validate' as const] };
  assert.equal(proposeSubject(base), 'Exigences — version 2 — pour validation');
  assert.equal(proposeSubject({ ...base, roles: ['inform'] }), 'Exigences — version 2 — pour information');
  assert.ok(proposeSubject({ ...base, documentName: 'N'.repeat(500) }).length <= 200);
  const m = proposeMessage(base);
  assert.match(m, /brouillon, non validé/);
  assert.match(m, /avant le 15\/12\/2026/);
  assert.match(m, /validé avec réserves/);
  assert.doesNotMatch(m, /Cordialement,\n\S/, 'aucune signature');
  const v = proposeMessage({ ...base, status: 'validated', validatedOn: '2026-11-20', dueOn: null, roles: ['inform'] });
  assert.match(v, /validé le 20\/11\/2026/);
  assert.doesNotMatch(v, /Réponse souhaitée/);
  assert.ok(proposeMessage({ ...base, documentName: 'N'.repeat(9000) }).length <= 4000);
});

// ------------------------------------------------------------------ migration et e-mail

test('migration 9 : schéma 9, tables et e-mail vide par défaut (F8-D13)', async () => {
  const t = await migratedDb();
  try {
    assert.equal(SCHEMA_VERSION >= 9, true);
    const tables = (await query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'distribution%' ORDER BY name")).map((r) => r.name);
    assert.deepEqual(tables, ['distribution_recipients', 'distributions']);
    const p = await createProject('P');
    const s = await createStakeholder({ projectId: p, title: 'Sans mail' });
    assert.equal((await getStakeholder(s.id))!.email, '');
  } finally { t.close(); }
});

test('e-mail : créé, modifié, journal « email » sans l\'adresse, adresse invalide refusée (F8-D02, D11)', async () => {
  const t = await migratedDb();
  try {
    const p = await createProject('P');
    const s = await createStakeholder({ projectId: p, title: 'X', email: ' x@exemple.test ' });
    assert.equal((await getStakeholder(s.id))!.email, 'x@exemple.test');
    await updateStakeholder(s.id, { fields: { email: 'y@exemple.test' } });
    assert.equal((await getStakeholder(s.id))!.email, 'y@exemple.test');
    const rows = await query<{ detail: string | null }>("SELECT detail FROM activity_log WHERE object_type = 'item' AND action = 'updated'");
    assert.ok(rows.some((r) => r.detail?.includes('email')));
    assert.ok(rows.every((r) => !(r.detail ?? '').includes('@')), 'jamais l\'adresse au journal');
    await assert.rejects(() => updateStakeholder(s.id, { fields: { email: 'pas-une-adresse' } }), /Adresse e-mail non valide/);
    assert.equal((await getStakeholder(s.id))!.email, 'y@exemple.test');
  } finally { t.close(); }
});

// ------------------------------------------------------------------ destinataires et documents

test('destinataires : actives avec adresse seulement, exclues comptées (F8-D04)', async () => {
  const t = await migratedDb();
  try {
    const s = await setup();
    const archived = await createStakeholder({ projectId: s.projectId, title: 'Archivé', email: 'arch@exemple.test' });
    await changeItemStatus(archived.id, 'archived');
    const c = await listCandidates(s.projectId);
    assert.deepEqual(c.available.map((x) => x.id), [s.a, s.b]);
    assert.equal(c.excluded, 1, 'la partie prenante active sans adresse est comptée ; l\'archivée ne l\'est pas');
    await assert.rejects(() => prepareDistribution(s.doc, input([{ stakeholderId: s.noMail, role: 'inform' }]), TODAY), /plus disponible/);
    await assert.rejects(() => prepareDistribution(s.doc, input([{ stakeholderId: archived.id, role: 'inform' }]), TODAY), /plus disponible/);
    await assert.rejects(() => prepareDistribution(s.doc, input([]), TODAY), /au moins un destinataire/);
    await assert.rejects(() => prepareDistribution(s.doc, input([{ stakeholderId: s.a, role: 'inform' }, { stakeholderId: s.a, role: 'validate' }]), TODAY), /qu'une fois/);
    assert.deepEqual(await listDistributions(s.doc), [], 'aucun refus n\'a laissé de ligne');
  } finally { t.close(); }
});

test('documents : brouillon et validé diffusables, archivé refusé, remplacé refusé (F8-D03)', async () => {
  const t = await migratedDb();
  try {
    const s = await setup();
    const rec = [{ stakeholderId: s.a, role: 'validate' as const }];
    await prepareDistribution(s.doc, input(rec), TODAY);
    await validateDocument(s.doc, null);
    await prepareDistribution(s.doc, input(rec), TODAY);
    assert.equal((await listDistributions(s.doc)).length, 2);
    await archiveDocument(s.doc);
    await assert.rejects(() => prepareDistribution(s.doc, input(rec), TODAY), /ne peut plus être diffusé/);
    assert.equal((await listDistributions(s.doc)).length, 2, 'les diffusions passées restent lisibles');
  } finally { t.close(); }
});

test('documents : un document remplacé ne reçoit plus de diffusion (F8-D03)', async () => {
  const t = await migratedDb();
  try {
    const s = await setup();
    await createRequirement({ projectId: s.projectId, title: 'Nouvelle exigence' });
    const v2 = (await saveDeliverable(s.projectId, 'requirements', OPT)).id;
    assert.notEqual(v2, s.doc);
    await assert.rejects(() => prepareDistribution(s.doc, input([{ stakeholderId: s.a, role: 'inform' }]), TODAY), /ne peut plus être diffusé/);
    await prepareDistribution(v2, input([{ stakeholderId: s.a, role: 'inform' }]), TODAY);
  } finally { t.close(); }
});

// ------------------------------------------------------------------ cycle

test('cycle : préparer, modifier, envoyer, figer, annuler, supprimer ; le document n\'est jamais modifié (F8-D06, D08)', async () => {
  const t = await migratedDb();
  try {
    const s = await setup();
    const docBefore = JSON.stringify(await getDocument(s.doc));
    const id = await prepareDistribution(s.doc, input([{ stakeholderId: s.a, role: 'validate' }, { stakeholderId: s.b, role: 'inform' }], { dueOn: '2026-12-10' }), TODAY);
    let d = (await getDistribution(id))!;
    assert.equal(d.sent_on, null);
    assert.equal(d.prepared_on, TODAY);
    assert.deepEqual(d.recipients.map((r) => [r.name, r.email, r.role]), [['Alice Test', 'alice@exemple.test', 'validate'], ['Bruno Test', 'bruno@exemple.test', 'inform']]);

    await updatePreparation(id, input([{ stakeholderId: s.b, role: 'validate' }], { subject: 'Autre objet', dueOn: null }), TODAY);
    d = (await getDistribution(id))!;
    assert.equal(d.subject, 'Autre objet');
    assert.equal(d.due_on, null);
    assert.deepEqual(d.recipients.map((r) => [r.name, r.role]), [['Bruno Test', 'validate']]);

    await assert.rejects(() => markSent(id, '2026-11-29', TODAY), /futur/);
    await assert.rejects(() => markSent(id, '2026-11-01', TODAY), /précéder/);
    assert.equal((await getDistribution(id))!.sent_on, null, 'un refus n\'écrit rien');
    await markSent(id, null, TODAY);
    d = (await getDistribution(id))!;
    assert.equal(d.sent_on, TODAY);

    // Figée : modification et suppression refusées, message exact.
    await assert.rejects(() => updatePreparation(id, input([{ stakeholderId: s.a, role: 'inform' }]), TODAY), (e: Error) => e instanceof DistributionStateError && e.message === "Action impossible : l'état de cette diffusion a changé. Rouvrez le document.");
    await assert.rejects(() => deleteDistribution(id), DistributionStateError);
    await assert.rejects(() => markSent(id, null, TODAY), DistributionStateError);

    // Annuler tant qu'aucune réponse.
    await cancelSent(id);
    assert.equal((await getDistribution(id))!.sent_on, null);
    await assert.rejects(() => cancelSent(id), DistributionStateError);
    await markSent(id, null, TODAY);

    const rid = (await getDistribution(id))!.recipients[0].id;
    await saveReply(rid, 'approved_with_reserves', TODAY, '  Voir point 3  ', TODAY);
    d = (await getDistribution(id))!;
    assert.deepEqual([d.recipients[0].verdict, d.recipients[0].replied_on, d.recipients[0].reply_comment], ['approved_with_reserves', TODAY, 'Voir point 3']);
    await assert.rejects(() => cancelSent(id), DistributionStateError, 'plus d\'annulation une fois une réponse saisie');
    await saveReply(rid, 'rejected', TODAY, null, TODAY);
    assert.equal((await getDistribution(id))!.recipients[0].verdict, 'rejected', 'une réponse se corrige');
    await removeReply(rid);
    d = (await getDistribution(id))!;
    assert.deepEqual([d.recipients[0].verdict, d.recipients[0].replied_on, d.recipients[0].reply_comment], [null, null, null]);
    await assert.rejects(() => removeReply(rid), DistributionStateError);
    await cancelSent(id);
    await deleteDistribution(id);
    assert.equal(await getDistribution(id), null);
    assert.equal((await query('SELECT id FROM distribution_recipients')).length, 0, 'destinataires supprimés avec la diffusion');

    assert.equal(JSON.stringify(await getDocument(s.doc)), docBefore, 'ni la diffusion ni les réponses ne modifient le document');
  } finally { t.close(); }
});

test('réponses : date avant l\'envoi ou dans le futur refusée, commentaire 500 / 501, avant envoi refusée (F8-D08)', async () => {
  const t = await migratedDb();
  try {
    const s = await setup();
    const id = await prepareDistribution(s.doc, input([{ stakeholderId: s.a, role: 'validate' }]), '2026-11-20');
    const rid = (await getDistribution(id))!.recipients[0].id;
    await assert.rejects(() => saveReply(rid, 'approved', TODAY, null, TODAY), DistributionStateError, 'pas de réponse avant l\'envoi');
    await markSent(id, '2026-11-25', TODAY);
    await assert.rejects(() => saveReply(rid, 'approved', '2026-11-24', null, TODAY), /précéder/);
    await assert.rejects(() => saveReply(rid, 'approved', '2026-11-29', null, TODAY), /futur/);
    await assert.rejects(() => saveReply(rid, 'approved', TODAY, 'x'.repeat(501), TODAY), /500/);
    await assert.rejects(() => saveReply(rid, 'peut-être' as 'approved', TODAY, null, TODAY), /inconnue/);
    await saveReply(rid, 'approved', '2026-11-25', 'x'.repeat(500), TODAY);
    assert.equal((await getDistribution(id))!.recipients[0].reply_comment!.length, 500);
  } finally { t.close(); }
});

test('état périmé : deux fenêtres simulées — rien n\'est écrit, pas de ligne de journal (F8-D06)', async () => {
  const t = await migratedDb();
  try {
    const s = await setup();
    const id = await prepareDistribution(s.doc, input([{ stakeholderId: s.a, role: 'validate' }]), TODAY);
    const stale = (await getDistribution(id))!; // l'écran A a lu l'état « préparée »
    await markSent(id, null, TODAY); // la fenêtre B envoie
    const logBefore = (await distLog()).length;
    await assert.rejects(() => deleteDistribution(stale.id), DistributionStateError);
    await assert.rejects(() => updatePreparation(stale.id, input([{ stakeholderId: s.b, role: 'inform' }]), TODAY), DistributionStateError);
    assert.equal((await distLog()).length, logBefore);
    assert.equal((await getDistribution(id))!.recipients.length, 1);
    assert.equal((await getDistribution(id))!.recipients[0].name, 'Alice Test');
    // Envoi sans destinataire impossible : on vide à la main la table puis on tente.
    const id2 = await prepareDistribution(s.doc, input([{ stakeholderId: s.b, role: 'inform' }]), TODAY);
    await query('SELECT 1');
    await assert.rejects(() => markSent(999999, null, TODAY), DistributionStateError);
    assert.equal((await getDistribution(id2))!.sent_on, null);
  } finally { t.close(); }
});

// ------------------------------------------------------------------ copies et suppressions

test('copies : adresse modifiée ensuite = diffusion inchangée ; partie prenante supprimée = lien vidé, nom et adresse gardés ; projet supprimé = cascade (F8-D10, D14)', async () => {
  const t = await migratedDb();
  try {
    const s = await setup();
    const id = await prepareDistribution(s.doc, input([{ stakeholderId: s.a, role: 'validate' }, { stakeholderId: s.b, role: 'inform' }]), TODAY);
    await updateStakeholder(s.a, { fields: { email: 'nouvelle@exemple.test' }, title: 'Alice Renommée' });
    let d = (await getDistribution(id))!;
    assert.deepEqual([d.recipients[0].name, d.recipients[0].email], ['Alice Test', 'alice@exemple.test']);
    await deleteItem(s.b);
    d = (await getDistribution(id))!;
    assert.equal(d.recipients[1].stakeholder_id, null);
    assert.deepEqual([d.recipients[1].name, d.recipients[1].email], ['Bruno Test', 'bruno@exemple.test']);
    await deleteProject(s.projectId);
    assert.equal((await query('SELECT id FROM distributions')).length, 0);
    assert.equal((await query('SELECT id FROM distribution_recipients')).length, 0);
  } finally { t.close(); }
});

// ------------------------------------------------------------------ journal

test('journal : codes seulement, jamais adresse, objet, message ni commentaire ; libellés lisibles sous « Document » (F8-D11)', async () => {
  const t = await migratedDb();
  try {
    const s = await setup();
    const id = await prepareDistribution(s.doc, input([{ stakeholderId: s.a, role: 'validate' }], { subject: 'SECRET-OBJET', message: 'SECRET-MESSAGE' }), TODAY);
    await updatePreparation(id, input([{ stakeholderId: s.a, role: 'validate' }, { stakeholderId: s.b, role: 'inform' }], { subject: 'SECRET-OBJET', message: 'SECRET-MESSAGE' }), TODAY);
    await markSent(id, null, TODAY);
    const rid = (await getDistribution(id))!.recipients[0].id;
    await saveReply(rid, 'approved_with_reserves', TODAY, 'SECRET-COMMENTAIRE', TODAY);
    await removeReply(rid);
    await cancelSent(id);
    await deleteDistribution(id);
    const log = await distLog();
    assert.deepEqual(log.map((l) => `${l.action}:${l.detail ?? ''}`), [
      'created:', 'updated:recipients', 'status_changed:prepared>sent', 'updated:reply:approved_with_reserves', 'updated:reply:removed', 'status_changed:sent>prepared', 'deleted:',
    ]);
    const all = JSON.stringify(await query('SELECT * FROM activity_log'));
    for (const secret of ['SECRET', '@exemple.test', 'Alice']) assert.ok(!all.includes(secret), `journal sans « ${secret} »`);
    const lines = (await listJournal(s.projectId, { group: 'document', action: 'all' }, 1, 50)).filter((e) => e.object_type === 'distribution').map((e) => journalLine(e as never));
    assert.ok(lines.length >= 6);
    assert.ok(lines.every((l) => l.object === 'Document'));
    const details = lines.map((l) => l.detail);
    assert.ok(details.includes('Diffusion préparée'));
    assert.ok(details.includes('Préparée → Envoyée'));
    assert.ok(details.includes('Réponse : validé avec réserves'));
    assert.ok(details.includes('Réponse retirée'));
    assert.ok(details.some((x) => x.startsWith('Envoi annulé')));
    assert.ok(details.includes('Diffusion supprimée'));
    const withDoc = lines.find((l) => l.detail === 'Préparée → Envoyée')!;
    assert.notEqual(withDoc.label, 'distribution');
  } finally { t.close(); }
});
