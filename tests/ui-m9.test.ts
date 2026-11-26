// Lot M9, étape 4 : bouton « Créer le projet d'exemple » dans l'écran Projets (logique pure, rendu statique, branchement).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadRender } from './helpers/ui-loader.ts';
import { hasSampleProject, sampleCreatedMessage } from '../src/modules/projects/logic.ts';
import { SAMPLE_PROJECT_NAME } from '../src/domain/sample-project.ts';

interface Render {
  projects: (p: { rows: Array<{ id: number; parent_id: number | null; kind: string; name: string }>; activeId: number | null; renamingId: number | null; confirm: { id: number; message: string } | null; newError: string; sampleExists?: boolean; info?: string }) => string;
}
const render = loadRender<Render>();
const ui = (name: string, fn: (r: Render) => void) => test(name, { skip: render === null ? 'esbuild introuvable : rendu des écrans non vérifié' : false }, () => fn(render as Render));
const ROWS = [{ id: 1, parent_id: null, kind: 'project', name: 'Alpha' }];

test('détection : seul un projet (pas un dossier ni une archive) portant exactement le nom de l\'exemple compte', () => {
  const p = (kind: string, name: string) => ({ id: 1, parent_id: null, kind, name });
  assert.equal(hasSampleProject([], SAMPLE_PROJECT_NAME), false);
  assert.equal(hasSampleProject([p('project', 'Alpha')], SAMPLE_PROJECT_NAME), false);
  assert.equal(hasSampleProject([p('project', SAMPLE_PROJECT_NAME)], SAMPLE_PROJECT_NAME), true);
  assert.equal(hasSampleProject([p('folder', SAMPLE_PROJECT_NAME), p('archive', SAMPLE_PROJECT_NAME)], SAMPLE_PROJECT_NAME), false);
  assert.equal(hasSampleProject([p('project', SAMPLE_PROJECT_NAME + ' (copie)')], SAMPLE_PROJECT_NAME), false);
});

test('message de réussite : annonce les volumes et que le projet est actif', () => {
  assert.equal(sampleCreatedMessage({ items: 38, links: 52 }), 'Projet d\'exemple créé : 38 éléments et 52 liens. Il est maintenant le projet actif.');
});

ui('écran Projets : bouton actif quand aucun exemple n\'existe, description visible, aucun message d\'état', (r) => {
  const html = r.projects({ rows: ROWS, activeId: 1, renamingId: null, confirm: null, newError: '' });
  assert.match(html, /Projet d&#x27;exemple|Projet d'exemple/);
  assert.match(html, /portail de réservation de salles/);
  const button = html.match(/<button[^>]*>Créer le projet d(?:&#x27;|')exemple<\/button>/);
  assert.ok(button, 'bouton présent');
  assert.ok(!/disabled=""/.test(button[0]), 'bouton actif');
  assert.ok(!html.includes('existe déjà'));
  assert.ok(!html.includes('role="status"'));
});

ui('écran Projets : si l\'exemple existe, le bouton est inactif et l\'explication est donnée', (r) => {
  const html = r.projects({ rows: ROWS, activeId: 1, renamingId: null, confirm: null, newError: '', sampleExists: true });
  const button = html.match(/<button[^>]*>Créer le projet d(?:&#x27;|')exemple<\/button>/);
  assert.ok(button && /disabled=""/.test(button[0]));
  assert.match(html, /existe déjà : activez-le dans la liste ci-dessous, ou supprimez-le pour le recréer/);
});

ui('écran Projets : le message de réussite est annoncé comme un statut, et le formulaire de création de projet reste en place', (r) => {
  const html = r.projects({ rows: ROWS, activeId: 1, renamingId: null, confirm: null, newError: '', info: 'Projet d\'exemple créé : 38 éléments et 52 liens. Il est maintenant le projet actif.' });
  assert.match(html, /role="status"[^>]*>Projet d(?:&#x27;|')exemple créé : 38 éléments et 52 liens/);
  assert.match(html, /Nouveau projet/);
  assert.match(html, />Créer</);
});

test('branchement : l\'écran appelle le générateur, active le projet créé, annonce le résultat ; il n\'y a pas de création automatique', () => {
  const screen = fs.readFileSync(new URL('../src/modules/projects/ProjectsScreen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /createSampleProject\(\)/);
  assert.match(screen, /props\.onChanged\(done\.projectId\)/);
  assert.match(screen, /sampleCreatedMessage\(done\)/);
  assert.match(screen, /hasSampleProject\(props\.projects, SAMPLE_PROJECT_NAME\)/);
  const app = fs.readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
  assert.ok(!app.includes('createSampleProject'), 'rien n\'est injecté au démarrage : seul le bouton déclenche la création (D107)');
  const main = fs.readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.ok(!main.includes('createSampleProject'));
});
