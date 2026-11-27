// Lot M4 : logique pure des écrans Décisions et Risques, et rendu statique de leurs écrans d'affichage (décisions D52 à D60).
// Comme avant, aucun clic ni saisie n'est simulé : ces comportements se vérifient à la recette sur clé. Si esbuild est introuvable, les rendus sont « ignorés ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRender } from './helpers/ui-loader.ts';
import { titleProblem, emptyListText } from '../src/shared/register-logic.ts';
import { EMPTY_DECISION_FORM, STATUS_FILTER_OPTIONS as DEC_FILTERS, STATUS_OPTIONS as DEC_STATUS, emptyDecisionsMessage, validateDecisionForm } from '../src/modules/decisions/logic.ts';
import { EMPTY_RISK_FORM, LEVEL_OPTIONS, STATUS_FILTER_OPTIONS as RISK_FILTERS, STATUS_OPTIONS as RISK_STATUS, emptyRisksMessage, validateRiskForm } from '../src/modules/risks/logic.ts';
import { KINDS_WITH_SCREEN, SCREENS } from '../src/app/navigation.ts';
import { KINDS } from '../src/domain/kinds.ts';
import { linkOptionsFor, optionText } from '../src/domain/links.ts';

// ------------------------------------------------------------------ logique pure

test('registres : le message de titre est commun, avec la limite passée en paramètre', () => {
  assert.equal(titleProblem('  ', 'de la décision', 200), 'Le titre de la décision est obligatoire.');
  assert.equal(titleProblem('x'.repeat(201), 'du risque', 200), 'Le titre du risque est limité à 200 caractères.');
  assert.equal(titleProblem('  ok  ', 'du risque', 200), null);
  assert.equal(emptyListText(3, 'Prise', 'Aucune décision', 'x', 'Toutes'), 'Aucune décision « Prise » : 3 au total dans ce projet.');
  assert.equal(emptyListText(3, null, 'Aucune décision', 'x', 'Toutes'), 'Aucune décision « Toutes » : 3 au total dans ce projet.');
  assert.equal(emptyListText(3, null, 'Aucun besoin', 'x'), 'Aucun besoin « Tous » : 3 au total dans ce projet.', 'valeur par défaut inchangée pour les besoins');
});

test('navigation : types annoncés dans les listes de liens = types qui ont un écran (les huit, depuis M7)', () => {
  assert.deepEqual([...KINDS_WITH_SCREEN].sort(), ['decision', 'need', 'requirement', 'risk', 'stakeholder', 'story', 'test', 'workshop']);
  assert.ok(KINDS.every((k) => KINDS_WITH_SCREEN.includes(k.kind)), 'depuis M5, chaque type a son écran');
  assert.equal(SCREENS.length, 15);
});

test('liste « Ajouter un lien » : seuls les types demandés sont annoncés (ceux qui ont un écran)', () => {
  const text = (kind: Parameters<typeof linkOptionsFor>[0], key: string) => optionText(linkOptionsFor(kind).find((o) => o.key === key) as ReturnType<typeof linkOptionsFor>[number], KINDS_WITH_SCREEN);
  assert.equal(text('decision', 'concerns:out'), 'concerne (Besoin ou Exigence ou Risque ou User story)', 'User story proposée depuis M5');
  assert.equal(optionText(linkOptionsFor('decision')[0], ['need', 'requirement', 'risk']), 'concerne (Besoin ou Exigence ou Risque)', 'un type sans écran n\'est pas annoncé');
  assert.equal(text('decision', 'supersedes:out'), 'remplace (Décision)');
  assert.equal(text('decision', 'supersedes:in'), 'remplacée par (Décision)');
  assert.equal(text('risk', 'mitigates:in'), 'atténué par (Exigence ou Décision)');
  assert.equal(text('need', 'derives:out'), 'dérive en (Exigence)');
  assert.equal(optionText(linkOptionsFor('decision')[0], []), 'concerne', 'aucun type annoncé : libellé seul');
});

test('écran décisions : options de statut accordées au féminin, filtre « Toutes », messages de liste vide', () => {
  assert.deepEqual(DEC_STATUS.map((o) => o.label), ['Proposée', 'Prise', 'Remplacée', 'Annulée', 'Archivée']);
  assert.deepEqual(DEC_FILTERS.map((o) => o.value), ['all', 'proposed', 'decided', 'superseded', 'cancelled', 'archived']);
  assert.equal(DEC_FILTERS[0].label, 'Toutes');
  assert.match(emptyDecisionsMessage(0, 'all'), /^Aucune décision dans ce projet\. Créez la première/);
  assert.match(emptyDecisionsMessage(4, 'superseded'), /Aucune décision « Remplacée » : 4 au total/);
  assert.match(emptyDecisionsMessage(4, 'all'), /« Toutes »/);
});

