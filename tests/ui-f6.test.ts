// Lot F6 : logique pure et rendu statique de l'écran Documents (valider, archiver, désarchiver, comparer) et du message de Livrables
// (décisions F6-D01, D03 à D08). Aucun clic simulé : cadre de validation, boutons, cases et comparaison se vérifient à la recette sur clé (TESTS-F6.md).
// Si esbuild est introuvable, les rendus sont « ignorés ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRender } from './helpers/ui-loader.ts';
import {
  archivedCount, archivedMessage, comparisonView, detailView, documentLine, noDifferenceText, replacedCount, unarchivedMessage, validatedMessage, visibleDocuments,
} from '../src/modules/documents/logic.ts';
import type { DetailInput, DocumentInput } from '../src/modules/documents/logic.ts';
import { savedMessage } from '../src/modules/deliverables/logic.ts';
import { compareSnapshots, serializeOptions, serializeSnapshot } from '../src/domain/documents.ts';

const doc = (over: Partial<DocumentInput> = {}): DocumentInput => ({
  id: 1, name: 'Registre des exigences Exemple', status: 'draft', version: 1, series_key: 'requirements', replaces_id: null, replaced_by_id: null, replaced_by_version: null, updated_at: '2026-11-27T14:08:09.000Z', ...over,
});
const detail = (over: Partial<DetailInput> = {}): DetailInput => ({
  ...doc(), kind: 'generated', template_ref: 'requirements', replaces_version: null,
  options_json: serializeOptions({ includeArchived: false, workshopId: null }),
  items_snapshot: serializeSnapshot([{ code: 'EX-001', title: 'Exporter', status: 'validated' }]), ...over,
});

// ------------------------------------------------------------------ logique pure

test('liste : deux cases indépendantes — remplacés et archivés ; un archivé remplacé ne compte que parmi les remplacés (F6-D08)', () => {
  const docs = [
    doc({ id: 5 }),
    doc({ id: 4, status: 'archived' }),
    doc({ id: 3, status: 'archived', replaced_by_id: 5, replaced_by_version: 2 }),
    doc({ id: 2, status: 'validated', replaced_by_id: 5, replaced_by_version: 2 }),
    doc({ id: 1, status: 'archived', series_key: null }),
  ];
  const ids = (a: boolean, b: boolean): number[] => visibleDocuments(docs, a, b).map((d) => d.id);
  assert.deepEqual(ids(false, false), [5], 'par défaut : ni remplacés ni archivés');
  assert.deepEqual(ids(true, false), [5, 3, 2], 'remplacés seuls : l\'archivé remplacé apparaît, l\'archivé courant non');
  assert.deepEqual(ids(false, true), [5, 4, 1]);
  assert.deepEqual(ids(true, true), [5, 4, 3, 2, 1]);
  assert.equal(archivedCount(docs), 2, 'archivés non remplacés : 4 et 1');
  assert.equal(replacedCount(docs), 2);
  assert.deepEqual(visibleDocuments(docs, false).map((d) => d.id), [5, 4, 1], 'sans troisième argument, comportement de F5 : les archivés restent visibles');
  assert.equal(archivedCount([]), 0);
});

test('détail : gestes proposés selon l\'état, un geste non permis n\'est pas proposé ; comparer seulement pour un document généré (F6-D01 à D06)', () => {
  assert.deepEqual(detailView(detail()).actions, ['validate', 'archive']);
  assert.deepEqual(detailView(detail({ status: 'validated' })).actions, ['archive']);
  assert.deepEqual(detailView(detail({ status: 'archived' })).actions, ['unarchive']);
  assert.deepEqual(detailView(detail({ replaced_by_id: 2, replaced_by_version: 2 })).actions, []);
  assert.equal(detailView(detail()).canCompare, true);
  assert.equal(detailView(detail({ replaced_by_id: 2, replaced_by_version: 2 })).canCompare, true, 'un remplacé se compare');
  const imp = detailView(detail({ series_key: null, kind: 'cr', template_ref: null, options_json: null, items_snapshot: null }));
  assert.equal(imp.canCompare, false);
  assert.deepEqual(imp.actions, ['validate', 'archive'], 'un import V1 se valide et s\'archive');
});

