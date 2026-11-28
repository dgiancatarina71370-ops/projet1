// Lot F8 : logique pure et rendu statique de la section « Diffusion » et du champ e-mail (décisions F8-D01 à F8-D08).
// Aucun clic simulé : copie dans le presse-papiers, boutons, saisies, séparateur d'adresses dans votre messagerie et rendu réel se vérifient à la recette sur clé (TESTS-F8.md).
// Si esbuild est introuvable, les rendus sont « ignorés ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRender } from './helpers/ui-loader.ts';
import { DIFFUSION_BANNER, DRAFT_NOTICE, NO_ADDRESS_TEXT, REPLY_REMINDER, addressList, distributionLine, excludedText, picksToRecipients, chosenRoles } from '../src/modules/documents/diffusion-logic.ts';
import type { DistributionInput } from '../src/modules/documents/diffusion-logic.ts';
import { validateForm, EMPTY_FORM } from '../src/modules/stakeholders/logic.ts';

interface Render {
  diffusion: (p: Record<string, unknown>) => string;
  form: (p: { errors: Record<string, string>; askAbandon: boolean; title: string; email?: string }) => string;
  detail: (p: { archived: boolean; confirm: string | null; error: string; email?: string }) => string;
}
const render = loadRender<Render>();
const ui = (name: string, fn: (r: Render) => void) => test(name, { skip: render === null ? 'esbuild introuvable : rendu des écrans non vérifié' : false }, () => fn(render as Render));
const plain = (html: string): string => html.replace(/&#x27;/g, "'");
const TODAY = '2026-11-28';

const dist = (over: Partial<DistributionInput> = {}): DistributionInput => ({
  id: 1, subject: 'Objet <test>', message: 'Bonjour', due_on: null, prepared_on: '2026-11-20', sent_on: null,
  recipients: [
    { id: 1, name: 'Alice', email: 'alice@exemple.test', role: 'validate', verdict: null, replied_on: null, reply_comment: null },
    { id: 2, name: 'Bruno', email: 'bruno@exemple.test', role: 'inform', verdict: null, replied_on: null, reply_comment: null },
  ], ...over,
});

// ------------------------------------------------------------------ logique pure

test('ligne de diffusion : préparée = modifiable, envoyée = figée, annulation seulement sans réponse (F8-D06)', () => {
  const p = distributionLine(dist(), TODAY);
  assert.deepEqual([p.canEdit, p.canMarkSent, p.canCancel, p.canReply], [true, true, false, false]);
  assert.equal(p.stateText, 'Préparée, non envoyée');
  assert.deepEqual(p.recipients.map((r) => r.status), ['to_send', 'to_send']);
  const s = distributionLine(dist({ sent_on: '2026-11-25' }), TODAY);
  assert.deepEqual([s.canEdit, s.canMarkSent, s.canCancel, s.canReply], [false, false, true, true]);
  assert.equal(s.stateText, 'Envoyée le 25/11/2026 (date déclarée)');
  const r = distributionLine(dist({ sent_on: '2026-11-25', recipients: [{ id: 1, name: 'A', email: 'a@b.co', role: 'validate', verdict: 'approved', replied_on: '2026-11-26', reply_comment: 'OK' }] }), TODAY);
  assert.equal(r.canCancel, false);
  assert.equal(r.recipients[0].replyText, 'Validé le 26/11/2026 — OK');
  assert.equal(r.recipients[0].statusText, 'Réponse reçue');
  assert.equal(distributionLine(dist({ recipients: [] }), TODAY).canMarkSent, false, 'pas d\'envoi sans destinataire');
});

test('échéance : « sans réponse » et phrase de retard, d\'après la date du poste (F8-D07, D09)', () => {
  const base = { sent_on: '2026-11-20' };
  assert.equal(distributionLine(dist({ ...base, due_on: '2026-11-29' }), TODAY).overdueNote, null);
  assert.equal(distributionLine(dist({ ...base, due_on: TODAY }), TODAY).overdueNote, null);
  const late = distributionLine(dist({ ...base, due_on: '2026-11-27' }), TODAY);
  assert.equal(late.overdueNote, 'Échéance dépassée : 2 destinataires n’ont pas répondu.');
  assert.deepEqual(late.recipients.map((r) => r.statusText), ['Sans réponse', 'Sans réponse']);
  assert.equal(late.dueText, 'Réponse souhaitée avant le 27/11/2026');
  const one = distributionLine(dist({ ...base, due_on: '2026-11-27', recipients: [{ id: 1, name: 'A', email: 'a@b.co', role: 'inform', verdict: null, replied_on: null, reply_comment: null }] }), TODAY);
  assert.equal(one.overdueNote, 'Échéance dépassée : 1 destinataire n’a pas répondu.');
});

test('adresses, rôles choisis et texte des exclues (F8-D04, D05)', () => {
  assert.equal(addressList([{ email: 'a@b.co' }, { email: 'c@d.co' }]), 'a@b.co; c@d.co');
  assert.equal(addressList([]), '');
  assert.deepEqual(chosenRoles({ 1: 'validate', 2: '', 3: 'inform' }), ['validate', 'inform']);
  assert.deepEqual(picksToRecipients({ 1: 'validate', 2: '', 3: 'inform' }), [{ stakeholderId: 1, role: 'validate' }, { stakeholderId: 3, role: 'inform' }]);
  assert.equal(excludedText(1), '1 partie prenante active n’a pas d’adresse et n’est pas proposée.');
  assert.equal(excludedText(3), '3 parties prenantes actives n’ont pas d’adresse et ne sont pas proposées.');
});

test('formulaire partie prenante : e-mail validé, message exact, vide permis (F8-D02)', () => {
  assert.equal(EMPTY_FORM.email, '');
  const bad = validateForm({ ...EMPTY_FORM, title: 'X', email: 'pas une adresse' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.errors.email, 'Adresse e-mail non valide.');
  const ok = validateForm({ ...EMPTY_FORM, title: 'X', email: '  A@b.co ' });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.fields.email, 'A@b.co');
  assert.equal(validateForm({ ...EMPTY_FORM, title: 'X' }).ok, true);
});

// ------------------------------------------------------------------ rendu

ui('rendu : bandeau fixe, bouton, aucune diffusion ; brouillon = diffusion non officielle (F8-D03, D05)', (r) => {
  const cand = [{ id: 1, code: 'PP-001', name: 'Alice', email: 'alice@exemple.test' }];
  const html = plain(r.diffusion({ candidates: cand, isDraft: true }));
  assert.match(html, /<section[^>]*aria-label="Diffusion"/);
  assert.ok(html.includes(DIFFUSION_BANNER));
  assert.ok(html.includes(DRAFT_NOTICE));
  assert.ok(html.includes('Préparer une diffusion'));
  assert.ok(html.includes('Aucune diffusion pour ce document.'));
  assert.ok(!plain(r.diffusion({ candidates: cand, isDraft: false })).includes(DRAFT_NOTICE));
});

ui('rendu : aucune adresse, parties prenantes exclues, document non diffusable (F8-D03, D04)', (r) => {
  const none = plain(r.diffusion({ candidates: [], excluded: 2 }));
  assert.ok(none.includes(NO_ADDRESS_TEXT));
  assert.ok(!none.includes('Préparer une diffusion'));
  assert.ok(none.includes(excludedText(2)));
  const archived = plain(r.diffusion({ canDiffuse: false, candidates: [{ id: 1, code: 'PP-001', name: 'A', email: 'a@b.co' }] }));
  assert.ok(archived.includes('ne reçoit plus de nouvelle diffusion'));
  assert.ok(!archived.includes('Préparer une diffusion'));
});

ui('rendu : diffusion préparée — boutons de copie, envoi, suppression, texte échappé (F8-D05, D06)', (r) => {
  const html = plain(r.diffusion({ lines: [distributionLine(dist(), TODAY)] }));
  for (const t of ['Copier les adresses', 'Copier l’objet', 'Copier le message', 'Marquer comme envoyé', 'Modifier la préparation', 'Supprimer cette diffusion']) assert.ok(html.includes(t), t);
  assert.ok(!html.includes('Annuler l’envoi déclaré'));
  assert.ok(!html.includes(REPLY_REMINDER));
  assert.ok(html.includes('Objet &lt;test&gt;'), 'le texte saisi est échappé');
  assert.ok(html.includes('À envoyer'));
});

ui('rendu : diffusion envoyée — annulation, réponses, rappel, retard, pas de modification (F8-D06 à D09)', (r) => {
  const html = plain(r.diffusion({ lines: [distributionLine(dist({ sent_on: '2026-11-20', due_on: '2026-11-27' }), TODAY)] }));
  assert.ok(html.includes('Annuler l’envoi déclaré'));
  assert.ok(html.includes('Saisir la réponse'));
  assert.ok(html.includes(REPLY_REMINDER));
  assert.ok(html.includes('Échéance dépassée'));
  assert.ok(html.includes('Sans réponse'));
  assert.ok(!html.includes('Modifier la préparation'));
  assert.ok(!html.includes('Supprimer cette diffusion'));
  assert.ok(!html.includes('Marquer comme envoyé'));
  const replied = plain(r.diffusion({ lines: [distributionLine(dist({ sent_on: '2026-11-20', recipients: [{ id: 1, name: 'A', email: 'a@b.co', role: 'validate', verdict: 'rejected', replied_on: '2026-11-22', reply_comment: null }] }), TODAY)] }));
  assert.ok(replied.includes('Refusé le 22/11/2026'));
  assert.ok(replied.includes('Corriger la réponse') && replied.includes('Retirer la réponse'));
  assert.ok(!replied.includes('Annuler l’envoi déclaré'), 'plus d\'annulation une fois une réponse saisie');
});

ui('rendu : formulaire de préparation et saisie de réponse (F8-D05, D08)', (r) => {
  const cand = [{ id: 1, code: 'PP-001', name: 'Alice', email: 'alice@exemple.test' }];
  const html = plain(r.diffusion({
    candidates: cand,
    form: { id: null, subject: 'S', message: 'M', dueOn: '', picks: { 1: 'validate' }, error: 'Choisissez au moins un destinataire.' },
  }));
  assert.ok(html.includes('Nouvelle diffusion'));
  assert.ok(html.includes('PP-001 · Alice'));
  assert.ok(html.includes('alice@exemple.test'));
  assert.ok(html.includes('À valider') && html.includes('Pour information'));
  assert.match(html, /role="alert"[^>]*>Choisissez au moins un destinataire\./);
  assert.ok(html.includes('joindre le fichier exporté'));
  const reply = plain(r.diffusion({
    lines: [distributionLine(dist({ sent_on: '2026-11-20' }), TODAY)],
    replyForm: { recipientId: 1, verdict: '', repliedOn: TODAY, comment: '', error: '' },
  }));
  assert.ok(reply.includes('Validé avec réserves') && reply.includes('Refusé'));
  assert.ok(reply.includes('Enregistrer la réponse'));
});

ui('rendu : champ e-mail dans le formulaire (aide fixe, erreur) et dans le détail (F8-D01, D02, D12)', (r) => {
  const f = plain(r.form({ errors: { email: 'Adresse e-mail non valide.' }, askAbandon: false, title: 'X', email: 'oups' }));
  assert.ok(f.includes('E-mail'));
  assert.ok(f.includes('Adresse e-mail non valide.'));
  // L'aide fixe s'affiche sous le champ ; elle cède la place au message d'erreur quand il y en a un (comportement commun des champs).
  assert.ok(plain(r.form({ errors: {}, askAbandon: false, title: 'X' })).includes('La version 1.0 est prévue pour des adresses fictives.'));
  const d = plain(r.detail({ archived: false, confirm: null, error: '', email: 'sponsor@exemple.test' }));
  assert.ok(d.includes('sponsor@exemple.test'));
  assert.ok(plain(r.detail({ archived: false, confirm: null, error: '' })).includes('E-mail'));
});