test('écran risques : options de statut, niveaux, messages de liste vide', () => {
  assert.deepEqual(RISK_STATUS.map((o) => o.label), ['Identifié', 'En traitement', 'Accepté', 'Clos', 'Archivé']);
  assert.deepEqual(RISK_FILTERS.map((o) => o.value), ['all', 'identified', 'mitigating', 'accepted', 'closed', 'archived']);
  assert.deepEqual(LEVEL_OPTIONS.map((o) => o.label), ['Faible', 'Moyen', 'Élevé']);
  assert.match(emptyRisksMessage(0, 'all'), /^Aucun risque dans ce projet\. Créez le premier/);
  assert.match(emptyRisksMessage(2, 'closed'), /Aucun risque « Clos » : 2 au total/);
});

test('formulaire décision : défauts, une erreur par champ fautif, date réelle, valeurs normalisées', () => {
  assert.deepEqual(EMPTY_DECISION_FORM, { title: '', description: '', decidedOn: '', decider: '', alternatives: '', rationale: '' });
  const bad = validateDecisionForm({ title: '', description: '', decidedOn: '2026-02-30', decider: 'x'.repeat(201), alternatives: 'x'.repeat(10001), rationale: 'x'.repeat(10001) });
  assert.ok(!bad.ok);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ['alternatives', 'decidedOn', 'decider', 'rationale', 'title'], 'les cinq erreurs sont remontées ensemble');
  if (!bad.ok) assert.match(bad.errors.title ?? '', /Le titre de la décision est obligatoire/);
  const ok = validateDecisionForm({ title: ' D ', description: 'ctx', decidedOn: '2026-11-25', decider: ' Comité ', alternatives: 'A', rationale: 'R' });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual({ t: ok.title, f: ok.fields }, { t: 'D', f: { decidedOn: '2026-11-25', decider: 'Comité', alternatives: 'A', rationale: 'R' } });
  assert.ok(validateDecisionForm({ ...EMPTY_DECISION_FORM, title: 'D' }).ok, 'la date est facultative');
});

test('formulaire risque : défauts, une erreur par champ fautif, valeurs normalisées', () => {
  assert.deepEqual(EMPTY_RISK_FORM, { title: '', description: '', probability: 'medium', impact: 'medium', mitigation: '', owner: '' });
  const bad = validateRiskForm({ title: '', description: '', probability: 'zzz', impact: 'yyy', mitigation: 'x'.repeat(10001), owner: 'x'.repeat(201) });
  assert.ok(!bad.ok);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ['impact', 'mitigation', 'owner', 'probability', 'title']);
  if (!bad.ok) assert.match(bad.errors.title ?? '', /Le titre du risque est obligatoire/);
  const ok = validateRiskForm({ title: ' R ', description: '', probability: 'high', impact: 'low', mitigation: 'Plan', owner: ' DSI ' });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual({ t: ok.title, f: ok.fields }, { t: 'R', f: { probability: 'high', impact: 'low', mitigation: 'Plan', owner: 'DSI' } });
});

// ------------------------------------------------------------------ rendu statique

interface DecRow { id: number; code: string; title: string; description: string; status: string; decided_on: string; decider: string; alternatives: string; rationale: string }
interface RskRow { id: number; code: string; title: string; description: string; status: string; probability: string; impact: string; mitigation: string; owner: string }
interface Render {
  shell: (p: { navigable: boolean; screen: string; projects: Array<{ id: number; name: string }>; activeId: number | null }) => string;
  analysisNoProject: (what: string) => string;
  decList: (p: { rows: DecRow[]; total: number; filter: string }) => string;
  decDetail: (p: { row: DecRow; confirm: string | null; error: string }) => string;
  decForm: (p: { errors: Record<string, string>; askAbandon: boolean; values: { title: string; description: string; decidedOn: string; decider: string; alternatives: string; rationale: string } }) => string;
  riskList: (p: { rows: RskRow[]; total: number; filter: string }) => string;
  riskDetail: (p: { row: RskRow; confirm: string | null; error: string }) => string;
  riskForm: (p: { errors: Record<string, string>; askAbandon: boolean; values: { title: string; description: string; probability: string; impact: string; mitigation: string; owner: string } }) => string;
}

const render = loadRender<Render>();
const ui = (name: string, fn: (r: Render) => void) => test(name, { skip: render === null ? 'esbuild introuvable : rendu des écrans non vérifié' : false }, () => fn(render as Render));