test('détail : dates de validation et d\'archivage, commentaire, affichés seulement quand ils existent (F6-D08)', () => {
  const base = detailView(detail());
  assert.deepEqual(base.facts.map((f) => f.label), ['État', 'Version', 'Origine', 'Dernière date', 'Options']);
  const v = detailView(detail({ status: 'validated', validated_at: '2026-11-27T10:00:00.000Z', validation_comment: 'Relu en COPIL' }));
  assert.deepEqual(v.facts.map((f) => f.label), ['État', 'Version', 'Origine', 'Dernière date', 'Options', 'Validé le', 'Commentaire de validation']);
  assert.match(v.facts.find((f) => f.label === 'Validé le')!.value, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
  assert.equal(v.facts.find((f) => f.label === 'Commentaire de validation')!.value, 'Relu en COPIL');
  const a = detailView(detail({ status: 'archived', validated_at: '2026-11-27T10:00:00.000Z', archived_at: '2026-11-28T10:00:00.000Z' }));
  assert.deepEqual(a.facts.slice(-2).map((f) => f.label), ['Validé le', 'Archivé le']);
  assert.equal(detailView(detail({ validation_comment: '' })).facts.some((f) => f.label === 'Commentaire de validation'), false, 'commentaire vide : pas de ligne');
  assert.equal(documentLine(doc({ status: 'validated' })).state, 'Validé');
});

test('messages : validation avec date, archivage, désarchivage selon le statut retrouvé (F6-D01, D03, D04)', () => {
  assert.match(validatedMessage('2026-11-27T10:00:00.000Z'), /^Document validé le \d{2}\/\d{2}\/\d{4}\.$/);
  assert.equal(archivedMessage, 'Document archivé. Il n’apparaît plus dans la liste ; cochez « Afficher les archivés » pour le retrouver.');
  assert.equal(unarchivedMessage('validated'), 'Document désarchivé : il est de nouveau Validé.');
  assert.equal(unarchivedMessage('draft'), 'Document désarchivé : il est de nouveau Brouillon.');
});

test('Livrables : le message d\'un contenu identique dit l\'état de la version — brouillon, validée, archivée (F6-D05)', () => {
  assert.equal(savedMessage({ outcome: 'identical', version: 1 }), 'Contenu identique à la version 1 : aucune nouvelle version.');
  assert.equal(savedMessage({ outcome: 'identical', version: 1, status: 'draft' }), 'Contenu identique à la version 1 : aucune nouvelle version.');
  assert.equal(savedMessage({ outcome: 'identical', version: 2, status: 'validated' }), 'Contenu identique à la version 2, validée : aucune nouvelle version.');
  assert.equal(savedMessage({ outcome: 'identical', version: 2, status: 'archived' }), 'Contenu identique à la version 2, qui est archivée : désarchivez-la dans Documents pour la rouvrir. Aucune nouvelle version.');
  assert.equal(savedMessage({ outcome: 'created', version: 1, replacedVersion: null }), 'Document enregistré : version 1 (brouillon).');
  assert.equal(savedMessage({ outcome: 'created', version: 3, replacedVersion: 2 }), 'Version 3 enregistrée ; la version 2 est remplacée.');
});

test('comparaison : synthèse accordée, un tableau par groupe non vide, libellés de statut par type, message sans écart (F6-D06, D07)', () => {
  const frozen = [{ code: 'EX-001', title: 'A', status: 'draft' }, { code: 'EX-002', title: 'B', status: 'draft' }, { code: 'EX-003', title: 'C', status: 'draft' }];
  const current = [{ code: 'EX-001', title: 'A 2', status: 'validated' }, { code: 'EX-002', title: 'B', status: 'draft' }, { code: 'EX-004', title: 'D', status: 'draft' }, { code: 'EX-005', title: 'E', status: 'draft' }];
  const v = comparisonView(compareSnapshots(frozen, current));
  assert.equal(v.summary, '2 ajoutés, 1 retiré, 1 statut modifié, 1 titre modifié');
  assert.deepEqual(v.groups.map((g) => g.title), ['Ajoutés', 'Retirés', 'Statut modifié', 'Titre modifié']);
  assert.deepEqual(v.groups[0].rows, [['EX-004', 'D', 'Brouillon'], ['EX-005', 'E', 'Brouillon']]);
  assert.deepEqual(v.groups[1].rows, [['EX-003', 'C', 'Brouillon']]);
  assert.deepEqual(v.groups[2].rows, [['EX-001', 'A 2', 'Brouillon → Validé']]);
  assert.deepEqual(v.groups[3].rows, [['EX-001', 'A', 'A 2']]);
  assert.equal(v.note, 'Calculé maintenant ; rien n’est enregistré.');
  const one = comparisonView(compareSnapshots(frozen, frozen.slice(1)));
  assert.equal(one.summary, '1 retiré');
  assert.deepEqual(one.groups.map((g) => g.title), ['Retirés']);
  const none = comparisonView(compareSnapshots(frozen, frozen));
  assert.equal(none.summary, noDifferenceText);
  assert.match(noDifferenceText, /Les descriptions, critères et liens ne sont pas comparés/);
  assert.deepEqual(none.groups, []);
  assert.equal(comparisonView(compareSnapshots([{ code: 'ZZ-1', title: 'x', status: 'bizarre' }], [])).groups[0].rows[0][2], 'bizarre', 'code ou statut inconnu : affiché tel quel, sans erreur');
});

// ------------------------------------------------------------------ rendu statique

interface Render {
  documents: (p: Record<string, unknown>) => string;
}
const render = loadRender<Render>();
const ui = (name: string, fn: (r: Render) => void) => test(name, { skip: render === null ? 'esbuild introuvable : rendu des écrans non vérifié' : false }, () => fn(render as Render));

const view = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  projectName: 'Exemple', lines: [], total: 1, replacedCount: 0, showReplaced: false, archivedCount: 0, showArchived: false, selectedId: 1,
  detail: detailView(detail()), preview: '# Registre', askWhere: false, busy: false, message: null, validating: false, comment: '', comparison: null, ...over,
});
const buttons = (html: string): string[] => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);

