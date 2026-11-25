// Contrôle d'intégrité du modèle de domaine (lot M1, contrepartie de la décision D17).
// La base ne contraint ni les types, ni les statuts, ni les types de liens : ce contrôle relit tout et signale chaque anomalie.
// Il ne corrige rien et n'écrit rien. Il sert aux tests, et plus tard à un écran de diagnostic.
import { query } from '../db.ts';
import { codeMatches, sequenceName } from '../../domain/codes.ts';
import { isKind, isValidStatus } from '../../domain/kinds.ts';
import type { ItemKind } from '../../domain/kinds.ts';
import { canLoop, findAnyCycle, isLinkAllowed, isLinkType } from '../../domain/links.ts';
import type { LinkType } from '../../domain/links.ts';
import { isLevel } from '../../domain/stakeholders.ts';
import { isNature, isPriority } from '../../domain/requirements.ts';
import { isCalendarDate } from '../../domain/decisions.ts';
import { isTestType } from '../../domain/testcases.ts';

export type IntegrityProblem =
  | 'unknown-kind'
  | 'invalid-status'
  | 'code-mismatch'
  | 'source-other-project'
  | 'counter-behind'
  | 'unknown-link-type'
  | 'link-not-allowed'
  | 'link-other-project'
  | 'stakeholder-details-missing'
  | 'stakeholder-details-wrong-kind'
  | 'stakeholder-invalid-level'
  | 'requirement-details-missing'
  | 'requirement-details-wrong-kind'
  | 'requirement-invalid-value'
  | 'decision-details-missing'
  | 'decision-details-wrong-kind'
  | 'decision-invalid-date'
  | 'risk-details-missing'
  | 'risk-details-wrong-kind'
  | 'risk-invalid-level'
  | 'story-details-missing'
  | 'story-details-wrong-kind'
  | 'test-details-missing'
  | 'test-details-wrong-kind'
  | 'test-invalid-type'
  | 'test-invalid-date'
  | 'link-cycle';

export interface IntegrityIssue {
  problem: IntegrityProblem;
  message: string;
  itemId?: number;
  linkId?: number;
}

