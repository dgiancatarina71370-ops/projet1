// Lot M8 : logique pure de l'écran Livrables, rendu statique, branchement (décisions D88 à D97).
// Aucun clic ni saisie n'est simulé : ces comportements se vérifient à la recette sur clé. Si esbuild est introuvable, les rendus sont « ignorés ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadRender } from './helpers/ui-loader.ts';
import { DEFAULT_MODEL, MODEL_OPTIONS, NO_WORKSHOP_VALUE, archiveNote, modelOf, savedMessage, selectionProblem, workshopChoices } from '../src/modules/deliverables/logic.ts';
import { MODELS, modelInfo } from '../src/export/deliverables/models.ts';
import { NAV_SECTIONS, SCREENS } from '../src/app/navigation.ts';
import type { DItem } from '../src/domain/project-data.ts';

const w = (id: number, code: string, title: string, status: string): DItem => ({ id, kind: 'workshop', code, title, status, description: '', d: {} });

// ------------------------------------------------------------------ logique pure

test('menu : « Livrables » puis « Documents » terminent la section Pilotage (D91, F5-D01), seize écrans depuis F5', () => {
  const pilotage = NAV_SECTIONS.find((s) => s.title === 'Pilotage');
  assert.deepEqual(pilotage?.screens.map((s) => s.label), ['Décisions', 'Risques', 'Livrables', 'Documents']);
  assert.equal(SCREENS.length, 16);
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

test('écran livrables : note sous la case « archivés ou rejetés », messages d\'enregistrement (F5-D05)', () => {
  assert.match(archiveNote(modelOf('requirements')), /seuls les éléments actifs/);
  assert.match(archiveNote(modelOf('traceability')), /Sans effet sur la matrice de traçabilité/);
  assert.equal(savedMessage({ outcome: 'created', version: 1, replacedVersion: null }), 'Document enregistré : version 1 (brouillon).');
  assert.equal(savedMessage({ outcome: 'created', version: 2, replacedVersion: 1 }), 'Version 2 enregistrée ; la version 1 est remplacée.');
  assert.equal(savedMessage({ outcome: 'identical', version: 3 }), 'Contenu identique à la version 3 : aucune nouvelle version.');
});

test('branchement : l\'écran appelle la lecture et l\'enregistrement (plus d\'export direct, F5-D10), l\'application rend l\'écran et passe la demande de la fiche atelier (D92)', () => {
  const screen = fs.readFileSync(new URL('../src/modules/deliverables/DeliverablesScreen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /loadProjectData\(projectId\)/);
  assert.match(screen, /saveDeliverable\(projectId, model\.id,/);
  assert.ok(!/exportGeneratedToFile|exportDocumentToFile/.test(screen), 'plus d\'export depuis Livrables');
  assert.match(screen, /onPresetHandled\?\.\(\)/);
  assert.ok(!/mutate|INSERT|UPDATE|DELETE/.test(screen), 'l\'écran n\'écrit pas lui-même : l\'écriture passe par le service et le dépôt');
  const app = fs.readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /screen === 'deliverables'/);
  assert.match(app, /screen === 'documents'/);
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
  busy: boolean;
  savedDocumentId: number | null;
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
  projectName: 'Projet <CRP>', modelId: 'requirements', model: modelInfo('requirements'), workshopOptions: workshopChoices([]), workshopId: '', includeArchived: false, busy: false, savedDocumentId: null, problem: '', preview: '', message: null, ...over,
});

ui('rendu : le menu place « Livrables » dans Pilotage, après les risques', (r) => {
  const html = r.shell({ navigable: true, screen: 'deliverables', projects: [{ id: 1, name: 'A' }], activeId: 1 });
  assert.match(html, /aria-current="page"[^>]*>Livrables</);
  assert.ok(html.indexOf('>Pilotage<') < html.indexOf('>Risques<') && html.indexOf('>Risques<') < html.indexOf('>Livrables<') && html.indexOf('>Livrables<') < html.indexOf('>Documents<') && html.indexOf('>Documents<') < html.indexOf('>Réalisation<'));
});

ui('rendu : écran livrables (modèle, description, bouton d\'enregistrement, échappement du nom de projet, pas d\'aperçu vide)', (r) => {
  const html = r.deliverables(base());
  for (const t of ['Modèle de livrable', 'Registre des exigences', 'Backlog des user stories', 'Cahier de recette', 'Matrice de traçabilité', "Compte rendu d&#x27;atelier", 'Enregistrer comme document', 'Inclure les éléments archivés ou rejetés', 'Projet &lt;CRP&gt;', 'depuis l&#x27;écran Documents']) assert.ok(html.includes(t), t);
  assert.ok(!html.includes('Projet <CRP>'));
  assert.ok(!html.includes('Aperçu'), 'pas d\'aperçu quand il n\'y a rien à montrer');
  assert.ok(!html.includes('id="dl-workshop"'), 'pas de choix d\'atelier pour un registre');
  assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>Enregistrer comme document/, 'bouton actif quand tout est prêt');
  for (const t of ['Exporter en', 'Choisir l&#x27;emplacement']) assert.ok(!html.includes(t), `plus de ${t} dans Livrables`);
  assert.ok(!html.includes('Ouvrir dans Documents'), 'pas de bouton d\'ouverture avant un enregistrement');
});

ui('rendu : compte rendu — choix d\'atelier, bouton bloqué tant qu\'il manque l\'atelier, message d\'explication', (r) => {
  const items = [w(1, 'ATL-001', 'Recueil', 'held')];
  const html = r.deliverables(base({ modelId: 'workshop-report', model: modelInfo('workshop-report'), workshopOptions: workshopChoices(items), problem: 'Choisissez un atelier.' }));
  assert.ok(html.includes('id="dl-workshop"') && html.includes('ATL-001 — Recueil (Tenu)') && html.includes('Choisissez un atelier.'));
  assert.match(html, /<button[^>]*disabled=""[^>]*>Enregistrer comme document/, 'le bouton est bloqué');
});

ui('rendu : traçabilité — la case des archivés est inactive et expliquée', (r) => {
  const html = r.deliverables(base({ modelId: 'traceability', model: modelInfo('traceability') }));
  assert.match(html, /<input[^>]*id="dl-archived"[^>]*disabled=""|<input[^>]*disabled=""[^>]*id="dl-archived"/);
  assert.ok(html.includes('Sans effet sur la matrice de traçabilité'));
  assert.doesNotMatch(r.deliverables(base()), /<input[^>]*id="dl-archived"[^>]*disabled/, 'active pour un registre');
});

ui('rendu : aperçu échappé, message de réussite ou d\'erreur, occupation', (r) => {
  const html = r.deliverables(base({ preview: '# Titre <script>x</script>\n| a | b |', message: { level: 'ok', text: 'Document enregistré : version 1 (brouillon).' }, savedDocumentId: 7 }));
  assert.ok(html.includes('Aperçu (Markdown généré)') && html.includes('&lt;script&gt;x&lt;/script&gt;') && !html.includes('<script>x'));
  assert.match(html, /role="status"[^>]*>Document enregistré : version 1 \(brouillon\)\.</);
  assert.ok(html.includes('Ouvrir dans Documents'), 'le bouton d\'ouverture apparaît après un enregistrement');
  assert.match(r.deliverables(base({ message: { level: 'error', text: 'Panne <x>' } })), /role="alert"[^>]*>Panne &lt;x&gt;</);
  assert.match(r.deliverables(base({ busy: true })), /<button[^>]*disabled=""[^>]*>Enregistrer comme document/, 'pendant un enregistrement, le bouton est bloqué');
});

ui('rendu : fiche atelier — le bouton « Exporter le compte rendu » n\'existe que si l\'application le branche', (r) => {
  const row: WsRow = { id: 1, code: 'ATL-001', title: 'A', description: '', status: 'held', held_on: '', place: '', objective: '', notes: '', follow_up: '' };
  assert.ok(r.wsDetail({ row, confirm: null, error: '', withExport: true }).includes('Exporter le compte rendu'));
  assert.ok(!r.wsDetail({ row, confirm: null, error: '' }).includes('Exporter le compte rendu'));
});
