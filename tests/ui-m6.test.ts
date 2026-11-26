// Lot M6 : logique pure de l'écran Traçabilité, rendu statique, branchement de l'ouverture de fiche (décisions D70 à D78).
// Aucun clic n'est simulé : ouvrir une fiche, changer d'onglet et filtrer se vérifient à la recette sur clé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadRender } from './helpers/ui-loader.ts';
import { MATRIX_FILTERS, ORPHAN_GROUPS, TABS, emptyMatrixMessage, filterMatrix, ignoredText, orphanCount, ratioText, resultLabel, summaryLines } from '../src/modules/traceability/logic.ts';
import { computeTraceability } from '../src/domain/traceability.ts';
import type { Traceability, TraceItem, TraceLink } from '../src/domain/traceability.ts';

const it = (id: number, kind: TraceItem['kind'], code: string, status: string, extra: Partial<TraceItem> = {}): TraceItem => ({ id, kind, code, title: `Titre ${code}`, status, ...extra });
const ln = (type: string, fromId: number, toId: number): TraceLink => ({ type, fromId, toId });

const ITEMS: TraceItem[] = [
  it(1, 'stakeholder', 'PP-001', 'active'), it(2, 'stakeholder', 'PP-002', 'active'),
  it(3, 'need', 'BES-001', 'validated'),
  it(5, 'requirement', 'EX-001', 'draft', { priority: 'must', title: 'Temps <b>de réponse</b>' }), it(6, 'requirement', 'EX-002', 'draft', { priority: 'should' }), it(7, 'requirement', 'EX-003', 'draft', { priority: 'must' }),
  it(8, 'story', 'US-001', 'ready'), it(9, 'story', 'US-002', 'draft'),
  it(11, 'test', 'TEST-001', 'passed', { lastRunOn: '2026-11-20' }), it(12, 'test', 'TEST-002', 'failed', { lastRunOn: '2026-11-25' }), it(14, 'test', 'TEST-004', 'to_run'), it(15, 'test', 'TEST-005', 'archived'),
];
const LINKS: TraceLink[] = [ln('expresses', 1, 3), ln('derives', 3, 5), ln('implements', 8, 5), ln('verifies', 11, 5), ln('verifies', 12, 8)];
const DATA: Traceability = computeTraceability(ITEMS, LINKS);
const EMPTY: Traceability = computeTraceability([], []);

// ------------------------------------------------------------------ logique pure

test('traçabilité : ratios affichés « x sur y », tiret quand il n\'y a rien à couvrir', () => {
  assert.equal(ratioText({ covered: 3, total: 5 }), '3 sur 5');
  assert.equal(ratioText({ covered: 0, total: 4 }), '0 sur 4');
  assert.equal(ratioText({ covered: 0, total: 0 }), '—');
  assert.deepEqual(summaryLines(DATA.summary).map((l) => l.label), [
    'Parties prenantes avec un besoin', 'Besoins avec une exigence', 'Exigences avec une user story', 'Exigences testées', 'Exigences dont le résultat est Réussi', 'Exigences Indispensable (Must) testées',
  ]);
  assert.deepEqual(summaryLines(DATA.summary).map((l) => ratioText(l.ratio)), ['1 sur 2', '1 sur 1', '1 sur 3', '1 sur 3', '0 sur 3', '1 sur 2']);
});

