// Lot V2.2b : import des données de la V1 (exigence E9 : « avant = après »).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { migratedDb } from './helpers/setup.ts';
import { query } from '../src/data/db.ts';
import { mutate } from '../src/data/mutate.ts';
import { createProject, deleteProject } from '../src/data/repositories/projects.ts';
import { parseV1Export, ImportFormatError, ORPHAN_PROJECT_NAME } from '../src/data/import-v1-parse.ts';
import { buildPlan, keptSentence, previewImport, runImport, ImportRefusedError } from '../src/data/import-v1.ts';
import type { ImportInput } from '../src/data/import-v1.ts';

const FIX = path.resolve(import.meta.dirname, 'fixtures');
const NOW = new Date('2026-11-21T09:00:00.000Z');

function load(name: string): ImportInput {
  const bytes = fs.readFileSync(path.join(FIX, name));
  return { name, text: bytes.toString('utf-8'), sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

function fromObject(obj: unknown): ImportInput {
  const text = JSON.stringify(obj);
  return { name: 'inline.json', text, sha256: crypto.createHash('sha256').update(text).digest('hex') };
}

const n = async (sql: string, params: Array<string | number> = []): Promise<number> => Number((await query<{ n: number }>(sql, params))[0].n);

const wrap = (state: unknown, extra: Record<string, unknown> = {}) => ({ format: 'ba-mentor-v1-export', formatVersion: 1, exportedAt: '2026-04-01T08:00:00.000Z', state, ...extra });

// ---------------------------------------------------------------------------------------------------------------------
// Lecture et contrôle du format
// ---------------------------------------------------------------------------------------------------------------------

test('export réel anonymisé : structure lue sans écart ni avertissement', async () => {
  const f = load('v1-export-minimal.json');
  const p = await parseV1Export({ text: f.text, sha256: f.sha256, now: NOW });
  assert.deepEqual(p.warnings, []);
  assert.equal(p.projects.length, 6);
  assert.deepEqual(p.projects.map((x) => x.kind).sort(), ['archive', 'folder', 'folder', 'folder', 'folder', 'project']);
  const archive = p.projects.find((x) => x.kind === 'archive')!;
  assert.notEqual(archive.parentV1Id, null, 'dans l\'export réel, « 99 Archives » est un enfant du projet, pas une racine');
  assert.equal(p.documents.length, 1);
  assert.equal(p.documents[0].status, 'draft');
  assert.equal(p.documents[0].kind, 'cr');
  assert.equal(p.dod.length, 7);
  assert.equal(p.dod.filter((d) => d.enabled).length, 6);
  assert.equal(p.sampleOnly, true, 'seules les données d\'exemple de la V1 : à signaler (D4)');
  assert.deepEqual(p.settings.map((s) => s.key).sort(), ['author', 'theme']);
});

test('D1 : un dossier est daté du plus ancien livrable qu\'il contient, à défaut de la date d\'export', async () => {
  const f = load('v1-export-minimal.json');
  const p = await parseV1Export({ text: f.text, sha256: f.sha256, now: NOW });
  const byName = Object.fromEntries(p.projects.map((x) => [x.name, x.createdAt]));
  assert.equal(byName['Projet exemple — Référentiel clients'], '2026-11-01T22:48:08.823Z');
  assert.equal(byName['02 Ateliers'], '2026-11-01T22:48:08.823Z');
  assert.equal(byName['01 Cadrage'], '2026-11-20T17:31:06.971Z');
});

test('export riche synthétique : avertissements attendus, et pas « exemple seul »', async () => {
  const f = load('v1-export-synthetic-rich.json');
  const p = await parseV1Export({ text: f.text, sha256: f.sha256, now: NOW });
  assert.equal(p.sampleOnly, false);
  const w = p.warnings.join('\n');
  assert.match(w, /sans dossier valide/);
  assert.match(w, /« en cours » inconnu/);
  assert.match(w, /date de modification absente ou illisible/);
  assert.match(w, /doublon ignoré/);
  assert.match(w, /sans adresse e-mail/);
  assert.ok(p.projects.some((x) => x.name === ORPHAN_PROJECT_NAME));
  // parents toujours avant leurs enfants
  const seen = new Set<string>();
  for (const pr of p.projects) {
    if (pr.parentV1Id !== null) assert.ok(seen.has(pr.parentV1Id), `${pr.name} vient avant son parent`);
    seen.add(pr.v1Id);
  }
});

test('fichiers invalides : refusés avec le chemin de la clé fautive', async () => {
  const bad = async (input: string | unknown, expected: RegExp) => {
    const text = typeof input === 'string' ? input : JSON.stringify(input);
    await assert.rejects(parseV1Export({ text, sha256: 'x', now: NOW }), (e: unknown) => {
      assert.ok(e instanceof ImportFormatError, String(e));
      assert.match(e.message, expected);
      return true;
    });
  };
  await bad('{ pas du json', /JSON valide/);
  await bad('[]', /un objet JSON/);
  await bad({ format: 'autre', formatVersion: 1, state: {} }, /pas un export de BA-Mentor V1/);
  await bad({ format: 'ba-mentor-v1-export', formatVersion: 2, state: {} }, /plus récent/);
  await bad({ format: 'ba-mentor-v1-export', formatVersion: 1 }, /« state » doit être un objet/);
  await bad(wrap({ nodes: {} }), /« state\.nodes » doit être un tableau/);
  await bad(wrap({ nodes: [{ id: 'a', type: 'dossier', parent: null, name: 'x' }] }), /« state\.nodes\[0\]\.type »/);
  await bad(wrap({ nodes: [{ type: 'folder', parent: null, name: 'x' }] }), /« state\.nodes\[0\]\.id »/);
  await bad(wrap({ nodes: [{ id: 'a', type: 'folder', parent: null, name: 'x' }, { id: 'a', type: 'folder', parent: null, name: 'y' }] }), /apparaît deux fois/);
  await bad(wrap({ nodes: [{ id: 'a', type: 'folder', parent: 'b', name: 'x' }, { id: 'b', type: 'folder', parent: 'a', name: 'y' }] }), /boucle/);
});

test('un export vide est valide : rien à importer', async () => {
  const p = await parseV1Export({ text: JSON.stringify(wrap({})), sha256: 'x', now: NOW });
  assert.equal(p.projects.length, 0);
  assert.equal(p.sampleOnly, false);
});

// ---------------------------------------------------------------------------------------------------------------------
// Import réel dans une base migrée (E9)
// ---------------------------------------------------------------------------------------------------------------------

test('E9 : import de l\'export réel anonymisé, totaux avant = après, journal complet', async () => {
  const t = await migratedDb();
  try {
    const f = load('v1-export-minimal.json');
    const preview = await previewImport(f, NOW);
    assert.equal(preview.alreadyImportedAt, null);
    assert.equal(await n('SELECT count(*) AS n FROM projects'), 0, 'l\'aperçu n\'écrit rien');

    const r = await runImport(f, { now: NOW });
    assert.equal(r.matches, true);
    assert.deepEqual(r.expected, { projects: 6, documents: 1, sends: 0, contacts: 0, dodItems: 7, notes: 1, pspoSteps: 1, settings: 2, flags: 0 });
    assert.deepEqual(r.actual, r.expected);

    // Avant = après, comptés indépendamment de l'import, sur le fichier source.
    const src = JSON.parse(f.text).state;
    assert.equal(await n("SELECT count(*) AS n FROM projects"), src.nodes.filter((x: { type: string }) => x.type === 'folder').length);
    assert.equal(await n('SELECT count(*) AS n FROM documents'), src.nodes.filter((x: { type: string }) => x.type === 'doc').length);
    assert.equal(await n('SELECT count(*) AS n FROM dod_items'), src.dod.length);
    assert.equal(await n('SELECT count(*) AS n FROM dod_items WHERE enabled = 1'), src.dod.filter((d: { on: boolean }) => d.on).length);
    assert.equal(await n('SELECT count(*) AS n FROM pspo_progress'), Object.keys(src.pspo).length);

    // Un livrable est identique, caractère pour caractère.
    const srcDoc = src.nodes.find((x: { type: string }) => x.type === 'doc');
    const [doc] = await query<{ content: string; name: string; status: string; kind: string; updated_at: string; project_id: number }>('SELECT * FROM documents');
    assert.equal(doc.content, srcDoc.content);
    assert.equal(doc.name, srcDoc.name);
    assert.equal(doc.status, 'draft');
    assert.equal(doc.updated_at, srcDoc.updated);
    const [home] = await query<{ name: string }>('SELECT name FROM projects WHERE id = ?', [doc.project_id]);
    assert.equal(home.name, '02 Ateliers');

    // Hiérarchie : un seul projet racine, quatre dossiers et une archive dessous.
    assert.equal(await n('SELECT count(*) AS n FROM projects WHERE parent_id IS NULL'), 1);
    assert.equal(await n("SELECT count(*) AS n FROM projects WHERE kind = 'archive' AND parent_id IS NOT NULL"), 1);

    // Réglages et bloc-notes.
    assert.deepEqual(await query('SELECT key, value FROM settings ORDER BY key'), [{ key: 'author', value: 'Auteur Test' }, { key: 'theme', value: 'dark' }]);
    const [notes] = await query<{ title: string; text: string }>('SELECT title, text FROM workspace_notes');
    assert.equal(notes.text, src.notes.text);

    // Journal : une ligne « imported » par ligne importée, sans aucun contenu.
    assert.equal(await n("SELECT count(*) AS n FROM activity_log WHERE action = 'imported'"), 18);
    assert.equal(r.journalLines, 18);
    const details = await query<{ detail: string }>("SELECT detail FROM activity_log WHERE action = 'imported'");
    for (const d of details) assert.ok(!d.detail.includes('CR atelier') && !d.detail.includes('Auteur'), 'pas de contenu dans le journal');
    // Les projets sont journalisés à leur date, pas à celle de l'import.
    assert.equal(await n("SELECT count(*) AS n FROM activity_log WHERE object_type = 'document' AND at = ?", [srcDoc.updated]), 1);

    // Sauvegarde de sécurité et empreinte du fichier.
    assert.ok(fs.existsSync(r.safetyBackup));
    assert.match(path.basename(r.safetyBackup), /-pre-migration/);
    assert.equal(await n("SELECT count(*) AS n FROM backups_log WHERE kind = 'pre-migration'"), 1);
    assert.equal(await n('SELECT count(*) AS n FROM meta WHERE key = ?', ['import_v1_' + f.sha256]), 1);
  } finally {
    t.close();
  }
});

test('la sauvegarde de sécurité contient la base d\'AVANT l\'import', async () => {
  const t = await migratedDb();
  try {
    await createProject('Déjà là');
    const r = await runImport(load('v1-export-minimal.json'), { now: NOW });
    const { DatabaseSync } = await import('node:sqlite');
    const b = new DatabaseSync(r.safetyBackup, { readOnly: true });
    assert.equal((b.prepare('SELECT count(*) AS n FROM projects').get() as { n: number }).n, 1);
    b.close();
    assert.equal(await n('SELECT count(*) AS n FROM projects'), 7);
  } finally {
    t.close();
  }
});

test('E9 : import de l\'export riche synthétique, chaque cas délicat', async () => {
  const t = await migratedDb();
  try {
    const r = await runImport(load('v1-export-synthetic-rich.json'), { now: NOW });
    assert.equal(r.matches, true);
    assert.deepEqual(r.actual, { projects: 6, documents: 5, sends: 2, contacts: 2, dodItems: 3, notes: 1, pspoSteps: 3, settings: 2, flags: 4 });

    const docs = await query<{ name: string; status: string; kind: string; validated_at: string | null; archived_at: string | null; previous_project_id: number | null; project_id: number }>('SELECT * FROM documents ORDER BY id');
    const byName = Object.fromEntries(docs.map((d) => [d.name, d]));
    assert.equal(byName['SFD règles de gestion'].status, 'validated');
    assert.equal(byName['SFD règles de gestion'].validated_at, '2026-03-10T14:30:00.000Z');
    assert.equal(byName['CR archivé'].status, 'archived');
    assert.equal(byName['CR archivé'].archived_at, '2026-03-20T10:00:00.000Z');
    const [prev] = await query<{ name: string }>('SELECT name FROM projects WHERE id = ?', [byName['CR archivé'].previous_project_id!]);
    assert.equal(prev.name, 'Cadrage');
    const [archiveHome] = await query<{ name: string; kind: string }>('SELECT name, kind FROM projects WHERE id = ?', [byName['CR archivé'].project_id]);
    assert.deepEqual(archiveHome, { name: 'Archives', kind: 'archive' });
    assert.equal(byName['SGD statut inconnu'].status, 'draft', 'statut inconnu → brouillon, avec avertissement');
    const [orphanHome] = await query<{ name: string }>('SELECT name FROM projects WHERE id = ?', [byName['Livrable sans dossier'].project_id]);
    assert.equal(orphanHome.name, ORPHAN_PROJECT_NAME);
    assert.equal((await query<{ content: string }>("SELECT content FROM documents WHERE name = 'US connexion'"))[0].content, 'En tant que testeur,\nje veux des accents : é è à ç — « guillemets » et un emoji 🙂\n');

    assert.deepEqual(await query('SELECT recipients, sent_at FROM document_sends ORDER BY id'), [
      { recipients: 'alice@exemple.test, bob@exemple.test', sent_at: '2026-03-11T08:00:00.000Z' },
      { recipients: 'carole@exemple.test;dan@exemple.test', sent_at: '2026-03-12T08:00:00.000Z' },
    ]);
    assert.deepEqual(await query('SELECT name, email FROM contacts ORDER BY id'), [
      { name: 'Alice Test', email: 'alice@exemple.test' },
      { name: 'Bob Test', email: 'bob@exemple.test' },
    ]);
    assert.deepEqual(await query('SELECT key, enabled, custom, label FROM flags ORDER BY key'), [
      { key: 'agile', enabled: 0, custom: 0, label: null },
      { key: 'challenge', enabled: 1, custom: 0, label: null },
      { key: 'custom1', enabled: 1, custom: 1, label: 'Mon module' },
      { key: 'custom2', enabled: 1, custom: 1, label: 'Autre module' }, // absent de « flags » : valeur par défaut du flag
    ]);
    assert.deepEqual(await query('SELECT text, enabled, position FROM dod_items ORDER BY position'), [
      { text: 'Critère actif', enabled: 1, position: 0 },
      { text: 'Critère inactif', enabled: 0, position: 1 },
      { text: 'Autre critère', enabled: 1, position: 2 },
    ]);
    assert.deepEqual(await query('SELECT step_id, done FROM pspo_progress ORDER BY step_id'), [{ step_id: 'p1', done: 1 }, { step_id: 'p2', done: 0 }, { step_id: 'p3', done: 1 }]);
    assert.equal(await n("SELECT count(*) AS n FROM activity_log WHERE action = 'imported'"), r.journalLines);
    assert.equal(r.journalLines, 6 + 5 + 2 + 2 + 3 + 1 + 3 + 2 + 4);
    assert.ok(r.warnings.length >= 5);
  } finally {
    t.close();
  }
});

test('D5 : un second import du même fichier exige une confirmation explicite, et n\'écrase rien', async () => {
  const t = await migratedDb();
  try {
    const f = load('v1-export-minimal.json');
    await runImport(f, { now: NOW });
    const again = await previewImport(f, NOW);
    assert.equal(again.alreadyImportedAt, NOW.toISOString());

    await assert.rejects(runImport(f, { now: NOW }), (e: unknown) => e instanceof ImportRefusedError && /déjà été importé/.test(e.message));
    assert.equal(await n('SELECT count(*) AS n FROM projects'), 6, 'refus : rien n\'a été écrit');
    assert.equal(await n("SELECT count(*) AS n FROM backups_log WHERE kind = 'pre-migration'"), 1, 'refus avant toute sauvegarde');

    await mutate([{ sql: "UPDATE settings SET value = 'light' WHERE key = 'theme'", activity: { objectType: 'setting', action: 'created', objectId: 1 } }]);
    const r = await runImport(f, { now: NOW, allowDuplicate: true });
    assert.equal(r.matches, true);
    assert.deepEqual(r.actual, { projects: 6, documents: 1, sends: 0, contacts: 0, dodItems: 0, notes: 0, pspoSteps: 0, settings: 0, flags: 0 });
    assert.equal(await n('SELECT count(*) AS n FROM projects'), 12, 'projets et livrables dupliqués, comme annoncé');
    assert.equal(await n('SELECT count(*) AS n FROM dod_items'), 7, 'DoD non réimportée : la base en a déjà');
    assert.equal((await query<{ value: string }>("SELECT value FROM settings WHERE key = 'theme'"))[0].value, 'light', 'réglage existant conservé');
  } finally {
    t.close();
  }
});

test('D5 : contacts, réglages, notes et DoD déjà présents sont conservés', async () => {
  const t = await migratedDb();
  try {
    await mutate([
      { sql: "INSERT INTO settings (key, value) VALUES ('author', 'Existant')", activity: { objectType: 'setting', action: 'created', objectId: 1 } },
      { sql: "INSERT INTO contacts (name, email) VALUES ('Alice locale', 'Alice@Exemple.test')", activity: { objectType: 'contact', action: 'created', objectId: 1 } },
      { sql: "INSERT INTO dod_items (text, enabled, position) VALUES ('Mon critère', 1, 0)", activity: { objectType: 'dod_item', action: 'created', objectId: 1 } },
      { sql: "INSERT INTO workspace_notes (id, title, text, updated_at) VALUES (1, 'Mes notes', 'à moi', '2026-01-01T00:00:00.000Z')", activity: { objectType: 'workspace_notes', action: 'created', objectId: 1 } },
    ]);
    const f = load('v1-export-synthetic-rich.json');
    const preview = await previewImport(f, NOW);
    const kept = Object.fromEntries(preview.plan.kept.map((k) => [k.what, k.count]));
    assert.equal(kept['contact déjà présent'], 1);
    assert.equal(kept['réglage déjà présent'], 1);
    assert.equal(kept['bloc-notes (la base en a déjà un)'], 1);
    assert.equal(kept['critères de « terminé » (la base en a déjà)'], 3);
    assert.deepEqual(preview.plan.kept.map(keptSentence), [
      '1 contact déjà présent : conservé tel quel, non écrasé.',
      '3 critères de « terminé » (la base en a déjà) : conservés tels quels, non écrasés.',
      '1 bloc-notes (la base en a déjà un) : conservé tel quel, non écrasé.',
      '1 réglage déjà présent : conservé tel quel, non écrasé.',
    ]);

    const r = await runImport(f, { now: NOW });
    assert.equal(r.matches, true);
    assert.equal((await query<{ value: string }>("SELECT value FROM settings WHERE key = 'author'"))[0].value, 'Existant');
    assert.equal((await query<{ text: string }>('SELECT text FROM workspace_notes'))[0].text, 'à moi');
    assert.equal(await n('SELECT count(*) AS n FROM dod_items'), 1);
    assert.equal(await n('SELECT count(*) AS n FROM contacts'), 2); // Alice (casse différente) non dupliquée ; Bob ajouté
  } finally {
    t.close();
  }
});

test('les identifiants attribués ne réutilisent jamais ceux d\'un projet supprimé', async () => {
  const t = await migratedDb();
  try {
    await createProject('A');
    const b = await createProject('B');
    await deleteProject(b); // la séquence reste à 2 ; le plus haut identifiant présent est 1
    const r = await runImport(load('v1-export-minimal.json'), { now: NOW });
    assert.equal(r.matches, true);
    assert.equal(await n('SELECT MIN(id) AS n FROM projects WHERE name LIKE ?', ['Projet exemple%']), 3);
  } finally {
    t.close();
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Tout ou rien
// ---------------------------------------------------------------------------------------------------------------------

test('une erreur en cours d\'import annule TOUT (transaction unique)', async () => {
  const t = await migratedDb();
  try {
    // Piège : l'insertion d'une étape PSPO échoue, après les projets, livrables, DoD et notes.
    t.raw.exec("CREATE TRIGGER boom BEFORE INSERT ON pspo_progress BEGIN SELECT RAISE(ABORT, 'panne simulée'); END");
    const f = load('v1-export-minimal.json');
    await assert.rejects(runImport(f, { now: NOW }), /panne simulée/);
    for (const table of ['projects', 'documents', 'dod_items', 'workspace_notes', 'settings', 'activity_log']) {
      assert.equal(await n(`SELECT count(*) AS n FROM ${table}`), 0, `${table} doit être vide après l'échec`);
    }
    assert.equal(await n('SELECT count(*) AS n FROM meta WHERE key = ?', ['import_v1_' + f.sha256]), 0, 'l\'empreinte n\'est pas enregistrée : l\'import pourra être retenté sans confirmation');
  } finally {
    t.close();
  }
});

test('si la sauvegarde de sécurité échoue, rien n\'est écrit', async () => {
  const t = await migratedDb();
  try {
    t.driver.backupCreate = async () => {
      throw new Error('disque plein');
    };
    await assert.rejects(runImport(load('v1-export-minimal.json'), { now: NOW }), (e: unknown) => e instanceof ImportRefusedError && /sauvegarde de sécurité a échoué/.test(e.message) && /disque plein/.test(e.message));
    assert.equal(await n('SELECT count(*) AS n FROM projects'), 0);
    assert.equal(await n('SELECT count(*) AS n FROM activity_log'), 0);
  } finally {
    t.close();
  }
});

test('un fichier invalide est refusé avant toute sauvegarde ou écriture', async () => {
  const t = await migratedDb();
  try {
    await assert.rejects(runImport(fromObject({ format: 'ba-mentor-v1-export', formatVersion: 1, state: { nodes: 5 } }), { now: NOW }), ImportFormatError);
    assert.equal(t.backups.length, 0);
    assert.equal(await n('SELECT count(*) AS n FROM activity_log'), 0);
  } finally {
    t.close();
  }
});

test('buildPlan est pur : mêmes entrées, mêmes écritures', async () => {
  const f = load('v1-export-synthetic-rich.json');
  const parsed = await parseV1Export({ text: f.text, sha256: f.sha256, now: NOW });
  const state = { nextProjectId: 1, nextDocumentId: 1, settings: new Set<string>(), flags: new Set<string>(), emails: new Set<string>(), pspo: new Set<string>(), dodCount: 0, notesExist: false };
  assert.deepEqual(buildPlan(parsed, state, NOW.toISOString()), buildPlan(parsed, state, NOW.toISOString()));
});
