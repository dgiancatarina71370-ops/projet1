// Lot M8 : livrables générés depuis les données (décisions D88 à D97). Générateurs purs, lecteur en lecture seule, export signé.
// Depuis F5 (F5-D10), il n'existe plus d'export direct : un livrable s'enregistre comme document, puis le document s'exporte.
// L'écran est dans ui-m8.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { migratedDb } from './helpers/setup.ts';
import { snapshot } from './helpers/seed.ts';
import { query } from '../src/data/db.ts';
import { createProject } from '../src/data/repositories/projects.ts';
import { changeItemStatus, createItem } from '../src/data/repositories/items.ts';
import { createStakeholder } from '../src/data/repositories/stakeholders.ts';
import { createRequirement } from '../src/data/repositories/requirements.ts';
import { createDecision } from '../src/data/repositories/decisions.ts';
import { createRisk } from '../src/data/repositories/risks.ts';
import { createStory } from '../src/data/repositories/stories.ts';
import { createTestCase } from '../src/data/repositories/testcases.ts';
import { createWorkshop } from '../src/data/repositories/workshops.ts';
import { createLink } from '../src/data/repositories/links.ts';
import { loadProjectData } from '../src/data/repositories/project-export.ts';
import { exportDocumentToFile, saveDeliverable } from '../src/export/service.ts';
import type { SavedExport } from '../src/data/export-files.ts';
import { exportDocument, FORMATS } from '../src/export/pipeline.ts';
import type { ExportFormat } from '../src/export/pipeline.ts';
import { parseMarkdown } from '../src/export/model.ts';
import type { Block, Inline } from '../src/export/model.ts';
import { readDocx, missingFromDocx } from '../src/export/docx-check.ts';
import { buildSignature } from '../src/shared/signature.ts';
import { COVERAGE_LABELS, MODELS, ORPHAN_LABELS, generateDeliverable, modelInfo, ratioText } from '../src/export/deliverables/models.ts';
import type { ModelId } from '../src/export/deliverables/models.ts';
import { body, cell, field, freeText, heading, headingText, inline, table } from '../src/export/deliverables/text.ts';
import type { DItem, DLink, ProjectData } from '../src/domain/project-data.ts';
import { ORPHAN_GROUPS, RESULT_LABELS, ratioText as screenRatioText, summaryLines } from '../src/modules/traceability/logic.ts';

const di = (id: number, kind: DItem['kind'], code: string, title: string, status: string, d: Record<string, string> = {}, description = ''): DItem => ({ id, kind, code, title, status, description, d });
const lk = (type: string, fromId: number, toId: number): DLink => ({ type, fromId, toId });
const OPTS: { includeArchived: boolean; workshopId?: number | null } = { includeArchived: false, workshopId: 10 };
const ALL = MODELS.map((m) => m.id);
const NOW = new Date(2026, 10, 26, 14, 30, 5);
const VERSION = '0.10.0';

/** Jeu de référence : un exemple de chaque cas. */
function reference(): ProjectData {
  return {
    projectName: 'Projet CRP',
    items: [
      di(1, 'stakeholder', 'PP-001', 'Alice Martin', 'active', { organisation: 'DSI', role: 'Sponsor' }),
      di(2, 'need', 'BES-001', 'Suivre les campagnes', 'validated'),
      di(3, 'requirement', 'EX-003', 'Afficher les campagnes', 'validated', { nature: 'functional', priority: 'must', criteria: 'Liste triée\nFiltre par date' }, 'Vue de synthèse'),
      di(4, 'requirement', 'EX-001', 'Exporter en Word', 'draft', { nature: 'non_functional', priority: 'should', criteria: '' }),
      di(5, 'requirement', 'EX-002', 'Ancienne exigence', 'archived', { nature: 'constraint', priority: 'could', criteria: 'Obsolète' }),
      di(6, 'story', 'US-001', 'Voir les campagnes', 'ready', { role: 'responsable CRP', goal: 'suivre les campagnes', benefit: 'piloter', criteria: 'Tri par date' }),
      di(7, 'test', 'TEST-001', 'Affichage', 'passed', { test_type: 'acceptance', preconditions: 'Connecté', steps: 'Ouvrir\nCliquer', expected: 'Liste visible', last_run_on: '2026-11-20' }),
      di(8, 'decision', 'DEC-001', 'Choix initial', 'superseded', { decided_on: '2026-11-10', decider: 'Comité', alternatives: 'Option B', rationale: 'Coût' }),
      di(9, 'decision', 'DEC-002', 'Choix révisé', 'decided', { decided_on: '', decider: '', alternatives: '', rationale: '' }),
      di(10, 'workshop', 'ATL-001', 'Recueil du besoin', 'held', { held_on: '2026-11-20', place: 'Salle A', objective: 'Recueillir le besoin', notes: 'Point 1\nPoint 2', follow_up: 'Action : envoyer le CR' }, 'Premier atelier'),
      di(11, 'risk', 'RIS-001', 'Retard de livraison', 'identified', { probability: 'high', impact: 'medium', mitigation: 'Livrer par lots', owner: 'Chef de projet' }),
      di(12, 'workshop', 'ATL-002', 'Atelier vide', 'planned', { held_on: '', place: '', objective: '', notes: '', follow_up: '' }),
      di(13, 'stakeholder', 'PP-002', 'Ancien contact', 'archived', { organisation: '', role: '' }),
    ],
    links: [
      lk('expresses', 1, 2), lk('derives', 2, 3), lk('implements', 6, 3), lk('verifies', 7, 3),
      lk('supersedes', 9, 8), lk('participates', 1, 10), lk('participates', 13, 10),
      lk('originates', 2, 10), lk('originates', 3, 10), lk('originates', 8, 10), lk('originates', 11, 10), lk('originates', 5, 10),
    ],
  };
}

