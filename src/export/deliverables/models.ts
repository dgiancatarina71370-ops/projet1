// Générateurs de livrables à partir des données du projet (lot M8, décisions D88 à D97).
// Fonctions PURES : elles reçoivent un `ProjectData` déjà lu et rendent du Markdown. Le Markdown passe ensuite par le pipeline d'export
// existant (signature, Markdown, HTML, Word). Aucun accès à la base, aucune écriture, aucun journal (D96).
// Tout texte saisi par l'utilisateur passe par `text.ts` : il n'est jamais interprété comme du Markdown (D93).
import { kindInfo, statusLabel } from '../../domain/kinds.ts';
import type { ItemKind } from '../../domain/kinds.ts';
import { natureLabel, priorityLabel } from '../../domain/requirements.ts';
import { levelLabel } from '../../domain/stakeholders.ts';
import { testTypeLabel } from '../../domain/testcases.ts';
import { dayLabel } from '../../domain/decisions.ts';
import { CHAIN_KINDS, IGNORED_STATUSES, computeTraceability, priorityRank } from '../../domain/traceability.ts';
import type { SnapshotItem } from '../../domain/documents.ts';
import type { MatrixRow, Orphans, Ratio, TraceItem, TraceRef, TraceResult } from '../../domain/traceability.ts';
import { count } from '../../shared/plural.ts';
import type { DItem, ProjectData } from '../../domain/project-data.ts';
import { body, cell, field, heading, inline, table } from './text.ts';

export type ModelId = 'workshop-report' | 'requirements' | 'decisions' | 'risks' | 'stories' | 'test-plan' | 'traceability';

export interface ModelInfo {
  id: ModelId;
  label: string;
  description: string;
  /** Le modèle porte sur un atelier choisi (compte rendu). */
  needsWorkshop: boolean;
  /** L'option « inclure les éléments archivés ou rejetés » s'applique (la traçabilité les ignore toujours : D73). */
  usesArchiveOption: boolean;
}

export const MODELS: readonly ModelInfo[] = [
  { id: 'workshop-report', label: "Compte rendu d'atelier", description: "Un atelier : date, lieu, objectif, participants, éléments qui en proviennent, notes, points ouverts et actions.", needsWorkshop: true, usesArchiveOption: true },
  { id: 'requirements', label: 'Registre des exigences', description: 'Nature, priorité, statut, besoin d’origine, description et critères d’acceptation.', needsWorkshop: false, usesArchiveOption: true },
  { id: 'decisions', label: 'Registre des décisions', description: 'Date, décideur, statut, remplacements, alternatives et justification.', needsWorkshop: false, usesArchiveOption: true },
  { id: 'risks', label: 'Registre des risques', description: 'Probabilité, impact, statut, responsable et plan de traitement.', needsWorkshop: false, usesArchiveOption: true },
  { id: 'stories', label: 'Backlog des user stories', description: 'Rôle, objectif, bénéfice, critères d’acceptation et exigences liées.', needsWorkshop: false, usesArchiveOption: true },
  { id: 'test-plan', label: 'Cahier de recette', description: 'Tests : type, préconditions, étapes, résultat attendu, dernier résultat et ce qu’ils vérifient.', needsWorkshop: false, usesArchiveOption: true },
  { id: 'traceability', label: 'Matrice de traçabilité', description: 'Couverture, matrice exigence par exigence et éléments orphelins (calcul de l’écran Traçabilité).', needsWorkshop: false, usesArchiveOption: false },
];

export function modelInfo(id: string): ModelInfo | null {
  return MODELS.find((m) => m.id === id) ?? null;
}

export interface DeliverableOptions {
  /** Inclure les éléments archivés ou rejetés (faux par défaut, D91). Sans effet sur la matrice de traçabilité. */
  includeArchived: boolean;
  /** Atelier du compte rendu. */
  workshopId?: number | null;
}

export interface Deliverable {
  /** Titre du livrable : sert au nom du fichier et aux propriétés du document Word. */
  title: string;
  markdown: string;
}

// ---------------------------------------------------------------------------------------------------------------------
// Outils communs

const codeNumber = (code: string): number => {
  const m = /(\d+)$/.exec(code);
  return m ? Number(m[1]) : 0;
};
const byCode = (a: { code: string; id: number }, b: { code: string; id: number }): number =>
  codeNumber(a.code) - codeNumber(b.code) || (a.code < b.code ? -1 : a.code > b.code ? 1 : a.id - b.id);

