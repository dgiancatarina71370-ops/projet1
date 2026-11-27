// Lot F2 : recherche, tri et compteurs des registres (décisions F2-D01 à F2-D09). Logique pure + garde-fous de structure.
// Les résultats attendus sur le projet d'exemple sont ceux de la recette TESTS-F2.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SAMPLE_ITEMS } from '../src/domain/sample-project.ts';
import {
  DEFAULT_SORT, SORT_OPTIONS, compareCodes, filterByStatus, isSearching, noResultText, normalizeSearchText, searchRows, searchWords, sortRows, statusCounts,
} from '../src/shared/register-logic.ts';

interface R { code: string; title: string; description: string; status: string; updated_at?: string }
const r = (code: string, title: string, description = '', status = 'draft', updated_at?: string): R => ({ code, title, description, status, ...(updated_at ? { updated_at } : {}) });
const codes = (rows: readonly R[]): string[] => rows.map((x) => x.code);

/** Lignes du projet d'exemple pour un type d'élément (le code est la clé : EX-001…). */
const sample = (kind: string): R[] => SAMPLE_ITEMS.filter((i) => i.kind === kind).map((i) => r(i.key, i.title, i.description, i.status));

// ------------------------------------------------------------------ recherche (F2-D01)

test('recherche : fragment de code, de mot du titre et de la description', () => {
  const rows = [r('EX-003', 'Blocage du créneau', 'Aucune double réservation'), r('EX-004', 'Validation', 'Sous trois jours')];
  assert.deepEqual(codes(searchRows(rows, '003')), ['EX-003']);
  assert.deepEqual(codes(searchRows(rows, 'bloc')), ['EX-003']);
  assert.deepEqual(codes(searchRows(rows, 'trois')), ['EX-004']);
  assert.deepEqual(codes(searchRows(rows, 'ex-0')), ['EX-003', 'EX-004']);
});

test('recherche : insensible aux majuscules, aux accents et aux apostrophes typographiques', () => {
  const rows = [r('EX-003', 'Blocage d\'un créneau déjà réservé'), r('EX-004', 'Autre')];
  assert.deepEqual(codes(searchRows(rows, 'CRENEAU')), ['EX-003']);
  assert.deepEqual(codes(searchRows(rows, 'déjà')), ['EX-003']);
  assert.deepEqual(codes(searchRows(rows, 'deja')), ['EX-003']);
  assert.deepEqual(codes(searchRows(rows, 'd’un')), ['EX-003'], 'apostrophe typographique tapée, droite dans les données');
  assert.equal(normalizeSearchText('Éléphant À’Ç'), 'elephant a\'c');
});

test('recherche : plusieurs mots = tous requis (ET), dans n\'importe quel des trois champs', () => {
  const rows = [r('EX-001', 'Rechercher une salle', 'par équipement'), r('EX-002', 'Réserver une salle', 'avec accusé'), r('EX-003', 'Autre', 'équipement seul')];
  assert.deepEqual(codes(searchRows(rows, 'salle equipement')), ['EX-001']);
  assert.deepEqual(codes(searchRows(rows, 'salle')), ['EX-001', 'EX-002']);
  assert.deepEqual(codes(searchRows(rows, 'ex-002 accuse')), ['EX-002'], 'un mot dans le code, un dans la description');
  assert.deepEqual(codes(searchRows(rows, 'salle zzz')), []);
});

test('recherche : vide ou espaces seuls = tout est gardé, ordre conservé ; la liste reçue n\'est pas modifiée', () => {
  const rows = [r('EX-002', 'B'), r('EX-001', 'A')];
  const copy = JSON.stringify(rows);
  assert.deepEqual(codes(searchRows(rows, '')), ['EX-002', 'EX-001']);
  assert.deepEqual(codes(searchRows(rows, '   ')), ['EX-002', 'EX-001']);
  assert.notEqual(searchRows(rows, ''), rows, 'copie, pas la même liste');
  assert.equal(JSON.stringify(rows), copy);
  assert.equal(isSearching(''), false);
  assert.equal(isSearching('  '), false);
  assert.equal(isSearching(' a '), true);
  assert.deepEqual(searchWords('  salle   Équipement '), ['salle', 'equipement']);
});