export async function checkModelIntegrity(): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];

  const items = await query<{ id: number; project_id: number; kind: string; number: number; code: string; status: string }>(
    'SELECT id, project_id, kind, number, code, status FROM items ORDER BY id',
  );
  for (const it of items) {
    if (!isKind(it.kind)) {
      issues.push({ problem: 'unknown-kind', itemId: it.id, message: `L'élément ${it.code} a un type inconnu : « ${it.kind} ».` });
      continue;
    }
    if (!isValidStatus(it.kind, it.status)) {
      issues.push({ problem: 'invalid-status', itemId: it.id, message: `L'élément ${it.code} a un statut invalide : « ${it.status} ».` });
    }
    if (!codeMatches(it.kind, it.number, it.code)) {
      issues.push({ problem: 'code-mismatch', itemId: it.id, message: `Le code ${it.code} ne correspond pas à son type et à son numéro (${it.number}).` });
    }
  }

  const strays = await query<{ id: number; code: string }>(
    `SELECT i.id, i.code FROM items i JOIN documents d ON d.id = i.source_document_id WHERE d.project_id <> i.project_id ORDER BY i.id`,
  );
  for (const s of strays) {
    issues.push({ problem: 'source-other-project', itemId: s.id, message: `L'élément ${s.code} a pour source un document d'un autre projet.` });
  }

  const maxima = await query<{ project_id: number; kind: string; m: number }>(
    'SELECT project_id, kind, MAX(number) AS m FROM items GROUP BY project_id, kind',
  );
  const counters = await query<{ name: string; value: number }>("SELECT name, value FROM sequences WHERE name LIKE 'item:%'");
  const counterOf = new Map(counters.map((c) => [c.name, c.value]));
  for (const mx of maxima) {
    if (!isKind(mx.kind)) continue;
    const value = counterOf.get(sequenceName(mx.project_id, mx.kind as ItemKind));
    if (value === undefined || value < mx.m) {
      issues.push({
        problem: 'counter-behind',
        message: `Le compteur de numérotation du projet ${mx.project_id} (type « ${mx.kind} ») est en retard sur le plus grand numéro attribué (${mx.m}) : un code pourrait être réattribué.`,
      });
    }
  }

  const links = await query<{ id: number; project_id: number; link_type: string; from_kind: string; to_kind: string; from_project: number; to_project: number }>(
    `SELECT l.id, l.project_id, l.link_type, f.kind AS from_kind, t.kind AS to_kind, f.project_id AS from_project, t.project_id AS to_project
     FROM links l JOIN items f ON f.id = l.from_id JOIN items t ON t.id = l.to_id ORDER BY l.id`,
  );
  for (const l of links) {
    if (l.from_project !== l.project_id || l.to_project !== l.project_id) {
      issues.push({ problem: 'link-other-project', linkId: l.id, message: `Le lien ${l.id} relie des éléments qui ne sont pas du projet du lien.` });
    }
    if (!isLinkType(l.link_type)) {
      issues.push({ problem: 'unknown-link-type', linkId: l.id, message: `Le lien ${l.id} a un type inconnu : « ${l.link_type} ».` });
      continue;
    }
    if (!isKind(l.from_kind) || !isKind(l.to_kind) || !isLinkAllowed(l.link_type as LinkType, l.from_kind, l.to_kind)) {
      issues.push({ problem: 'link-not-allowed', linkId: l.id, message: `Le lien ${l.id} (« ${l.link_type} ») relie des types d'éléments non autorisés (${l.from_kind} vers ${l.to_kind}).` });
    }
  }

  // Parties prenantes (lot M3a) : une ligne de détails par partie prenante, et seulement pour elles ; niveaux valides.
  const missing = await query<{ id: number; code: string }>(
    `SELECT i.id, i.code FROM items i LEFT JOIN stakeholder_details d ON d.item_id = i.id WHERE i.kind = 'stakeholder' AND d.item_id IS NULL ORDER BY i.id`,
  );
  for (const m of missing) {
    issues.push({ problem: 'stakeholder-details-missing', itemId: m.id, message: `La partie prenante ${m.code} n'a pas de ligne de détails.` });
  }
  const details = await query<{ id: number; code: string; kind: string; influence: string; interest: string }>(
    `SELECT i.id, i.code, i.kind, d.influence, d.interest FROM stakeholder_details d JOIN items i ON i.id = d.item_id ORDER BY i.id`,
  );
  for (const d of details) {
    if (d.kind !== 'stakeholder') {
      issues.push({ problem: 'stakeholder-details-wrong-kind', itemId: d.id, message: `L'élément ${d.code} porte des détails de partie prenante alors que c'est un « ${d.kind} ».` });
    }
    if (!isLevel(d.influence) || !isLevel(d.interest)) {
      issues.push({ problem: 'stakeholder-invalid-level', itemId: d.id, message: `La partie prenante ${d.code} a un niveau d'influence ou d'intérêt invalide.` });
    }
  }

  // Exigences (lot M3b) : une ligne de détails par exigence, et seulement pour elles ; valeurs valides.
  const reqMissing = await query<{ id: number; code: string }>(
    `SELECT i.id, i.code FROM items i LEFT JOIN requirement_details d ON d.item_id = i.id WHERE i.kind = 'requirement' AND d.item_id IS NULL ORDER BY i.id`,
  );
  for (const m of reqMissing) {
    issues.push({ problem: 'requirement-details-missing', itemId: m.id, message: `L'exigence ${m.code} n'a pas de ligne de détails.` });
  }
  const reqDetails = await query<{ id: number; code: string; kind: string; nature: string; priority: string }>(
    `SELECT i.id, i.code, i.kind, d.nature, d.priority FROM requirement_details d JOIN items i ON i.id = d.item_id ORDER BY i.id`,
  );
  for (const d of reqDetails) {
    if (d.kind !== 'requirement') {
      issues.push({ problem: 'requirement-details-wrong-kind', itemId: d.id, message: `L'élément ${d.code} porte des détails d'exigence alors que c'est un « ${d.kind} ».` });
    }
    if (!isNature(d.nature) || !isPriority(d.priority)) {
      issues.push({ problem: 'requirement-invalid-value', itemId: d.id, message: `L'exigence ${d.code} a une nature ou une priorité invalide.` });
    }
  }

  // Décisions (lot M4) : une ligne de détails par décision, et seulement pour elles ; date valide ou vide.
  const decMissing = await query<{ id: number; code: string }>(
    `SELECT i.id, i.code FROM items i LEFT JOIN decision_details d ON d.item_id = i.id WHERE i.kind = 'decision' AND d.item_id IS NULL ORDER BY i.id`,
  );
  for (const m of decMissing) {
    issues.push({ problem: 'decision-details-missing', itemId: m.id, message: `La décision ${m.code} n'a pas de ligne de détails.` });
  }
  const decDetails = await query<{ id: number; code: string; kind: string; decided_on: string }>(
    `SELECT i.id, i.code, i.kind, d.decided_on FROM decision_details d JOIN items i ON i.id = d.item_id ORDER BY i.id`,
  );
  for (const d of decDetails) {
    if (d.kind !== 'decision') {
      issues.push({ problem: 'decision-details-wrong-kind', itemId: d.id, message: `L'élément ${d.code} porte des détails de décision alors que c'est un « ${d.kind} ».` });
    }
    if (d.decided_on !== '' && !isCalendarDate(d.decided_on)) {
      issues.push({ problem: 'decision-invalid-date', itemId: d.id, message: `La décision ${d.code} a une date invalide (« ${d.decided_on} »).` });
    }
  }

  // Risques (lot M4) : une ligne de détails par risque, et seulement pour eux ; niveaux valides.
  const riskMissing = await query<{ id: number; code: string }>(
    `SELECT i.id, i.code FROM items i LEFT JOIN risk_details d ON d.item_id = i.id WHERE i.kind = 'risk' AND d.item_id IS NULL ORDER BY i.id`,
  );
  for (const m of riskMissing) {
    issues.push({ problem: 'risk-details-missing', itemId: m.id, message: `Le risque ${m.code} n'a pas de ligne de détails.` });
  }
  const riskDetails = await query<{ id: number; code: string; kind: string; probability: string; impact: string }>(
    `SELECT i.id, i.code, i.kind, d.probability, d.impact FROM risk_details d JOIN items i ON i.id = d.item_id ORDER BY i.id`,
  );
  for (const d of riskDetails) {
    if (d.kind !== 'risk') {
      issues.push({ problem: 'risk-details-wrong-kind', itemId: d.id, message: `L'élément ${d.code} porte des détails de risque alors que c'est un « ${d.kind} ».` });
    }
    if (!isLevel(d.probability) || !isLevel(d.impact)) {
      issues.push({ problem: 'risk-invalid-level', itemId: d.id, message: `Le risque ${d.code} a une probabilité ou un impact invalide.` });
    }
  }

  // User stories (lot M5) : une ligne de détails par story, et seulement pour elles.
  const storyMissing = await query<{ id: number; code: string }>(
    `SELECT i.id, i.code FROM items i LEFT JOIN story_details d ON d.item_id = i.id WHERE i.kind = 'story' AND d.item_id IS NULL ORDER BY i.id`,
  );
  for (const m of storyMissing) {
    issues.push({ problem: 'story-details-missing', itemId: m.id, message: `La user story ${m.code} n'a pas de ligne de détails.` });
  }
  const storyDetails = await query<{ id: number; code: string; kind: string }>(
    `SELECT i.id, i.code, i.kind FROM story_details d JOIN items i ON i.id = d.item_id ORDER BY i.id`,
  );
  for (const d of storyDetails) {
    if (d.kind !== 'story') {
      issues.push({ problem: 'story-details-wrong-kind', itemId: d.id, message: `L'élément ${d.code} porte des détails de user story alors que c'est un « ${d.kind} ».` });
    }
  }

  // Tests (lot M5) : une ligne de détails par test, et seulement pour eux ; type et date valides.
  const testMissing = await query<{ id: number; code: string }>(
    `SELECT i.id, i.code FROM items i LEFT JOIN test_details d ON d.item_id = i.id WHERE i.kind = 'test' AND d.item_id IS NULL ORDER BY i.id`,
  );
  for (const m of testMissing) {
    issues.push({ problem: 'test-details-missing', itemId: m.id, message: `Le test ${m.code} n'a pas de ligne de détails.` });
  }
  const testDetails = await query<{ id: number; code: string; kind: string; test_type: string; last_run_on: string }>(
    `SELECT i.id, i.code, i.kind, d.test_type, d.last_run_on FROM test_details d JOIN items i ON i.id = d.item_id ORDER BY i.id`,
  );
  for (const d of testDetails) {
    if (d.kind !== 'test') {
      issues.push({ problem: 'test-details-wrong-kind', itemId: d.id, message: `L'élément ${d.code} porte des détails de test alors que c'est un « ${d.kind} ».` });
    }
    if (!isTestType(d.test_type)) {
      issues.push({ problem: 'test-invalid-type', itemId: d.id, message: `Le test ${d.code} a un type invalide (« ${d.test_type} »).` });
    }
    if (d.last_run_on !== '' && !isCalendarDate(d.last_run_on)) {
      issues.push({ problem: 'test-invalid-date', itemId: d.id, message: `Le test ${d.code} a une date d'exécution invalide (« ${d.last_run_on} »).` });
    }
  }

  // Boucles (décision D50) : un type de lien qui peut relier deux éléments du même type ne doit pas former de cycle.
  const loopable = await query<{ id: number; project_id: number; link_type: string; from_id: number; to_id: number }>(
    'SELECT id, project_id, link_type, from_id, to_id FROM links ORDER BY id',
  );
  const groups = new Map<string, Array<readonly [number, number]>>();
  for (const l of loopable) {
    if (!isLinkType(l.link_type) || !canLoop(l.link_type as LinkType)) continue;
    const key = `${l.project_id}:${l.link_type}`;
    groups.set(key, [...(groups.get(key) ?? []), [l.from_id, l.to_id] as const]);
  }
  for (const [key, edges] of groups) {
    const cycle = findAnyCycle(edges);
    if (cycle) issues.push({ problem: 'link-cycle', message: `Les liens « ${key.split(':')[1]} » du projet ${key.split(':')[0]} forment une boucle (éléments ${cycle.join(' → ')}).` });
  }

  return issues;
}