const isHidden = (status: string): boolean => IGNORED_STATUSES.includes(status);

interface Scope {
  shown: DItem[];
  hidden: number;
}

/** Éléments d'un type dans le périmètre choisi, triés par code ; `hidden` : ceux que le périmètre écarte. */
function scopeOf(data: ProjectData, kind: ItemKind, opts: DeliverableOptions): Scope {
  const all = data.items.filter((i) => i.kind === kind).sort(byCode);
  if (opts.includeArchived) return { shown: all, hidden: 0 };
  const shown = all.filter((i) => !isHidden(i.status));
  return { shown, hidden: all.length - shown.length };
}

function scopeLine(opts: DeliverableOptions, hidden: number): string {
  if (opts.includeArchived) return '**Périmètre :** tous les éléments, y compris les éléments archivés ou rejetés.';
  if (hidden === 0) return '**Périmètre :** éléments actifs (aucun élément archivé ou rejeté).';
  return `**Périmètre :** éléments actifs ; ${count(hidden, 'élément archivé ou rejeté exclu', 'éléments archivés ou rejetés exclus')}.`;
}

/** Début commun : titre, projet, périmètre. */
function head(title: string, data: ProjectData, scope: string): string[] {
  return [heading(1, title), `**Projet :** ${inline(data.projectName)}`, scope];
}

const byId = (data: ProjectData): Map<number, DItem> => new Map(data.items.map((i) => [i.id, i]));

/** Éléments reliés à `item` par un lien du type donné, dans le sens demandé, triés par code. */
function related(data: ProjectData, item: DItem, type: string, direction: 'out' | 'in'): DItem[] {
  const index = byId(data);
  const ids = data.links
    .filter((l) => l.type === type && (direction === 'out' ? l.fromId === item.id : l.toId === item.id))
    .map((l) => (direction === 'out' ? l.toId : l.fromId));
  return ids.map((id) => index.get(id)).filter((i): i is DItem => i !== undefined).sort(byCode);
}

const codesOf = (items: readonly { code: string }[]): string => (items.length === 0 ? '—' : items.map((i) => inline(i.code)).join(', '));

const val = (item: DItem, key: string): string => item.d[key] ?? '';
const hasText = (text: string): boolean => text.trim() !== '';

/** Un champ de fiche seulement s'il est renseigné (dans les sections de détail, on ne liste pas les champs vides). */
const fieldIf = (label: string, text: string): string[] => (hasText(text) ? [field(label, text)] : []);

/** Section « Détail » : une fiche par élément qui a au moins un champ renseigné. */
function detailSection(items: readonly DItem[], fields: (item: DItem) => string[]): string[] {
  const sheets = items
    .map((item) => ({ item, parts: fields(item) }))
    .filter((s) => s.parts.length > 0)
    .map((s) => [heading(3, `${s.item.code} — ${s.item.title}`), ...s.parts].join('\n\n'));
  return sheets.length === 0 ? [] : [heading(2, 'Détail'), ...sheets];
}

const finish = (blocks: readonly string[]): string => `${blocks.join('\n\n')}\n`;

// ---------------------------------------------------------------------------------------------------------------------
// Compte rendu d'atelier

/** Participants et éléments issus d'un atelier, dans le périmètre choisi (partagé par le document et par sa liste figée, lot F5). */
function workshopScope(data: ProjectData, w: DItem, opts: DeliverableOptions): { shownParticipants: DItem[]; shownSources: DItem[]; hidden: number } {
  const visible = (i: DItem): boolean => opts.includeArchived || !isHidden(i.status);
  const participants = related(data, w, 'participates', 'in').filter((i) => i.kind === 'stakeholder');
  const sources = related(data, w, 'originates', 'in').filter((i) => i.kind !== 'workshop');
  const shownParticipants = participants.filter(visible);
  const shownSources = sources.filter(visible).sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || byCode(a, b));
  return { shownParticipants, shownSources, hidden: participants.length - shownParticipants.length + sources.length - shownSources.length };
}