test('recherche : pas de jokers ni d\'expressions régulières (les caractères spéciaux sont du texte)', () => {
  const rows = [r('EX-001', 'Coût (HT) : 5 € * 2', 'a.b'), r('EX-002', 'Autre')];
  assert.deepEqual(codes(searchRows(rows, '(ht)')), ['EX-001']);
  assert.deepEqual(codes(searchRows(rows, 'a.b')), ['EX-001'], 'le point est un point');
  assert.deepEqual(codes(searchRows(rows, '.*')), [], '« .* » n\'est pas un joker : cherché tel quel, il n\'existe nulle part');
  assert.deepEqual(codes(searchRows(rows, '[')), [], 'un crochet seul ne provoque pas d\'erreur');
});

// ------------------------------------------------------------------ tri (F2-D02)

test('tri : par défaut « code croissant », identique à l\'ordre historique ; quatre modes proposés', () => {
  assert.equal(DEFAULT_SORT, 'code-asc');
  assert.deepEqual(SORT_OPTIONS.map((o) => o.value), ['code-asc', 'code-desc', 'title-asc', 'updated-desc']);
  assert.deepEqual(SORT_OPTIONS.map((o) => o.label), ['Code croissant', 'Code décroissant', 'Titre de A à Z', 'Modifié récemment']);
});

test('tri par code : suit le numéro (EX-1000 après EX-999, EX-2 avant EX-10), pas l\'ordre alphabétique', () => {
  const rows = [r('EX-1000', 'a'), r('EX-999', 'b'), r('EX-010', 'c'), r('EX-002', 'd')];
  assert.deepEqual(codes(sortRows(rows, 'code-asc')), ['EX-002', 'EX-010', 'EX-999', 'EX-1000']);
  assert.deepEqual(codes(sortRows(rows, 'code-desc')), ['EX-1000', 'EX-999', 'EX-010', 'EX-002']);
  assert.equal(compareCodes('EX-1000', 'EX-999'), 1);
  assert.equal(compareCodes('EX-001', 'EX-001'), 0);
  assert.equal(compareCodes('SANS-NUMERO', 'SANS-NUMERO'), 0, 'code sans numéro : repli sur le texte');
});

test('tri par titre : de A à Z, accents rangés avec leur lettre, égalité départagée par le code', () => {
  const rows = [r('EX-004', 'Résultats'), r('EX-001', 'Rechercher'), r('EX-003', 'Éclair'), r('EX-002', 'Zèbre'), r('EX-005', 'Éclair'), r('EX-006', 'Abricot')];
  assert.deepEqual(codes(sortRows(rows, 'title-asc')), ['EX-006', 'EX-003', 'EX-005', 'EX-001', 'EX-004', 'EX-002']);
});

test('tri par modification : la plus récente d\'abord ; égalité ou date absente départagée par le code', () => {
  const rows = [r('EX-001', 'a', '', 'draft', '2026-11-01T10:00:00.000Z'), r('EX-002', 'b', '', 'draft', '2026-11-03T10:00:00.000Z'), r('EX-003', 'c', '', 'draft', '2026-11-03T10:00:00.000Z'), r('EX-004', 'd')];
  assert.deepEqual(codes(sortRows(rows, 'updated-desc')), ['EX-002', 'EX-003', 'EX-001', 'EX-004']);
});

test('tri : ne modifie pas la liste reçue', () => {
  const rows = [r('EX-002', 'b'), r('EX-001', 'a')];
  sortRows(rows, 'code-asc');
  assert.deepEqual(codes(rows), ['EX-002', 'EX-001']);
});

// ------------------------------------------------------------------ compteurs et messages (F2-D03, F2-D04)

