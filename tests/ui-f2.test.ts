// Lot F2 : rendu statique de la barre de recherche, de tri et des compteurs sur les huit listes de registre (décisions F2-D01 à F2-D04).
// Aucun clic ni saisie n'est simulé : taper dans le champ et changer le tri se vérifient à la recette sur clé (TESTS-F2.md). Si esbuild est introuvable, les rendus sont « ignorés ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRender } from './helpers/ui-loader.ts';

type ListFn = (p: { rows: unknown[]; total: number; filter: string; query?: string }) => string;
interface Render { needList: ListFn; reqList: ListFn; decList: ListFn; riskList: ListFn; storyList: ListFn; testList: ListFn; wsList: ListFn; list: ListFn }

const render = loadRender<Render>();
const ui = (name: string, fn: (r: Render) => void) => test(name, { skip: render === null ? 'esbuild introuvable : rendu des écrans non vérifié' : false }, () => fn(render as Render));

const LISTS: Array<[string, keyof Render]> = [
  ['besoins', 'needList'], ['exigences', 'reqList'], ['décisions', 'decList'], ['risques', 'riskList'],
  ['user stories', 'storyList'], ['tests', 'testList'], ['ateliers', 'wsList'], ['parties prenantes', 'list'],
];

ui('rendu : les huit listes portent le champ de recherche, le tri à quatre modes et les compteurs', (r) => {
  assert.equal(LISTS.length, 8);
  for (const [name, fn] of LISTS) {
    const html = r[fn]({ rows: [], total: 0, filter: 'all' });
    assert.match(html, /<label[^>]*for="register-search"[^>]*>Rechercher</, `${name} : libellé de la recherche`);
    assert.match(html, /<input id="register-search"[^>]*value=""/, `${name} : champ vide`);
    assert.match(html, /role="search"/, `${name} : zone de recherche`);
    assert.match(html, /<label[^>]*for="register-sort"[^>]*>Trier par</, `${name} : libellé du tri`);
    for (const t of ['>Code croissant<', '>Code décroissant<', '>Titre de A à Z<', '>Modifié récemment<']) assert.ok(html.includes(t), `${name} : ${t}`);
    assert.match(html, /<option value="code-asc" selected=""/, `${name} : tri par défaut = code croissant`);
    assert.match(html, /aria-pressed="true"[^>]*>Tou(?:s|tes) \(0\)</, `${name} : compteur « Tous » (« Toutes » au féminin)`);
    assert.ok(!html.includes('>Effacer<'), `${name} : pas de bouton Effacer sans texte`);
  }
});

ui('rendu : sans recherche, les messages de liste vide d\'origine sont inchangés', (r) => {
  assert.match(r.reqList({ rows: [], total: 0, filter: 'all' }), /Aucune exigence dans ce projet/);
  assert.match(r.reqList({ rows: [], total: 3, filter: 'archived' }), /Aucune exigence « Archivé » : 3 au total/);
  assert.match(r.list({ rows: [], total: 0, filter: 'all' }), /Aucune partie prenante dans ce projet/);
  assert.ok(!r.reqList({ rows: [], total: 3, filter: 'archived' }).includes('Aucun résultat'));
});

ui('rendu : recherche sans résultat : message dédié, texte tapé conservé, bouton Effacer, liste vide', (r) => {
  for (const [name, fn] of LISTS) {
    const html = r[fn]({ rows: [], total: 8, filter: 'all', query: 'zzz' });
    assert.ok(html.includes('Aucun résultat pour « zzz » (8 au total dans ce projet).'), `${name} : message de recherche`);
    assert.match(html, /<input id="register-search"[^>]*value="zzz"/, `${name} : texte conservé`);
    assert.ok(html.includes('>Effacer<'), `${name} : bouton Effacer`);
    assert.ok(!html.includes('<table'), `${name} : aucune ligne`);
    assert.ok(!/Aucun[e]? [a-zé ]+ dans ce projet\./.test(html), `${name} : le message de registre vide n'apparaît pas`);
  }
});

ui('rendu : recherche sans résultat avec un filtre de statut actif : le statut est nommé', (r) => {
  assert.ok(r.needList({ rows: [], total: 4, filter: 'draft', query: 'zzz' }).includes('Aucun résultat pour « zzz » parmi les éléments « Brouillon » (4 au total dans ce projet).'));
  assert.ok(r.list({ rows: [], total: 4, filter: 'archived', query: 'zzz' }).includes('parmi les éléments « Archivé »'));
  assert.ok(r.wsList({ rows: [], total: 2, filter: 'planned', query: 'zzz' }).includes('parmi les éléments « Planifié »'));
});

ui('rendu : le texte cherché est échappé dans le champ et dans le message', (r) => {
  const html = r.riskList({ rows: [], total: 1, filter: 'all', query: '<b>"x"</b>' });
  assert.ok(!html.includes('<b>"x"</b>'));
  assert.ok(html.includes('&lt;b&gt;&quot;x&quot;&lt;/b&gt;'));
});

ui('rendu : compteurs par statut sur les exigences (archivés inclus dans « Tous », statut vide = 0)', (r) => {
  const row = (id: number, status: string) => ({ id, code: `EX-00${id}`, title: `Titre ${id}`, description: '', status, nature: 'functional', priority: 'must', criteria: '' });
  const html = r.reqList({ rows: [row(1, 'draft'), row(2, 'draft'), row(3, 'validated')], total: 3, filter: 'all' });
  for (const t of ['>Tous (3)<', '>Brouillon (2)<', '>Validé (1)<', '>Rejeté (0)<', '>Archivé (0)<']) assert.ok(html.includes(t), t);
  const withArchived = r.reqList({ rows: [row(1, 'draft'), row(2, 'archived')], total: 2, filter: 'all' });
  assert.ok(withArchived.includes('>Tous (2)<') && withArchived.includes('>Archivé (1)<'));
});