ui('rendu : deux cases — remplacées et archivées, avec leurs nombres, la seconde cochée selon l\'état (F6-D08)', (r) => {
  const html = r.documents(view({ replacedCount: 2, archivedCount: 3, showArchived: true }));
  assert.ok(html.includes('Afficher les versions remplacées (2)') && html.includes('Afficher les archivés (3)'));
  assert.match(html, /<input[^>]*id="doc-archived"[^>]*checked=""/);
  assert.ok(!/<input[^>]*id="doc-replaced"[^>]*checked=""/.test(html));
});

ui('rendu : un brouillon propose Valider, Archiver, Comparer et les trois exports ; pas de Désarchiver (F6-D01, D03)', (r) => {
  const b = buttons(r.documents(view()));
  for (const t of ['Valider', 'Archiver', 'Comparer avec l’état courant', 'Exporter en Markdown', 'Exporter en HTML', 'Exporter en Word']) assert.ok(b.includes(t), t);
  assert.ok(!b.includes('Désarchiver') && !b.includes('Confirmer la validation'));
});

ui('rendu : un validé ne propose plus Valider ; un archivé propose Désarchiver seulement ; un remplacé aucun geste ; un import V1 ni Comparer (F6-D02 à D06)', (r) => {
  const validated = buttons(r.documents(view({ detail: detailView(detail({ status: 'validated' })) })));
  assert.ok(validated.includes('Archiver') && !validated.includes('Valider') && !validated.includes('Désarchiver'));
  const archived = buttons(r.documents(view({ detail: detailView(detail({ status: 'archived' })) })));
  assert.ok(archived.includes('Désarchiver') && !archived.includes('Archiver') && !archived.includes('Valider') && archived.includes('Comparer avec l’état courant'));
  const replaced = buttons(r.documents(view({ detail: detailView(detail({ replaced_by_id: 2, replaced_by_version: 2 })) })));
  for (const t of ['Valider', 'Archiver', 'Désarchiver']) assert.ok(!replaced.includes(t), t);
  assert.ok(replaced.includes('Exporter en Word'));
  const imp = buttons(r.documents(view({ detail: detailView(detail({ series_key: null, kind: 'cr', options_json: null, items_snapshot: null })) })));
  assert.ok(imp.includes('Valider') && imp.includes('Archiver') && !imp.includes('Comparer avec l’état courant'));
});