const gen = (id: ModelId, data: ProjectData = reference(), opts: { includeArchived: boolean; workshopId?: number | null } = OPTS): string => generateDeliverable(id, data, opts).markdown;

// ------------------------------------------------------------------ catalogue (D90)

test('D90 : sept modèles fixes, dans l\'ordre, un seul qui porte sur un atelier, un seul sans option d\'archivage', () => {
  assert.deepEqual(MODELS.map((m) => m.id), ['workshop-report', 'requirements', 'decisions', 'risks', 'stories', 'test-plan', 'traceability']);
  assert.deepEqual(MODELS.map((m) => m.label), ["Compte rendu d'atelier", 'Registre des exigences', 'Registre des décisions', 'Registre des risques', 'Backlog des user stories', 'Cahier de recette', 'Matrice de traçabilité']);
  assert.deepEqual(MODELS.filter((m) => m.needsWorkshop).map((m) => m.id), ['workshop-report']);
  assert.deepEqual(MODELS.filter((m) => !m.usesArchiveOption).map((m) => m.id), ['traceability']);
  assert.ok(MODELS.every((m) => m.description.length > 20));
  assert.equal(modelInfo('requirements')?.label, 'Registre des exigences');
  assert.equal(modelInfo('inconnu'), null);
});

// ------------------------------------------------------------------ neutralisation du texte (D93)

test('D93 : inline ramène à une ligne et neutralise les caractères du Markdown', () => {
  assert.equal(inline('  a\n b\t\tc  '), 'a b c');
  assert.equal(inline('a | b'), 'a \\| b');
  assert.equal(inline('**gras** _it_ `code` ~~x~~ [l](u) <b> &amp; \\'), '\\*\\*gras\\*\\* \\_it\\_ \\`code\\` \\~\\~x\\~\\~ \\[l\\](u) \\<b\\> \\&amp; \\\\');
  assert.equal(inline('EX-001 (v1.2) #3'), 'EX-001 (v1.2) #3', 'les caractères inoffensifs en texte courant restent lisibles');
  assert.equal(cell(''), '—');
  assert.equal(cell('   \n '), '—');
  assert.equal(cell('a|b'), 'a\\|b');
});

test('D93 : un titre ne se ferme pas par des « # » et ne contient jamais de retour à la ligne', () => {
  assert.equal(headingText('Titre ##'), 'Titre \\#\\#');
  assert.equal(headingText('Ligne 1\n# Ligne 2'), 'Ligne 1 # Ligne 2');
  assert.equal(heading(2, 'A'), '## A');
});

test('D93 : un texte libre garde ses retours à la ligne et neutralise le début des lignes', () => {
  assert.equal(freeText('a\nb'), 'a  \nb');
  assert.equal(freeText('a\n\nb'), 'a\n\nb');
  assert.equal(freeText('\n\n  a  \n\n\n\n b \n\n'), 'a\n\nb');
  assert.equal(freeText('# titre'), '\\# titre');
  assert.equal(freeText('- puce'), '\\- puce');
  assert.equal(freeText('+ plus'), '\\+ plus');
  assert.equal(freeText('= égal'), '\\= égal');
  assert.equal(freeText('1. un\n2) deux'), '1\\. un  \n2\\) deux');
  assert.equal(freeText('    indenté'), 'indenté');
  assert.equal(freeText('---'), '\\---');
  assert.equal(freeText('```js'), '\\`\\`\\`js');
  assert.equal(freeText('> déjà cité'), '\\> déjà cité');
  assert.equal(freeText('a\r\nb\rc'), 'a  \nb  \nc');
});

test('D93 : body, field et table', () => {
  assert.equal(body('', 'Aucune note.'), 'Aucune note.');
  assert.equal(body('  \n ', 'Aucune note.'), 'Aucune note.');
  assert.equal(body('x', 'Aucune note.'), 'x');
  assert.equal(field('Objectif', ''), '**Objectif :**\n\nNon renseigné.');
  assert.equal(field('Objectif', 'x'), '**Objectif :**\n\nx');
  assert.equal(table(['A', 'B'], [['1', '2']]), '| A | B |\n| --- | --- |\n| 1 | 2 |');
});

// Texte piège dans CHAQUE champ de CHAQUE type : les documents gardent leur structure et ne contiennent ni lien ni HTML ni code.
const TRAP = '# piège | **x** [lien](http://exemple.test) <script>alert(1)</script> `c` ~~s~~ &amp;\n## suite\n- puce\n1. num\n---\n```\ncode\n```';

