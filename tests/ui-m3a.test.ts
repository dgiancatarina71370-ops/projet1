// Lot M3a : logique pure des écrans et rendu statique des écrans d'affichage (décisions D33, D34, D41).
// Le rendu passe par esbuild (déjà présent avec Vite) : si l'outil est introuvable, ces tests sont signalés « ignorés » et non « réussis ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRender } from './helpers/ui-loader.ts';
import { SCREENS, isScreenId, startScreen } from '../src/app/navigation.ts';
import { chooseActiveProject, kindLabel, projectDeletionMessage, selectableProjects, validateName } from '../src/modules/projects/logic.ts';
import { EMPTY_FORM, deletionMessage, emptyListMessage, filterByStatus, formFrom, isDirty, validateForm } from '../src/modules/stakeholders/logic.ts';
import { MAX_TITLE } from '../src/domain/stakeholders.ts';
import { MAX_TITLE_LENGTH } from '../src/data/repositories/items.ts';


// ------------------------------------------------------------------ navigation et projets (logique pure)

test('navigation : quinze écrans regroupés en sections depuis F4, projets d\'abord tant qu\'aucun projet n\'est actif, accueil ensuite', () => {
  assert.deepEqual(SCREENS.map((s) => s.id), ['home', 'projects', 'workshops', 'stakeholders', 'needs', 'requirements', 'decisions', 'risks', 'deliverables', 'stories', 'tests', 'traceability', 'journal', 'technical', 'about']);
  assert.deepEqual(SCREENS.map((s) => s.label), ['Accueil', 'Projets', 'Ateliers', 'Parties prenantes', 'Besoins', 'Exigences', 'Décisions', 'Risques', 'Livrables', 'User stories', 'Tests', 'Traçabilité', 'Journal', 'Technique', 'À propos']);
  assert.equal(startScreen(null), 'projects');
  assert.equal(startScreen(3), 'home');
  assert.ok(isScreenId('home') && isScreenId('journal') && isScreenId('about') && isScreenId('technical') && isScreenId('needs') && isScreenId('stories') && isScreenId('tests') && isScreenId('traceability') && isScreenId('workshops') && isScreenId('deliverables') && !isScreenId('matrix'), 'les quinze écrans existent ; pas d\'écran fantôme');
});

test('projet actif : le dernier utilisé s\'il existe encore, sinon le premier projet, sinon aucun ; jamais un dossier', () => {
  const list = [
    { id: 1, kind: 'folder', name: 'Dossier', parent_id: null },
    { id: 2, kind: 'project', name: 'A', parent_id: 1 },
    { id: 3, kind: 'archive', name: 'Arch', parent_id: null },
    { id: 4, kind: 'project', name: 'B', parent_id: null },
  ];
  assert.deepEqual(selectableProjects(list).map((p) => p.id), [2, 4]);
  assert.equal(chooseActiveProject(list, 4), 4);
  assert.equal(chooseActiveProject(list, null), 2);
  assert.equal(chooseActiveProject(list, 99), 2, 'projet disparu : repli sur le premier');
  assert.equal(chooseActiveProject(list, 1), 2, 'un dossier n\'est pas un projet actif');
  assert.equal(chooseActiveProject(list, 3), 2);
  assert.equal(chooseActiveProject([list[0], list[2]], 1), null);
  assert.equal(chooseActiveProject([], null), null);
  assert.equal(kindLabel('folder'), 'Dossier');
  assert.equal(kindLabel('autre'), 'autre');
});

test('projets : nom valide, message de suppression qui dit exactement ce qui disparaîtra', () => {
  assert.equal(validateName('  '), 'Le nom du projet est obligatoire.');
  assert.match(validateName('x'.repeat(201)) ?? '', /200 caractères/);
  assert.equal(validateName(' Mon projet '), null);
  assert.match(projectDeletionMessage('P', { projects: 1, documents: 0, items: 0, links: 0 }), /Il est vide\./);
  const m = projectDeletionMessage('P', { projects: 3, documents: 1, items: 12, links: 1 });
  assert.match(m, /2 sous-dossiers ou sous-projets, 12 éléments, 1 lien, 1 document/);
  assert.match(m, /irréversible/);
});

