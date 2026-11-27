// Lot M5 : logique pure des écrans User stories et Tests, menu regroupé, rendu statique (décisions D61 à D69).
// Aucun clic ni saisie n'est simulé : ces comportements se vérifient à la recette sur clé. Si esbuild est introuvable, les rendus sont « ignorés ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRender } from './helpers/ui-loader.ts';
import { EMPTY_STORY_FORM, STATUS_FILTER_OPTIONS as US_FILTERS, STATUS_OPTIONS as US_STATUS, emptyStoriesMessage, validateStoryForm } from '../src/modules/stories/logic.ts';
import { EMPTY_TEST_FORM, STATUS_FILTER_OPTIONS as TS_FILTERS, STATUS_OPTIONS as TS_STATUS, TYPE_OPTIONS, emptyTestsMessage, validateTestForm } from '../src/modules/testcases/logic.ts';
import { NAV_SECTIONS, SCREENS } from '../src/app/navigation.ts';

// ------------------------------------------------------------------ logique pure

test('menu : sections nommées (Analyse, Pilotage, Réalisation, Contrôle), Projets et Technique seuls, ordre figé (D67, D70)', () => {
  assert.deepEqual(NAV_SECTIONS.map((s) => s.title), [null, 'Analyse', 'Pilotage', 'Réalisation', 'Contrôle', null]);
  assert.deepEqual(NAV_SECTIONS.map((s) => s.screens.map((x) => x.label)), [['Accueil', 'Projets'], ['Ateliers', 'Parties prenantes', 'Besoins', 'Exigences'], ['Décisions', 'Risques', 'Livrables'], ['User stories', 'Tests'], ['Traçabilité'], ['Technique']]);
  assert.deepEqual(SCREENS.map((s) => s.id), ['home', 'projects', 'workshops', 'stakeholders', 'needs', 'requirements', 'decisions', 'risks', 'deliverables', 'stories', 'tests', 'traceability', 'technical']);
  assert.equal(new Set(SCREENS.map((s) => s.id)).size, SCREENS.length);
});

test('écran user stories : statuts accordés au féminin, filtre « Toutes », messages de liste vide', () => {
  assert.deepEqual(US_STATUS.map((o) => o.label), ['Brouillon', 'Prête', 'Réalisée', 'Rejetée', 'Archivée']);
  assert.deepEqual(US_FILTERS.map((o) => o.value), ['all', 'draft', 'ready', 'done', 'rejected', 'archived']);
  assert.equal(US_FILTERS[0].label, 'Toutes');
  assert.match(emptyStoriesMessage(0, 'all'), /^Aucune user story dans ce projet\. Créez la première/);
  assert.match(emptyStoriesMessage(4, 'rejected'), /Aucune user story « Rejetée » : 4 au total/);
});

test('écran tests : statuts, types, messages de liste vide', () => {
  assert.deepEqual(TS_STATUS.map((o) => o.label), ['À exécuter', 'Réussi', 'Échoué', 'Bloqué', 'Archivé']);
  assert.deepEqual(TS_FILTERS.map((o) => o.value), ['all', 'to_run', 'passed', 'failed', 'blocked', 'archived']);
  assert.equal(TS_FILTERS[0].label, 'Tous');
  assert.deepEqual(TYPE_OPTIONS.map((o) => o.label), ['Unitaire', 'Intégration', 'Recette (UAT)']);
  assert.match(emptyTestsMessage(0, 'all'), /^Aucun test dans ce projet\. Créez le premier/);
  assert.match(emptyTestsMessage(3, 'failed'), /Aucun test « Échoué » : 3 au total/);
});

test('formulaire user story : défauts, une erreur par champ fautif, valeurs normalisées', () => {
  assert.deepEqual(EMPTY_STORY_FORM, { title: '', description: '', role: '', goal: '', benefit: '', criteria: '' });
  const bad = validateStoryForm({ title: '', description: '', role: 'x'.repeat(201), goal: 'x'.repeat(2001), benefit: 'x'.repeat(2001), criteria: 'x'.repeat(10001) });
  assert.ok(!bad.ok);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ['benefit', 'criteria', 'goal', 'role', 'title']);
  if (!bad.ok) assert.match(bad.errors.title ?? '', /Le titre de la user story est obligatoire/);
  const ok = validateStoryForm({ title: ' S ', description: 'd', role: ' Client ', goal: 'g', benefit: 'b', criteria: 'c' });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual({ t: ok.title, f: ok.fields }, { t: 'S', f: { role: 'Client', goal: 'g', benefit: 'b', criteria: 'c' } });
  assert.ok(validateStoryForm({ ...EMPTY_STORY_FORM, title: 'S' }).ok, 'seul le titre est obligatoire');
});

