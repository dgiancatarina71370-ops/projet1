// Lot M3b : logique pure des écrans Besoins et Exigences, et rendu statique des écrans d'affichage (décisions D44 à D51).
// Comme pour M3a, aucun clic ni saisie n'est simulé : ces comportements se vérifient à la recette sur clé. Si esbuild est introuvable, les rendus sont « ignorés ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRender } from './helpers/ui-loader.ts';
import { filterByStatus, isDirty, deletionMessage, emptyListText } from '../src/shared/register-logic.ts';
import {
  EMPTY_NEED_FORM, EMPTY_REQUIREMENT_FORM, NATURE_OPTIONS, PRIORITY_OPTIONS, STATUS_FILTER_OPTIONS, STATUS_OPTIONS,
  emptyNeedsMessage, emptyRequirementsMessage, validateNeedForm, validateRequirementForm,
} from '../src/modules/analysis/logic.ts';
import { MAX_CRITERIA_LENGTH } from '../src/domain/requirements.ts';

// ------------------------------------------------------------------ logique pure

test('registres : filtre par statut, saisie non enregistrée, messages de liste vide et de suppression', () => {
  const rows = [{ status: 'draft' }, { status: 'validated' }, { status: 'draft' }];
  assert.equal(filterByStatus(rows, 'all').length, 3);
  assert.equal(filterByStatus(rows, 'draft').length, 2);
  assert.equal(filterByStatus(rows, 'archived').length, 0);
  assert.equal(isDirty({ a: 'x' }, { a: 'x' }), false);
  assert.equal(isDirty({ a: 'x' }, { a: 'y' }), true);
  assert.equal(emptyListText(0, null, 'Aucun besoin', 'Créez-en un.'), 'Aucun besoin dans ce projet. Créez-en un.');
  assert.match(deletionMessage('EX-001', 'T', 0), /irréversible/);
  assert.match(deletionMessage('EX-001', 'T', 1), /1 lien sera aussi supprimé/);
  assert.match(deletionMessage('EX-001', 'T', 3), /3 liens seront aussi supprimés/);
});

test('écrans d\'analyse : options de statut, nature et priorité dans l\'ordre validé', () => {
  assert.deepEqual(STATUS_OPTIONS.map((o) => o.label), ['Brouillon', 'Validé', 'Rejeté', 'Archivé']);
  assert.deepEqual(STATUS_FILTER_OPTIONS.map((o) => o.value), ['all', 'draft', 'validated', 'rejected', 'archived']);
  assert.deepEqual(NATURE_OPTIONS.map((o) => o.label), ['Fonctionnelle', 'Non fonctionnelle', 'Contrainte']);
  assert.deepEqual(PRIORITY_OPTIONS.map((o) => o.label), ['Indispensable (Must)', 'Important (Should)', 'Souhaitable (Could)', 'Hors périmètre (Won\'t)']);
});

test('écrans d\'analyse : messages de liste vide accordés (« Aucun besoin », « Aucune exigence ») et distincts du filtre', () => {
  assert.match(emptyNeedsMessage(0, 'all'), /^Aucun besoin dans ce projet\. Créez le premier/);
  assert.match(emptyRequirementsMessage(0, 'all'), /^Aucune exigence dans ce projet\. Créez la première/);
  assert.match(emptyNeedsMessage(4, 'rejected'), /Aucun besoin « Rejeté » : 4 au total/);
  assert.match(emptyRequirementsMessage(2, 'validated'), /Aucune exigence « Validé » : 2 au total/);
});

test('formulaire besoin : titre obligatoire, limité à 200, espaces retirés, description conservée telle quelle', () => {
  assert.equal(validateNeedForm(EMPTY_NEED_FORM).ok, false);
  const empty = validateNeedForm({ title: '   ', description: '' });
  assert.ok(!empty.ok && /obligatoire/.test(empty.errors.title ?? ''));
  const long = validateNeedForm({ title: 'x'.repeat(201), description: '' });
  assert.ok(!long.ok && /200/.test(long.errors.title ?? ''));
  const ok = validateNeedForm({ title: '  Mon besoin  ', description: '  ligne 1\nligne 2  ' });
  assert.ok(ok.ok && ok.title === 'Mon besoin' && ok.description === '  ligne 1\nligne 2  ');
});