// ------------------------------------------------------------------ parties prenantes (logique pure)

test('parties prenantes : filtre par statut et messages de liste vide', () => {
  const rows = [{ status: 'active', n: 1 }, { status: 'archived', n: 2 }, { status: 'active', n: 3 }];
  assert.deepEqual(filterByStatus(rows, 'all').map((r) => r.n), [1, 2, 3]);
  assert.deepEqual(filterByStatus(rows, 'active').map((r) => r.n), [1, 3]);
  assert.deepEqual(filterByStatus(rows, 'archived').map((r) => r.n), [2]);
  assert.match(emptyListMessage(0, 'all'), /Aucune partie prenante dans ce projet/);
  assert.match(emptyListMessage(3, 'archived'), /Archivé.*3 au total/);
});

test('parties prenantes : le formulaire est validé champ par champ avec les règles du dépôt', () => {
  assert.equal(MAX_TITLE, MAX_TITLE_LENGTH, 'la limite du nom est la même dans l\'écran et dans le dépôt');
  const bad = validateForm({ ...EMPTY_FORM, title: '   ', organisation: 'x'.repeat(201), influence: 'énorme' });
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.deepEqual(Object.keys(bad.errors).sort(), ['influence', 'organisation', 'title']);
    assert.equal(bad.errors.title, 'Le nom est obligatoire.');
  }
  const long = validateForm({ ...EMPTY_FORM, title: 'x'.repeat(201) });
  assert.ok(!long.ok && /limité à 200/.test(long.errors.title ?? ''));
  const good = validateForm({ title: '  Responsable CRP ', description: 'Texte', organisation: ' La Poste ', role: 'Sponsor', influence: 'high', interest: 'low' });
  assert.ok(good.ok);
  if (good.ok) {
    assert.equal(good.title, 'Responsable CRP');
    assert.deepEqual(good.fields, { organisation: 'La Poste', role: 'Sponsor', influence: 'high', interest: 'low' });
  }
});

test('parties prenantes : saisie non enregistrée détectée, message de suppression annonçant les liens', () => {
  const start = formFrom({ title: 'A', description: '', organisation: '', role: '', influence: 'medium', interest: 'medium' });
  assert.equal(isDirty(start, { ...start }), false);
  assert.equal(isDirty(start, { ...start, role: 'x' }), true);
  assert.equal(isDirty(EMPTY_FORM, EMPTY_FORM), false);
  assert.match(deletionMessage('PP-001', 'Nom', 0), /irréversible; l'archivage|irréversible ; l'archivage/);
  assert.ok(!/lien/.test(deletionMessage('PP-001', 'Nom', 0)));
  assert.match(deletionMessage('PP-001', 'Nom', 1), /1 lien sera aussi supprimé/);
  assert.match(deletionMessage('PP-001', 'Nom', 4), /4 liens seront aussi supprimés/);
});

// ------------------------------------------------------------------ rendu statique des écrans

interface Render {
  shell: (p: { navigable: boolean; screen: 'projects' | 'stakeholders' | 'technical'; projects: Array<{ id: number; name: string }>; activeId: number | null }) => string;
  noProject: () => string;
  list: (p: { rows: Array<Record<string, string | number>>; total: number; filter: 'all' | 'active' | 'archived' }) => string;
  detail: (p: { archived: boolean; confirm: string | null; error: string }) => string;
  form: (p: { errors: Record<string, string>; askAbandon: boolean; title: string }) => string;
  projects: (p: { rows: Array<{ id: number; parent_id: number | null; kind: string; name: string }>; activeId: number | null; renamingId: number | null; confirm: { id: number; message: string } | null; newError: string }) => string;
}

