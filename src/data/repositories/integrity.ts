// Contrôle d'intégrité du modèle de domaine (lot M1, contrepartie de la décision D17).
// La base ne contraint ni les types, ni les statuts, ni les types de liens : ce contrôle relit tout et signale chaque anomalie.
// Il ne corrige rien et n'écrit rien. Il sert aux tests, et plus tard à un écran de diagnostic.
import { query } from '../db.ts';
import { codeMatches, sequenceName } from '../../domain/codes.ts';
import { isKind, isValidStatus } from '../../domain/kinds.ts';
import type { ItemKind } from '../../domain/kinds.ts';
import { isLinkAllowed, isLinkType } from '../../domain/links.ts';
import type { LinkType } from '../../domain/links.ts';
import { isLevel } from '../../domain/stakeholders.ts';

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
  | 'stakeholder-invalid-level';

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

  return issues;
}
