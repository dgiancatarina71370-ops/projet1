// Lot M7 : logique pure de l'écran Ateliers, rendu statique, branchement (décisions D79 à D87).
// Aucun clic ni saisie n'est simulé : ces comportements se vérifient à la recette sur clé. Si esbuild est introuvable, les rendus sont « ignorés ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadRender } from './helpers/ui-loader.ts';
import { EMPTY_WORKSHOP_FORM, STATUS_FILTER_OPTIONS, STATUS_OPTIONS, emptyWorkshopsMessage, validateWorkshopForm } from '../src/modules/workshops/logic.ts';
import { NAV_SECTIONS, SCREENS, screenForKind, KINDS_WITH_SCREEN } from '../src/app/navigation.ts';
import { KINDS } from '../src/domain/kinds.ts';

// ------------------------------------------------------------------ logique pure

test('menu : « Ateliers » ouvre la section Analyse, avant les parties prenantes (D83)', () => {
  const analysis = NAV_SECTIONS.find((s) => s.title === 'Analyse');
  assert.deepEqual(analysis?.screens.map((s) => s.label), ['Ateliers', 'Parties prenantes', 'Besoins', 'Exigences']);
  assert.equal(SCREENS.length, 12);
  assert.equal(screenForKind('workshop'), 'workshops');
  assert.ok(KINDS_WITH_SCREEN.includes('workshop'));
  assert.ok(KINDS.every((k) => KINDS_WITH_SCREEN.includes(k.kind)), 'chaque type a son écran');
});

test('écran ateliers : statuts au masculin, filtre « Tous », messages de liste vide', () => {
  assert.deepEqual(STATUS_OPTIONS.map((o) => o.label), ['Planifié', 'Tenu', 'Archivé']);
  assert.deepEqual(STATUS_FILTER_OPTIONS.map((o) => o.value), ['all', 'planned', 'held', 'archived']);
  assert.equal(STATUS_FILTER_OPTIONS[0].label, 'Tous');
  assert.match(emptyWorkshopsMessage(0, 'all'), /^Aucun atelier dans ce projet\. Créez le premier/);
  assert.match(emptyWorkshopsMessage(4, 'held'), /Aucun atelier « Tenu » : 4 au total/);
  assert.match(emptyWorkshopsMessage(4, 'all'), /« Tous »/);
});

test('formulaire atelier : défauts, une erreur par champ fautif, date réelle, valeurs normalisées', () => {
  assert.deepEqual(EMPTY_WORKSHOP_FORM, { title: '', description: '', heldOn: '', place: '', objective: '', notes: '', followUp: '' });
  const bad = validateWorkshopForm({ title: '', description: '', heldOn: '2026-02-30', place: 'x'.repeat(201), objective: 'x'.repeat(2001), notes: 'x'.repeat(10001), followUp: 'x'.repeat(10001) });
  assert.ok(!bad.ok);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ['followUp', 'heldOn', 'notes', 'objective', 'place', 'title']);
  if (!bad.ok) assert.match(bad.errors.title ?? '', /Le titre de l'atelier est obligatoire/);
  const ok = validateWorkshopForm({ title: ' A ', description: 'd', heldOn: '2026-11-26', place: ' Salle ', objective: 'o', notes: 'n', followUp: 'f' });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual({ t: ok.title, f: ok.fields }, { t: 'A', f: { heldOn: '2026-11-26', place: 'Salle', objective: 'o', notes: 'n', followUp: 'f' } });
  assert.ok(validateWorkshopForm({ ...EMPTY_WORKSHOP_FORM, title: 'A' }).ok, 'seul le titre est obligatoire');
});