test('compteurs : « all » compte tout, archivés compris ; un statut absent n\'a pas d\'entrée ; la somme des statuts = « all »', () => {
  const rows = [r('A-1', 'a', '', 'draft'), r('A-2', 'b', '', 'draft'), r('A-3', 'c', '', 'archived'), r('A-4', 'd', '', 'validated')];
  const c = statusCounts(rows);
  assert.deepEqual(c, { all: 4, draft: 2, archived: 1, validated: 1 });
  assert.equal(statusCounts(rows).rejected, undefined);
  assert.equal(c.draft + c.archived + c.validated, c.all);
  assert.deepEqual(statusCounts([]), { all: 0 });
});

test('compteurs : calculés sur le résultat de la recherche, avant le filtre de statut', () => {
  const rows = [r('A-1', 'salle', '', 'draft'), r('A-2', 'salle', '', 'archived'), r('A-3', 'autre', '', 'draft')];
  const found = searchRows(rows, 'salle');
  assert.deepEqual(statusCounts(found), { all: 2, draft: 1, archived: 1 });
  assert.deepEqual(codes(filterByStatus(found, 'draft')), ['A-1']);
  assert.deepEqual(statusCounts(searchRows(rows, '')), { all: 3, draft: 2, archived: 1 }, 'sans recherche : les compteurs du registre entier');
});

test('message : recherche sans résultat, avec ou sans filtre de statut', () => {
  assert.equal(noResultText('zzz', 8, null), 'Aucun résultat pour « zzz » (8 au total dans ce projet).');
  assert.equal(noResultText('  zzz ', 8, 'Brouillon'), 'Aucun résultat pour « zzz » parmi les éléments « Brouillon » (8 au total dans ce projet).');
});

// ------------------------------------------------------------------ projet d'exemple (recette TESTS-F2.md)

test('projet d\'exemple : « code croissant » rend l\'ordre de création (ordre historique des dépôts) pour chaque type', () => {
  for (const kind of ['stakeholder', 'need', 'requirement', 'decision', 'risk', 'story', 'test', 'workshop']) {
    const rows = sample(kind);
    assert.deepEqual(codes(sortRows([...rows].reverse(), 'code-asc')), codes(rows), kind);
  }
});

test('projet d\'exemple, Exigences : compteurs initiaux et recherches de la recette (tests 3 à 8)', () => {
  const ex = sample('requirement');
  assert.deepEqual(statusCounts(ex), { all: 8, validated: 6, draft: 2 });
  assert.deepEqual(codes(searchRows(ex, 'recherche')), ['EX-001', 'EX-006']);
  assert.deepEqual(statusCounts(searchRows(ex, 'recherche')), { all: 2, validated: 2 });
  assert.deepEqual(codes(searchRows(ex, 'creneau')), ['EX-003', 'EX-005'], 'accent absent à la saisie ; le second a « créneaux » dans sa description');
  assert.deepEqual(statusCounts(searchRows(ex, 'creneau')), { all: 2, validated: 1, draft: 1 });
  assert.deepEqual(codes(searchRows(ex, '003')), ['EX-003']);
  assert.deepEqual(codes(searchRows(ex, 'salle equipement')), ['EX-001']);
  assert.deepEqual(codes(searchRows(ex, 'zzz')), []);
  assert.deepEqual(codes(filterByStatus(searchRows(ex, 'creneau'), 'draft')), ['EX-005']);
});

test('projet d\'exemple, Exigences : tris de la recette (test 9)', () => {
  const ex = sample('requirement');
  assert.deepEqual(codes(sortRows(ex, 'title-asc')), ['EX-003', 'EX-002', 'EX-008', 'EX-007', 'EX-001', 'EX-006', 'EX-005', 'EX-004']);
  assert.deepEqual(codes(sortRows(ex, 'code-desc')), ['EX-008', 'EX-007', 'EX-006', 'EX-005', 'EX-004', 'EX-003', 'EX-002', 'EX-001']);
});

test('projet d\'exemple, Risques et Parties prenantes : recherches de la recette (tests 11 et 12)', () => {
  const ris = sample('risk');
  assert.deepEqual(statusCounts(ris), { all: 4, identified: 1, mitigating: 1, accepted: 1, archived: 1 });
  const found = searchRows(ris, 'service');
  assert.deepEqual(codes(found), ['RIS-001', 'RIS-004']);
  assert.deepEqual(statusCounts(found), { all: 2, identified: 1, archived: 1 });
  assert.deepEqual(codes(searchRows(sample('stakeholder'), 'service')), ['PP-001', 'PP-002', 'PP-005'], 'ni l\'organisation ni le rôle ne sont cherchés');
});

