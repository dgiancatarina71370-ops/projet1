// Lot F3 : rendu statique de l'écran Accueil (décisions F3-D01 à F3-D07). Aucun clic simulé : les boutons, la navigation et l'heure locale se vérifient
// à la recette sur clé (TESTS-F3.md). Si esbuild est introuvable, les rendus sont « ignorés ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRender } from './helpers/ui-loader.ts';
import { SAMPLE_ITEMS, SAMPLE_LINKS } from '../src/domain/sample-project.ts';
import { computeTraceability } from '../src/domain/traceability.ts';
import type { TraceItem, TraceLink } from '../src/domain/traceability.ts';
import { activityLine } from '../src/modules/home/logic.ts';
import type { ActivityLine } from '../src/modules/home/logic.ts';

type HomeProps = { projectName: string; summary: unknown; ignored: number; orphans: unknown; drafts: { need: number; requirement: number; story: number }; activity: ActivityLine[] };
interface Render { home: (p: HomeProps) => string; shell: (p: { navigable: boolean; screen: string; projects: Array<{ id: number; name: string }>; activeId: number | null }) => string; analysisNoProject: (what: string) => string }

const render = loadRender<Render>();
const ui = (name: string, fn: (r: Render) => void) => test(name, { skip: render === null ? 'esbuild introuvable : rendu des écrans non vérifié' : false }, () => fn(render as Render));

const ids = new Map(SAMPLE_ITEMS.map((s, i) => [s.key, i + 1]));
const items: TraceItem[] = SAMPLE_ITEMS.map((s) => ({ id: ids.get(s.key) as number, kind: s.kind, code: s.key, title: s.title, status: s.status, priority: (s.fields as { priority?: string }).priority }));
const links: TraceLink[] = SAMPLE_LINKS.map((l) => ({ type: l.type, fromId: ids.get(l.from) as number, toId: ids.get(l.to) as number }));
const sample = computeTraceability(items, links);
const empty = computeTraceability([], []);

const act = (over: Partial<Parameters<typeof activityLine>[0]>): ActivityLine => activityLine({ id: 1, object_id: 5, at: '2026-11-27T14:08:09.000Z', action: 'created', detail: 'requirement', kind: 'requirement', code: 'EX-009', title: 'Test F3', ...over });

ui('rendu accueil : projet d\'exemple = couverture, 6 orphelins, brouillons 0/2/2', (r) => {
  const html = r.home({ projectName: 'Exemple', summary: sample.summary, ignored: sample.ignored, orphans: sample.orphans, drafts: { need: 0, requirement: 2, story: 2 }, activity: [] });
  for (const [label, value] of [['Parties prenantes avec un besoin', '5 sur 5'], ['Besoins avec une exigence', '4 sur 4'], ['Exigences avec une user story', '5 sur 8'], ['Exigences testées', '7 sur 8'], ['Exigences dont le résultat est Réussi', '4 sur 8'], ['Exigences Indispensable \\(Must\\) testées', '4 sur 4']]) {
    assert.match(html, new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>${value}</dd>`), `${label} : ${value}`);
  }
  assert.ok(html.includes('Voir la traçabilité'));
  assert.ok(html.includes('>6 orphelins<'));
  assert.ok(html.includes('Voir les orphelins'));
  assert.match(html, /Besoins<\/button><span[^>]*>0</);
  assert.match(html, /Exigences<\/button><span[^>]*>2</);
  assert.match(html, /User stories<\/button><span[^>]*>2</);
  assert.ok(html.includes('Seuls les types qui ont un statut Brouillon sont comptés'));
  assert.ok(html.includes('Aucune modification d’élément dans ce projet.'), 'journal vide : message');
  assert.ok(!html.includes('élément archivé'), 'aucun élément ignoré : pas de phrase');
});

ui('rendu accueil : projet vide = « — » partout, aucun orphelin (sans bouton), brouillons à zéro', (r) => {
  const html = r.home({ projectName: 'Vide', summary: empty.summary, ignored: 0, orphans: empty.orphans, drafts: { need: 0, requirement: 0, story: 0 }, activity: [] });
  assert.equal((html.match(/>—</g) ?? []).length, 6, 'six couvertures sans objet');
  assert.ok(html.includes('Aucun orphelin'));
  assert.ok(!html.includes('Voir les orphelins'), 'pas de bouton sans orphelin');
  assert.ok(!html.includes('sur 0'));
});

ui('rendu accueil : orphelin au singulier et éléments ignorés', (r) => {
  const one = computeTraceability([{ id: 1, kind: 'stakeholder', code: 'PP-001', title: 'P', status: 'active' }, { id: 2, kind: 'need', code: 'BES-001', title: 'B', status: 'archived' }], []);
  const html = r.home({ projectName: 'P', summary: one.summary, ignored: one.ignored, orphans: one.orphans, drafts: { need: 0, requirement: 0, story: 0 }, activity: [] });
  assert.ok(html.includes('>1 orphelin<'));
  assert.ok(html.includes('1 élément archivé ou rejeté ignoré dans le calcul.'));
});

ui('rendu accueil : lignes de modification (verbe, code cliquable, supprimé sans code ni bouton)', (r) => {
  const activity = [
    act({ id: 4, action: 'deleted', detail: 'risk', kind: null, code: null, title: null, object_id: 3 }),
    act({ id: 3, action: 'status_changed', detail: 'draft>validated' }),
    act({ id: 2, action: 'updated', detail: 'title', title: 'Titre modifié' }),
    act({ id: 1, action: 'created' }),
  ];
  const html = r.home({ projectName: 'P', summary: sample.summary, ignored: 0, orphans: sample.orphans, drafts: { need: 0, requirement: 0, story: 0 }, activity });
  assert.equal((html.match(/<li class="flex flex-wrap/g) ?? []).length, 4);
  assert.ok(html.includes('Risque supprimé'));
  assert.ok(html.includes('statut : Brouillon → Validé'));
  assert.ok(html.includes('· modifié') && html.includes('· créé'));
  assert.equal((html.match(/>EX-009</g) ?? []).length, 3, 'trois lignes cliquables, la suppression n\'en a pas');
  assert.ok(html.indexOf('Risque supprimé') < html.indexOf('statut : Brouillon'), 'ordre reçu conservé (le plus récent d\'abord)');
  assert.match(html, /\d{2}\/\d{2}\/2026 \d{2}:\d{2}:\d{2}/);
});

ui('rendu menu : Accueil premier, surligné quand il est affiché', (r) => {
  const html = r.shell({ navigable: true, screen: 'home', projects: [{ id: 1, name: 'P' }], activeId: 1 });
  const first = html.indexOf('>Accueil<');
  assert.ok(first > 0 && first < html.indexOf('>Projets<'), 'Accueil avant Projets');
  assert.match(html, /aria-current="page"[^>]*>Accueil</);
  assert.ok(!html.includes('aria-current="page" class="w-full rounded px-3 py-1.5 text-left text-sm text-hub-fg">Projets'));
});