function trapped(): ProjectData {
  const d = (...keys: string[]): Record<string, string> => Object.fromEntries(keys.map((k) => [k, TRAP]));
  return {
    projectName: TRAP,
    items: [
      di(1, 'stakeholder', 'PP-001', TRAP, 'active', d('organisation', 'role')),
      di(2, 'need', 'BES-001', TRAP, 'validated', {}, TRAP),
      di(3, 'requirement', 'EX-001', TRAP, 'validated', { nature: 'functional', priority: 'must', criteria: TRAP }, TRAP),
      di(4, 'story', 'US-001', TRAP, 'ready', d('role', 'goal', 'benefit', 'criteria'), TRAP),
      di(5, 'test', 'TEST-001', TRAP, 'passed', { test_type: 'unit', preconditions: TRAP, steps: TRAP, expected: TRAP, last_run_on: '2026-11-20' }, TRAP),
      di(6, 'decision', 'DEC-001', TRAP, 'decided', { decided_on: '2026-11-20', decider: TRAP, alternatives: TRAP, rationale: TRAP }, TRAP),
      di(7, 'risk', 'RIS-001', TRAP, 'identified', { probability: 'low', impact: 'high', mitigation: TRAP, owner: TRAP }, TRAP),
      di(8, 'workshop', 'ATL-001', TRAP, 'held', { held_on: '2026-11-20', place: TRAP, objective: TRAP, notes: TRAP, follow_up: TRAP }, TRAP),
    ],
    links: [lk('expresses', 1, 2), lk('derives', 2, 3), lk('implements', 4, 3), lk('verifies', 5, 3), lk('participates', 1, 8), lk('originates', 2, 8), lk('originates', 3, 8)],
  };
}

const walkBlocks = (blocks: readonly Block[], f: (b: Block) => void): void => {
  for (const b of blocks) {
    f(b);
    if (b.kind === 'quote') walkBlocks(b.blocks, f);
    if (b.kind === 'list') for (const it of b.items) walkBlocks(it.blocks, f);
  }
};
const inlinesOf = (b: Block): Inline[] => {
  if (b.kind === 'heading' || b.kind === 'paragraph') return b.inlines;
  if (b.kind === 'table') return [...b.header.flat(), ...b.rows.flat(2)];
  return [];
};
const plain = (inl: Inline[]): string => inl.map((i) => (i.kind === 'text' ? i.text : i.kind === 'link' ? plain(i.children) : '\n')).join('');