test('branchement : l\'écran Ateliers appelle le crochet d\'ouverture, l\'application lui passe la demande et le rend', () => {
  const src = fs.readFileSync(new URL('../src/modules/workshops/WorkshopsScreen.tsx', import.meta.url), 'utf8');
  assert.match(src, /<RegisterScreen config=\{CONFIG\} \{\.\.\.common\}/, 'l\'écran délègue au composant générique (M8b)');
  const generic = fs.readFileSync(new URL('../src/shared/register-screen.tsx', import.meta.url), 'utf8');
  assert.match(generic, /useOpenRequest\(props\.openId, rows\.map\(\(r\) => r\.id\)/);
  assert.match(generic, /props\.onOpenHandled/);
  assert.match(src, /createWorkshop/);
  assert.match(src, /updateWorkshop/);
  const app = fs.readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
  assert.ok(app.includes("{...openProps('workshop')}"));
  assert.match(app, /screen === 'workshops'/);
});

// ------------------------------------------------------------------ rendu statique

interface WsRow { id: number; code: string; title: string; description: string; status: string; held_on: string; place: string; objective: string; notes: string; follow_up: string }
interface Render {
  shell: (p: { navigable: boolean; screen: string; projects: Array<{ id: number; name: string }>; activeId: number | null }) => string;
  analysisNoProject: (what: string) => string;
  wsList: (p: { rows: WsRow[]; total: number; filter: string }) => string;
  wsDetail: (p: { row: WsRow; confirm: string | null; error: string }) => string;
  wsForm: (p: { errors: Record<string, string>; askAbandon: boolean; values: { title: string; description: string; heldOn: string; place: string; objective: string; notes: string; followUp: string } }) => string;
}
const render = loadRender<Render>();
const ui = (name: string, fn: (r: Render) => void) => test(name, { skip: render === null ? 'esbuild introuvable : rendu des écrans non vérifié' : false }, () => fn(render as Render));

const WS: WsRow = { id: 1, code: 'ATL-001', title: 'Recueil <b>du besoin</b>', description: 'Contexte\nsur deux lignes', status: 'held', held_on: '2026-11-26', place: 'Salle <x>', objective: 'Cadrer le périmètre', notes: 'Notes\nlongues <script>x</script>', follow_up: 'Action : relancer' };

ui('rendu : le menu place « Ateliers » en tête de la section Analyse', (r) => {
  const html = r.shell({ navigable: true, screen: 'workshops', projects: [{ id: 1, name: 'A' }], activeId: 1 });
  assert.match(html, /aria-current="page"[^>]*>Ateliers</);
  assert.ok(html.indexOf('>Analyse<') < html.indexOf('>Ateliers<') && html.indexOf('>Ateliers<') < html.indexOf('>Parties prenantes<'));
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
});

ui('rendu : liste des ateliers (date, lieu, statut, filtre « Tous », singulier et pluriel, échappement, états vides)', (r) => {
  const html = r.wsList({ rows: [WS, { ...WS, id: 2, code: 'ATL-002', title: 'Autre', held_on: '', place: '', status: 'planned' }], total: 2, filter: 'all' });
  assert.match(html, /2 ateliers/);
  for (const t of ['ATL-001', 'ATL-002', 'Lieu ou format', '26/11/2026', 'Salle &lt;x&gt;', 'Tenu', 'Planifié', 'Nouvel atelier', '>Tous (', '>Archivé (']) assert.ok(html.includes(t), t);
  assert.ok(html.includes('Recueil &lt;b&gt;du besoin&lt;/b&gt;') && !html.includes('<b>du besoin</b>'));
  assert.match(r.wsList({ rows: [WS], total: 1, filter: 'all' }), /1 atelier\b(?!s)/);
  assert.match(r.wsList({ rows: [], total: 0, filter: 'all' }), /Aucun atelier dans ce projet/);
  assert.match(r.wsList({ rows: [], total: 5, filter: 'planned' }), /Aucun atelier « Planifié » : 5 au total/);
});

ui('rendu : fiche d\'un atelier (champs propres, textes échappés, changement de statut, confirmation, valeurs inattendues visibles)', (r) => {
  const html = r.wsDetail({ row: WS, confirm: null, error: '' });
  for (const t of ['ATL-001 · Recueil &lt;b&gt;du besoin&lt;/b&gt;', '26/11/2026', 'Salle &lt;x&gt;', 'Objectif', 'Cadrer le périmètre', 'Description', 'Notes', 'Points ouverts et actions', 'Action : relancer', 'Modifier', 'Supprimer…', 'Passer à']) assert.ok(html.includes(t), t);
  assert.ok(!html.includes('<script>') && html.includes('whitespace-pre-wrap'));
  assert.match(html, /<dt[^>]*>Statut<\/dt><dd>Tenu<\/dd>/);
  for (const label of ['Planifié', 'Archivé']) assert.match(html, new RegExp(`<button[^>]*>${label}</button>`), label);
  assert.doesNotMatch(html, /<button[^>]*>Tenu<\/button>/, 'le statut courant n\'est pas proposé');
  const asking = r.wsDetail({ row: WS, confirm: 'Supprimer définitivement ATL-001 ?', error: '' });
  assert.ok(asking.includes('Supprimer définitivement ATL-001 ?') && !asking.includes('Supprimer…'));
  assert.match(r.wsDetail({ row: WS, confirm: null, error: 'Panne <x>' }), /role="alert"[^>]*>Panne &lt;x&gt;</);
  const odd = r.wsDetail({ row: { ...WS, held_on: 'zzz', place: '', objective: '', notes: '', follow_up: '', description: '' }, confirm: null, error: '' });
  assert.ok(odd.includes('Invalide (zzz)'), 'une date illisible en base reste visible');
  assert.ok((odd.match(/—/g) ?? []).length >= 5, 'champs vides : tiret');
});

ui('rendu : formulaire d\'un atelier (champ date, libellés, erreurs par champ, valeurs conservées, abandon)', (r) => {
  const values = { title: 'A', description: 'ctx', heldOn: '2026-11-26', place: 'Salle', objective: 'o', notes: 'n', followUp: 'f' };
  const html = r.wsForm({ errors: { heldOn: 'Date invalide.', notes: 'Trop long.' }, askAbandon: false, values });
  assert.match(html, /<input[^>]*type="date"[^>]*value="2026-11-26"|<input[^>]*value="2026-11-26"[^>]*type="date"/);
  assert.ok(html.includes('Date invalide.') && html.includes('Trop long.'));
  for (const t of ['Nouvel atelier', 'Date de l&#x27;atelier', 'Lieu ou format', 'Objectif', 'Description', 'Notes', 'Points ouverts et actions', 'Enregistrer', 'value="Salle"']) assert.ok(html.includes(t), t);
  assert.ok(!r.wsForm({ errors: {}, askAbandon: false, values }).includes('Date invalide.'));
  assert.match(r.wsForm({ errors: {}, askAbandon: true, values }), /Abandonner/);
});

ui('rendu : sans projet actif, les ateliers renvoient vers les projets (écran commun)', (r) => {
  assert.match(r.analysisNoProject('Les ateliers'), /Aucun projet actif\. Les ateliers appartiennent à un projet/);
});