test('traçabilité : éléments ignorés, onglets, filtre Must, messages de matrice vide, résultats', () => {
  assert.equal(ignoredText(0), '');
  assert.equal(ignoredText(1), '1 élément archivé ou rejeté ignoré dans le calcul.');
  assert.equal(ignoredText(3), '3 éléments archivés ou rejetés ignorés dans le calcul.');
  assert.deepEqual(TABS.map((t) => t.value), ['matrix', 'orphans']);
  assert.deepEqual(MATRIX_FILTERS.map((f) => f.value), ['all', 'must']);
  assert.deepEqual(filterMatrix(DATA.matrix, 'must').map((r) => r.code), ['EX-001', 'EX-003']);
  assert.deepEqual(filterMatrix(DATA.matrix, 'all').map((r) => r.code), ['EX-001', 'EX-003', 'EX-002']);
  assert.match(emptyMatrixMessage(0, 'all'), /Aucune exigence active dans ce projet/);
  assert.match(emptyMatrixMessage(2, 'must'), /Aucune exigence Indispensable \(Must\) active : 2 exigences au total/);
  assert.match(emptyMatrixMessage(1, 'must'), /1 exigence au total/);
  assert.deepEqual(['failed', 'blocked', 'to_run', 'passed', 'none', 'zzz'].map(resultLabel), ['Échoué', 'Bloqué', 'À exécuter', 'Réussi', 'Aucun test', 'Inconnu (zzz)']);
  assert.equal(ORPHAN_GROUPS.length, 7);
  assert.equal(orphanCount(DATA.orphans), DATA.orphans.stakeholdersWithoutNeed.length + DATA.orphans.requirementsWithoutStory.length + DATA.orphans.requirementsWithoutTest.length + DATA.orphans.storiesWithoutRequirement.length + DATA.orphans.storiesWithoutTest.length + DATA.orphans.testsWithoutTarget.length + DATA.orphans.needsWithoutRequirement.length);
  assert.equal(orphanCount(EMPTY.orphans), 0);
});

// ------------------------------------------------------------------ branchement (le crochet React ne tourne pas en rendu statique)

test('branchement : les sept écrans de registre appellent le crochet d\'ouverture, et l\'application leur passe la demande de leur type', () => {
  const screens = ['stakeholders/StakeholdersScreen', 'analysis/NeedsScreen', 'analysis/RequirementsScreen', 'decisions/DecisionsScreen', 'risks/RisksScreen', 'stories/StoriesScreen', 'testcases/TestsScreen'];
  for (const f of screens) {
    const src = fs.readFileSync(new URL(`../src/modules/${f}.tsx`, import.meta.url), 'utf8');
    if (/<RegisterScreen config=\{CONFIG\} \{\.\.\.(props|common)\}/.test(src)) continue; // écran converti (M8b) : le crochet est dans le composant générique, vérifié plus bas
    assert.match(src, /useOpenRequest\(props\.openId, rows\.map\(\(r\) => r\.id\)/, `${f} appelle le crochet avec sa liste`);
    assert.match(src, /props\.onOpenHandled/, `${f} signale la demande traitée`);
  }
  const generic = fs.readFileSync(new URL('../src/shared/register-screen.tsx', import.meta.url), 'utf8');
  assert.match(generic, /useOpenRequest\(props\.openId, rows\.map\(\(r\) => r\.id\)/, 'le composant générique appelle le crochet avec sa liste');
  assert.match(generic, /props\.onOpenHandled/, 'le composant générique signale la demande traitée');
  const app = fs.readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
  for (const kind of ['stakeholder', 'need', 'requirement', 'decision', 'risk', 'story', 'test']) assert.ok(app.includes(`{...openProps('${kind}')}`), `App passe la demande du type ${kind}`);
  assert.match(app, /onOpenItem=\{openItem\}/);
  assert.match(app, /onNavigate=\{navigate\}/, 'le menu efface la demande en attente');
});

// ------------------------------------------------------------------ rendu statique

interface Render {
  shell: (p: { navigable: boolean; screen: string; projects: Array<{ id: number; name: string }>; activeId: number | null }) => string;
  analysisNoProject: (what: string) => string;
  trace: (p: { data: Traceability; tab: string; filter: string; error: string }) => string;
}
const render = loadRender<Render>();
const ui = (name: string, fn: (r: Render) => void) => test(name, { skip: render === null ? 'esbuild introuvable : rendu des écrans non vérifié' : false }, () => fn(render as Render));

ui('rendu : bandeau de couverture, onglets, matrice (codes cliquables, tests directs et via story, résultat, date, échappement)', (r) => {
  const html = r.trace({ data: DATA, tab: 'matrix', filter: 'all', error: '' });
  for (const t of ['Projet : <strong>Mon projet</strong>', 'lecture seule', 'Parties prenantes avec un besoin', '1 sur 2', 'Exigences testées', 'Exigences Indispensable (Must) testées', '1 élément archivé ou rejeté ignoré dans le calcul.']) assert.ok(html.includes(t), t);
  assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*>Matrice</);
  assert.match(html, /role="tab"[^>]*aria-selected="false"[^>]*>Orphelins \(\d+\)</);
  for (const t of ['Tests directs', 'Tests via story', 'Indispensable (Must)', 'Important (Should)', 'Échoué', 'Aucun test', 'dernière exécution 25/11/2026']) assert.ok(html.includes(t), t);
  assert.match(html, /<button[^>]*title="Titre BES-001 \(Validé\)"[^>]*>BES-001</, 'le code est un bouton, le titre est dans l\'infobulle');
  assert.match(html, /<button[^>]*>US-001</);
  assert.match(html, /<button[^>]*>TEST-001</);
  assert.match(html, /<button[^>]*>TEST-002</);
  assert.ok(html.includes('Temps &lt;b&gt;de réponse&lt;/b&gt;') && !html.includes('<b>de réponse</b>'), 'texte échappé');
  assert.ok(html.indexOf('EX-001') < html.indexOf('EX-003') && html.indexOf('EX-003') < html.indexOf('EX-002'), 'tri Must puis Should');
  assert.ok(!html.includes('TEST-005'), 'l\'élément archivé n\'apparaît pas');
});

ui('rendu : filtre « Indispensable (Must) seulement », matrice vide', (r) => {
  const must = r.trace({ data: DATA, tab: 'matrix', filter: 'must', error: '' });
  assert.ok(must.includes('EX-001') && must.includes('EX-003') && !must.includes('>EX-002<'));
  assert.match(must, /aria-pressed="true"[^>]*>Indispensable \(Must\) seulement</);
  const empty = r.trace({ data: EMPTY, tab: 'matrix', filter: 'all', error: '' });
  assert.match(empty, /Aucune exigence active dans ce projet : la matrice est vide\./);
  assert.ok(empty.includes('—') && !empty.includes('NaN'), 'ratios sur zéro : tiret');
});

ui('rendu : onglet Orphelins (sept listes avec compteurs, codes cliquables, cas sans orphelin)', (r) => {
  const html = r.trace({ data: DATA, tab: 'orphans', filter: 'all', error: '' });
  assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*>Orphelins \(\d+\)</);
  for (const g of ORPHAN_GROUPS) assert.ok(html.includes(g.label), g.label);
  assert.ok(html.includes('Parties prenantes sans besoin <span class="font-normal text-hub-muted">(1)</span>'));
  assert.match(html, /<button[^>]*>PP-002</);
  assert.match(html, /<button[^>]*>EX-003</);
  assert.match(html, /<button[^>]*>US-002</);
  assert.match(html, /<button[^>]*>TEST-004</);
  assert.ok(html.includes('Aucun.'), 'une liste vide le dit');
  const none = r.trace({ data: EMPTY, tab: 'orphans', filter: 'all', error: '' });
  assert.match(none, /Aucun orphelin : chaque élément actif de la chaîne a les liens attendus\./);
});