test('formulaire test : défauts (recette), une erreur par champ fautif, date réelle, valeurs normalisées', () => {
  assert.deepEqual(EMPTY_TEST_FORM, { title: '', description: '', testType: 'acceptance', preconditions: '', steps: '', expected: '', lastRunOn: '' });
  const bad = validateTestForm({ title: '', description: '', testType: 'smoke', preconditions: 'x'.repeat(10001), steps: 'x'.repeat(10001), expected: 'x'.repeat(10001), lastRunOn: '2026-02-30' });
  assert.ok(!bad.ok);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ['expected', 'lastRunOn', 'preconditions', 'steps', 'testType', 'title']);
  if (!bad.ok) assert.match(bad.errors.title ?? '', /Le titre du test est obligatoire/);
  const ok = validateTestForm({ title: ' T ', description: '', testType: 'unit', preconditions: 'p', steps: 's', expected: 'e', lastRunOn: '2026-11-25' });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual({ t: ok.title, f: ok.fields }, { t: 'T', f: { testType: 'unit', preconditions: 'p', steps: 's', expected: 'e', lastRunOn: '2026-11-25' } });
  assert.ok(validateTestForm({ ...EMPTY_TEST_FORM, title: 'T' }).ok, 'la date est facultative');
});

// ------------------------------------------------------------------ rendu statique

interface UsRow { id: number; code: string; title: string; description: string; status: string; role: string; goal: string; benefit: string; criteria: string }
interface TsRow { id: number; code: string; title: string; description: string; status: string; test_type: string; preconditions: string; steps: string; expected: string; last_run_on: string }
interface Render {
  shell: (p: { navigable: boolean; screen: string; projects: Array<{ id: number; name: string }>; activeId: number | null }) => string;
  analysisNoProject: (what: string) => string;
  storyList: (p: { rows: UsRow[]; total: number; filter: string }) => string;
  storyDetail: (p: { row: UsRow; confirm: string | null; error: string }) => string;
  storyForm: (p: { errors: Record<string, string>; askAbandon: boolean; values: { title: string; description: string; role: string; goal: string; benefit: string; criteria: string } }) => string;
  testList: (p: { rows: TsRow[]; total: number; filter: string }) => string;
  testDetail: (p: { row: TsRow; confirm: string | null; error: string }) => string;
  testForm: (p: { errors: Record<string, string>; askAbandon: boolean; values: { title: string; description: string; testType: string; preconditions: string; steps: string; expected: string; lastRunOn: string } }) => string;
}

const render = loadRender<Render>();
const ui = (name: string, fn: (r: Render) => void) => test(name, { skip: render === null ? 'esbuild introuvable : rendu des écrans non vérifié' : false }, () => fn(render as Render));

const US: UsRow = { id: 1, code: 'US-001', title: 'Consulter <b>solde</b>', description: 'Contexte\nsur deux lignes', status: 'ready', role: 'Client <x>', goal: 'voir mon solde', benefit: 'savoir <script>x</script>', criteria: 'Critère 1\nCritère 2' };
const TS: TsRow = { id: 2, code: 'TEST-001', title: 'Connexion <i>ok</i>', description: '', status: 'failed', test_type: 'integration', preconditions: 'Compte <b>actif</b>', steps: '1. Ouvrir\n2. Saisir', expected: 'Accès <script>x</script>', last_run_on: '2026-11-25' };

ui('rendu : le menu est regroupé en sections nommées, avec une seule entrée courante', (r) => {
  const html = r.shell({ navigable: true, screen: 'stories', projects: [{ id: 1, name: 'A' }], activeId: 1 });
  for (const label of ['Projets', 'Ateliers', 'Parties prenantes', 'Besoins', 'Exigences', 'Décisions', 'Risques', 'User stories', 'Tests', 'Traçabilité', 'Technique']) assert.ok(html.includes(`>${label}<`), label);
  for (const title of ['Analyse', 'Pilotage', 'Réalisation', 'Contrôle']) assert.ok(html.includes(`>${title}<`), title);
  assert.ok(html.indexOf('>Analyse<') < html.indexOf('>Parties prenantes<') && html.indexOf('>Exigences<') < html.indexOf('>Pilotage<') && html.indexOf('>Risques<') < html.indexOf('>Réalisation<') && html.indexOf('>Tests<') < html.indexOf('>Contrôle<') && html.indexOf('>Traçabilité<') < html.indexOf('>Technique<'), 'ordre des sections');
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  assert.match(html, /aria-current="page"[^>]*>User stories</);
  assert.match(r.shell({ navigable: true, screen: 'tests', projects: [{ id: 1, name: 'A' }], activeId: 1 }), /aria-current="page"[^>]*>Tests</);
  assert.ok(!/<button[^>]*>(Analyse|Pilotage|Réalisation|Contrôle)</.test(html), 'les intitulés de section ne sont pas cliquables');
});