function workshopReport(data: ProjectData, opts: DeliverableOptions): Deliverable {
  const w = data.items.find((i) => i.kind === 'workshop' && i.id === opts.workshopId);
  if (!w) throw new Error(opts.workshopId == null ? 'Choisissez un atelier.' : "Cet atelier n'existe plus.");
  const { shownParticipants, shownSources, hidden } = workshopScope(data, w, opts);

  const scope = opts.includeArchived
    ? '**Périmètre :** tous les éléments liés, y compris les éléments archivés ou rejetés.'
    : hidden === 0
      ? '**Périmètre :** éléments liés actifs (aucun élément archivé ou rejeté).'
      : `**Périmètre :** éléments liés actifs ; ${count(hidden, 'élément archivé ou rejeté exclu', 'éléments archivés ou rejetés exclus')}.`;

  const blocks = [
    heading(1, "Compte rendu d'atelier"),
    `**Projet :** ${inline(data.projectName)}`,
    `**Atelier :** ${inline(w.code)} — ${inline(w.title)}`,
    `**Date :** ${val(w, 'held_on') === '' ? 'Non renseignée' : inline(dayLabel(val(w, 'held_on')))}`,
    `**Lieu ou format :** ${val(w, 'place') === '' ? 'Non renseigné' : inline(val(w, 'place'))}`,
    `**Statut :** ${inline(statusLabel(w.status, 'workshop'))}`,
    scope,
    field('Objectif', val(w, 'objective')),
    ...(hasText(w.description) ? [field('Description', w.description)] : []),
    heading(2, 'Participants'),
    shownParticipants.length === 0
      ? 'Aucune partie prenante liée à cet atelier.'
      : table(['Code', 'Nom', 'Organisation', 'Rôle'], shownParticipants.map((p) => [cell(p.code), cell(p.title), cell(val(p, 'organisation')), cell(val(p, 'role'))])),
    heading(2, "Éléments issus de l'atelier"),
    shownSources.length === 0
      ? 'Aucun élément lié à cet atelier.'
      : table(['Type', 'Code', 'Titre', 'Statut'], shownSources.map((s) => [cell(kindInfo(s.kind).label), cell(s.code), cell(s.title), cell(statusLabel(s.status, s.kind))])),
    heading(2, 'Notes'),
    body(val(w, 'notes'), 'Aucune note.'),
    heading(2, 'Points ouverts et actions'),
    body(val(w, 'follow_up'), 'Aucun point ouvert ni action.'),
  ];
  return { title: `Compte rendu atelier ${w.code} ${w.title}`, markdown: finish(blocks) };
}

/** Ordre d'affichage des types d'éléments issus d'un atelier. */
const SOURCE_ORDER: readonly ItemKind[] = ['need', 'requirement', 'decision', 'risk'];
const kindOrder = (kind: ItemKind): number => {
  const i = SOURCE_ORDER.indexOf(kind);
  return i === -1 ? SOURCE_ORDER.length : i;
};

// ---------------------------------------------------------------------------------------------------------------------
// Registres

function requirementsRegister(data: ProjectData, opts: DeliverableOptions): Deliverable {
  const { shown, hidden } = scopeOf(data, 'requirement', opts);
  const items = [...shown].sort((a, b) => priorityRank(val(a, 'priority')) - priorityRank(val(b, 'priority')) || byCode(a, b));
  const blocks = head('Registre des exigences', data, scopeLine(opts, hidden));
  if (items.length === 0) {
    blocks.push('Aucune exigence dans ce périmètre.');
  } else {
    const byPriority = [...new Set(items.map((i) => val(i, 'priority')))].sort((a, b) => priorityRank(a) - priorityRank(b));
    const parts = byPriority.map((p) => `${items.filter((i) => val(i, 'priority') === p).length} ${inline(priorityLabel(p))}`);
    blocks.push(`**Synthèse :** ${count(items.length, 'exigence', 'exigences')} (${parts.join(', ')}). Tri : priorité, puis code.`);
    blocks.push(
      table(
        ['Code', 'Titre', 'Nature', 'Priorité', 'Statut', "Besoin d'origine"],
        items.map((i) => [cell(i.code), cell(i.title), cell(natureLabel(val(i, 'nature'))), cell(priorityLabel(val(i, 'priority'))), cell(statusLabel(i.status, 'requirement')), codesOf(related(data, i, 'derives', 'in'))]),
      ),
    );
    blocks.push(...detailSection(items, (i) => [...fieldIf('Description', i.description), ...fieldIf("Critères d'acceptation", val(i, 'criteria'))]));
  }
  return { title: `Registre des exigences ${data.projectName}`, markdown: finish(blocks) };
}

