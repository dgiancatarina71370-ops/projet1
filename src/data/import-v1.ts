// Import des données de la V1 (lot V2.2b ; spécification, section 11 et exigence E9).
// Aperçu (lecture seule) → confirmation → sauvegarde de sécurité → import en UNE transaction (tout ou rien) → compte rendu.
// Chaque ligne importée reçoit une ligne « imported » dans le journal d'activité, dans la même transaction (règle E10).
import type { PickedTextFile } from './driver.ts';
import { rawDriver } from './internal.ts';
import { query } from './db.ts';
import { mutate } from './mutate.ts';
import type { WriteOp } from './mutate.ts';
import { createBackup } from './backup-service.ts';
import { plural } from '../shared/plural.ts';
import { parseV1Export } from './import-v1-parse.ts';
import type { ParsedImport } from './import-v1-parse.ts';

export class ImportRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportRefusedError';
  }
}

/** Taille maximale d'un fichier d'import (le noyau applique la même limite). */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

const META_PREFIX = 'import_v1_';
const DETAIL = 'import-v1';

export interface ImportCounts {
  projects: number;
  documents: number;
  sends: number;
  contacts: number;
  dodItems: number;
  notes: number;
  pspoSteps: number;
  settings: number;
  flags: number;
}

/** État de la base nécessaire pour planifier : lu avant toute écriture. */
export interface DbState {
  nextProjectId: number;
  nextDocumentId: number;
  settings: Set<string>;
  flags: Set<string>;
  emails: Set<string>;
  pspo: Set<string>;
  dodCount: number;
  notesExist: boolean;
}

export interface PlannedOp extends WriteOp {
  table: keyof ImportCounts;
}

export interface ImportPlan {
  ops: PlannedOp[];
  /** Lignes que l'import va créer. Après coup, le nombre de lignes réellement écrites doit être identique. */
  expected: ImportCounts;
  /** Éléments de l'export laissés de côté parce que la base en contient déjà (jamais d'écrasement). `what` est déjà accordé en nombre. */
  kept: Array<{ what: string; count: number; feminine: boolean }>;
}

/** « 1 étape PSPO déjà présente : conservée telle quelle, non écrasée. » (accord en genre et en nombre) */
export function keptSentence(k: ImportPlan['kept'][number]): string {
  const done = k.feminine
    ? plural(k.count, 'conservée telle quelle, non écrasée', 'conservées telles quelles, non écrasées')
    : plural(k.count, 'conservé tel quel, non écrasé', 'conservés tels quels, non écrasés');
  return `${k.count} ${k.what} : ${done}.`;
}

const zero = (): ImportCounts => ({ projects: 0, documents: 0, sends: 0, contacts: 0, dodItems: 0, notes: 0, pspoSteps: 0, settings: 0, flags: 0 });

const cut = (s: string): string => (s.length > 100 ? s.slice(0, 100) : s);