test('formulaire exigence : défauts, une erreur par champ fautif, critères limités, valeurs normalisées', () => {
  assert.deepEqual(EMPTY_REQUIREMENT_FORM, { title: '', description: '', nature: 'functional', priority: 'should', criteria: '' });
  const bad = validateRequirementForm({ title: '', description: '', nature: 'zzz', priority: 'yyy', criteria: 'x'.repeat(MAX_CRITERIA_LENGTH + 1) });
  assert.ok(!bad.ok);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ['criteria', 'nature', 'priority', 'title'], 'les quatre erreurs sont remontées ensemble, pas une par une');
  const ok = validateRequirementForm({ title: ' E ', description: 'd', nature: 'constraint', priority: 'wont', criteria: 'c' });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual({ t: ok.title, f: ok.fields }, { t: 'E', f: { nature: 'constraint', priority: 'wont', criteria: 'c' } });
});

// ------------------------------------------------------------------ rendu statique

interface NeedRow { id: number; code: string; title: string; description: string; status: string }
interface ReqRow extends NeedRow { nature: string; priority: string; criteria: string }
interface Render {
  analysisNoProject: (what: string) => string;
  needList: (p: { rows: NeedRow[]; total: number; filter: string }) => string;
  needDetail: (p: { row: NeedRow; confirm: string | null; error: string }) => string;
  needForm: (p: { errors: Record<string, string>; askAbandon: boolean; title: string }) => string;
  reqList: (p: { rows: ReqRow[]; total: number; filter: string }) => string;
  reqDetail: (p: { row: ReqRow; confirm: string | null; error: string }) => string;
  reqForm: (p: { errors: Record<string, string>; askAbandon: boolean; title: string; nature: string; priority: string; criteria: string }) => string;
  links: (p: {
    rows: Array<{ linkId: number; label: string; otherCode: string; otherTitle: string; otherStatus: string }>;
    options: Array<{ key: string; label: string }>; optionKey: string;
    candidates: Array<{ id: number; label: string }>; candidateId: string; error: string; confirmRemove: { linkId: number; message: string } | null;
  }) => string;
}

const render = loadRender<Render>();
const ui = (name: string, fn: (r: Render) => void) => test(name, { skip: render === null ? 'esbuild introuvable : rendu des écrans non vérifié' : false }, () => fn(render as Render));

const NEED: NeedRow = { id: 1, code: 'BES-001', title: 'Suivre <b>les</b> campagnes', description: 'Ligne 1\nLigne 2', status: 'draft' };
const REQ: ReqRow = { id: 2, code: 'EX-001', title: 'Temps de réponse', description: '', status: 'validated', nature: 'non_functional', priority: 'must', criteria: 'Moins de 2 s <script>x</script>' };

ui('rendu : sans projet actif, besoins et exigences renvoient vers les projets', (r) => {
  const html = r.analysisNoProject('Les besoins');
  assert.match(html, /Aucun projet actif\. Les besoins appartiennent à un projet/);
  assert.match(html, /Aller aux projets/);
  assert.match(r.analysisNoProject('Les exigences'), /Les exigences appartiennent/);
});

ui('rendu : liste des besoins (lignes, statuts, filtre à quatre statuts, singulier et pluriel, états vides)', (r) => {
  const html = r.needList({ rows: [NEED, { ...NEED, id: 2, code: 'BES-002', title: 'Autre', status: 'rejected' }], total: 2, filter: 'all' });
  assert.match(html, /2 besoins/);
  assert.ok(html.includes('BES-001') && html.includes('BES-002') && html.includes('Brouillon') && html.includes('Rejeté'));
  for (const label of ['Tous', 'Brouillon', 'Validé', 'Rejeté', 'Archivé']) assert.ok(html.includes(`>${label}<`), label);
  assert.match(html, /aria-pressed="true"[^>]*>Tous</);
  assert.ok(html.includes('Nouveau besoin'));
  assert.ok(html.includes('Suivre &lt;b&gt;les&lt;/b&gt; campagnes') && !html.includes('<b>les</b>'), 'titre échappé');
  assert.match(r.needList({ rows: [NEED], total: 1, filter: 'all' }), /1 besoin\b(?!s)/);
  const none = r.needList({ rows: [], total: 0, filter: 'all' });
  assert.match(none, /Aucun besoin dans ce projet/);
  assert.ok(!none.includes('<table'));
  assert.match(r.needList({ rows: [], total: 3, filter: 'archived' }), /Aucun besoin « Archivé » : 3 au total/);
});