test('D93 : texte piégé dans tous les champs — structure intacte pour chacun des sept modèles', () => {
  for (const id of ALL) {
    const md = gen(id, trapped(), { includeArchived: false, workshopId: 8 });
    const blocks = parseMarkdown(md);
    const where = `modèle ${id}`;
    let links = 0;
    let codeBlocks = 0;
    let rules = 0;
    walkBlocks(blocks, (b) => {
      if (b.kind === 'code') codeBlocks++;
      if (b.kind === 'rule') rules++;
      for (const i of inlinesOf(b)) {
        if (i.kind !== 'link') continue;
        links++;
        // Seule exception : une adresse web écrite telle quelle devient un lien cliquable (http ou https, texte = adresse). Jamais un lien déguisé « [texte](adresse) ».
        assert.ok(/^https?:\/\//.test(i.href) && plain(i.children) === i.href, `${where} : lien déguisé ${i.href}`);
      }
      if (b.kind === 'table') {
        const width = b.header.length;
        assert.ok(b.rows.every((r) => r.length === width), `${where} : toutes les lignes de tableau ont ${width} cellules`);
      }
    });
    assert.equal(codeBlocks, 0, `${where} : aucun bloc de code produit par le texte saisi`);
    assert.equal(rules, 0, `${where} : aucune règle horizontale produite par le texte saisi`);
    // Seuls les titres prévus existent : le texte piégé « # piège » et « ## suite » n'en crée aucun.
    const titles = blocks.filter((b) => b.kind === 'heading').map((b) => (b.kind === 'heading' ? plain(b.inlines) : ''));
    assert.ok(titles.every((t) => !t.startsWith('suite') && !t.startsWith('piège')), `${where} : titres ${JSON.stringify(titles)}`);
    // Les seules listes sont celles que le modèle écrit lui-même (orphelins de la matrice) : un paragraphe par puce, jamais de liste imbriquée.
    walkBlocks(blocks, (b) => {
      if (b.kind !== 'list') return;
      assert.equal(id, 'traceability', `${where} : le texte saisi ne crée pas de liste`);
      assert.ok(b.items.every((x) => x.blocks.length === 1 && x.blocks[0].kind === 'paragraph'), `${where} : une puce = un paragraphe`);
    });
    assert.ok(md.includes('\\<script\\>'), `${where} : le HTML est neutralisé`);
    assert.ok(!md.includes('<script>'), `${where} : jamais de balise brute`);
  }
});

// ------------------------------------------------------------------ contenu des modèles

test('compte rendu d\'atelier : en-tête, participants, éléments issus, notes, points ouverts', () => {
  const md = gen('workshop-report');
  assert.ok(md.startsWith("# Compte rendu d'atelier\n"));
  for (const line of ['**Projet :** Projet CRP', '**Atelier :** ATL-001 — Recueil du besoin', '**Date :** 20/11/2026', '**Lieu ou format :** Salle A', '**Statut :** Tenu']) assert.ok(md.includes(line), line);
  assert.ok(md.includes('**Objectif :**\n\nRecueillir le besoin'));
  assert.ok(md.includes('**Description :**\n\nPremier atelier'));
  assert.ok(md.includes('| PP-001 | Alice Martin | DSI | Sponsor |'));
  // Éléments issus : ordre besoin, exigence, décision, risque ; l'exigence archivée (EX-002) est exclue.
  const i = (s: string): number => md.indexOf(s);
  assert.ok(i('| Besoin | BES-001') > 0 && i('| Besoin | BES-001') < i('| Exigence | EX-003') && i('| Exigence | EX-003') < i('| Décision | DEC-001') && i('| Décision | DEC-001') < i('| Risque | RIS-001'));
  assert.ok(!md.includes('EX-002') && !md.includes('PP-002'), 'archivés exclus');
  assert.ok(md.includes('2 éléments archivés ou rejetés exclus'));
  assert.ok(md.includes('## Notes\n\nPoint 1  \nPoint 2'));
  assert.ok(md.includes('## Points ouverts et actions\n\nAction : envoyer le CR'));
  assert.ok(md.includes('| Décision | DEC-001 | Choix initial | Remplacée |'));
});

test('compte rendu d\'atelier : archivés inclus sur demande, atelier vide, atelier archivé, erreurs', () => {
  const all = gen('workshop-report', reference(), { includeArchived: true, workshopId: 10 });
  assert.ok(all.includes('| Exigence | EX-002 | Ancienne exigence | Archivé |') && all.includes('| PP-002 | Ancien contact |'));
  assert.ok(all.includes('tous les éléments liés, y compris les éléments archivés ou rejetés'));
  const empty = gen('workshop-report', reference(), { includeArchived: false, workshopId: 12 });
  for (const s of ['**Date :** Non renseignée', '**Lieu ou format :** Non renseigné', '**Objectif :**\n\nNon renseigné.', 'Aucune partie prenante liée à cet atelier.', 'Aucun élément lié à cet atelier.', 'Aucune note.', 'Aucun point ouvert ni action.']) assert.ok(empty.includes(s), s);
  assert.ok(!empty.includes('**Description :**'), 'description vide : omise');
  assert.ok(empty.includes('aucun élément archivé ou rejeté'));
  const data = reference();
  data.items = data.items.map((x) => (x.id === 10 ? { ...x, status: 'archived' } : x));
  assert.ok(gen('workshop-report', data).includes('**Statut :** Archivé'), 'un atelier archivé s\'exporte quand on le choisit');
  assert.throws(() => gen('workshop-report', reference(), { includeArchived: false, workshopId: null }), /Choisissez un atelier/);
  assert.throws(() => gen('workshop-report', reference(), { includeArchived: false }), /Choisissez un atelier/);
  assert.throws(() => gen('workshop-report', reference(), { includeArchived: false, workshopId: 999 }), /n'existe plus/);
  assert.throws(() => gen('workshop-report', reference(), { includeArchived: false, workshopId: 3 }), /n'existe plus/, 'un identifiant qui n\'est pas un atelier est refusé');
  assert.equal(generateDeliverable('workshop-report', reference(), OPTS).title, 'Compte rendu atelier ATL-001 Recueil du besoin');
});

test('registre des exigences : tri par priorité puis code, archivées exclues, besoin d\'origine, détail', () => {
  const md = gen('requirements');
  assert.ok(md.startsWith('# Registre des exigences\n'));
  assert.ok(md.includes('**Périmètre :** éléments actifs ; 1 élément archivé ou rejeté exclu.'));
  assert.ok(md.includes('**Synthèse :** 2 exigences (1 Indispensable (Must), 1 Important (Should)). Tri : priorité, puis code.'));
  assert.ok(md.indexOf('EX-003') < md.indexOf('EX-001'), 'Must avant Should même si le code est plus grand');
  assert.ok(md.includes('| EX-003 | Afficher les campagnes | Fonctionnelle | Indispensable (Must) | Validé | BES-001 |'));
  assert.ok(md.includes('| EX-001 | Exporter en Word | Non fonctionnelle | Important (Should) | Brouillon | — |'));
  assert.ok(!md.includes('EX-002'));
  assert.ok(md.includes('### EX-003 — Afficher les campagnes\n\n**Description :**\n\nVue de synthèse\n\n**Critères d\'acceptation :**\n\nListe triée  \nFiltre par date'));
  assert.ok(!md.includes('### EX-001'), 'une exigence sans description ni critères n\'a pas de fiche');
  const all = gen('requirements', reference(), { includeArchived: true });
  assert.ok(all.includes('| EX-002 | Ancienne exigence | Contrainte | Souhaitable (Could) | Archivé | — |'));
  assert.ok(all.includes('tous les éléments, y compris'));
  assert.ok(all.includes('3 exigences (1 Indispensable (Must), 1 Important (Should), 1 Souhaitable (Could))'));
});

test('registre des décisions : date, décideur, remplacements dans les deux sens, détail seulement si renseigné', () => {
  const md = gen('decisions');
  assert.ok(md.includes('**Synthèse :** 2 décisions. Tri : code.'));
  assert.ok(md.includes('| DEC-001 | Choix initial | Remplacée | 10/11/2026 | Comité | remplacée par DEC-002 |'));
  assert.ok(md.includes('| DEC-002 | Choix révisé | Prise | — | — | remplace DEC-001 |'));
  assert.ok(md.includes('### DEC-001 — Choix initial\n\n**Alternatives envisagées :**\n\nOption B\n\n**Justification :**\n\nCoût'));
  assert.ok(!md.includes('### DEC-002'));
});

test('registre des risques : niveaux côte à côte, aucun score, plan de traitement', () => {
  const md = gen('risks');
  assert.ok(md.includes('| RIS-001 | Retard de livraison | Identifié | Élevé | Moyen | Chef de projet |'));
  assert.ok(md.includes('Aucun score n\'est calculé'));
  assert.ok(md.includes('### RIS-001 — Retard de livraison\n\n**Plan de traitement :**\n\nLivrer par lots'));
  assert.ok(md.includes('**Synthèse :** 1 risque.'));
});

test('backlog des user stories : phrase complète ou champs séparés, exigences liées', () => {
  const md = gen('stories');
  assert.ok(md.includes('| US-001 | Voir les campagnes | Prête | EX-003 |'));
  assert.ok(md.includes('En tant que **responsable CRP**, je veux **suivre les campagnes**, afin de **piloter**.'));
  assert.ok(md.includes("**Critères d'acceptation :**\n\nTri par date"));
  const data = reference();
  data.items = data.items.map((x) => (x.id === 6 ? { ...x, d: { role: 'responsable', goal: '', benefit: 'piloter', criteria: '' } } : x));
  const partial = gen('stories', data);
  assert.ok(!partial.includes('En tant que'));
  assert.ok(partial.includes('**Rôle :** responsable') && partial.includes('**Bénéfice :** piloter') && !partial.includes('**Objectif :**'));
});

test('cahier de recette : type, statut, dernière exécution, ce que le test vérifie, étapes à la ligne', () => {
  const md = gen('test-plan');
  assert.ok(md.includes('**Synthèse :** 1 test (1 Réussi).'));
  assert.ok(md.includes('| TEST-001 | Affichage | Recette (UAT) | Réussi | 20/11/2026 | EX-003 |'));
  assert.ok(md.includes('**Préconditions :**\n\nConnecté'));
  assert.ok(md.includes('**Étapes :**\n\nOuvrir  \nCliquer'));
  assert.ok(md.includes('**Résultat attendu :**\n\nListe visible'));
  const data = reference();
  data.items = [...data.items, di(20, 'test', 'TEST-002', 'Jamais exécuté', 'to_run', { test_type: 'unit', preconditions: '', steps: '', expected: '', last_run_on: '' }), di(21, 'test', 'TEST-003', 'Échec', 'failed', { test_type: 'integration', preconditions: '', steps: '', expected: '', last_run_on: '2026-11-21' })];
  const many = gen('test-plan', data);
  assert.ok(many.includes('**Synthèse :** 3 tests (1 À exécuter, 1 Réussi, 1 Échoué).'), 'statuts dans l\'ordre À exécuter, Réussi, Échoué');
  assert.ok(many.includes('| TEST-002 | Jamais exécuté | Unitaire | À exécuter | — | — |'));
  assert.ok(many.includes('| TEST-003 | Échec | Intégration | Échoué | 21/11/2026 | — |'));
});

test('matrice de traçabilité : même calcul que l\'écran, mêmes libellés', () => {
  const md = gen('traceability');
  assert.ok(md.includes('1 élément archivé ou rejeté ignoré') === false, 'deux éléments de la chaîne sont archivés dans le jeu');
  assert.ok(md.includes('2 éléments archivés ou rejetés ignorés (les éléments archivés ou rejetés sont toujours ignorés dans ce calcul).'));
  const none = gen('traceability', { projectName: 'P', items: [], links: [] });
  assert.ok(none.includes('aucun élément archivé ou rejeté à ignorer (les éléments archivés ou rejetés sont toujours ignorés dans ce calcul).'), 'aucun : phrase sans accord bancal');
  assert.ok(!none.includes('(toujours ignorés'));
  const one = reference();
  one.items = one.items.filter((i) => i.id !== 13);
  assert.ok(gen('traceability', one).includes('1 élément archivé ou rejeté ignoré (les éléments'), 'un seul : singulier');
  // Libellés identiques à ceux de l'écran (une divergence ferait dire deux choses différentes à l'écran et au document).
  const screen = summaryLines({ stakeholdersWithNeed: { covered: 0, total: 0 }, needsWithRequirement: { covered: 0, total: 0 }, requirementsWithStory: { covered: 0, total: 0 }, requirementsTested: { covered: 0, total: 0 }, requirementsPassed: { covered: 0, total: 0 }, mustTested: { covered: 0, total: 0 } });
  assert.deepEqual(COVERAGE_LABELS.map((c) => [c.key, c.label]), screen.map((l) => [l.key, l.label]));
  assert.deepEqual(ORPHAN_LABELS.map((g) => [g.key, g.label]), ORPHAN_GROUPS.map((g) => [g.key, g.label]));
  for (const r of [{ covered: 0, total: 0 }, { covered: 3, total: 5 }]) assert.equal(ratioText(r), screenRatioText(r));
  assert.ok(md.includes('| Parties prenantes avec un besoin | 1 sur 1 |'));
  assert.ok(md.includes('| Exigences testées | 1 sur 2 |'));
  assert.ok(md.includes('| EX-003 — Afficher les campagnes | Indispensable (Must) | BES-001 | US-001 | TEST-001 | Réussi |'));
  assert.ok(md.includes('| EX-001 — Exporter en Word | Important (Should) | — | — | — | Aucun test |'));
  assert.ok(md.indexOf('EX-003 —') < md.indexOf('EX-001 —'), 'ordre MoSCoW de la matrice');
  assert.ok(md.includes('### Exigences sans user story (1)\n\n- EX-001 — Exporter en Word'));
  assert.ok(md.includes('### Besoins sans exigence') === false);
  const results = Object.values(RESULT_LABELS);
  assert.deepEqual(results, ['Échoué', 'Bloqué', 'À exécuter', 'Réussi', 'Aucun test']);
});

test('matrice de traçabilité : l\'option d\'archivage est sans effet ; tests directs et via story réunis sans doublon', () => {
  const a = gen('traceability', reference(), { includeArchived: false });
  const b = gen('traceability', reference(), { includeArchived: true });
  assert.equal(a, b);
  const data = reference();
  data.items = [...data.items, di(30, 'test', 'TEST-002', 'Via story', 'failed', { test_type: 'unit', preconditions: '', steps: '', expected: '', last_run_on: '' })];
  data.links = [...data.links, lk('verifies', 30, 6), lk('verifies', 7, 6)];
  const md = gen('traceability', data);
  assert.ok(md.includes('| TEST-001, TEST-002 | Échoué |'), 'TEST-001 (direct et via la story) n\'apparaît qu\'une fois ; le pire résultat gagne');
});

test('projet sans élément : chaque modèle dit qu\'il est vide, sans tableau vide', () => {
  const data: ProjectData = { projectName: 'Vide', items: [], links: [] };
  const expected: Record<string, string> = { requirements: 'Aucune exigence dans ce périmètre.', decisions: 'Aucune décision dans ce périmètre.', risks: 'Aucun risque dans ce périmètre.', stories: 'Aucune user story dans ce périmètre.', 'test-plan': 'Aucun test dans ce périmètre.' };
  for (const [id, text] of Object.entries(expected)) {
    const md = gen(id as ModelId, data);
    assert.ok(md.includes(text), id);
    assert.ok(!md.includes('| --- |'), `${id} : pas de tableau`);
    assert.ok(md.includes('**Périmètre :** éléments actifs (aucun élément archivé ou rejeté).'));
  }
  const t = gen('traceability', data);
  assert.ok(t.includes('Aucune exigence active dans ce projet : la matrice est vide.') && t.includes('Aucun élément orphelin.'));
  assert.ok(t.includes('| Parties prenantes avec un besoin | — |'), 'un ratio sur zéro s\'affiche « — »');
});

test('un statut ou un niveau inconnu en base ne casse pas le document', () => {
  const data = reference();
  data.items = data.items.map((x) => (x.id === 11 ? { ...x, status: 'bizarre', d: { ...x.d, probability: 'x' } } : x));
  const md = gen('risks', data);
  assert.ok(md.includes('Inconnu (bizarre)') && md.includes('Inconnu (x)'));
});

test('chaque modèle produit un Markdown analysable, une seule fois chaque titre de niveau 1', () => {
  for (const id of ALL) {
    const doc = generateDeliverable(id, reference(), OPTS);
    const blocks = parseMarkdown(doc.markdown);
    assert.equal(blocks.filter((b) => b.kind === 'heading' && b.level === 1).length, 1, id);
    assert.ok(doc.title.length > 5 && !doc.title.includes('\n'), id);
    assert.ok(doc.markdown.endsWith('\n') && !doc.markdown.endsWith('\n\n'), id);
  }
});

// ------------------------------------------------------------------ lecteur (lecture seule) et export signé


interface ViaOptions { version: string; now: Date; includeArchived: boolean; workshopId?: number | null; askWhere?: boolean }
/** Chemin unique depuis F5 : enregistrer le livrable comme document, puis exporter ce document. Remplace l'ancien export direct. */
async function exportGeneratedToFile(projectId: number, modelId: string, format: ExportFormat, o: ViaOptions): Promise<SavedExport | null> {
  const saved = await saveDeliverable(projectId, modelId, { includeArchived: o.includeArchived, workshopId: o.workshopId });
  return exportDocumentToFile(saved.id, format, { version: o.version, now: o.now, askWhere: o.askWhere });
}

interface Built {
  projectId: number;
  workshopId: number;
}

async function buildProject(): Promise<Built> {
  const projectId = await createProject('Projet M8');
  const pp = await createStakeholder({ projectId, title: 'Alice', organisation: 'DSI', role: 'Sponsor' });
  const need = await createItem({ projectId, kind: 'need', title: 'Besoin 1', description: 'Desc besoin' });
  const rq = await createRequirement({ projectId, title: 'Exigence 1', priority: 'must', criteria: 'Critère' });
  const st = await createStory({ projectId, title: 'Story 1', role: 'rôle', goal: 'but', benefit: 'valeur', criteria: 'cr' });
  const ts = await createTestCase({ projectId, title: 'Test 1', steps: 'a\nb', lastRunOn: '2026-11-20' });
  const de = await createDecision({ projectId, title: 'Décision 1', decidedOn: '2026-11-20', decider: 'Comité' });
  const ri = await createRisk({ projectId, title: 'Risque 1', mitigation: 'Plan' });
  const wk = await createWorkshop({ projectId, title: 'Atelier 1', heldOn: '2026-11-20', place: 'Salle A', objective: 'But', notes: 'N', followUp: 'A' });
  await createLink({ type: 'expresses', fromId: pp.id, toId: need.id });
  await createLink({ type: 'derives', fromId: need.id, toId: rq.id });
  await createLink({ type: 'implements', fromId: st.id, toId: rq.id });
  await createLink({ type: 'verifies', fromId: ts.id, toId: rq.id });
  await createLink({ type: 'participates', fromId: pp.id, toId: wk.id });
  await createLink({ type: 'originates', fromId: need.id, toId: wk.id });
  await createLink({ type: 'originates', fromId: de.id, toId: wk.id });
  await createLink({ type: 'originates', fromId: ri.id, toId: wk.id });
  return { projectId, workshopId: wk.id };
}

test('lecteur : réunit éléments, champs des tables d\'extension et liens d\'un seul projet', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await buildProject();
    const other = await createProject('Autre projet');
    await createItem({ projectId: other, kind: 'need', title: 'Besoin ailleurs' });
    await createWorkshop({ projectId: other, title: 'Atelier ailleurs' });
    const data = await loadProjectData(projectId);
    assert.ok(data);
    assert.equal(data.projectName, 'Projet M8');
    assert.equal(data.items.length, 8);
    assert.ok(!data.items.some((i) => i.title.includes('ailleurs')));
    assert.equal(data.links.length, 8);
    const by = (code: string): DItem => data.items.find((i) => i.code === code)!;
    assert.deepEqual(by('PP-001').d, { organisation: 'DSI', role: 'Sponsor', influence: 'medium', interest: 'medium' });
    assert.equal(by('EX-001').d.priority, 'must');
    assert.equal(by('TEST-001').d.steps, 'a\nb');
    assert.equal(by('ATL-001').d.held_on, '2026-11-20');
    assert.equal(by('DEC-001').d.decider, 'Comité');
    assert.equal(by('RIS-001').d.mitigation, 'Plan');
    assert.equal(by('US-001').d.goal, 'but');
    assert.deepEqual(by('BES-001').d, {}, 'un besoin n\'a pas de table d\'extension');
    assert.equal(by('BES-001').description, 'Desc besoin');
    assert.equal(await loadProjectData(99999), null);
  } finally {
    t.close();
  }
});