ui('rendu : liste des user stories (rôle, statut au féminin, filtre « Toutes », singulier et pluriel, échappement, états vides)', (r) => {
  const html = r.storyList({ rows: [US, { ...US, id: 3, code: 'US-002', title: 'Autre', role: '', status: 'rejected' }], total: 2, filter: 'all' });
  assert.match(html, /2 user stories/);
  for (const t of ['US-001', 'US-002', 'En tant que', 'Client &lt;x&gt;', 'Prête', 'Rejetée', 'Nouvelle user story', '>Toutes (', '>Brouillon (']) assert.ok(html.includes(t), t);
  assert.ok(html.includes('Consulter &lt;b&gt;solde&lt;/b&gt;') && !html.includes('<b>solde</b>'));
  assert.match(r.storyList({ rows: [US], total: 1, filter: 'all' }), /1 user story\b(?!ies)/);
  assert.match(r.storyList({ rows: [], total: 0, filter: 'all' }), /Aucune user story dans ce projet/);
  assert.match(r.storyList({ rows: [], total: 5, filter: 'done' }), /Aucune user story « Réalisée » : 5 au total/);
});

ui('rendu : fiche d\'une user story (trois temps, critères, textes échappés, changement de statut, confirmation, valeur inattendue visible)', (r) => {
  const html = r.storyDetail({ row: US, confirm: null, error: '' });
  for (const t of ['US-001 · Consulter &lt;b&gt;solde&lt;/b&gt;', 'En tant que', 'Client &lt;x&gt;', 'Je veux', 'voir mon solde', 'Afin de', 'savoir &lt;script&gt;x&lt;/script&gt;', 'Critères d&#x27;acceptation', 'Critère 1', 'Modifier', 'Supprimer…', 'Passer à']) assert.ok(html.includes(t), t);
  assert.ok(!html.includes('<script>') && html.includes('whitespace-pre-wrap'));
  assert.match(html, /<dt[^>]*>Statut<\/dt><dd>Prête<\/dd>/);
  for (const label of ['Brouillon', 'Réalisée', 'Rejetée', 'Archivée']) assert.match(html, new RegExp(`<button[^>]*>${label}</button>`), label);
  assert.doesNotMatch(html, /<button[^>]*>Prête<\/button>/, 'le statut courant n\'est pas proposé');
  const asking = r.storyDetail({ row: US, confirm: 'Supprimer définitivement US-001 ?', error: '' });
  assert.ok(asking.includes('Supprimer définitivement US-001 ?') && !asking.includes('Supprimer…'));
  assert.match(r.storyDetail({ row: US, confirm: null, error: 'Panne <x>' }), /role="alert"[^>]*>Panne &lt;x&gt;</);
  assert.ok(r.storyDetail({ row: { ...US, status: 'zzz' }, confirm: null, error: '' }).includes('zzz'), 'un statut inattendu reste visible');
  assert.ok((r.storyDetail({ row: { ...US, role: '', goal: '', benefit: '', criteria: '', description: '' }, confirm: null, error: '' }).match(/—/g) ?? []).length >= 5, 'champs vides : tiret');
});

ui('rendu : formulaire d\'une user story (libellés, erreurs par champ, valeurs conservées, abandon)', (r) => {
  const values = { title: 'S', description: 'ctx', role: 'Client', goal: 'g', benefit: 'b', criteria: 'c' };
  const html = r.storyForm({ errors: { role: 'Rôle trop long.', criteria: 'Critères trop longs.' }, askAbandon: false, values });
  assert.ok(html.includes('Rôle trop long.') && html.includes('Critères trop longs.'));
  for (const t of ['Nouvelle user story', 'En tant que', 'Je veux', 'Afin de', 'Description', 'Critères d&#x27;acceptation', 'Enregistrer', 'value="Client"']) assert.ok(html.includes(t), t);
  assert.ok(!r.storyForm({ errors: {}, askAbandon: false, values }).includes('Rôle trop long.'));
  assert.match(r.storyForm({ errors: {}, askAbandon: true, values }), /Abandonner/);
});

