// Lot F5 : logique pure et rendu statique de l'écran Documents, et du nouvel état de Livrables (décisions F5-D01, F5-D04, F5-D07, F5-D09 à F5-D11).
// Aucun clic simulé : sélection, case des versions remplacées, ouverture depuis Livrables et export se vérifient à la recette sur clé (TESTS-F5.md).
// Si esbuild est introuvable, les rendus sont « ignorés ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRender } from './helpers/ui-loader.ts';
import { detailView, documentLine, emptyDocumentsText, exportedMessage, kindOfCode, replacedCount, replacementText, snapshotRows, visibleDocuments } from '../src/modules/documents/logic.ts';
import type { DetailInput, DocumentDetailView, DocumentInput, DocumentLine } from '../src/modules/documents/logic.ts';
import { serializeOptions, serializeSnapshot } from '../src/domain/documents.ts';

const doc = (over: Partial<DocumentInput> = {}): DocumentInput => ({
  id: 1, name: 'Registre des exigences Exemple', status: 'draft', version: 1, series_key: 'requirements', replaces_id: null, replaced_by_id: null, replaced_by_version: null, updated_at: '2026-11-27T14:08:09.000Z', ...over,
});
const detail = (over: Partial<DetailInput> = {}): DetailInput => ({
  ...doc(), kind: 'generated', template_ref: 'requirements', replaces_version: null,
  options_json: serializeOptions({ includeArchived: false, workshopId: null }),
  items_snapshot: serializeSnapshot([{ code: 'EX-001', title: 'Exporter', status: 'validated' }, { code: 'BES-002', title: 'Besoin', status: 'draft' }]), ...over,
});

// ------------------------------------------------------------------ logique pure