test('D96 : lire et générer ne modifient rien (tables identiques, journal inchangé)', async () => {
  const t = await migratedDb();
  try {
    const { projectId, workshopId } = await buildProject();
    const before = snapshot(t.raw);
    for (const id of ALL) {
      const data = await loadProjectData(projectId);
      generateDeliverable(id, data!, { includeArchived: true, workshopId });
    }
    assert.deepEqual(snapshot(t.raw), before);
  } finally {
    t.close();
  }
});

test('de bout en bout : sept modèles enregistrés puis exportés en trois formats, signés ; l\'export n\'écrit rien', async () => {
  const t = await migratedDb();
  try {
    const { projectId, workshopId } = await buildProject();
    const before = snapshot(t.raw);
    const ids = new Map<string, number>();
    for (const m of MODELS) ids.set(m.id, (await saveDeliverable(projectId, m.id, { includeArchived: false, workshopId })).id);
    const saved7 = snapshot(t.raw);
    assert.equal(saved7.documents.count, before.documents.count + 7, 'un document par modèle');
    assert.equal(Number((await query<{ n: number }>("SELECT count(*) AS n FROM activity_log WHERE object_type = 'document' AND action = 'created'"))[0].n), 7, 'une ligne de journal par enregistrement');
    const sig = buildSignature(VERSION, NOW);
    const seen = new Set<string>();
    for (const m of MODELS) {
      for (const format of Object.keys(FORMATS) as ExportFormat[]) {
        const saved = await exportDocumentToFile(ids.get(m.id)!, format, { version: VERSION, now: NOW });
        assert.ok(saved, `${m.id}/${format}`);
        assert.ok(saved.name.endsWith(`.${FORMATS[format].ext}`) && saved.name.includes('20261126-143005'), saved.name);
        assert.ok(saved.name.includes(' v1-2026'), `${saved.name} : la version est dans le nom du fichier`);
        assert.ok(!seen.has(saved.name), 'noms distincts');
        seen.add(saved.name);
        const bytes = new Uint8Array(fs.readFileSync(saved.path));
        assert.equal(saved.sizeBytes, bytes.length);
        if (format === 'docx') {
          assert.deepEqual(await missingFromDocx(bytes, sig), [], `${m.id} : signature Word`);
          const docx = await readDocx(bytes);
          assert.ok(docx.paragraphs.some((p) => p.includes('Projet M8')), `${m.id} : contenu Word`);
          assert.ok(docx.paragraphs.some((p) => p.includes('Document : version 1, brouillon')), `${m.id} : mention du statut dans Word`);
        } else {
          const text = new TextDecoder().decode(bytes);
          assert.ok(text.includes('BA-Mentor Portable Ultimate Edition') && text.includes('Version : 0.10.0') && text.includes('Date de génération : 26/11/2026 14:30'), `${m.id}/${format} : signature`);
          assert.ok(text.includes('Projet M8'));
          assert.ok(text.includes(format === 'markdown' ? '**Document :** version 1, brouillon' : 'Document :</strong> version 1, brouillon'), `${m.id}/${format} : mention du statut`);
        }
      }
    }
    assert.equal(seen.size, 21);
    assert.deepEqual(snapshot(t.raw), saved7, 'un export n\'ajoute aucune ligne, ni au journal (D96)');
  } finally {
    t.close();
  }
});