/** Construit les écritures. Fonction pure : aucun accès à la base. Les identifiants sont attribués ici (pas de table de correspondance). */
export function buildPlan(p: ParsedImport, s: DbState, importedAt: string): ImportPlan {
  const ops: PlannedOp[] = [];
  const expected = zero();
  const kept: ImportPlan['kept'] = [];
  const keep = (count: number, one: string, many: string, feminine = false) => {
    if (count > 0) kept.push({ what: plural(count, one, many), count, feminine });
  };

  // Projets : parents avant enfants (garanti par le lecteur). Le projet d'accueil des éléments orphelins est un projet ordinaire.
  const projectId = new Map<string, number>();
  let nextProject = s.nextProjectId;
  for (const pr of p.projects) projectId.set(pr.v1Id, nextProject++);
  for (const pr of p.projects) {
    const id = projectId.get(pr.v1Id)!;
    const parent = pr.parentV1Id === null ? null : projectId.get(pr.parentV1Id)!;
    ops.push({
      table: 'projects',
      sql: 'INSERT INTO projects (id, parent_id, kind, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [id, parent, pr.kind, pr.name, pr.createdAt, pr.createdAt],
      // Même convention que createProject() : un projet porte son propre identifiant, un dossier celui de son parent.
      activity: { objectType: pr.kind === 'project' ? 'project' : 'folder', action: 'imported', objectId: id, projectId: pr.kind === 'project' ? id : parent, detail: DETAIL, at: pr.createdAt },
    });
    expected.projects++;
  }

  // Livrables, puis leurs envois.
  let nextDoc = s.nextDocumentId;
  for (const d of p.documents) {
    const id = nextDoc++;
    const proj = projectId.get(d.projectV1Id)!;
    const previous = d.previousProjectV1Id === null ? null : projectId.get(d.previousProjectV1Id) ?? null;
    ops.push({
      table: 'documents',
      sql: `INSERT INTO documents (id, project_id, previous_project_id, kind, name, status, content, template_ref, created_at, updated_at, validated_at, archived_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      params: [id, proj, previous, d.kind, d.name, d.status, d.content, d.updatedAt, d.updatedAt, d.validatedAt, d.archivedAt],
      activity: { objectType: 'document', action: 'imported', objectId: id, projectId: proj, detail: DETAIL, at: d.updatedAt },
    });
    expected.documents++;
    for (const send of d.sends) {
      ops.push({
        table: 'sends',
        sql: 'INSERT INTO document_sends (document_id, recipients, sent_at) VALUES (?, ?, ?)',
        params: [id, send.recipients, send.sentAt],
        activity: { objectType: 'document_send', action: 'imported', objectId: 'inserted', projectId: proj, detail: DETAIL, at: send.sentAt },
      });
      expected.sends++;
    }
  }

  // Contacts : l'adresse est unique ; un contact déjà présent est conservé tel quel (jamais d'écrasement).
  let existingContacts = 0;
  for (const c of p.contacts) {
    if (s.emails.has(c.email.toLowerCase())) {
      existingContacts++;
      continue;
    }
    ops.push({
      table: 'contacts',
      sql: 'INSERT OR IGNORE INTO contacts (name, email) VALUES (?, ?)',
      params: [c.name, c.email],
      activity: { objectType: 'contact', action: 'imported', objectId: 'inserted', detail: DETAIL, at: importedAt },
    });
    expected.contacts++;
  }
  keep(existingContacts, 'contact déjà présent', 'contacts déjà présents');

  // Définition de « terminé » : importée seulement si la base n'en a pas encore.
  if (s.dodCount === 0) {
    p.dod.forEach((d, i) => {
      ops.push({
        table: 'dodItems',
        sql: 'INSERT INTO dod_items (text, enabled, position) VALUES (?, ?, ?)',
        params: [d.text, d.enabled ? 1 : 0, i],
        activity: { objectType: 'dod_item', action: 'imported', objectId: 'inserted', detail: DETAIL, at: importedAt },
      });
      expected.dodItems++;
    });
  } else {
    keep(p.dod.length, 'critère de « terminé » (la base en a déjà)', 'critères de « terminé » (la base en a déjà)');
  }

  // Bloc-notes : une seule ligne ; celle de la base est conservée si elle existe.
  if (p.notes) {
    if (s.notesExist) keep(1, 'bloc-notes (la base en a déjà un)', 'bloc-notes (la base en a déjà un)');
    else {
      ops.push({
        table: 'notes',
        sql: 'INSERT OR IGNORE INTO workspace_notes (id, title, text, updated_at) VALUES (1, ?, ?, ?)',
        params: [p.notes.title, p.notes.text, p.exportedAt],
        activity: { objectType: 'workspace_notes', action: 'imported', objectId: 1, detail: DETAIL, at: importedAt },
      });
      expected.notes++;
    }
  }

  // Parcours PSPO, réglages, interrupteurs : une ligne par clé, la valeur déjà présente est conservée.
  let existingPspo = 0;
  for (const st of p.pspo) {
    if (s.pspo.has(st.stepId)) {
      existingPspo++;
      continue;
    }
    ops.push({
      table: 'pspoSteps',
      sql: 'INSERT OR IGNORE INTO pspo_progress (step_id, done, updated_at) VALUES (?, ?, ?)',
      params: [st.stepId, st.done ? 1 : 0, p.exportedAt],
      activity: { objectType: 'pspo_step', action: 'imported', objectId: 'inserted', detail: cut(st.stepId), at: importedAt },
    });
    expected.pspoSteps++;
  }
  keep(existingPspo, 'étape PSPO déjà présente', 'étapes PSPO déjà présentes', true);

  let existingSettings = 0;
  for (const st of p.settings) {
    if (s.settings.has(st.key)) {
      existingSettings++;
      continue;
    }
    ops.push({
      table: 'settings',
      sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      params: [st.key, st.value],
      activity: { objectType: 'setting', action: 'imported', objectId: 'inserted', detail: cut(st.key), at: importedAt },
    });
    expected.settings++;
  }
  keep(existingSettings, 'réglage déjà présent', 'réglages déjà présents');

  let existingFlags = 0;
  for (const f of p.flags) {
    if (s.flags.has(f.key)) {
      existingFlags++;
      continue;
    }
    ops.push({
      table: 'flags',
      sql: 'INSERT OR IGNORE INTO flags (key, enabled, custom, label, description, group_name) VALUES (?, ?, ?, ?, ?, ?)',
      params: [f.key, f.enabled ? 1 : 0, f.custom ? 1 : 0, f.label, f.description, f.group],
      activity: { objectType: 'flag', action: 'imported', objectId: 'inserted', detail: cut(f.key), at: importedAt },
    });
    expected.flags++;
  }
  keep(existingFlags, 'interrupteur déjà présent', 'interrupteurs déjà présents');

  return { ops, expected, kept };
}

/** Lit l'état de la base utile à la planification. */
export async function readDbState(): Promise<DbState> {
  const nextId = async (table: string): Promise<number> => {
    // AUTOINCREMENT ne réutilise jamais un identifiant supprimé : on repart du plus haut identifiant jamais attribué.
    const [m] = await query<{ n: number }>(`SELECT COALESCE(MAX(id), 0) AS n FROM ${table}`);
    const seq = await query<{ n: number }>('SELECT seq AS n FROM sqlite_sequence WHERE name = ?', [table]);
    return Math.max(Number(m.n), seq.length > 0 ? Number(seq[0].n) : 0) + 1;
  };
  const keys = async (sql: string): Promise<Set<string>> => new Set((await query<{ k: string }>(sql)).map((r) => String(r.k)));
  const [dod] = await query<{ n: number }>('SELECT count(*) AS n FROM dod_items');
  const [notes] = await query<{ n: number }>('SELECT count(*) AS n FROM workspace_notes');
  return {
    nextProjectId: await nextId('projects'),
    nextDocumentId: await nextId('documents'),
    settings: await keys('SELECT key AS k FROM settings'),
    flags: await keys('SELECT key AS k FROM flags'),
    emails: new Set([...(await keys('SELECT email AS k FROM contacts'))].map((e) => e.toLowerCase())),
    pspo: await keys('SELECT step_id AS k FROM pspo_progress'),
    dodCount: Number(dod.n),
    notesExist: Number(notes.n) > 0,
  };
}

/** Date du précédent import du même fichier (même empreinte), ou null. */
export async function previousImportOf(sha256: string): Promise<string | null> {
  const rows = await query<{ value: string }>('SELECT value FROM meta WHERE key = ?', [META_PREFIX + sha256]);
  return rows.length > 0 ? rows[0].value : null;
}

export interface ImportPreview {
  fileName: string;
  sha256: string;
  parsed: ParsedImport;
  plan: ImportPlan;
  /** Non null : ce fichier a déjà été importé à cette date ; un nouvel import duplique projets et livrables. */
  alreadyImportedAt: string | null;
}

export interface ImportInput {
  name: string;
  text: string;
  sha256: string;
}

/** Aperçu : analyse du fichier et chiffres de ce qui serait importé. N'écrit rien. */
export async function previewImport(file: ImportInput, now: Date = new Date()): Promise<ImportPreview> {
  const parsed = await parseV1Export({ text: file.text, sha256: file.sha256, now });
  const plan = buildPlan(parsed, await readDbState(), now.toISOString());
  return { fileName: file.name, sha256: file.sha256, parsed, plan, alreadyImportedAt: await previousImportOf(file.sha256) };
}

export interface ImportReport {
  expected: ImportCounts;
  actual: ImportCounts;
  /** Vrai si chaque compte réellement écrit égale le compte annoncé par l'aperçu (critère E9). */
  matches: boolean;
  journalLines: number;
  safetyBackup: string;
  warnings: string[];
}

export interface ImportOptions {
  /** Confirmation explicite d'un second import du même fichier (décision D5). */
  allowDuplicate?: boolean;
  now?: Date;
}

/**
 * Import. Le fichier est ré-analysé ici : l'interface ne transmet rien qui n'ait pas été contrôlé.
 * Ordre : refus du doublon non confirmé → sauvegarde de sécurité (un échec arrête tout, rien n'est écrit) → transaction unique.
 */
export async function runImport(file: ImportInput, options: ImportOptions = {}): Promise<ImportReport> {
  const now = options.now ?? new Date();
  const parsed = await parseV1Export({ text: file.text, sha256: file.sha256, now });
  const duplicateOf = await previousImportOf(file.sha256);
  if (duplicateOf !== null && !options.allowDuplicate) {
    throw new ImportRefusedError(`Ce fichier a déjà été importé (${duplicateOf.slice(0, 16).replace('T', ' ')} UTC). Confirmez explicitement pour l'importer une seconde fois : projets et livrables seraient dupliqués.`);
  }

  // Sauvegarde de sécurité : type « pre-migration » (la base n'admet pas d'autre type sans migration).
  let backup;
  try {
    backup = await createBackup('pre-migration');
  } catch (e) {
    throw new ImportRefusedError(`Import annulé : la sauvegarde de sécurité a échoué, aucune donnée n'a été écrite. ${e instanceof Error ? e.message : String(e)}`);
  }

  // L'état est lu APRÈS la sauvegarde : les identifiants attribués sont ceux de la base telle qu'elle est au moment d'écrire.
  const plan = buildPlan(parsed, await readDbState(), now.toISOString());
  const ops: WriteOp[] = plan.ops.map(({ table: _table, ...op }) => op);
  ops.push({
    sql: 'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    params: [META_PREFIX + file.sha256, now.toISOString()],
  });
  const results = await mutate(ops);

  const actual = zero();
  plan.ops.forEach((op, i) => {
    actual[op.table] += results[i].changes;
  });
  const total = (c: ImportCounts): number => Object.values(c).reduce((a, b) => a + b, 0);
  return {
    expected: plan.expected,
    actual,
    matches: (Object.keys(actual) as Array<keyof ImportCounts>).every((k) => actual[k] === plan.expected[k]),
    journalLines: total(actual),
    safetyBackup: backup.created.file,
    warnings: [...parsed.warnings, ...backup.warnings],
  };
}

/** Boîte de dialogue système puis lecture du fichier par le noyau (50 Mo au plus) ; null si l'utilisateur annule. */
export function pickImportFile(): Promise<PickedTextFile | null> {
  return rawDriver().pickImportFile();
}
