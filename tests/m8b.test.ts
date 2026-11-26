// Lot M8b : transitions d'état des écrans de registre (logique pure) et garde-fous de structure.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { initialState, registerReducer } from '../src/shared/register-state.ts';
import type { RegisterAction, RegisterState } from '../src/shared/register-state.ts';

interface F { title: string; note: string }
const EMPTY: F = { title: '', note: '' };
const run = (s: RegisterState<F>, ...actions: Array<RegisterAction<F>>) => actions.reduce(registerReducer, s);
const start = () => initialState(EMPTY);

test('état initial : liste, formulaire vide, rien en cours', () => {
  const s = start();
  assert.deepEqual(s.mode, { kind: 'list' });
  assert.deepEqual(s.values, EMPTY);
  assert.deepEqual(s.errors, {});
  assert.equal(s.busy, false);
  assert.equal(s.error, '');
  assert.equal(s.confirmDelete, null);
  assert.equal(s.askAbandon, false);
});

test('ouvrir une fiche : efface confirmation et erreur', () => {
  const s = run(start(), { type: 'askDelete', message: 'm' }, { type: 'fail', message: 'e' }, { type: 'open', id: 7 });
  assert.deepEqual(s.mode, { kind: 'detail', id: 7 });
  assert.equal(s.confirmDelete, null);
  assert.equal(s.error, '');
});

test('retour à la liste depuis une fiche : efface la confirmation mais garde l\'erreur', () => {
  const s = run(start(), { type: 'open', id: 1 }, { type: 'askDelete', message: 'm' }, { type: 'fail', message: 'e' }, { type: 'backToList' });
  assert.deepEqual(s.mode, { kind: 'list' });
  assert.equal(s.confirmDelete, null);
  assert.equal(s.error, 'e');
});

test('« n\'existe plus » : le retour ne touche qu\'au mode', () => {
  const s = run(start(), { type: 'open', id: 1 }, { type: 'askDelete', message: 'm' }, { type: 'leaveMissing' });
  assert.deepEqual(s.mode, { kind: 'list' });
  assert.equal(s.confirmDelete, 'm');
});

test('changement de projet : liste, sans confirmation ni erreur ; formulaire et question d\'abandon inchangés (comportement d\'origine conservé)', () => {
  let s = run(start(), { type: 'openForm', id: null, start: EMPTY }, { type: 'change', key: 'title', value: 'x' }, { type: 'cancelForm' });
  assert.equal(s.askAbandon, true);
  s = run(s, { type: 'fail', message: 'e' }, { type: 'projectChanged' });
  assert.deepEqual(s.mode, { kind: 'list' });
  assert.equal(s.error, '');
  assert.equal(s.confirmDelete, null);
  assert.equal(s.askAbandon, true);
  assert.equal(s.values.title, 'x');
});

test('ouvrir un formulaire : valeurs de départ, état initial mémorisé, erreurs et abandon remis à zéro', () => {
  const begin: F = { title: 'A', note: 'B' };
  const s = run(start(), { type: 'invalid', errors: { title: 'trop court' } }, { type: 'fail', message: 'e' }, { type: 'openForm', id: 4, start: begin });
  assert.deepEqual(s.mode, { kind: 'form', id: 4 });
  assert.deepEqual(s.values, begin);
  assert.deepEqual(s.initial, begin);
  assert.deepEqual(s.errors, {});
  assert.equal(s.error, '');
  assert.equal(s.askAbandon, false);
});

test('saisie : ne modifie que le champ visé, sans toucher à l\'état initial', () => {
  const s = run(start(), { type: 'openForm', id: null, start: EMPTY }, { type: 'change', key: 'note', value: 'n' });
  assert.deepEqual(s.values, { title: '', note: 'n' });
  assert.deepEqual(s.initial, EMPTY);
});

test('annuler sans rien saisir : sort sans question ; création → liste, modification → fiche', () => {
  const c = run(start(), { type: 'openForm', id: null, start: EMPTY }, { type: 'cancelForm' });
  assert.deepEqual(c.mode, { kind: 'list' });
  assert.equal(c.askAbandon, false);
  const m = run(start(), { type: 'openForm', id: 9, start: { title: 'A', note: '' } }, { type: 'cancelForm' });
  assert.deepEqual(m.mode, { kind: 'detail', id: 9 });
});

test('annuler après saisie : pose la question ; rester continue la saisie ; abandonner sort et ferme la question', () => {
  let s = run(start(), { type: 'openForm', id: 9, start: { title: 'A', note: '' } }, { type: 'change', key: 'title', value: 'AB' }, { type: 'cancelForm' });
  assert.equal(s.askAbandon, true);
  assert.deepEqual(s.mode, { kind: 'form', id: 9 });
  const kept = run(s, { type: 'keepEditing' });
  assert.equal(kept.askAbandon, false);
  assert.deepEqual(kept.mode, { kind: 'form', id: 9 });
  assert.equal(kept.values.title, 'AB');
  s = run(s, { type: 'leaveForm' });
  assert.equal(s.askAbandon, false);
  assert.deepEqual(s.mode, { kind: 'detail', id: 9 });
  const created = run(start(), { type: 'openForm', id: null, start: EMPTY }, { type: 'change', key: 'title', value: 'x' }, { type: 'cancelForm' }, { type: 'leaveForm' });
  assert.deepEqual(created.mode, { kind: 'list' });
});