test('de bout en bout : contenu réel du compte rendu et de la matrice, version inconnue refusée, annulation de la boîte', async () => {
  const t = await migratedDb();
  try {
    const { projectId, workshopId } = await buildProject();
    const saved = await exportGeneratedToFile(projectId, 'workshop-report', 'markdown', { version: VERSION, now: NOW, includeArchived: false, workshopId });
    const md = fs.readFileSync(saved!.path, 'utf8');
    for (const s of ['**Atelier :** ATL-001 — Atelier 1', '| PP-001 | Alice | DSI | Sponsor |', '| Besoin | BES-001 | Besoin 1 | Brouillon |', '| Décision | DEC-001 | Décision 1 | Proposée |', '| Risque | RIS-001 | Risque 1 | Identifié |', 'N\n', 'A\n']) assert.ok(md.includes(s), s);
    const tr = fs.readFileSync((await exportGeneratedToFile(projectId, 'traceability', 'markdown', { version: VERSION, now: NOW, includeArchived: false }))!.path, 'utf8');
    assert.ok(tr.includes('| EX-001 — Exigence 1 | Indispensable (Must) | BES-001 | US-001 | TEST-001 | À exécuter |'));
    await assert.rejects(exportGeneratedToFile(projectId, 'traceability', 'markdown', { version: '—', now: NOW, includeArchived: false }), /version de l'application est inconnue/);
    assert.equal(await exportGeneratedToFile(projectId, 'traceability', 'docx', { version: VERSION, now: NOW, includeArchived: false, askWhere: true }), null);
  } finally {
    t.close();
  }
});

test('erreurs : modèle inconnu, projet inconnu, atelier manquant', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await buildProject();
    const o = { version: VERSION, now: NOW, includeArchived: false };
    await assert.rejects(exportGeneratedToFile(projectId, 'inconnu', 'markdown', o), /Modèle de livrable inconnu/);
    await assert.rejects(exportGeneratedToFile(99999, 'requirements', 'markdown', o), /Projet introuvable/);
    await assert.rejects(exportGeneratedToFile(projectId, 'workshop-report', 'markdown', o), /Choisissez un atelier/);
    await assert.rejects(exportGeneratedToFile(projectId, 'workshop-report', 'markdown', { ...o, workshopId: 99999 }), /n'existe plus/);
  } finally {
    t.close();
  }
});

