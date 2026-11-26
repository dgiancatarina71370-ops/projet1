// Lecteur des données d'un projet pour les livrables générés (lot M8). LECTURE SEULE : ni mutate(), ni journal (décision D96).
// Il réunit les éléments, les champs de leurs tables d'extension et les liens ; la mise en forme est faite par la couche export.
import { query } from '../db.ts';
import type { Row } from '../db.ts';
import type { ItemKind } from '../../domain/kinds.ts';
import type { DItem, DLink, ProjectData } from '../../domain/project-data.ts';

interface ItemRow extends Row {
  id: number;
  kind: string;
  code: string;
  title: string;
  description: string;
  status: string;
}

interface LinkRow extends Row {
  link_type: string;
  from_id: number;
  to_id: number;
}

/** Table d'extension de chaque type (les besoins n'en ont pas). Noms fixes : jamais construits à partir de données saisies. */
const DETAIL_TABLES: ReadonlyArray<{ kind: ItemKind; table: string }> = [
  { kind: 'stakeholder', table: 'stakeholder_details' },
  { kind: 'requirement', table: 'requirement_details' },
  { kind: 'decision', table: 'decision_details' },
  { kind: 'risk', table: 'risk_details' },
  { kind: 'story', table: 'story_details' },
  { kind: 'test', table: 'test_details' },
  { kind: 'workshop', table: 'workshop_details' },
];

const asText = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export async function loadProjectData(projectId: number): Promise<ProjectData | null> {
  const projects = await query<{ name: string }>('SELECT name FROM projects WHERE id = ?', [projectId]);
  if (projects.length === 0) return null;
  const rows = await query<ItemRow>('SELECT id, kind, code, title, description, status FROM items WHERE project_id = ? ORDER BY id', [projectId]);
  const details = new Map<number, Record<string, string>>();
  for (const { kind, table } of DETAIL_TABLES) {
    const list = await query<Row>(`SELECT d.* FROM ${table} d JOIN items i ON i.id = d.item_id WHERE i.project_id = ? AND i.kind = ?`, [projectId, kind]);
    for (const r of list) {
      const { item_id: itemId, ...rest } = r as Row & { item_id: number };
      details.set(Number(itemId), Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, asText(v)])));
    }
  }
  const items: DItem[] = rows.map((r) => ({ id: Number(r.id), kind: r.kind as ItemKind, code: r.code, title: r.title, description: asText(r.description), status: r.status, d: details.get(Number(r.id)) ?? {} }));
  const linkRows = await query<LinkRow>('SELECT link_type, from_id, to_id FROM links WHERE project_id = ? ORDER BY id', [projectId]);
  const links: DLink[] = linkRows.map((l) => ({ type: l.link_type, fromId: Number(l.from_id), toId: Number(l.to_id) }));
  return { projectName: projects[0].name, items, links };
}