const DEC: DecRow = { id: 1, code: 'DEC-001', title: 'Choisir <b>SQLite</b>', description: 'Contexte\nsur deux lignes', status: 'decided', decided_on: '2026-11-05', decider: 'Comité <x>', alternatives: 'Option A\nOption B', rationale: 'Hors ligne <script>x</script>' };
const RSK: RskRow = { id: 2, code: 'RIS-001', title: 'Perte <i>de données</i>', description: '', status: 'mitigating', probability: 'low', impact: 'high', mitigation: 'Sauvegardes <script>x</script>', owner: 'DSI' };

ui('rendu : le menu propose Décisions et Risques, avec une seule entrée courante', (r) => {
  const html = r.shell({ navigable: true, screen: 'decisions', projects: [{ id: 1, name: 'A' }], activeId: 1 });
  for (const label of ['Projets', 'Parties prenantes', 'Besoins', 'Exigences', 'Décisions', 'Risques', 'Technique']) assert.ok(html.includes(`>${label}<`), label);
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  assert.match(html, /aria-current="page"[^>]*>Décisions</);
  assert.match(r.shell({ navigable: true, screen: 'risks', projects: [{ id: 1, name: 'A' }], activeId: 1 }), /aria-current="page"[^>]*>Risques</);
});

ui('rendu : sans projet actif, décisions et risques renvoient vers les projets (écran commun)', (r) => {
  assert.match(r.analysisNoProject('Les décisions'), /Aucun projet actif\. Les décisions appartiennent à un projet/);
  assert.match(r.analysisNoProject('Les risques'), /Les risques appartiennent/);
});