ui('rendu : fiche d\'un besoin (description, changement de statut, modifier, suppression confirmée en ligne, erreur)', (r) => {
  const html = r.needDetail({ row: NEED, confirm: null, error: '' });
  assert.ok(html.includes('BES-001 · Suivre &lt;b&gt;les&lt;/b&gt; campagnes'));
  assert.ok(html.includes('Ligne 1') && html.includes('whitespace-pre-wrap'), 'retours à la ligne conservés à l\'affichage');
  assert.ok(html.includes('Modifier') && html.includes('Supprimer…'));
  assert.ok(html.includes('Passer à'));
  for (const label of ['Validé', 'Rejeté', 'Archivé']) assert.match(html, new RegExp(`<button[^>]*>${label}</button>`), `bouton « ${label} » proposé`);
  assert.doesNotMatch(html, /<button[^>]*>Brouillon<\/button>/, 'le statut courant n\'est pas proposé comme destination');
  assert.match(html, /<dt[^>]*>Statut<\/dt><dd>Brouillon<\/dd>/, 'le statut courant est affiché');
  const asking = r.needDetail({ row: NEED, confirm: 'Supprimer définitivement BES-001 ?', error: '' });
  assert.ok(asking.includes('Supprimer définitivement BES-001 ?') && asking.includes('Supprimer définitivement') && !asking.includes('Supprimer…'));
  assert.match(r.needDetail({ row: NEED, confirm: null, error: 'Panne <x>' }), /role="alert"[^>]*>Panne &lt;x&gt;</);
  assert.ok(r.needDetail({ row: { ...NEED, description: '' }, confirm: null, error: '' }).includes('—'), 'description vide : tiret');
});

ui('rendu : formulaire d\'un besoin (erreurs à leur place, confirmation avant d\'abandonner)', (r) => {
  const html = r.needForm({ errors: { title: 'Le titre du besoin est obligatoire.' }, askAbandon: false, title: '' });
  assert.match(html, /Nouveau besoin/);
  assert.match(html, /Le titre du besoin est obligatoire\./);
  assert.ok(!r.needForm({ errors: {}, askAbandon: false, title: 'x' }).includes('obligatoire.'));
  assert.match(r.needForm({ errors: {}, askAbandon: true, title: 'x' }), /abandon|Abandonner|perdr/i);
});

ui('rendu : liste des exigences (nature, priorité MoSCoW, statut, échappement)', (r) => {
  const html = r.reqList({ rows: [REQ, { ...REQ, id: 3, code: 'EX-002', nature: 'constraint', priority: 'wont', status: 'archived' }], total: 2, filter: 'all' });
  assert.match(html, /2 exigences/);
  for (const t of ['EX-001', 'EX-002', 'Non fonctionnelle', 'Contrainte', 'Indispensable (Must)', 'Hors périmètre (Won&#x27;t)', 'Validé', 'Archivé', 'Nouvelle exigence']) assert.ok(html.includes(t), t);
  assert.match(r.reqList({ rows: [], total: 0, filter: 'all' }), /Aucune exigence dans ce projet/);
  assert.match(r.reqList({ rows: [REQ], total: 1, filter: 'all' }), /1 exigence\b(?!s)/);
});