const render = loadRender<Render>();
const ui = (name: string, fn: (r: Render) => void) => test(name, { skip: render === null ? 'esbuild introuvable : rendu des écrans non vérifié' : false }, () => fn(render as Render));

const ROW = { id: 1, code: 'PP-001', title: 'Responsable CRP', description: '', status: 'active', organisation: 'La Poste', role: 'Sponsor', influence: 'high', interest: 'low' };

ui('écran : le cadre affiche le projet actif et le menu, et rien de tout cela avant que la base soit prête', (r) => {
  const ready = r.shell({ navigable: true, screen: 'stakeholders', projects: [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }], activeId: 2 });
  assert.match(ready, /Projet actif/);
  assert.match(ready, /<option value="2" selected="">Beta<\/option>|<option value="2"[^>]*selected/);
  for (const label of ['Projets', 'Ateliers', 'Parties prenantes', 'Besoins', 'Exigences', 'Décisions', 'Risques', 'User stories', 'Tests', 'Traçabilité', 'Journal', 'Technique', 'À propos']) assert.ok(ready.includes(`>${label}<`), label);
  assert.equal((ready.match(/aria-current="page"/g) ?? []).length, 1, 'une seule entrée marquée comme courante');
  assert.match(ready, /aria-current="page"[^>]*>Parties prenantes</);
  for (const title of ['Analyse', 'Pilotage', 'Réalisation']) assert.ok(ready.includes(`>${title}<`), `intitulé de section ${title}`);
  assert.ok(ready.includes('>Contrôle<') && !ready.includes('Matrice'), 'section Contrôle présente, aucune entrée sans écran');
  const starting = r.shell({ navigable: false, screen: 'projects', projects: [], activeId: null });
  assert.ok(!starting.includes('Projet actif') && !starting.includes('<nav'));
  assert.match(starting, /Contenu/);
  const none = r.shell({ navigable: true, screen: 'projects', projects: [], activeId: null });
  assert.match(none, /Aucun projet/);
  assert.match(none, /<select[^>]*disabled/);
});

ui('écran : sans projet actif, les parties prenantes renvoient vers les projets', (r) => {
  const html = r.noProject();
  assert.match(html, /Aucun projet actif/);
  assert.match(html, /Aller aux projets/);
});