test('archivage : un élément archivé disparaît du registre, revient avec l\'option', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await buildProject();
    const rq = (await query<{ id: number }>("SELECT id FROM items WHERE code = 'EX-001'"))[0].id;
    await changeItemStatus(rq, 'archived');
    const data = (await loadProjectData(projectId))!;
    assert.ok(!gen('requirements', data, { includeArchived: false }).includes('| EX-001 |'));
    assert.ok(gen('requirements', data, { includeArchived: true }).includes('| EX-001 |'));
  } finally {
    t.close();
  }
});

test('mêmes données, deux générations : texte identique (pas de date ni de hasard dans le document lui-même)', () => {
  for (const id of ALL) assert.equal(gen(id), gen(id), id);
});

test('Word : un document volumineux (200 exigences) s\'exporte et se relit', async () => {
  const items: DItem[] = [];
  for (let n = 1; n <= 200; n++) items.push(di(n, 'requirement', `EX-${String(n).padStart(3, '0')}`, `Exigence numéro ${n} avec un titre assez long pour passer à la ligne dans une cellule`, 'draft', { nature: 'functional', priority: 'should', criteria: `Critère ${n}` }));
  const doc = generateDeliverable('requirements', { projectName: 'Gros projet', items, links: [] }, OPTS);
  const out = await exportDocument({ title: doc.title, markdown: doc.markdown }, 'docx', { version: VERSION, now: NOW });
  assert.deepEqual(await missingFromDocx(out.bytes, buildSignature(VERSION, NOW)), []);
});