test('ligne de liste : version « v2 » pour un document généré, vide pour un import V1 ; état « Remplacé » si une suite existe (F5-D04, F5-D11)', () => {
  const a = documentLine(doc({ version: 2, replaces_id: 1 }));
  assert.deepEqual([a.version, a.state, a.origin, a.replaced], ['v2', 'Brouillon', 'Généré', false]);
  assert.match(a.when, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
  const b = documentLine(doc({ id: 2, replaced_by_id: 3, replaced_by_version: 2 }));
  assert.deepEqual([b.state, b.replaced], ['Remplacé', true]);
  const c = documentLine(doc({ id: 4, series_key: null, status: 'validated', name: 'CR importé' }));
  assert.deepEqual([c.version, c.state, c.origin], ['', 'Validé', 'Importé V1']);
  assert.equal(documentLine(doc({ status: 'archived', series_key: null })).state, 'Archivé');
});

test('liste : les versions remplacées sont masquées par défaut, visibles avec la case ; l\'ordre reçu est conservé (F5-D11)', () => {
  const docs = [doc({ id: 3 }), doc({ id: 2, replaced_by_id: 3, replaced_by_version: 2 }), doc({ id: 1, series_key: null, replaced_by_id: null }), doc({ id: 0, replaced_by_id: 2, replaced_by_version: 2 })];
  assert.deepEqual(visibleDocuments(docs, false).map((d) => d.id), [3, 1]);
  assert.deepEqual(visibleDocuments(docs, true).map((d) => d.id), [3, 2, 1, 0]);
  assert.equal(replacedCount(docs), 2);
  assert.equal(replacedCount([]), 0);
  assert.deepEqual(visibleDocuments([], false), []);
});

test('messages : projet sans document, ou liste filtrée vide', () => {
  assert.equal(emptyDocumentsText(0), 'Aucun document dans ce projet. Enregistrez un livrable depuis l’écran Livrables.');
  assert.equal(emptyDocumentsText(3), 'Aucun document à afficher.');
  assert.equal(replacementText(null, 3), 'Remplacée par la version 3');
  assert.equal(replacementText(2, null), 'Remplace la version 2');
  assert.equal(replacementText(1, 3), 'Remplacée par la version 3', 'une version du milieu dit d\'abord qu\'elle est remplacée');
  assert.equal(replacementText(null, null), '');
  assert.equal(exportedMessage('Word', 'a.docx', '1,2 Ko', 'C:\\x\\a.docx'), 'Export Word créé : a.docx (1,2 Ko). Emplacement : C:\\x\\a.docx');
});

test('code → type d\'élément, et libellé du statut propre au type (« Prête » n’existe que pour une story)', () => {
  assert.equal(kindOfCode('EX-001'), 'requirement');
  assert.equal(kindOfCode('BES-014'), 'need');
  assert.equal(kindOfCode('TEST-006'), 'test');
  assert.equal(kindOfCode('ATL-001'), 'workshop');
  assert.equal(kindOfCode('XX-001'), null);
  assert.equal(kindOfCode('EX001'), null);
  assert.equal(kindOfCode(''), null);
  const rows = snapshotRows([{ code: 'EX-001', title: 'A', status: 'validated' }, { code: 'US-002', title: 'B', status: 'ready' }, { code: 'ZZ-1', title: 'C', status: 'bizarre' }]);
  assert.deepEqual(rows.map((r) => r.status), ['Validé', 'Prête', 'bizarre'], 'un statut inconnu s\'affiche tel quel, sans erreur');
});

test('détail d\'un document généré : version, options, série, liste figée triée (F5-D07)', () => {
  const v = detailView(detail({ version: 2, replaces_id: 1, replaces_version: 1 }));
  assert.deepEqual(v.facts.map((f) => f.label), ['État', 'Version', 'Origine', 'Dernière date', 'Série', 'Options']);
  assert.equal(v.facts.find((f) => f.label === 'Série')!.value, 'Remplace la version 1');
  assert.equal(v.facts.find((f) => f.label === 'Options')!.value, 'Éléments archivés ou rejetés exclus');
  assert.deepEqual(v.items?.map((i) => i.code), ['BES-002', 'EX-001']);
  assert.equal(detailView(detail({ options_json: serializeOptions({ includeArchived: true, workshopId: null }) })).facts.find((f) => f.label === 'Options')!.value, 'Éléments archivés ou rejetés inclus');
  assert.match(detailView(detail({ series_key: 'traceability', options_json: serializeOptions({ includeArchived: true, workshopId: null }) })).facts.find((f) => f.label === 'Options')!.value, /^Sans objet/);
  assert.equal(detailView(detail({ options_json: null })).facts.find((f) => f.label === 'Options')!.value, 'Non enregistrées');
  assert.equal(detailView(detail({ replaced_by_id: 5, replaced_by_version: 3 })).facts[0].value, 'Remplacé');
});

test('détail d\'un document importé de la V1 ou à liste illisible : jamais d\'erreur, message explicite', () => {
  const v1 = detailView(detail({ series_key: null, kind: 'cr', template_ref: null, options_json: null, items_snapshot: null }));
  assert.deepEqual(v1.facts.map((f) => f.label), ['État', 'Origine', 'Dernière date']);
  assert.equal(v1.items, null);
  assert.match(v1.noItemsText, /importé de la V1/);
  const broken = detailView(detail({ items_snapshot: '{cassé' }));
  assert.equal(broken.items, null);
  assert.match(broken.noItemsText, /absente ou illisible/);
  assert.deepEqual(detailView(detail({ items_snapshot: '[]' })).items, []);
});

// ------------------------------------------------------------------ rendu statique

type ViewProps = {
  projectName: string; lines: DocumentLine[]; total: number; replacedCount: number; showReplaced: boolean; selectedId: number | null;
  detail: DocumentDetailView | null; preview: string; askWhere: boolean; busy: boolean; message: { level: 'ok' | 'error'; text: string } | null;
};
interface Render {
  documents: (p: ViewProps) => string;
  deliverables: (p: Record<string, unknown>) => string;
  shell: (p: { navigable: boolean; screen: string; projects: Array<{ id: number; name: string }>; activeId: number | null }) => string;
}
const render = loadRender<Render>();
const ui = (name: string, fn: (r: Render) => void) => test(name, { skip: render === null ? 'esbuild introuvable : rendu des écrans non vérifié' : false }, () => fn(render as Render));

const view = (over: Partial<ViewProps> = {}): ViewProps => ({
  projectName: 'Exemple <CRP>', lines: [], total: 0, replacedCount: 0, showReplaced: false, selectedId: null, detail: null, preview: '', askWhere: false, busy: false, message: null, ...over,
});

ui('rendu : le menu place « Documents » juste après « Livrables », dans Pilotage (F5-D01)', (r) => {
  const html = r.shell({ navigable: true, screen: 'documents', projects: [{ id: 1, name: 'A' }], activeId: 1 });
  assert.match(html, /aria-current="page"[^>]*>Documents</);
  assert.ok(html.indexOf('>Livrables<') < html.indexOf('>Documents<') && html.indexOf('>Documents<') < html.indexOf('>Réalisation<'));
});

ui('rendu documents : projet vide, message, case à zéro, aucun tableau, nom du projet échappé', (r) => {
  const html = r.documents(view());
  assert.ok(html.includes('Aucun document dans ce projet. Enregistrez un livrable depuis l’écran Livrables.'));
  assert.ok(html.includes('Afficher les versions remplacées (0)'));
  assert.ok(html.includes('Exemple &lt;CRP&gt;') && !html.includes('Exemple <CRP>'));
  assert.ok(!html.includes('<table') && !html.includes('Détail du document'));
});

ui('rendu documents : liste, colonnes, sélection, nom cliquable, version vide pour un import', (r) => {
  const lines = [documentLine(doc({ id: 7, version: 2, replaces_id: 6 })), documentLine(doc({ id: 3, series_key: null, status: 'validated', name: 'CR importé <b>' }))];
  const html = r.documents(view({ lines, total: 3, replacedCount: 1, selectedId: 7 }));
  for (const t of ['>Nom<', '>Version<', '>État<', '>Origine<', '>Date<', '>v2<', '>Brouillon<', '>Généré<', '>Validé<', '>Importé V1<', 'Afficher les versions remplacées (1)']) assert.ok(html.includes(t), t);
  assert.equal((html.match(/<tr class="border-t/g) ?? []).length, 2);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1, 'une seule ligne sélectionnée');
  assert.ok(html.includes('CR importé &lt;b&gt;') && !html.includes('<b>'));
  assert.ok(!html.includes('Détail du document'), 'pas de détail sans sélection');
  assert.match(view({ showReplaced: true }).showReplaced ? r.documents(view({ showReplaced: true })) : '', /<input[^>]*id="doc-replaced"[^>]*checked=""/);
});

ui('rendu documents : détail — faits, liste figée, aperçu échappé, trois boutons d\'export, case « Enregistrer sous »', (r) => {
  const d = detailView(detail({ version: 2, replaces_id: 1, replaces_version: 1 }));
  const html = r.documents(view({ lines: [documentLine(doc({ id: 7 }))], total: 1, selectedId: 7, detail: d, preview: '# Titre <script>x</script>\n| a | b |' }));
  for (const t of ['Détail du document', '>État<', '>Version<', 'Remplace la version 1', 'Éléments archivés ou rejetés exclus', 'Éléments figés', 'Statut à la génération', '>BES-002<', '>EX-001<', '>Validé<', 'Aperçu du contenu figé', 'Exporter en Markdown', 'Exporter en HTML', 'Exporter en Word', 'Choisir l’emplacement']) assert.ok(html.includes(t), t);
  assert.ok(html.indexOf('BES-002') < html.indexOf('EX-001'), 'tri par code');
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;') && !html.includes('<script>x'));
  assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>Exporter en/);
  assert.ok(!html.includes('Supprimer') && !html.includes('Modifier'), 'aucune modification ni suppression en F5');
});

ui('rendu documents : import V1 sans liste figée, liste vide, message de réussite ou d\'erreur, occupation', (r) => {
  const imported = r.documents(view({ lines: [documentLine(doc({ series_key: null }))], total: 1, selectedId: 1, detail: detailView(detail({ series_key: null, items_snapshot: null, options_json: null })), preview: 'Texte' }));
  assert.ok(imported.includes('importé de la V1 : il n’a pas de liste figée'));
  assert.ok(!imported.includes('Statut à la génération'));
  const empty = r.documents(view({ lines: [documentLine(doc())], total: 1, selectedId: 1, detail: detailView(detail({ items_snapshot: '[]' })), preview: 'x' }));
  assert.ok(empty.includes('Ce document ne présentait aucun élément.'));
  const ok = r.documents(view({ lines: [documentLine(doc())], total: 1, selectedId: 1, detail: detailView(detail()), preview: 'x', message: { level: 'ok', text: 'Export Word créé : a.docx' } }));
  assert.match(ok, /role="status"[^>]*>Export Word créé : a\.docx</);
  const bad = r.documents(view({ lines: [documentLine(doc())], total: 1, selectedId: 1, detail: detailView(detail()), preview: 'x', message: { level: 'error', text: 'Panne <x>' } }));
  assert.match(bad, /role="alert"[^>]*>Panne &lt;x&gt;</);
  const busy = r.documents(view({ lines: [documentLine(doc())], total: 1, selectedId: 1, detail: detailView(detail()), preview: 'x', busy: true }));
  assert.equal((busy.match(/<button[^>]*disabled=""[^>]*>Exporter en/g) ?? []).length, 3, 'pendant un export, les trois boutons sont bloqués');
});

ui('rendu documents : la liste vide filtrée dit qu\'aucun document n\'est à afficher', (r) => {
  const html = r.documents(view({ total: 2, replacedCount: 2 }));
  assert.ok(html.includes('Aucun document à afficher.'));
});
