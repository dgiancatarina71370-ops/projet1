// API de lecture publique, utilisable par les modules et les dépôts.
// Il n'existe volontairement aucune API d'écriture ici : toute écriture passe par mutate() (mutate.ts).
import type { Row, SqlValue } from './driver.ts';
import { rawSelect } from './internal.ts';

export type { Row, SqlValue } from './driver.ts';

/** Requête de lecture avec paramètres liés. Toute instruction qui n'est pas une lecture est refusée. */
export async function query<T extends Row = Row>(sql: string, params: SqlValue[] = []): Promise<T[]> {
  return (await rawSelect(sql, params)) as T[];
}

export async function queryOne<T extends Row = Row>(sql: string, params: SqlValue[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}
