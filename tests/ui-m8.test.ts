// Lot M8 : logique pure de l'écran Livrables, rendu statique, branchement (décisions D88 à D97).
// Aucun clic ni saisie n'est simulé : ces comportements se vérifient à la recette sur clé. Si esbuild est introuvable, les rendus sont « ignorés ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadRender } from './helpers/ui-loader.ts';
import { DEFAULT_MODEL, MODEL_OPTIONS, NO_WORKSHOP_VALUE, archiveNote, exportedMessage, modelOf, selectionProblem, workshopChoices } from '../src/modules/deliverables/logic.ts';
import { MODELS, modelInfo } from '../src/export/deliverables/models.ts';
import { NAV_SECTIONS, SCREENS } from '../src/app/navigation.ts';
import type { DItem } from '../src/domain/project-data.ts';

const w = (id: number, code: string, title: string, status: string): DItem => ({ id, kind: 'workshop', code, title, status, description: '', d: {} });

// ------------------------------------------------------------------ logique pure

test('menu : « Livrables » termine la section Pilotage (D91), quinze écrans depuis F4', () => {
  const pilotage = NAV_SECTIONS.find((s) => s.title === 'Pilotage');
  assert.deepEqual(pilotage?.screens.map((s) => s.label), ['Décisions', 'Risques', 'Livrables']);
  assert.equal(SCREENS.length, 15);
  assert.equal(SCREENS.find((s) => s.id === 'deliverables')?.label, 'Livrables');
});

test('écran livrables : modèles dans l\'ordre du catalogue, modèle par défaut sans atelier requis', () => {
  assert.deepEqual(MODEL_OPTIONS.map((o) => o.value), MODELS.map((m) => m.id));
  assert.deepEqual(MODEL_OPTIONS.map((o) => o.label), MODELS.map((m) => m.label));
  assert.equal(DEFAULT_MODEL, 'requirements');
  assert.equal(modelInfo(DEFAULT_MODEL)?.needsWorkshop, false);
  assert.equal(modelOf('workshop-report')?.needsWorkshop, true);
  assert.equal(modelOf('x'), null);
});

test('écran livrables : choix d\'atelier (tous, archivés compris, par code), libellé avec statut', () => {
  const items: DItem[] = [w(2, 'ATL-010', 'Dixième', 'archived'), w(1, 'ATL-002', 'Deuxième', 'held'), { ...w(3, 'EX-001', 'Pas un atelier', 'draft'), kind: 'requirement' }, w(4, 'ATL-001', 'Premier', 'planned')];
  const c = workshopChoices(items);
  assert.deepEqual(c.map((x) => x.value), [NO_WORKSHOP_VALUE, '4', '1', '2'], 'ordre numérique des codes, aucun autre type');
  assert.deepEqual(c.map((x) => x.label), ['— Choisir un atelier —', 'ATL-001 — Premier (Planifié)', 'ATL-002 — Deuxième (Tenu)', 'ATL-010 — Dixième (Archivé)']);
  assert.deepEqual(workshopChoices([]).map((x) => x.value), [NO_WORKSHOP_VALUE]);
});

