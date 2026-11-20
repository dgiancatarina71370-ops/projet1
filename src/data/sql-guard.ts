// Garde-fous SQL appliqués côté TypeScript. Le noyau Rust applique les siens (défense en profondeur).
// Syntaxe volontairement "effaçable" (pas d'enum ni de propriété de paramètre) : ce fichier s'exécute tel quel sous Node pour les tests.

export class SqlRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlRefusedError';
  }
}

/** Retire commentaires SQL et contenu des chaînes, pour analyser la structure d'une instruction. */
export function stripSql(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];
    if (c === '-' && n === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
    } else if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i++;
      while (i < sql.length) {
        if (sql[i] === q) {
          if (sql[i + 1] === q) { i += 2; continue; }
          break;
        }
        i++;
      }
      i++;
      out += "''";
    } else {
      out += c;
      i++;
    }
  }
  return out.trim();
}

export function firstKeyword(sql: string): string {
  const m = /^[A-Za-z_]+/.exec(stripSql(sql));
  return m ? m[0].toUpperCase() : '';
}

const FORBIDDEN_EVERYWHERE = ['ATTACH', 'DETACH', 'PRAGMA', 'VACUUM', 'LOAD_EXTENSION'];
const WRITE_WORDS = /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|ANALYZE)\b/i;

function assertSingleStatement(sql: string): void {
  const body = stripSql(sql).replace(/;\s*$/, '');
  if (body.includes(';')) throw new SqlRefusedError('Une seule instruction SQL par appel est autorisée.');
}

/** Toute instruction, quelle que soit la voie : ATTACH, DETACH, PRAGMA et VACUUM sont refusés (aucune donnée hors du fichier de base). */
export function assertAllowed(sql: string): void {
  assertSingleStatement(sql);
  const kw = firstKeyword(sql);
  if (kw === '') throw new SqlRefusedError('Instruction SQL vide.');
  if (FORBIDDEN_EVERYWHERE.includes(kw)) {
    throw new SqlRefusedError(`Instruction refusée : ${kw}. Aucune donnée ne peut vivre hors du fichier de base.`);
  }
  if (/\b(ATTACH|DETACH)\b/i.test(stripSql(sql))) {
    throw new SqlRefusedError('ATTACH et DETACH sont refusés.');
  }
}

/** Lecture seule : SELECT, ou WITH ... SELECT sans mot d'écriture. */
export function assertReadOnly(sql: string): void {
  assertAllowed(sql);
  const kw = firstKeyword(sql);
  if (kw !== 'SELECT' && kw !== 'WITH') {
    throw new SqlRefusedError('Cette voie ne permet que la lecture : utilisez mutate() pour écrire.');
  }
  if (WRITE_WORDS.test(stripSql(sql))) {
    throw new SqlRefusedError('Une requête de lecture ne peut contenir aucun mot d\'écriture.');
  }
}

/** Écriture par mutate() : INSERT, UPDATE ou DELETE uniquement (jamais de DDL), et jamais sur le journal d'activité. */
export function assertMutation(sql: string): void {
  assertAllowed(sql);
  const kw = firstKeyword(sql);
  if (kw !== 'INSERT' && kw !== 'UPDATE' && kw !== 'DELETE' && kw !== 'REPLACE') {
    throw new SqlRefusedError('mutate() n\'accepte que INSERT, UPDATE et DELETE.');
  }
  if (/\bactivity_log\b/i.test(stripSql(sql))) {
    throw new SqlRefusedError('Le journal d\'activité s\'écrit uniquement par le champ « activity » de mutate().');
  }
}

/**
 * Tables techniques : écrites sans ligne de journal d'activité (décision validée au lot V2.2a).
 * Elles décrivent le fonctionnement de l'application (version du schéma, historique des sauvegardes), pas le travail de l'utilisateur.
 * Toute autre table exige un champ « activity » dans mutate().
 */
export const TECHNICAL_TABLES: readonly string[] = ['backups_log', 'meta'];

/** Nom de la table visée par un INSERT, UPDATE, DELETE ou REPLACE ; null si l'instruction n'a pas la forme attendue. */
export function writeTarget(sql: string): string | null {
  const body = stripSql(sql);
  const m =
    /^\s*(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|REPLACE\s+INTO|UPDATE\s+(?:OR\s+\w+\s+)?|DELETE\s+FROM)\s*[`"\[]?(\w+)/i.exec(body);
  return m ? m[1].toLowerCase() : null;
}

/** Une écriture sans « activity » n'est admise que sur une table technique. */
export function assertTechnicalWrite(sql: string): void {
  const table = writeTarget(sql);
  if (table === null || !TECHNICAL_TABLES.includes(table)) {
    throw new SqlRefusedError(
      `Écriture sans journal d'activité refusée${table ? ` sur « ${table} »` : ''} : ajoutez le champ « activity » (seules les tables ${TECHNICAL_TABLES.join(' et ')} en sont dispensées).`,
    );
  }
}
