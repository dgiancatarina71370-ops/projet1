// Aide de test (lot F5) : tous les documents de la base, tous projets confondus, le plus récent d'abord.
// L'application ne lit plus les documents que par projet ; les tests d'export d'un import V1 veulent tout voir.
import { query } from '../../src/data/db.ts';

export async function listDocuments(): Promise<Array<{ id: number; name: string; status: string }>> {
  const rows = await query<{ id: number; name: string; status: string }>('SELECT id, name, status FROM documents ORDER BY updated_at DESC, id DESC');
  return rows.map((r) => ({ id: Number(r.id), name: r.name, status: r.status }));
}