test('écran livrables : ce qui empêche de générer', () => {
  const report = modelOf('workshop-report');
  const reg = modelOf('requirements');
  assert.equal(selectionProblem(null, '', 0), 'Choisissez un modèle de livrable.');
  assert.match(selectionProblem(report, '', 0), /aucun atelier : créez-en un dans l'écran Ateliers/);
  assert.equal(selectionProblem(report, NO_WORKSHOP_VALUE, 2), 'Choisissez un atelier.');
  assert.equal(selectionProblem(report, '4', 2), '');
  assert.equal(selectionProblem(reg, '', 0), '', 'un registre n\'a pas besoin d\'atelier');
});

test('écran livrables : note sous la case « archivés ou rejetés », message d\'export', () => {
  assert.match(archiveNote(modelOf('requirements')), /seuls les éléments actifs/);
  assert.match(archiveNote(modelOf('traceability')), /Sans effet sur la matrice de traçabilité/);
  assert.equal(exportedMessage('Word', 'a.docx', '1,2 Ko', 'C:\\x\\a.docx'), 'Export Word créé : a.docx (1,2 Ko). Emplacement : C:\\x\\a.docx');
});

test('branchement : l\'écran appelle la lecture et l\'export, l\'application rend l\'écran et passe la demande de la fiche atelier (D92)', () => {
  const screen = fs.readFileSync(new URL('../src/modules/deliverables/DeliverablesScreen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /loadProjectData\(projectId\)/);
  assert.match(screen, /exportGeneratedToFile\(projectId, model\.id, format/);
  assert.match(screen, /onPresetHandled\?\.\(\)/);
  assert.ok(!/mutate|INSERT|UPDATE|DELETE/.test(screen), 'l\'écran n\'écrit rien');
  const app = fs.readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /screen === 'deliverables'/);
  assert.match(app, /onExportReport=\{exportWorkshopReport\}/);
  assert.match(app, /setDeliverablePreset\(\{ modelId: 'workshop-report', workshopId \}\)/);
  assert.match(app, /setDeliverablePreset\(null\);\n/, 'une navigation par le menu efface la demande');
  const ws = fs.readFileSync(new URL('../src/modules/workshops/WorkshopsScreen.tsx', import.meta.url), 'utf8');
  assert.match(ws, /onExportReport \? \(\) => onExportReport\(row\.id\) : undefined/, 'le bouton n\'existe que si l\'application fournit l\'action');
});

// ------------------------------------------------------------------ rendu statique

interface ViewProps {
  projectName: string;
  modelId: string;
  model: ReturnType<typeof modelInfo>;
  workshopOptions: Array<{ value: string; label: string }>;
  workshopId: string;
  includeArchived: boolean;
  askWhere: boolean;
  busy: boolean;
  problem: string;
  preview: string;
  message: { level: 'ok' | 'error'; text: string } | null;
}
interface WsRow { id: number; code: string; title: string; description: string; status: string; held_on: string; place: string; objective: string; notes: string; follow_up: string }
interface Render {
  shell: (p: { navigable: boolean; screen: string; projects: Array<{ id: number; name: string }>; activeId: number | null }) => string;
  deliverables: (p: ViewProps) => string;
  wsDetail: (p: { row: WsRow; confirm: string | null; error: string; withExport?: boolean }) => string;
}
const render = loadRender<Render>();
const ui = (name: string, fn: (r: Render) => void) => test(name, { skip: render === null ? 'esbuild introuvable : rendu des écrans non vérifié' : false }, () => fn(render as Render));

const base = (over: Partial<ViewProps> = {}): ViewProps => ({
  projectName: 'Projet <CRP>', modelId: 'requirements', model: modelInfo('requirements'), workshopOptions: workshopChoices([]), workshopId: '', includeArchived: false, askWhere: false, busy: false, problem: '', preview: '', message: null, ...over,
});

ui('rendu : le menu place « Livrables » dans Pilotage, après les risques', (r) => {
  const html = r.shell({ navigable: true, screen: 'deliverables', projects: [{ id: 1, name: 'A' }], activeId: 1 });
  assert.match(html, /aria-current="page"[^>]*>Livrables</);
  assert.ok(html.indexOf('>Pilotage<') < html.indexOf('>Risques<') && html.indexOf('>Risques<') < html.indexOf('>Livrables<') && html.indexOf('>Livrables<') < html.indexOf('>Réalisation<'));
});

ui('rendu : écran livrables (modèle, description, trois formats, échappement du nom de projet, pas d\'aperçu vide)', (r) => {
  const html = r.deliverables(base());
  for (const t of ['Modèle de livrable', 'Registre des exigences', 'Backlog des user stories', 'Cahier de recette', 'Matrice de traçabilité', "Compte rendu d&#x27;atelier", 'Exporter en Markdown', 'Exporter en HTML', 'Exporter en Word', 'Inclure les éléments archivés ou rejetés', 'Choisir l&#x27;emplacement', 'Projet &lt;CRP&gt;', 'Rien n&#x27;est enregistré dans la base']) assert.ok(html.includes(t), t);
  assert.ok(!html.includes('Projet <CRP>'));
  assert.ok(!html.includes('Aperçu'), 'pas d\'aperçu quand il n\'y a rien à montrer');
  assert.ok(!html.includes('id="dl-workshop"'), 'pas de choix d\'atelier pour un registre');
  assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>Exporter en/, 'boutons actifs quand tout est prêt');
});

ui('rendu : compte rendu — choix d\'atelier, boutons bloqués tant qu\'il manque l\'atelier, message d\'explication', (r) => {
  const items = [w(1, 'ATL-001', 'Recueil', 'held')];
  const html = r.deliverables(base({ modelId: 'workshop-report', model: modelInfo('workshop-report'), workshopOptions: workshopChoices(items), problem: 'Choisissez un atelier.' }));
  assert.ok(html.includes('id="dl-workshop"') && html.includes('ATL-001 — Recueil (Tenu)') && html.includes('Choisissez un atelier.'));
  assert.equal((html.match(/<button[^>]*disabled=""[^>]*>Exporter en/g) ?? []).length, 3, 'les trois boutons sont bloqués');
});

ui('rendu : traçabilité — la case des archivés est inactive et expliquée', (r) => {
  const html = r.deliverables(base({ modelId: 'traceability', model: modelInfo('traceability') }));
  assert.match(html, /<input[^>]*id="dl-archived"[^>]*disabled=""|<input[^>]*disabled=""[^>]*id="dl-archived"/);
  assert.ok(html.includes('Sans effet sur la matrice de traçabilité'));
  assert.doesNotMatch(r.deliverables(base()), /<input[^>]*id="dl-archived"[^>]*disabled/, 'active pour un registre');
});

ui('rendu : aperçu échappé, message de réussite ou d\'erreur, occupation', (r) => {
  const html = r.deliverables(base({ preview: '# Titre <script>x</script>\n| a | b |', message: { level: 'ok', text: 'Export Word créé : a.docx' } }));
  assert.ok(html.includes('Aperçu (Markdown généré)') && html.includes('&lt;script&gt;x&lt;/script&gt;') && !html.includes('<script>x'));
  assert.match(html, /role="status"[^>]*>Export Word créé : a\.docx</);
  assert.match(r.deliverables(base({ message: { level: 'error', text: 'Panne <x>' } })), /role="alert"[^>]*>Panne &lt;x&gt;</);
  assert.equal((r.deliverables(base({ busy: true })).match(/<button[^>]*disabled=""[^>]*>Exporter en/g) ?? []).length, 3, 'pendant un export, les boutons sont bloqués');
});

ui('rendu : fiche atelier — le bouton « Exporter le compte rendu » n\'existe que si l\'application le branche', (r) => {
  const row: WsRow = { id: 1, code: 'ATL-001', title: 'A', description: '', status: 'held', held_on: '', place: '', objective: '', notes: '', follow_up: '' };
  assert.ok(r.wsDetail({ row, confirm: null, error: '', withExport: true }).includes('Exporter le compte rendu'));
  assert.ok(!r.wsDetail({ row, confirm: null, error: '' }).includes('Exporter le compte rendu'));
});