ui('rendu : erreur de chargement visible, aucune action de modification (lecture seule, D78)', (r) => {
  assert.match(r.trace({ data: DATA, tab: 'matrix', filter: 'all', error: 'Panne <x>' }), /role="alert"[^>]*>Panne &lt;x&gt;</);
  const html = r.trace({ data: DATA, tab: 'matrix', filter: 'all', error: '' });
  for (const forbidden of ['Supprimer', 'Modifier', 'Enregistrer', '<form', '<input', '<textarea', '<select']) assert.ok(!html.includes(forbidden), forbidden);
});

ui('rendu : sans projet actif, la traçabilité renvoie vers les projets (écran commun)', (r) => {
  assert.match(r.analysisNoProject('Les données de traçabilité'), /Aucun projet actif\. Les données de traçabilité appartiennent à un projet/);
});

ui('rendu : le menu place « Traçabilité » sous « Contrôle », entre Réalisation et Technique', (r) => {
  const html = r.shell({ navigable: true, screen: 'traceability', projects: [{ id: 1, name: 'A' }], activeId: 1 });
  assert.match(html, /aria-current="page"[^>]*>Traçabilité</);
  assert.ok(html.indexOf('>Tests<') < html.indexOf('>Contrôle<') && html.indexOf('>Contrôle<') < html.indexOf('>Traçabilité<') && html.indexOf('>Traçabilité<') < html.indexOf('>Technique<'));
});