ui('rendu : liste des tests (type, dernière exécution au format français, statut, échappement, états vides)', (r) => {
  const html = r.testList({ rows: [TS, { ...TS, id: 4, code: 'TEST-002', title: 'Autre', test_type: 'unit', last_run_on: '', status: 'passed' }], total: 2, filter: 'all' });
  assert.match(html, /2 tests/);
  for (const t of ['TEST-001', 'TEST-002', 'Intégration', 'Unitaire', '25/11/2026', 'Échoué', 'Réussi', 'Nouveau test', '>Tous (', '>À exécuter (']) assert.ok(html.includes(t), t);
  assert.ok(html.includes('Connexion &lt;i&gt;ok&lt;/i&gt;') && !html.includes('<i>ok</i>'));
  assert.match(r.testList({ rows: [TS], total: 1, filter: 'all' }), /1 test\b(?!s)/);
  assert.match(r.testList({ rows: [], total: 0, filter: 'all' }), /Aucun test dans ce projet/);
  assert.match(r.testList({ rows: [], total: 5, filter: 'blocked' }), /Aucun test « Bloqué » : 5 au total/);
});

ui('rendu : fiche d\'un test (champs propres, textes échappés, changement de statut, valeurs inattendues visibles)', (r) => {
  const html = r.testDetail({ row: TS, confirm: null, error: '' });
  for (const t of ['TEST-001 · Connexion &lt;i&gt;ok&lt;/i&gt;', 'Intégration', '25/11/2026', 'Préconditions', 'Compte &lt;b&gt;actif&lt;/b&gt;', 'Étapes', '1. Ouvrir', 'Résultat attendu', 'Accès &lt;script&gt;x&lt;/script&gt;', 'Modifier', 'Supprimer…', 'Passer à']) assert.ok(html.includes(t), t);
  assert.ok(!html.includes('<script>') && html.includes('whitespace-pre-wrap'));
  assert.match(html, /<dt[^>]*>Statut<\/dt><dd>Échoué<\/dd>/);
  for (const label of ['À exécuter', 'Réussi', 'Bloqué', 'Archivé']) assert.match(html, new RegExp(`<button[^>]*>${label}</button>`), label);
  assert.doesNotMatch(html, /<button[^>]*>Échoué<\/button>/);
  const odd = r.testDetail({ row: { ...TS, last_run_on: 'zzz', test_type: 'qqq', preconditions: '', steps: '', expected: '', description: '' }, confirm: null, error: '' });
  assert.ok(odd.includes('Invalide (zzz)'), 'une date illisible en base reste visible');
  assert.ok(odd.includes('qqq'), 'un type inattendu reste visible');
  assert.ok((odd.match(/—/g) ?? []).length >= 4, 'champs vides : tiret');
});

ui('rendu : formulaire d\'un test (liste des types, champ date, erreurs par champ, valeurs conservées, abandon)', (r) => {
  const values = { title: 'T', description: '', testType: 'unit', preconditions: 'p', steps: 's', expected: 'e', lastRunOn: '2026-11-25' };
  const html = r.testForm({ errors: { lastRunOn: 'Date invalide.', steps: 'Trop long.' }, askAbandon: false, values });
  assert.match(html, /<input[^>]*type="date"[^>]*value="2026-11-25"|<input[^>]*value="2026-11-25"[^>]*type="date"/);
  assert.match(html, /<option[^>]*value="unit"[^>]*selected|<option[^>]*selected[^>]*value="unit"/);
  assert.ok(html.includes('Date invalide.') && html.includes('Trop long.'));
  for (const t of ['Nouveau test', 'Type', 'Unitaire', 'Intégration', 'Recette (UAT)', 'Dernière exécution', 'Préconditions', 'Étapes', 'Résultat attendu', 'Enregistrer']) assert.ok(html.includes(t), t);
  assert.match(r.testForm({ errors: {}, askAbandon: true, values }), /Abandonner/);
});

ui('rendu : sans projet actif, user stories et tests renvoient vers les projets (écran commun)', (r) => {
  assert.match(r.analysisNoProject('Les user stories'), /Aucun projet actif\. Les user stories appartiennent à un projet/);
  assert.match(r.analysisNoProject('Les tests'), /Les tests appartiennent/);
});