test('revenir à la valeur d\'origine : plus de question à l\'annulation', () => {
  const s = run(start(), { type: 'openForm', id: 2, start: { title: 'A', note: '' } }, { type: 'change', key: 'title', value: 'AB' }, { type: 'change', key: 'title', value: 'A' }, { type: 'cancelForm' });
  assert.equal(s.askAbandon, false);
  assert.deepEqual(s.mode, { kind: 'detail', id: 2 });
});

test('validation : erreurs affichées puis effacées', () => {
  const s = run(start(), { type: 'invalid', errors: { title: 'obligatoire' } });
  assert.deepEqual(s.errors, { title: 'obligatoire' });
  assert.deepEqual(run(s, { type: 'valid' }).errors, {});
});

test('exécution : occupé pendant l\'action, erreur effacée au départ, échec conservé', () => {
  let s = run(start(), { type: 'fail', message: 'ancienne' }, { type: 'runStart' });
  assert.equal(s.busy, true);
  assert.equal(s.error, '');
  s = run(s, { type: 'fail', message: 'boum' }, { type: 'runEnd' });
  assert.equal(s.busy, false);
  assert.equal(s.error, 'boum');
});

test('enregistrement réussi : la fiche enregistrée s\'ouvre (création comme modification)', () => {
  assert.deepEqual(run(start(), { type: 'openForm', id: null, start: EMPTY }, { type: 'saved', id: 12 }).mode, { kind: 'detail', id: 12 });
  assert.deepEqual(run(start(), { type: 'openForm', id: 3, start: EMPTY }, { type: 'saved', id: 3 }).mode, { kind: 'detail', id: 3 });
});

test('suppression : demande, annulation, confirmation (retour à la liste)', () => {
  let s = run(start(), { type: 'open', id: 1 }, { type: 'askDelete', message: 'Supprimer ?' });
  assert.equal(s.confirmDelete, 'Supprimer ?');
  assert.equal(run(s, { type: 'cancelDelete' }).confirmDelete, null);
  assert.deepEqual(run(s, { type: 'cancelDelete' }).mode, { kind: 'detail', id: 1 });
  s = run(s, { type: 'deleted' });
  assert.deepEqual(s.mode, { kind: 'list' });
  assert.equal(s.confirmDelete, null);
});

test('le réducteur ne modifie jamais l\'état reçu', () => {
  const s = start();
  const frozen = JSON.stringify(s);
  run(s, { type: 'open', id: 1 }, { type: 'openForm', id: null, start: { title: 'a', note: '' } }, { type: 'change', key: 'title', value: 'z' });
  assert.equal(JSON.stringify(s), frozen);
});

// ------------------------------------------------------------------ garde-fous de structure

test('structure : le composant générique n\'importe pas la couche data (R4) et les écrans pilotes passent par lui', () => {
  const generic = fs.readFileSync(new URL('../src/shared/register-screen.tsx', import.meta.url), 'utf8');
  assert.ok(!/from '\.\.\/data\//.test(generic), 'shared/ n\'importe pas data/');
  const state = fs.readFileSync(new URL('../src/shared/register-state.ts', import.meta.url), 'utf8');
  assert.ok(!/from 'react'/.test(state) && !/data\//.test(state), 'transitions pures : ni React ni base');
  for (const f of ['workshops/WorkshopsScreen', 'risks/RisksScreen']) {
    const src = fs.readFileSync(new URL(`../src/modules/${f}.tsx`, import.meta.url), 'utf8');
    assert.match(src, /<RegisterScreen config=\{CONFIG\}/, `${f} délègue au composant générique`);
    assert.ok(src.split('\n').length < 60, `${f} reste une simple configuration`);
  }
});

test('configuration pilote : libellés d\'origine conservés (aucun changement visible)', () => {
  const w = fs.readFileSync(new URL('../src/modules/workshops/WorkshopsScreen.tsx', import.meta.url), 'utf8');
  for (const t of ["title: 'Ateliers'", "what: 'Les ateliers'", "kind: 'workshop'", `gone: "Cet atelier n'existe plus."`, "createHeading: 'Nouvel atelier'", `editHeading: "Modifier l'atelier"`]) assert.ok(w.includes(t), t);
  const r = fs.readFileSync(new URL('../src/modules/risks/RisksScreen.tsx', import.meta.url), 'utf8');
  for (const t of ["title: 'Risques'", "what: 'Les risques'", "kind: 'risk'", `gone: "Ce risque n'existe plus."`, "createHeading: 'Nouveau risque'", "editHeading: 'Modifier le risque'"]) assert.ok(r.includes(t), t);
});

test('ouvrir un formulaire ferme une question d\'abandon restée affichée', () => {
  const s = run(start(), { type: 'openForm', id: null, start: EMPTY }, { type: 'change', key: 'title', value: 'x' }, { type: 'cancelForm' }, { type: 'openForm', id: null, start: EMPTY });
  assert.equal(s.askAbandon, false);
});