function decisionsRegister(data: ProjectData, opts: DeliverableOptions): Deliverable {
  const { shown: items, hidden } = scopeOf(data, 'decision', opts);
  const blocks = head('Registre des décisions', data, scopeLine(opts, hidden));
  if (items.length === 0) {
    blocks.push('Aucune décision dans ce périmètre.');
  } else {
    blocks.push(`**Synthèse :** ${count(items.length, 'décision', 'décisions')}. Tri : code.`);
    blocks.push(
      table(
        ['Code', 'Titre', 'Statut', 'Date', 'Décideur', 'Remplacement'],
        items.map((i) => {
          const replaces = related(data, i, 'supersedes', 'out');
          const replacedBy = related(data, i, 'supersedes', 'in');
          const parts = [...(replaces.length ? [`remplace ${codesOf(replaces)}`] : []), ...(replacedBy.length ? [`remplacée par ${codesOf(replacedBy)}`] : [])];
          return [cell(i.code), cell(i.title), cell(statusLabel(i.status, 'decision')), cell(dayLabel(val(i, 'decided_on'))), cell(val(i, 'decider')), parts.length ? parts.join(' ; ') : '—'];
        }),
      ),
    );
    blocks.push(...detailSection(items, (i) => [...fieldIf('Description', i.description), ...fieldIf('Alternatives envisagées', val(i, 'alternatives')), ...fieldIf('Justification', val(i, 'rationale'))]));
  }
  return { title: `Registre des décisions ${data.projectName}`, markdown: finish(blocks) };
}