test('lecteur : une ligne de détails d\'un autre type (anomalie) n\'est pas lue ; les liens d\'un autre projet non plus', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await buildProject();
    const need = (await query<{ id: number }>("SELECT id FROM items WHERE code = 'BES-001'"))[0].id;
    t.raw.exec(`INSERT INTO workshop_details (item_id, held_on, place, objective, notes, follow_up) VALUES (${need}, '2026-01-01', 'Intrus', '', '', '')`);
    const other = await createProject('Autre');
    const a = await createItem({ projectId: other, kind: 'need', title: 'A' });
    const b = await createRequirement({ projectId: other, title: 'B' });
    await createLink({ type: 'derives', fromId: a.id, toId: b.id });
    const data = (await loadProjectData(projectId))!;
    assert.deepEqual(data.items.find((i) => i.code === 'BES-001')!.d, {}, 'le détail d\'un autre type est ignoré');
    assert.equal(data.links.length, 8, 'seuls les liens du projet');
    assert.ok(data.links.every((l) => data.items.some((i) => i.id === l.fromId) && data.items.some((i) => i.id === l.toId)));
  } finally {
    t.close();
  }
});

test('export réel : l\'option « archivés ou rejetés » et l\'atelier choisi sont bien transmis au générateur', async () => {
  const t = await migratedDb();
  try {
    const { projectId, workshopId } = await buildProject();
    const second = await createWorkshop({ projectId, title: 'Second atelier' });
    const old = await createRequirement({ projectId, title: 'Exigence archivée' });
    await changeItemStatus(old.id, 'archived');
    const read = async (model: string, extra: { includeArchived: boolean; workshopId?: number | null }): Promise<string> =>
      fs.readFileSync((await exportGeneratedToFile(projectId, model, 'markdown', { version: VERSION, now: NOW, ...extra }))!.path, 'utf8');
    assert.ok(!(await read('requirements', { includeArchived: false })).includes('Exigence archivée'));
    assert.ok((await read('requirements', { includeArchived: true })).includes('Exigence archivée'));
    assert.ok((await read('workshop-report', { includeArchived: false, workshopId })).includes('ATL-001 — Atelier 1'));
    assert.ok((await read('workshop-report', { includeArchived: false, workshopId: second.id })).includes('ATL-002 — Second atelier'));
  } finally {
    t.close();
  }
});
