// Seul point d'écriture de l'application (exigence E10).
// Chaque écriture passe ici ; l'entrée du journal d'activité est écrite dans la MÊME transaction que l'écriture qu'elle décrit.
import type { SqlValue, Statement, WriteResult } from './driver.ts';
import { rawTransaction } from './internal.ts';
import { assertExtensionWrite, assertMutation, assertTechnicalWrite, SqlRefusedError } from './sql-guard.ts';

export type ActivityAction = 'created' | 'deleted' | 'status_changed' | 'imported' | 'updated';

export interface ActivitySpec {
  objectType: string;
  action: ActivityAction;
  /** Identifiant de l'objet, ou 'inserted' pour reprendre la ligne que l'instruction vient d'insérer. */
  objectId: number | 'inserted';
  /** Projet concerné, ou 'inserted' quand l'objet créé est lui-même un projet. */
  projectId?: number | 'inserted' | null;
  /** Texte technique court. Jamais de titre ni de contenu : le journal ne garde que des types et des identifiants. */
  detail?: string | null;
  /** Date ISO 8601 UTC ; par défaut l'instant présent. Sert à l'import de la V1, qui date les objets de leur dernière modification. */
  at?: string;
}

export interface WriteOp {
  sql: string;
  params?: SqlValue[];
  activity?: ActivitySpec;
  /**
   * Écriture d'une table d'extension d'un élément (décision D43) : pas de ligne de journal propre, mais le lot doit contenir
   * au moins une écriture journalisée (celle de l'élément). Exclusif avec « activity ».
   */
  extension?: boolean;
}

export const MAX_DETAIL_LENGTH = 100;

function nowIso(): string {
  return new Date().toISOString();
}

function activityStatement(a: ActivitySpec): Statement {
  if (a.detail != null && a.detail.length > MAX_DETAIL_LENGTH) {
    throw new SqlRefusedError(`Le détail du journal est limité à ${MAX_DETAIL_LENGTH} caractères : pas de contenu dans le journal.`);
  }
  const params: SqlValue[] = [a.at ?? nowIso(), a.objectType];
  let objectExpr = '?';
  if (a.objectId === 'inserted') objectExpr = 'last_insert_rowid()';
  else params.push(a.objectId);
  params.push(a.action);
  let projectExpr = '?';
  if (a.projectId === 'inserted') projectExpr = 'last_insert_rowid()';
  else params.push(a.projectId ?? null);
  params.push(a.detail ?? null);
  // « WHERE changes() > 0 » : aucune ligne de journal si l'instruction précédente n'a rien modifié (par exemple INSERT OR IGNORE).
  return {
    sql: `INSERT INTO activity_log (at, object_type, object_id, action, project_id, detail) SELECT ?, ?, ${objectExpr}, ?, ${projectExpr}, ? WHERE changes() > 0`,
    params,
  };
}

/**
 * Exécute des écritures dans une seule transaction, avec leurs entrées de journal.
 * Une écriture sans « activity » n'est acceptée que sur une table technique (backups_log, meta).
 * Retourne un résultat par écriture (les instructions du journal ne sont pas renvoyées).
 */
export async function mutate(ops: WriteOp[]): Promise<WriteResult[]> {
  if (ops.length === 0) return [];
  const statements: Statement[] = [];
  const resultIndex: number[] = [];
  const hasJournal = ops.some((o) => o.activity !== undefined);
  for (const op of ops) {
    assertMutation(op.sql);
    if (op.extension && op.activity) throw new SqlRefusedError('« extension » et « activity » sont exclusifs.');
    if (op.extension) assertExtensionWrite(op.sql, hasJournal);
    else if (!op.activity) assertTechnicalWrite(op.sql);
    resultIndex.push(statements.length);
    statements.push({ sql: op.sql, params: op.params ?? [] });
    if (op.activity) statements.push(activityStatement(op.activity));
  }
  const results = await rawTransaction(statements);
  return resultIndex.map((i) => results[i]);
}