ui('rendu : fiche d\'une exigence (champs propres, critères échappés, valeur inconnue signalée sans planter)', (r) => {
  const html = r.reqDetail({ row: REQ, confirm: null, error: '' });
  for (const t of ['Nature', 'Priorité', 'Critères d&#x27;acceptation', 'Non fonctionnelle', 'Indispensable (Must)']) assert.ok(html.includes(t), t);
  assert.ok(html.includes('Moins de 2 s &lt;script&gt;x&lt;/script&gt;') && !html.includes('<script>'), 'critères échappés');
  assert.match(html, /<dt[^>]*>Statut<\/dt><dd>Validé<\/dd>/);
  const odd = r.reqDetail({ row: { ...REQ, nature: 'zzz', priority: 'yyy', criteria: '' }, confirm: null, error: '' });
  assert.ok(odd.includes('zzz') || /inconnu/i.test(odd), 'une valeur inattendue en base reste visible');
  assert.ok(odd.includes('—'), 'critères vides : tiret');
});

ui('rendu : formulaire d\'une exigence (listes nature et priorité, valeurs sélectionnées, erreurs par champ)', (r) => {
  const html = r.reqForm({ errors: { priority: 'Priorité inconnue.', criteria: 'Critères trop longs.' }, askAbandon: false, title: 'T', nature: 'constraint', priority: 'could', criteria: 'abc' });
  assert.match(html, /<option value="constraint" selected="">Contrainte<\/option>|<option value="constraint"[^>]*selected/);
  assert.match(html, /<option value="could" selected="">Souhaitable \(Could\)<\/option>|<option value="could"[^>]*selected/);
  assert.equal((html.match(/<option /g) ?? []).length, 7, 'trois natures et quatre priorités');
  assert.ok(html.includes('Priorité inconnue.') && html.includes('Critères trop longs.'));
  assert.ok(html.includes('abc'));
});

ui('rendu : zone Liens (aucun lien, liens lus depuis l\'élément, ajout, confirmation de retrait, aucun candidat, aucune option)', (r) => {
  const base = { rows: [], options: [{ key: 'derives:out', label: 'dérive en' }, { key: 'expresses:in', label: 'exprimé par' }], optionKey: 'derives:out', candidates: [{ id: 5, label: 'EX-001 · Titre (Brouillon)' }], candidateId: '', error: '', confirmRemove: null };
  const empty = r.links(base);
  assert.match(empty, /Aucun lien\./);
  assert.ok(empty.includes('Ajouter un lien') && empty.includes('dérive en') && empty.includes('exprimé par') && empty.includes('EX-001 · Titre (Brouillon)'));
  assert.match(empty, /<button[^>]*disabled=""[^>]*>Ajouter le lien</, 'ajout impossible tant qu\'aucun élément n\'est choisi');
  assert.ok(!/<button[^>]*disabled=""[^>]*>Ajouter le lien</.test(r.links({ ...base, candidateId: '5' })));
  const rows = [{ linkId: 9, label: 'exprimé par', otherCode: 'PP-001', otherTitle: 'Resp <i>CRP</i>', otherStatus: 'Actif' }];
  const withRow = r.links({ ...base, rows });
  assert.ok(withRow.includes('exprimé par') && withRow.includes('PP-001') && withRow.includes('Resp &lt;i&gt;CRP&lt;/i&gt;') && withRow.includes('Retirer'));
  assert.ok(!withRow.includes('Aucun lien.'));
  const asking = r.links({ ...base, rows, confirmRemove: { linkId: 9, message: 'Retirer ce lien ?' } });
  assert.ok(asking.includes('Retirer ce lien ?') && asking.includes('Retirer le lien'));
  assert.ok(!r.links({ ...base, rows, confirmRemove: { linkId: 77, message: 'Autre lien' } }).includes('Autre lien'), 'la confirmation ne s\'affiche que sous le lien concerné');
  assert.match(r.links({ ...base, candidates: [] }), /Aucun élément disponible pour ce lien\./);
  assert.ok(!r.links({ ...base, options: [], candidates: [] }).includes('Ajouter un lien'), 'type sans lien exposé : pas de formulaire');
  assert.match(r.links({ ...base, error: 'Lien refusé <x>' }), /role="alert"[^>]*>Lien refusé &lt;x&gt;</);
});