ui('écran : liste des parties prenantes (lignes, niveaux, filtre, états vides)', (r) => {
  const html = r.list({ rows: [ROW, { ...ROW, id: 2, code: 'PP-002', title: 'Archivée', status: 'archived' }], total: 2, filter: 'all' });
  assert.match(html, /Mon projet/);
  assert.match(html, /2 parties prenantes/);
  assert.ok(html.includes('PP-001') && html.includes('PP-002'));
  assert.ok(html.includes('Élevé') && html.includes('Faible'));
  assert.ok(html.includes('Actif') && html.includes('Archivé'));
  assert.match(html, /aria-pressed="true"[^>]*>Tous \(/);
  assert.match(html, /aria-pressed="false"[^>]*>Actif \(/);
  assert.ok(html.includes('Nouvelle partie prenante'));
  assert.match(r.list({ rows: [], total: 0, filter: 'all' }), /Aucune partie prenante dans ce projet/);
  assert.match(r.list({ rows: [], total: 2, filter: 'archived' }), /Archivé.*2 au total/);
  assert.ok(!r.list({ rows: [], total: 0, filter: 'all' }).includes('<table'));
  assert.match(r.list({ rows: [ROW], total: 1, filter: 'all' }), /1 partie prenante\b/);
});

ui('écran : fiche d\'une partie prenante (texte échappé, archiver ou réactiver, confirmation de suppression, erreur)', (r) => {
  const active = r.detail({ archived: false, confirm: null, error: '' });
  assert.ok(active.includes('PP-001 · Responsable &lt;CRP&gt;'), 'le nom est échappé, jamais interprété comme du HTML');
  assert.ok(!active.includes('<CRP>'));
  assert.ok(active.includes('Archiver') && !active.includes('Réactiver'));
  assert.ok(active.includes('Modifier') && active.includes('Supprimer…'));
  assert.ok(r.detail({ archived: true, confirm: null, error: '' }).includes('Réactiver'));
  const asking = r.detail({ archived: false, confirm: 'Supprimer définitivement PP-001 ?', error: '' });
  assert.match(asking, /role="alertdialog"/);
  assert.ok(asking.includes('Supprimer définitivement') && asking.includes('Annuler'));
  assert.ok(!asking.includes('>Modifier<') && !asking.includes('>Archiver<'), 'pendant la confirmation, seules les deux issues restent');
  assert.match(r.detail({ archived: false, confirm: null, error: 'Échec simulé' }), /role="alert"[^>]*>Échec simulé</);
});

ui('écran : formulaire (messages d\'erreur à leur place, confirmation avant d\'abandonner une saisie)', (r) => {
  const plain = r.form({ errors: {}, askAbandon: false, title: 'Ma saisie' });
  assert.ok(plain.includes('Nouvelle partie prenante') && plain.includes('Enregistrer') && plain.includes('Annuler'));
  assert.match(plain, /value="Ma saisie"/);
  assert.match(plain, /<option value="high" selected="">Élevé<\/option>|<option value="high"[^>]*selected/);
  const bad = r.form({ errors: { title: 'Le nom est obligatoire.', role: 'Trop long.' }, askAbandon: false, title: '' });
  assert.match(bad, /role="alert"[^>]*>Le nom est obligatoire\.</);
  assert.match(bad, /role="alert"[^>]*>Trop long\.</);
  const leaving = r.form({ errors: {}, askAbandon: true, title: 'x' });
  assert.match(leaving, /Abandonner la saisie en cours/);
  assert.ok(leaving.includes('Continuer à saisir') && !leaving.includes('>Enregistrer<'));
});

ui('écran : projets (type, projet actif, boutons selon le type, renommage, confirmation de suppression)', (r) => {
  const rows = [
    { id: 1, parent_id: null, kind: 'project', name: 'Alpha' },
    { id: 2, parent_id: null, kind: 'project', name: 'Beta' },
    { id: 3, parent_id: null, kind: 'folder', name: 'Classeur' },
  ];
  const html = r.projects({ rows, activeId: 1, renamingId: null, confirm: null, newError: '' });
  assert.ok(html.includes('Nouveau projet') && html.includes('Créer'));
  assert.equal((html.match(/>actif</g) ?? []).length, 1, 'un seul projet actif');
  assert.equal((html.match(/>Activer</g) ?? []).length, 1, 'Activer : le projet non actif seulement, ni le projet actif ni le dossier');
  assert.equal((html.match(/>Renommer</g) ?? []).length, 3);
  assert.ok(html.includes('Dossier') && html.includes('Classeur'));
  const renaming = r.projects({ rows, activeId: 1, renamingId: 2, confirm: null, newError: '' });
  assert.ok(renaming.includes('Nouveau nom de « Beta »') && renaming.includes('value="Nom actuel"'));
  const asking = r.projects({ rows, activeId: 1, renamingId: null, confirm: { id: 2, message: 'Supprimer « Beta » ?' }, newError: '' });
  assert.equal((asking.match(/role="alertdialog"/g) ?? []).length, 1, 'la confirmation n\'apparaît que sous le projet visé');
  assert.match(r.projects({ rows: [], activeId: null, renamingId: null, confirm: null, newError: 'Le nom du projet est obligatoire.' }), /Aucun projet\. Créez le premier/);
  assert.match(r.projects({ rows, activeId: 1, renamingId: null, confirm: null, newError: 'Le nom du projet est obligatoire.' }), /role="alert"[^>]*>Le nom du projet est obligatoire\./);
});
