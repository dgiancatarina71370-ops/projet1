// Lecteur de traçabilité (lot M6, D77) : lecture seule. Il charge les éléments de la chaîne et les liens d'un projet,
// puis laisse le calcul à la couche domain. Il n'écrit rien : ni mutate(), ni journal.
import { query } from '../db.ts';
import type { Row } from '../db.ts';
import { computeTraceability, CHAIN_KINDS } from '../../domain/traceability.ts';
import type { TraceItem, TraceLink, Traceability } from '../../domain/traceability.ts';
import type { ItemKind } from '../../domain/kinds.ts';

interface ItemRow extends Row {
  id: number;
  kind: string;
  code: string;
  title: string;
  status: string;
  priority: string | null;
  last_run_on: string | null;
}

interface LinkRow extends Row {
  link_type: string;
  from_id: number;
  to_id: number;
}

export async function loadTraceInput(projectId: number): Promise<{ items: TraceItem[]; links: TraceLink[] }> {
  const marks = CHAIN_KINDS.map(() => '?').join(', ');
  const rows = await query<ItemRow>(
    `SELECT i.id, i.kind, i.code, i.title, i.status, r.priority AS priority, t.last_run_on AS last_run_on
FROM items i
LEFT JOIN requirement_details r ON r.item_id = i.id AND i.kind = 'requirement'
LEFT JOIN test_details t ON t.item_id = i.id AND i.kind = 'test'
WHERE i.project_id = ? AND i.kind IN (${marks}) ORDER BY i.id`,
    [projectId, ...CHAIN_KINDS],
  );
  const items: TraceItem[] = rows.map((r) => {
    const it: TraceItem = { id: r.id, kind: r.kind as ItemKind, code: r.code, title: r.title, status: r.status };
    if (r.priority !== null) it.priority = r.priority;
    if (r.last_run_on !== null) it.lastRunOn = r.last_run_on;
    return it;
  });
  const linkRows = await query<LinkRow>('SELECT link_type, from_id, to_id FROM links WHERE project_id = ? ORDER BY id', [projectId]);
  return { items, links: linkRows.map((l) => ({ type: l.link_type, fromId: l.from_id, toId: l.to_id })) };
}

export async function getTraceability(projectId: number): Promise<Traceability> {
  const { items, links } = await loadTraceInput(projectId);
  return computeTraceability(items, links);
}
