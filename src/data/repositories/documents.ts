// Lecture des livrables (lot V2.3a). Lecture seule : la création et la modification arrivent avec l'écran Documents (lot V2.7).
import { query } from '../db.ts';

export interface DocumentSummary {
  id: number;
  name: string;
  kind: string;
  status: string;
  projectName: string;
  updatedAt: string;
}

export async function listDocuments(limit = 200): Promise<DocumentSummary[]> {
  const rows = await query<{ id: number; name: string; kind: string; status: string; project_name: string; updated_at: string }>(
    `SELECT d.id, d.name, d.kind, d.status, d.updated_at, p.name AS project_name
       FROM documents d JOIN projects p ON p.id = d.project_id
      ORDER BY d.updated_at DESC, d.id DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({ id: Number(r.id), name: r.name, kind: r.kind, status: r.status, projectName: r.project_name, updatedAt: r.updated_at }));
}

export async function getDocumentContent(id: number): Promise<{ name: string; content: string } | null> {
  const rows = await query<{ name: string; content: string }>('SELECT name, content FROM documents WHERE id = ?', [id]);
  return rows.length > 0 ? { name: rows[0].name, content: rows[0].content } : null;
}