// ------------------------------------------------------------------ volume (F2-D06)

test('volume : 120 lignes, résultats exacts et rapides', () => {
  const rows: R[] = [];
  for (let i = 1; i <= 120; i++) rows.push(r(`EX-${String(i).padStart(3, '0')}`, i % 3 === 0 ? `Créneau numéro ${i}` : `Élément ${i}`, i % 5 === 0 ? 'à vérifier' : '', i % 4 === 0 ? 'archived' : 'draft', `2026-11-${String((i % 28) + 1).padStart(2, '0')}T10:00:00.000Z`));
  const t0 = Date.now();
  const found = searchRows(rows, 'creneau');
  assert.equal(found.length, 40);
  assert.equal(searchRows(rows, 'creneau verifier').length, 8, 'multiples de 3 et de 5 : 8 entre 1 et 120');
  assert.equal(statusCounts(found).all, 40);
  assert.equal(sortRows(rows, 'title-asc').length, 120);
  assert.deepEqual(codes(sortRows([...rows].reverse(), 'code-asc')), codes(rows));
  assert.ok(Date.now() - t0 < 1000, 'moins d\'une seconde pour 120 lignes');
});

// ------------------------------------------------------------------ structure (R4, branchement)

const read = (path: string): string => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('structure : la logique partagée n\'importe rien (R4) et le composant générique n\'importe pas la couche data', () => {
  const logic = read('src/shared/register-logic.ts');
  assert.ok(!/^import /m.test(logic), 'register-logic.ts ne dépend de rien');
  assert.ok(!/from '\.\.\/data\//.test(read('src/shared/register-screen.tsx')));
  assert.ok(!/from '\.\.\/data\//.test(read('src/shared/ui.tsx')));
});

test('branchement : l\'écran générique cherche, compte, filtre puis trie dans cet ordre, et vide la recherche au changement de projet', () => {
  const src = read('src/shared/register-screen.tsx');
  const iSearch = src.indexOf('searchRows(rows, query)');
  const iCounts = src.indexOf('statusCounts(searched)');
  const iVisible = src.indexOf('sortRows(filterByStatus(searched, filter), sort)');
  assert.ok(iSearch >= 0 && iCounts > iSearch && iVisible > iCounts, 'ordre : recherche, compteurs sur son résultat, puis filtre de statut, puis tri (le filtre est appliqué avant le tri)');
  assert.match(src, /setQuery\(''\)/, 'la recherche est vidée');
  assert.match(src, /useState<SortKey>\(DEFAULT_SORT\)/, 'tri par défaut = code croissant');
  assert.match(src, /total=\{rows\.length\}/, 'le total reste celui du registre entier');
});

test('branchement : les huit listes utilisent le composant commun de contrôle et la notice de liste vide', () => {
  const views: Array<[string, number]> = [
    ['src/modules/stakeholders/StakeholdersView.tsx', 1], ['src/modules/analysis/AnalysisView.tsx', 2], ['src/modules/decisions/DecisionsView.tsx', 1], ['src/modules/risks/RisksView.tsx', 1],
    ['src/modules/stories/StoriesView.tsx', 1], ['src/modules/testcases/TestsView.tsx', 1], ['src/modules/workshops/WorkshopsView.tsx', 1],
  ];
  let total = 0;
  for (const [file, n] of views) {
    const src = read(file);
    assert.equal(src.match(/<ListControls /g)?.length ?? 0, n, `${file} : ListControls`);
    assert.equal(src.match(/<EmptyListNotice /g)?.length ?? 0, n, `${file} : EmptyListNotice`);
    assert.ok(!/<StatusFilterBar /.test(src), `${file} n'utilise plus la barre de filtre seule`);
    total += n;
  }
  assert.equal(total, 8);
});