ui('rendu : le cadre de validation — avertissement d\'irréversibilité, commentaire limité à 500, Confirmer et Annuler ; absent sinon (F6-D01, D02)', (r) => {
  const open = r.documents(view({ validating: true, comment: 'Relu <ok>' }));
  assert.ok(open.includes('Une validation ne s’annule pas'));
  assert.ok(open.includes('Commentaire de validation (facultatif, 500 caractères)'));
  assert.match(open, /<textarea[^>]*maxLength="500"/);
  assert.ok(open.includes('Relu &lt;ok&gt;') && !open.includes('Relu <ok>'), 'le commentaire est échappé');
  const b = buttons(open);
  assert.ok(b.includes('Confirmer la validation') && b.includes('Annuler'));
  assert.ok(!buttons(r.documents(view())).includes('Confirmer la validation'));
  assert.ok(!buttons(r.documents(view({ validating: true, detail: detailView(detail({ status: 'validated' })) }))).includes('Confirmer la validation'), 'le cadre ne s\'affiche pas si Valider n\'est plus permis');
});

ui('rendu : comparaison — synthèse, tableaux par groupe, note ; message « impossible » ; absente tant qu\'elle n\'est pas demandée (F6-D06, D07)', (r) => {
  assert.ok(!r.documents(view()).includes('Comparaison avec l’état courant</h4>'));
  const c = comparisonView(compareSnapshots([{ code: 'EX-001', title: 'A <i>', status: 'draft' }], [{ code: 'EX-001', title: 'A', status: 'validated' }, { code: 'EX-002', title: 'B', status: 'draft' }]));
  const html = r.documents(view({ comparison: { view: c } }));
  for (const t of ['Comparaison avec l’état courant', '1 ajouté, 1 statut modifié, 1 titre modifié', '>Ajoutés<', '>Statut modifié<', '>Titre modifié<', 'Brouillon → Validé', 'Calculé maintenant ; rien n’est enregistré.']) assert.ok(html.includes(t), t);
  assert.ok(html.includes('A &lt;i&gt;') && !html.includes('A <i>'), 'titres échappés');
  assert.ok(!html.includes('>Retirés<'), 'un groupe vide n\'est pas affiché');
  const none = r.documents(view({ comparison: { view: comparisonView(compareSnapshots([], [])) } }));
  assert.ok(none.includes('Aucun écart sur les éléments listés (code, titre, statut).'));
  const un = r.documents(view({ comparison: { unavailable: 'Ce document a été importé de la V1 : comparaison impossible.' } }));
  assert.ok(un.includes('comparaison impossible.') && !un.includes('Calculé maintenant'));
});

ui('rendu : occupation — tous les gestes sont désactivés pendant une écriture ; faits de validation affichés dans le détail (F6)', (r) => {
  const html = r.documents(view({ busy: true, detail: detailView(detail({ validated_at: '2026-11-27T10:00:00.000Z', status: 'validated', validation_comment: 'Relu' })) }));
  const all = [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].filter((m) => !/aria-pressed/.test(m[1]));
  assert.ok(all.length >= 4);
  for (const m of all) assert.match(m[1], /disabled=""/, m[2]);
  assert.ok(html.includes('Validé le') && html.includes('Commentaire de validation') && html.includes('Relu'));
});