ui('rendu : liste des décisions (date, décideur, statut au féminin, filtre « Toutes », singulier et pluriel, états vides)', (r) => {
  const html = r.decList({ rows: [DEC, { ...DEC, id: 3, code: 'DEC-002', title: 'Autre', status: 'archived', decided_on: '', decider: '' }], total: 2, filter: 'all' });
  assert.match(html, /2 décisions/);
  for (const t of ['DEC-001', 'DEC-002', '05/11/2026', 'Prise', 'Archivée', 'Nouvelle décision', '>Toutes (', '>Proposée (', '>Remplacée (', '>Annulée (']) assert.ok(html.includes(t), t);
  assert.ok(html.includes('Choisir &lt;b&gt;SQLite&lt;/b&gt;') && html.includes('Comité &lt;x&gt;') && !html.includes('<b>SQLite</b>'), 'textes échappés');
  assert.ok(html.includes('—'), 'date ou décideur absents : tiret');
  assert.match(html, /aria-pressed="true"[^>]*>Toutes \(/);
  assert.match(r.decList({ rows: [DEC], total: 1, filter: 'all' }), /1 décision\b(?!s)/);
  const none = r.decList({ rows: [], total: 0, filter: 'all' });
  assert.match(none, /Aucune décision dans ce projet/);
  assert.ok(!none.includes('<table'));
  assert.match(r.decList({ rows: [], total: 3, filter: 'superseded' }), /Aucune décision « Remplacée » : 3 au total/);
});

ui('rendu : fiche d\'une décision (champs propres, textes échappés, changement de statut, confirmation, valeurs inattendues visibles)', (r) => {
  const html = r.decDetail({ row: DEC, confirm: null, error: '' });
  for (const t of ['DEC-001 · Choisir &lt;b&gt;SQLite&lt;/b&gt;', '05/11/2026', 'Comité &lt;x&gt;', 'Contexte', 'Alternatives envisagées', 'Option A', 'Justification', 'Hors ligne &lt;script&gt;x&lt;/script&gt;', 'Modifier', 'Supprimer…', 'Passer à']) assert.ok(html.includes(t), t);
  assert.ok(!html.includes('<script>') && html.includes('whitespace-pre-wrap'));
  assert.match(html, /<dt[^>]*>Statut<\/dt><dd>Prise<\/dd>/);
  for (const label of ['Proposée', 'Remplacée', 'Annulée', 'Archivée']) assert.match(html, new RegExp(`<button[^>]*>${label}</button>`), label);
  assert.doesNotMatch(html, /<button[^>]*>Prise<\/button>/, 'le statut courant n\'est pas proposé');
  const asking = r.decDetail({ row: DEC, confirm: 'Supprimer définitivement DEC-001 ?', error: '' });
  assert.ok(asking.includes('Supprimer définitivement DEC-001 ?') && !asking.includes('Supprimer…'));
  assert.match(r.decDetail({ row: DEC, confirm: null, error: 'Panne <x>' }), /role="alert"[^>]*>Panne &lt;x&gt;</);
  const odd = r.decDetail({ row: { ...DEC, decided_on: 'zzz', decider: '', alternatives: '', rationale: '', description: '' }, confirm: null, error: '' });
  assert.ok(odd.includes('Invalide (zzz)'), 'une date illisible en base reste visible');
  assert.ok((odd.match(/—/g) ?? []).length >= 4, 'champs vides : tiret');
});

ui('rendu : formulaire d\'une décision (champ date, erreurs par champ, valeurs conservées, abandon)', (r) => {
  const values = { title: 'D', description: 'ctx', decidedOn: '2026-11-25', decider: 'Comité', alternatives: 'A', rationale: 'R' };
  const html = r.decForm({ errors: { decidedOn: 'Date invalide.', rationale: 'Trop long.' }, askAbandon: false, values });
  assert.match(html, /<input[^>]*type="date"[^>]*value="2026-11-25"|<input[^>]*value="2026-11-25"[^>]*type="date"/);
  assert.ok(html.includes('Date invalide.') && html.includes('Trop long.'));
  for (const t of ['Nouvelle décision', 'Date de la décision', 'Décideur', 'Contexte', 'Alternatives envisagées', 'Justification', 'Enregistrer']) assert.ok(html.includes(t), t);
  assert.ok(!r.decForm({ errors: {}, askAbandon: false, values }).includes('Date invalide.'));
  assert.match(r.decForm({ errors: {}, askAbandon: true, values }), /Abandonner/);
});

ui('rendu : liste des risques (probabilité, impact, statut, échappement, états vides)', (r) => {
  const html = r.riskList({ rows: [RSK, { ...RSK, id: 4, code: 'RIS-002', title: 'Autre', probability: 'high', impact: 'low', status: 'closed' }], total: 2, filter: 'all' });
  assert.match(html, /2 risques/);
  for (const t of ['RIS-001', 'RIS-002', 'Probabilité', 'Impact', 'Faible', 'Élevé', 'En traitement', 'Clos', 'Nouveau risque', '>Tous (', '>Identifié (', '>Accepté (']) assert.ok(html.includes(t), t);
  assert.ok(html.includes('Perte &lt;i&gt;de données&lt;/i&gt;') && !html.includes('<i>de données</i>'));
  assert.match(r.riskList({ rows: [RSK], total: 1, filter: 'all' }), /1 risque\b(?!s)/);
  assert.match(r.riskList({ rows: [], total: 0, filter: 'all' }), /Aucun risque dans ce projet/);
  assert.match(r.riskList({ rows: [], total: 5, filter: 'accepted' }), /Aucun risque « Accepté » : 5 au total/);
});

ui('rendu : fiche d\'un risque (niveaux, responsable, plan échappé, changement de statut, valeur inattendue visible)', (r) => {
  const html = r.riskDetail({ row: RSK, confirm: null, error: '' });
  for (const t of ['RIS-001 · Perte &lt;i&gt;de données&lt;/i&gt;', 'Probabilité', 'Faible', 'Impact', 'Élevé', 'Responsable', 'DSI', 'Plan de traitement', 'Sauvegardes &lt;script&gt;x&lt;/script&gt;', 'Passer à']) assert.ok(html.includes(t), t);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /<dt[^>]*>Statut<\/dt><dd>En traitement<\/dd>/);
  for (const label of ['Identifié', 'Accepté', 'Clos', 'Archivé']) assert.match(html, new RegExp(`<button[^>]*>${label}</button>`), label);
  assert.doesNotMatch(html, /<button[^>]*>En traitement<\/button>/);
  const odd = r.riskDetail({ row: { ...RSK, probability: 'zzz', owner: '', mitigation: '' }, confirm: null, error: '' });
  assert.ok(odd.includes('Inconnu (zzz)') && odd.includes('—'));
  assert.ok(r.riskDetail({ row: RSK, confirm: 'Supprimer définitivement RIS-001 ?', error: '' }).includes('Supprimer définitivement RIS-001 ?'));
});

ui('rendu : formulaire d\'un risque (deux listes de niveaux, valeurs sélectionnées, erreurs par champ)', (r) => {
  const values = { title: 'R', description: '', probability: 'high', impact: 'low', mitigation: 'Plan', owner: 'DSI' };
  const html = r.riskForm({ errors: { probability: 'Niveau inconnu.', owner: 'Trop long.' }, askAbandon: false, values });
  assert.match(html, /<option value="high" selected="">Élevé<\/option>|<option value="high"[^>]*selected/);
  assert.match(html, /<option value="low" selected="">Faible<\/option>|<option value="low"[^>]*selected/);
  assert.equal((html.match(/<option /g) ?? []).length, 6, 'deux listes de trois niveaux');
  assert.ok(html.includes('Niveau inconnu.') && html.includes('Trop long.'));
  for (const t of ['Nouveau risque', 'Responsable', 'Plan de traitement']) assert.ok(html.includes(t), t);
});