function risksRegister(data: ProjectData, opts: DeliverableOptions): Deliverable {
  const { shown: items, hidden } = scopeOf(data, 'risk', opts);
  const blocks = head('Registre des risques', data, scopeLine(opts, hidden));
  if (items.length === 0) {
    blocks.push('Aucun risque dans ce périmètre.');
  } else {
    blocks.push(`**Synthèse :** ${count(items.length, 'risque', 'risques')}. Tri : code. Aucun score n'est calculé : probabilité et impact sont présentés côte à côte.`);
    blocks.push(
      table(
        ['Code', 'Titre', 'Statut', 'Probabilité', 'Impact', 'Responsable'],
        items.map((i) => [cell(i.code), cell(i.title), cell(statusLabel(i.status, 'risk')), cell(levelLabel(val(i, 'probability'))), cell(levelLabel(val(i, 'impact'))), cell(val(i, 'owner'))]),
      ),
    );
    blocks.push(...detailSection(items, (i) => [...fieldIf('Description', i.description), ...fieldIf('Plan de traitement', val(i, 'mitigation'))]));
  }
  return { title: `Registre des risques ${data.projectName}`, markdown: finish(blocks) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Backlog et cahier de recette

function storiesBacklog(data: ProjectData, opts: DeliverableOptions): Deliverable {
  const { shown: items, hidden } = scopeOf(data, 'story', opts);
  const blocks = head('Backlog des user stories', data, scopeLine(opts, hidden));
  if (items.length === 0) {
    blocks.push('Aucune user story dans ce périmètre.');
  } else {
    blocks.push(`**Synthèse :** ${count(items.length, 'user story', 'user stories')}. Tri : code.`);
    blocks.push(table(['Code', 'Titre', 'Statut', 'Exigences'], items.map((i) => [cell(i.code), cell(i.title), cell(statusLabel(i.status, 'story')), codesOf(related(data, i, 'implements', 'out'))])));
    blocks.push(
      ...detailSection(items, (i) => {
        const role = val(i, 'role');
        const goal = val(i, 'goal');
        const benefit = val(i, 'benefit');
        const sentence =
          hasText(role) && hasText(goal) && hasText(benefit)
            ? [`En tant que **${inline(role)}**, je veux **${inline(goal)}**, afin de **${inline(benefit)}**.`]
            : [
                ...(hasText(role) ? [`**Rôle :** ${inline(role)}`] : []),
                ...(hasText(goal) ? [`**Objectif :** ${inline(goal)}`] : []),
                ...(hasText(benefit) ? [`**Bénéfice :** ${inline(benefit)}`] : []),
              ];
        return [...sentence, ...fieldIf('Description', i.description), ...fieldIf("Critères d'acceptation", val(i, 'criteria'))];
      }),
    );
  }
  return { title: `Backlog des user stories ${data.projectName}`, markdown: finish(blocks) };
}

const TEST_STATUS_ORDER: readonly string[] = ['to_run', 'passed', 'failed', 'blocked', 'archived'];

function testPlan(data: ProjectData, opts: DeliverableOptions): Deliverable {
  const { shown: items, hidden } = scopeOf(data, 'test', opts);
  const blocks = head('Cahier de recette', data, scopeLine(opts, hidden));
  if (items.length === 0) {
    blocks.push('Aucun test dans ce périmètre.');
  } else {
    const statuses = [...new Set(items.map((i) => i.status))].sort((a, b) => (TEST_STATUS_ORDER.indexOf(a) + 1 || 99) - (TEST_STATUS_ORDER.indexOf(b) + 1 || 99));
    const parts = statuses.map((s) => `${items.filter((i) => i.status === s).length} ${inline(statusLabel(s, 'test'))}`);
    blocks.push(`**Synthèse :** ${count(items.length, 'test', 'tests')} (${parts.join(', ')}). Tri : code. Le statut est le dernier résultat connu.`);
    blocks.push(
      table(
        ['Code', 'Titre', 'Type', 'Statut', 'Dernière exécution', 'Vérifie'],
        items.map((i) => [cell(i.code), cell(i.title), cell(testTypeLabel(val(i, 'test_type'))), cell(statusLabel(i.status, 'test')), cell(dayLabel(val(i, 'last_run_on'))), codesOf(related(data, i, 'verifies', 'out'))]),
      ),
    );
    blocks.push(...detailSection(items, (i) => [...fieldIf('Description', i.description), ...fieldIf('Préconditions', val(i, 'preconditions')), ...fieldIf('Étapes', val(i, 'steps')), ...fieldIf('Résultat attendu', val(i, 'expected'))]));
  }
  return { title: `Cahier de recette ${data.projectName}`, markdown: finish(blocks) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Matrice de traçabilité (même calcul que l'écran Traçabilité : domain/traceability.ts)

const RESULT_TEXT: Record<TraceResult, string> = { failed: 'Échoué', blocked: 'Bloqué', to_run: 'À exécuter', passed: 'Réussi', none: 'Aucun test' };
const resultText = (r: string): string => (r in RESULT_TEXT ? RESULT_TEXT[r as TraceResult] : `Inconnu (${r})`);

/** « 3 sur 5 » ; « — » quand il n'y a rien à couvrir. */
export const ratioText = (r: Ratio): string => (r.total === 0 ? '—' : `${r.covered} sur ${r.total}`);

export const COVERAGE_LABELS: ReadonlyArray<{ key: keyof ReturnType<typeof computeTraceability>['summary']; label: string }> = [
  { key: 'stakeholdersWithNeed', label: 'Parties prenantes avec un besoin' },
  { key: 'needsWithRequirement', label: 'Besoins avec une exigence' },
  { key: 'requirementsWithStory', label: 'Exigences avec une user story' },
  { key: 'requirementsTested', label: 'Exigences testées' },
  { key: 'requirementsPassed', label: 'Exigences dont le résultat est Réussi' },
  { key: 'mustTested', label: 'Exigences Indispensable (Must) testées' },
];

export const ORPHAN_LABELS: ReadonlyArray<{ key: keyof Orphans; label: string }> = [
  { key: 'stakeholdersWithoutNeed', label: 'Parties prenantes sans besoin' },
  { key: 'needsWithoutRequirement', label: 'Besoins sans exigence' },
  { key: 'requirementsWithoutStory', label: 'Exigences sans user story' },
  { key: 'requirementsWithoutTest', label: 'Exigences sans test' },
  { key: 'storiesWithoutRequirement', label: 'User stories sans exigence' },
  { key: 'storiesWithoutTest', label: 'User stories sans test' },
  { key: 'testsWithoutTarget', label: 'Tests qui ne vérifient rien' },
];

function traceabilityMatrix(data: ProjectData): Deliverable {
  const items: TraceItem[] = data.items.map((i) => {
    const t: TraceItem = { id: i.id, kind: i.kind, code: i.code, title: i.title, status: i.status };
    if (i.kind === 'requirement') t.priority = val(i, 'priority');
    if (i.kind === 'test') t.lastRunOn = val(i, 'last_run_on');
    return t;
  });
  const trace = computeTraceability(items, data.links);
  const ignoredText = trace.ignored === 0 ? 'aucun élément archivé ou rejeté à ignorer' : `${count(trace.ignored, 'élément archivé ou rejeté ignoré', 'éléments archivés ou rejetés ignorés')}`;
  const blocks = [
    heading(1, 'Matrice de traçabilité'),
    `**Projet :** ${inline(data.projectName)}`,
    `**Périmètre :** éléments actifs de la chaîne parties prenantes, besoins, exigences, user stories, tests ; ${ignoredText} (les éléments archivés ou rejetés sont toujours ignorés dans ce calcul).`,
    heading(2, 'Couverture'),
    table(['Indicateur', 'Résultat'], COVERAGE_LABELS.map((c) => [cell(c.label), cell(ratioText(trace.summary[c.key]))])),
    heading(2, 'Matrice'),
  ];
  if (trace.matrix.length === 0) {
    blocks.push('Aucune exigence active dans ce projet : la matrice est vide.');
  } else {
    const testCodes = (r: MatrixRow): string => {
      const all = new Map<number, TraceRef>();
      for (const t of [...r.directTests, ...r.viaStoryTests]) all.set(t.id, t);
      return codesOf([...all.values()].sort(byCode));
    };
    blocks.push(
      table(
        ['Exigence', 'Priorité', 'Besoins', 'User stories', 'Tests', 'Résultat'],
        trace.matrix.map((r) => [`${inline(r.code)} — ${cell(r.title)}`, cell(priorityLabel(r.priority)), codesOf(r.needs), codesOf(r.stories), testCodes(r), cell(resultText(r.result))]),
      ),
    );
  }
  blocks.push(heading(2, 'Éléments orphelins'));
  const groups = ORPHAN_LABELS.filter((g) => trace.orphans[g.key].length > 0);
  if (groups.length === 0) blocks.push('Aucun élément orphelin.');
  for (const g of groups) {
    const list = trace.orphans[g.key];
    blocks.push(`${heading(3, `${g.label} (${list.length})`)}\n\n${list.map((r) => `- ${inline(r.code)} — ${inline(r.title)}`).join('\n')}`);
  }
  return { title: `Matrice de traçabilité ${data.projectName}`, markdown: finish(blocks) };
}

// ---------------------------------------------------------------------------------------------------------------------

export function generateDeliverable(id: ModelId, data: ProjectData, options: DeliverableOptions): Deliverable {
  switch (id) {
    case 'workshop-report': return workshopReport(data, options);
    case 'requirements': return requirementsRegister(data, options);
    case 'decisions': return decisionsRegister(data, options);
    case 'risks': return risksRegister(data, options);
    case 'stories': return storiesBacklog(data, options);
    case 'test-plan': return testPlan(data, options);
    case 'traceability': return traceabilityMatrix(data);
  }
}

/**
 * Éléments figés avec un livrable (lot F5, F5-D07) : ceux que le document présente, d'après le même périmètre que sa génération.
 * Registres : les éléments du type dans le périmètre. Compte rendu : l'atelier, ses participants et ses éléments affichés.
 * Matrice : les éléments actifs de la chaîne de traçabilité. Fonction pure.
 */
export function deliverableItems(id: ModelId, data: ProjectData, options: DeliverableOptions): SnapshotItem[] {
  const snap = (i: DItem): SnapshotItem => ({ code: i.code, title: i.title, status: i.status });
  const registers: Partial<Record<ModelId, ItemKind>> = { requirements: 'requirement', decisions: 'decision', risks: 'risk', stories: 'story', 'test-plan': 'test' };
  const kind = registers[id];
  if (kind !== undefined) return scopeOf(data, kind, options).shown.map(snap);
  if (id === 'workshop-report') {
    const w = data.items.find((i) => i.kind === 'workshop' && i.id === options.workshopId);
    if (!w) throw new Error(options.workshopId == null ? 'Choisissez un atelier.' : "Cet atelier n'existe plus.");
    const { shownParticipants, shownSources } = workshopScope(data, w, options);
    return [w, ...shownParticipants, ...shownSources].map(snap);
  }
  return data.items.filter((i) => CHAIN_KINDS.includes(i.kind) && !isHidden(i.status)).map(snap);
}
