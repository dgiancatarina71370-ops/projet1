// Lot F5 : documents versionnés et figés (décisions F5-D01 à F5-D12). Base SQLite réelle (node:sqlite).
// Le rendu et la logique des écrans sont dans ui-f5.test.ts ; les clics, les fichiers ouverts dans Word et la migration sur la vraie base
// sont à la recette sur clé (TESTS-F5.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptyDb, migratedDb } from './helpers/setup.ts';
import { seedAllTables, snapshot } from './helpers/seed.ts';
import { query } from '../src/data/db.ts';
import { migrate, getSchemaVersion } from '../src/data/migrate.ts';
import { migrations, SCHEMA_VERSION } from '../src/data/migrations/index.ts';
import { createProject, deleteProject, projectDeletionImpact } from '../src/data/repositories/projects.ts';
import { changeItemStatus } from '../src/data/repositories/items.ts';
import { createRequirement, updateRequirement } from '../src/data/repositories/requirements.ts';
import { createWorkshop } from '../src/data/repositories/workshops.ts';
import { createSampleProject } from '../src/data/repositories/sample-project.ts';
import { getDocument, latestInSeries, listProjectDocuments, saveGeneratedDocument } from '../src/data/repositories/documents.ts';
import { listJournal } from '../src/data/repositories/journal.ts';
import { loadProjectData } from '../src/data/repositories/project-export.ts';
import { exportDocumentToFile, saveDeliverable } from '../src/export/service.ts';
import { MODELS, deliverableItems, generateDeliverable } from '../src/export/deliverables/models.ts';
import { CHAIN_KINDS, IGNORED_STATUSES } from '../src/domain/traceability.ts';
import {
  displayState, mentionLine, modelOfSeries, originLabel, parseOptions, parseSnapshot, seriesKey, serializeOptions, serializeSnapshot, versionedTitle, withMention,
} from '../src/domain/documents.ts';
import { journalLine } from '../src/modules/journal/logic.ts';

const NOW = new Date(2026, 10, 27, 15, 0, 0);
const VERSION = '0.15.0';
const OPT = { includeArchived: false };

// ------------------------------------------------------------------ migration 8

test('migration 8 : six colonnes et un index, documents importés intacts, sauvegarde pre-migration au schéma 7, 24 tables (F5-D02)', async () => {
  assert.ok(SCHEMA_VERSION >= 8, 'la migration 8 reste livrée ; F8 en ajoute une neuvième');
  assert.equal(migrations[7].name, 'documents_workflow');
  const t = emptyDb();
  await migrate(migrations.slice(0, 7), { backup: t.driver.backup });
  t.raw.exec("INSERT INTO projects (id, kind, name, created_at, updated_at) VALUES (1, 'project', 'Avant', 'x', 'x')");
  t.raw.exec(`INSERT INTO documents (id, project_id, kind, name, status, content, template_ref, created_at, updated_at, validated_at, archived_at)
    VALUES (1, 1, 'cr', 'CR importé', 'validated', 'Contenu éé', NULL, '2026-03-12T08:00:00.000Z', '2026-03-13T09:00:00.000Z', '2026-03-13T09:00:00.000Z', NULL),
           (2, 1, 'note', 'Note archivée', 'archived', '', 'tpl-1', '2026-03-01T08:00:00.000Z', '2026-03-02T08:00:00.000Z', NULL, '2026-03-02T08:00:00.000Z')`);
  const old = t.raw.prepare('SELECT id, project_id, previous_project_id, kind, name, status, content, template_ref, created_at, updated_at, validated_at, archived_at FROM documents ORDER BY id').all();
  const tablesBefore = (t.raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get() as { n: number }).n;

  // Le test s'arrête au schéma 8 : la migration 9 (F8) a son propre test.
  const report = await migrate(migrations.slice(0, 8), { backup: t.driver.backup });
  assert.deepEqual(report.applied, [8]);
  assert.equal(await getSchemaVersion(), 8);
  assert.equal(t.backups.filter((b) => b.kind === 'pre-migration').length, 1);
  assert.equal((t.raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get() as { n: number }).n, tablesBefore, 'aucune table ajoutée');

  const now = t.raw.prepare('SELECT id, project_id, previous_project_id, kind, name, status, content, template_ref, created_at, updated_at, validated_at, archived_at FROM documents ORDER BY id').all();
  assert.deepEqual(now, old, 'toutes les valeurs d\'origine sont identiques');
  const added = t.raw.prepare('SELECT series_key, version, replaces_id, options_json, items_snapshot, validation_comment FROM documents ORDER BY id').all();
  for (const row of added) assert.deepEqual({ ...row }, { series_key: null, version: 1, replaces_id: null, options_json: null, items_snapshot: null, validation_comment: null }, 'valeurs par défaut');

  const copy = (await import('node:sqlite')).DatabaseSync;
  const backup = new copy(t.backups[t.backups.length - 1].file, { readOnly: true });
  const cols = (backup.prepare("SELECT name FROM pragma_table_info('documents')").all() as Array<{ name: string }>).map((c) => c.name);
  assert.ok(!cols.includes('series_key'), 'la sauvegarde garde le schéma 7');
  backup.close();

  const fk = t.raw.prepare("SELECT \"table\" AS t, \"from\" AS f, on_delete AS d FROM pragma_foreign_key_list('documents') WHERE \"from\" = 'replaces_id'").all() as Array<{ t: string; f: string; d: string }>;
  assert.deepEqual(fk.map((r) => ({ ...r })), [{ t: 'documents', f: 'replaces_id', d: 'SET NULL' }]);
  t.close();
});

test('migration 8 : l\'index unique refuse deux versions identiques d\'une série, mais pas des documents sans série (F5-D02, F5-D03)', async () => {
  const t = await migratedDb();
  try {
    const p = await createProject('P');
    const ins = (series: string | null, version: number) =>
      t.raw.exec(`INSERT INTO documents (project_id, kind, name, status, content, created_at, updated_at, series_key, version) VALUES (${p}, 'k', 'n', 'draft', '', 'x', 'x', ${series === null ? 'NULL' : `'${series}'`}, ${version})`);
    ins('requirements', 1);
    assert.throws(() => ins('requirements', 1), /UNIQUE/);
    ins('requirements', 2);
    ins('risks', 1);
    ins(null, 1);
    ins(null, 1);
    assert.equal(Number((t.raw.prepare('SELECT count(*) AS n FROM documents').get() as { n: number }).n), 5, 'les documents importés (sans série) ne sont pas concernés');
  } finally {
    t.close();
  }
});

test('migration 8 : le jeu de test couvre les nouvelles colonnes (les tests de sauvegarde en vérifient alors la restauration)', async () => {
  const t = await migratedDb();
  seedAllTables(t.raw);
  const row = t.raw.prepare('SELECT series_key, version, options_json, items_snapshot, validation_comment FROM documents WHERE id = 1').get() as Record<string, unknown>;
  assert.equal(row.series_key, 'requirements');
  assert.ok(row.items_snapshot !== null && row.validation_comment !== null && row.options_json !== null);
  t.close();
});

// ------------------------------------------------------------------ domaine pur

test('domaine : clé de série, modèle de la série, état affiché, origine (F5-D03, F5-D04)', () => {
  assert.equal(seriesKey('requirements', null), 'requirements');
  assert.equal(seriesKey('requirements', 12), 'requirements', 'l\'atelier ne compte que pour le compte rendu');
  assert.equal(seriesKey('workshop-report', 12), 'workshop-report:12');
  assert.throws(() => seriesKey('workshop-report', null), /exige un atelier/);
  assert.throws(() => seriesKey('workshop-report', 0), /exige un atelier/);
  assert.equal(modelOfSeries('workshop-report:12'), 'workshop-report');
  assert.equal(modelOfSeries('risks'), 'risks');
  assert.equal(displayState('draft', null), 'Brouillon');
  assert.equal(displayState('validated', null), 'Validé');
  assert.equal(displayState('archived', null), 'Archivé');
  assert.equal(displayState('draft', 7), 'Remplacé', 'être désigné par une version suivante suffit');
  assert.equal(displayState('inconnu', null), 'inconnu');
  assert.equal(originLabel(true), 'Généré');
  assert.equal(originLabel(false), 'Importé V1');
});

test('domaine : liste figée (tri, aller-retour, texte illisible ou de forme inattendue = null) et options', () => {
  const items = [{ code: 'EX-010', title: 'Dix', status: 'draft' }, { code: 'EX-002', title: 'Deux', status: 'validated' }, { code: 'BES-001', title: 'Un', status: 'draft' }];
  const text = serializeSnapshot(items);
  assert.deepEqual(parseSnapshot(text)?.map((i) => i.code), ['BES-001', 'EX-002', 'EX-010']);
  assert.equal(serializeSnapshot([...items].reverse()), text, 'même liste, même texte, quel que soit l\'ordre reçu');
  assert.equal(parseSnapshot(null), null);
  assert.equal(parseSnapshot(''), null);
  assert.equal(parseSnapshot('{pas du json'), null);
  assert.equal(parseSnapshot('{"a":1}'), null);
  assert.equal(parseSnapshot('[1]'), null);
  assert.equal(parseSnapshot('[{"code":"A","title":2,"status":"x"}]'), null);
  assert.deepEqual(parseSnapshot('[]'), []);
  assert.deepEqual(parseOptions(serializeOptions({ includeArchived: true, workshopId: 4 })), { includeArchived: true, workshopId: 4 });
  assert.deepEqual(parseOptions(serializeOptions({ includeArchived: false, workshopId: null })), { includeArchived: false, workshopId: null });
  assert.equal(parseOptions('n\'importe quoi'), null);
  assert.equal(parseOptions(null), null);
  assert.equal(parseOptions('{"includeArchived":"oui"}'), null);
});

test('domaine : mention du statut sous le titre (F5-D08), le texte d\'origine n\'est pas modifié', () => {
  assert.equal(mentionLine(2, 'draft'), '**Document :** version 2, brouillon');
  assert.equal(mentionLine(1, 'draft', 2), '**Document :** version 1, brouillon, remplacée par la version 2');
  assert.equal(mentionLine(3, 'validated'), '**Document :** version 3, validé');
  const md = '# Titre\n\n**Projet :** P\n\nCorps\n';
  const out = withMention(md, mentionLine(2, 'draft'));
  assert.equal(out, '# Titre\n\n**Document :** version 2, brouillon\n\n**Projet :** P\n\nCorps\n');
  assert.equal(withMention('# Seul', 'M'), '# Seul\n\nM\n');
  assert.equal(withMention('Sans titre\n', 'M'), 'M\n\nSans titre\n', 'sans titre « # », la mention passe en tête');
  assert.equal(withMention('# T\n\n\n\nA', 'M'), '# T\n\nM\n\nA', 'les lignes vides en tête du reste ne s\'accumulent pas');
  assert.equal(versionedTitle('Registre', 3), 'Registre v3');
});

// ------------------------------------------------------------------ enregistrement, versions, contenu identique

async function projectWithRequirement(): Promise<{ projectId: number; reqId: number }> {
  const projectId = await createProject('Projet F5');
  const r = await createRequirement({ projectId, title: 'Exporter en Word', priority: 'must', criteria: 'Critère' });
  await createRequirement({ projectId, title: 'Autre exigence' });
  return { projectId, reqId: r.id };
}

test('enregistrer : version 1 en brouillon, champs du document, une ligne de journal « created » avec « v1 » (F5-D06)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const before = snapshot(t.raw);
    const r = await saveDeliverable(projectId, 'requirements', OPT);
    assert.equal(r.outcome, 'created');
    assert.equal(r.outcome === 'created' && r.version, 1);
    assert.equal(r.outcome === 'created' && r.replacedVersion, null);
    const d = (await getDocument(r.id))!;
    assert.deepEqual([d.kind, d.status, d.series_key, d.version, d.replaces_id, d.template_ref, d.project_id], ['generated', 'draft', 'requirements', 1, null, 'requirements', projectId]);
    assert.equal(d.name, `Registre des exigences Projet F5`);
    assert.deepEqual(parseOptions(d.options_json), { includeArchived: false, workshopId: null });
    assert.deepEqual(parseSnapshot(d.items_snapshot)?.map((i) => i.code), ['EX-001', 'EX-002']);
    assert.equal(d.content, generateDeliverable('requirements', (await loadProjectData(projectId))!, { includeArchived: false }).markdown);
    assert.equal(d.replaced_by_id, null);
    const log = await query<{ object_type: string; action: string; project_id: number; detail: string; object_id: number }>("SELECT object_type, action, project_id, detail, object_id FROM activity_log WHERE object_type = 'document'");
    assert.deepEqual(log.map((l) => ({ ...l })), [{ object_type: 'document', action: 'created', project_id: projectId, detail: 'v1', object_id: r.id }]);
    assert.equal(snapshot(t.raw).documents.count, before.documents.count + 1);
  } finally {
    t.close();
  }
});

test('contenu identique : aucune écriture, message vers la version existante ; contenu modifié : version 2 qui remplace la 1 (F5-D04, F5-D05)', async () => {
  const t = await migratedDb();
  try {
    const { projectId, reqId } = await projectWithRequirement();
    const v1 = await saveDeliverable(projectId, 'requirements', OPT);
    const afterV1 = snapshot(t.raw);
    const same = await saveDeliverable(projectId, 'requirements', OPT);
    assert.equal(same.outcome, 'identical');
    assert.equal(same.id, v1.id);
    assert.equal(same.outcome === 'identical' && same.version, 1);
    assert.deepEqual(snapshot(t.raw), afterV1, 'rien n\'a été écrit, pas même au journal');

    const v1Row = JSON.stringify(await getDocument(v1.id));
    await updateRequirement(reqId, { title: 'Exporter en Word et en PDF' });
    const v2 = await saveDeliverable(projectId, 'requirements', OPT);
    assert.equal(v2.outcome, 'created');
    assert.equal(v2.outcome === 'created' && v2.version, 2);
    assert.equal(v2.outcome === 'created' && v2.replacedVersion, 1);
    const d2 = (await getDocument(v2.id))!;
    assert.equal(d2.replaces_id, v1.id);
    assert.equal(d2.replaces_version, 1);
    assert.equal(d2.status, 'draft');
    const d1 = (await getDocument(v1.id))!;
    assert.equal(d1.replaced_by_id, v2.id);
    assert.equal(d1.replaced_by_version, 2);
    assert.equal(displayState(d1.status, d1.replaced_by_id), 'Remplacé');
    // La version 1 n'a pas bougé d'un octet : seuls les champs calculés (lien vers la suite) diffèrent.
    const strip = (d: unknown): unknown => { const { replaced_by_id, replaced_by_version, ...rest } = d as Record<string, unknown>; void replaced_by_id; void replaced_by_version; return rest; };
    assert.deepEqual(strip(d1), strip(JSON.parse(v1Row)), 'le document remplacé n\'est jamais modifié');
    assert.equal(d1.content.includes('Exporter en Word et en PDF'), false);
    assert.equal(d2.content.includes('Exporter en Word et en PDF'), true);

    const again = await saveDeliverable(projectId, 'requirements', OPT);
    assert.equal(again.outcome, 'identical', 'identique à la dernière version (la 2)');
    assert.equal(again.id, v2.id);

    // Le contenu de la version 1 revient : la comparaison ne porte que sur la DERNIÈRE version, donc c'est une version 3.
    await updateRequirement(reqId, { title: 'Exporter en Word' });
    const v3 = await saveDeliverable(projectId, 'requirements', OPT);
    assert.equal(v3.outcome, 'created');
    assert.equal(v3.outcome === 'created' && v3.version, 3);
    assert.equal((await getDocument(v3.id))!.content, d1.content, 'même texte que la version 1, mais version 3 : seule la dernière version est comparée');
    const list = await listProjectDocuments(projectId);
    assert.deepEqual(list.map((d) => [d.version, d.replaced_by_version]).sort(), [[1, 2], [2, 3], [3, null]]);
  } finally {
    t.close();
  }
});

test('contenu identique, options différentes sans effet sur le texte : toujours identique (F5-D05, décision de David : Markdown uniquement)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const a = await saveDeliverable(projectId, 'requirements', { includeArchived: false });
    const b = await saveDeliverable(projectId, 'requirements', { includeArchived: true });
    assert.equal(b.outcome, 'created', 'le périmètre figure dans le texte (« Périmètre : … ») : le contenu diffère');
    const d = (await getDocument(b.id))!;
    assert.deepEqual(parseOptions(d.options_json), { includeArchived: true, workshopId: null });
    assert.ok(a.id !== b.id);
    // La matrice ignore l'option : deux enregistrements avec des options différentes donnent le même texte → identique.
    const m1 = await saveDeliverable(projectId, 'traceability', { includeArchived: false });
    const m2 = await saveDeliverable(projectId, 'traceability', { includeArchived: true });
    assert.equal(m1.outcome, 'created');
    assert.equal(m2.outcome, 'identical');
    assert.equal(m2.id, m1.id);
  } finally {
    t.close();
  }
});

test('un compte rendu d\'atelier a une série par atelier ; les séries de modèles différents sont indépendantes (F5-D03)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const w1 = await createWorkshop({ projectId, title: 'Premier', heldOn: '2026-11-20' });
    const w2 = await createWorkshop({ projectId, title: 'Second' });
    const a = await saveDeliverable(projectId, 'workshop-report', { includeArchived: false, workshopId: w1.id });
    const b = await saveDeliverable(projectId, 'workshop-report', { includeArchived: false, workshopId: w2.id });
    const a2 = await saveDeliverable(projectId, 'workshop-report', { includeArchived: false, workshopId: w1.id });
    const r = await saveDeliverable(projectId, 'requirements', OPT);
    assert.equal(a.outcome === 'created' && a.version, 1);
    assert.equal(b.outcome === 'created' && b.version, 1, 'second atelier : sa propre série, version 1');
    assert.equal(a2.outcome, 'identical');
    assert.equal(r.outcome === 'created' && r.version, 1);
    const keys = (await listProjectDocuments(projectId)).map((d) => d.series_key).sort();
    assert.deepEqual(keys, ['requirements', `workshop-report:${w1.id}`, `workshop-report:${w2.id}`].sort());
    assert.deepEqual(parseOptions((await getDocument(a.id))!.options_json), { includeArchived: false, workshopId: w1.id });
    assert.equal(parseSnapshot((await getDocument(a.id))!.items_snapshot)![0].code, 'ATL-001', 'l\'atelier figure dans sa liste figée');
    // Une série par projet : le même modèle dans un autre projet repart à la version 1.
    const other = await createProject('Autre');
    const o = await saveDeliverable(other, 'requirements', OPT);
    assert.equal(o.outcome === 'created' && o.version, 1);
    assert.equal((await latestInSeries(other, 'requirements'))!.id, o.id);
    assert.equal((await listProjectDocuments(projectId)).some((d) => d.id === o.id), false, 'chaque projet ne voit que ses documents');
  } finally {
    t.close();
  }
});

test('erreurs : modèle inconnu, projet inconnu ou dossier, atelier manquant, nom vide (rien n\'est écrit)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const folder = await createProject('Dossier', 'folder');
    const before = snapshot(t.raw);
    await assert.rejects(saveDeliverable(projectId, 'inconnu', OPT), /Modèle de livrable inconnu/);
    await assert.rejects(saveDeliverable(99999, 'requirements', OPT), /Projet introuvable/);
    await assert.rejects(saveDeliverable(projectId, 'workshop-report', OPT), /Choisissez un atelier/);
    await assert.rejects(saveDeliverable(projectId, 'workshop-report', { includeArchived: false, workshopId: 99999 }), /n'existe plus/);
    await assert.rejects(saveDeliverable(folder, 'requirements', OPT), /pas dans un dossier/);
    await assert.rejects(saveGeneratedDocument({ projectId, seriesKey: 's', modelId: 'm', name: '  ', content: 'x', optionsJson: '{}', itemsSnapshot: '[]' }), /a un nom/);
    await assert.rejects(saveGeneratedDocument({ projectId, seriesKey: '', modelId: 'm', name: 'n', content: 'x', optionsJson: '{}', itemsSnapshot: '[]' }), /série et un modèle/);
    await assert.rejects(saveGeneratedDocument({ projectId: 99999, seriesKey: 's', modelId: 'm', name: 'n', content: 'x', optionsJson: '{}', itemsSnapshot: '[]' }), /n'existe pas/);
    assert.deepEqual(snapshot(t.raw), before);
  } finally {
    t.close();
  }
});

test('lire ne modifie rien : liste, détail, dernière version (D96)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const r = await saveDeliverable(projectId, 'requirements', OPT);
    const before = snapshot(t.raw);
    await listProjectDocuments(projectId);
    await getDocument(r.id);
    await latestInSeries(projectId, 'requirements');
    assert.equal(await getDocument(99999), null);
    assert.equal(await latestInSeries(projectId, 'risks'), null);
    assert.deepEqual(snapshot(t.raw), before);
  } finally {
    t.close();
  }
});

// ------------------------------------------------------------------ liste figée

test('liste figée : chaque code figé figure dans le texte du document, et chaque ligne de registre est figée (F5-D07)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await createSampleProject();
    const data = (await loadProjectData(projectId))!;
    const workshop = data.items.find((i) => i.kind === 'workshop')!;
    for (const m of MODELS) {
      for (const includeArchived of [false, true]) {
        const opts = { includeArchived, workshopId: m.needsWorkshop ? workshop.id : null };
        const items = deliverableItems(m.id, data, opts);
        const md = generateDeliverable(m.id, data, opts).markdown;
        if (m.id === 'traceability') {
          assert.ok(items.every((i) => !IGNORED_STATUSES.includes(i.status)), 'la matrice ne fige que des éléments actifs');
          const kinds = new Set(items.map((i) => data.items.find((x) => x.code === i.code)!.kind));
          for (const k of kinds) assert.ok(CHAIN_KINDS.includes(k), `type ${k} dans la chaîne`);
          assert.equal(items.length, data.items.filter((i) => CHAIN_KINDS.includes(i.kind) && !IGNORED_STATUSES.includes(i.status)).length);
          continue;
        }
        for (const i of items) assert.ok(md.includes(i.code), `${m.id} : ${i.code} est dans le texte`);
        if (m.id !== 'workshop-report') {
          const rows = [...md.matchAll(/^\| ([A-Z]+-\d{3}) \|/gm)].map((x) => x[1]);
          assert.deepEqual([...new Set(rows)].sort(), items.map((i) => i.code).sort(), `${m.id} : lignes du tableau = éléments figés`);
        }
      }
    }
  } finally {
    t.close();
  }
});

test('liste figée : registre sans les archivés, avec les archivés ; titre et statut figés à la génération', async () => {
  const t = await migratedDb();
  try {
    const { projectId, reqId } = await projectWithRequirement();
    const second = (await query<{ id: number }>("SELECT id FROM items WHERE code = 'EX-002'"))[0].id;
    await changeItemStatus(second, 'archived');
    const data = (await loadProjectData(projectId))!;
    assert.deepEqual(deliverableItems('requirements', data, { includeArchived: false }).map((i) => i.code), ['EX-001']);
    assert.deepEqual(deliverableItems('requirements', data, { includeArchived: true }).map((i) => [i.code, i.status]), [['EX-001', 'draft'], ['EX-002', 'archived']]);
    const r = await saveDeliverable(projectId, 'requirements', OPT);
    await updateRequirement(reqId, { title: 'Titre changé après' });
    await changeItemStatus(reqId, 'validated');
    const d = (await getDocument(r.id))!;
    assert.deepEqual(parseSnapshot(d.items_snapshot), [{ code: 'EX-001', title: 'Exporter en Word', status: 'draft' }], 'la liste figée ne suit pas les données courantes');
    assert.throws(() => deliverableItems('workshop-report', data, { includeArchived: false, workshopId: null }), /Choisissez un atelier/);
    assert.throws(() => deliverableItems('workshop-report', data, { includeArchived: false, workshopId: 99999 }), /n'existe plus/);
  } finally {
    t.close();
  }
});

// ------------------------------------------------------------------ export depuis l'instantané

test('export : part du contenu figé, jamais des données courantes (vérifié après modification d\'une exigence) (F5-D09)', async () => {
  const t = await migratedDb();
  try {
    const { projectId, reqId } = await projectWithRequirement();
    const r = await saveDeliverable(projectId, 'requirements', OPT);
    await updateRequirement(reqId, { title: 'TITRE MODIFIÉ APRÈS' });
    const out = await exportDocumentToFile(r.id, 'markdown', { version: VERSION, now: NOW });
    const text = fs.readFileSync(out!.path, 'utf8');
    assert.ok(text.includes('Exporter en Word'), 'l\'ancien titre figure dans le fichier');
    assert.ok(!text.includes('TITRE MODIFIÉ APRÈS'), 'le nouveau titre n\'y figure pas');
    // Le document stocké n'a pas été touché par l'export.
    assert.equal((await getDocument(r.id))!.content.includes('TITRE MODIFIÉ APRÈS'), false);
    // Une nouvelle version, elle, reprend les données courantes.
    const v2 = await saveDeliverable(projectId, 'requirements', OPT);
    const text2 = fs.readFileSync((await exportDocumentToFile(v2.id, 'html', { version: VERSION, now: NOW }))!.path, 'utf8');
    assert.ok(text2.includes('TITRE MODIFIÉ APRÈS'));
  } finally {
    t.close();
  }
});

test('export : mention version et statut sous le titre, version dans le nom du fichier, version remplacée signalée, signature intacte (F5-D08)', async () => {
  const t = await migratedDb();
  try {
    const { projectId, reqId } = await projectWithRequirement();
    const v1 = await saveDeliverable(projectId, 'requirements', OPT);
    const before = snapshot(t.raw);
    const f1 = await exportDocumentToFile(v1.id, 'markdown', { version: VERSION, now: NOW });
    assert.ok(f1!.name.includes(' v1-20261127-150000'), f1!.name);
    const t1 = fs.readFileSync(f1!.path, 'utf8');
    assert.ok(t1.indexOf('# Registre des exigences') < t1.indexOf('**Document :** version 1, brouillon') && t1.indexOf('**Document :** version 1, brouillon') < t1.indexOf('**Projet :**'), 'la mention est sous le titre');
    for (const line of ['BA-Mentor Portable Ultimate Edition', 'Développé par David Giancatarina', `Version : ${VERSION}`, 'Date de génération : 27/11/2026 15:00']) assert.ok(t1.includes(line), line);
    assert.deepEqual(snapshot(t.raw), before, 'un export n\'écrit rien (D96)');

    await updateRequirement(reqId, { title: 'Nouvelle formulation' });
    const v2 = await saveDeliverable(projectId, 'requirements', OPT);
    const old = fs.readFileSync((await exportDocumentToFile(v1.id, 'markdown', { version: VERSION, now: NOW, askWhere: false }))!.path, 'utf8');
    assert.ok(old.includes('**Document :** version 1, brouillon, remplacée par la version 2'), 'une ancienne version ne passe pas pour la version courante');
    const cur = fs.readFileSync((await exportDocumentToFile(v2.id, 'markdown', { version: VERSION, now: NOW }))!.path, 'utf8');
    assert.ok(cur.includes('**Document :** version 2, brouillon\n') && !cur.includes('remplacée par'));
    const html = fs.readFileSync((await exportDocumentToFile(v2.id, 'html', { version: VERSION, now: NOW }))!.path, 'utf8');
    assert.ok(html.includes('Document :</strong> version 2, brouillon'));
    assert.equal(await exportDocumentToFile(v2.id, 'docx', { version: VERSION, now: NOW, askWhere: true }), null, '« Enregistrer sous » annulé : aucun fichier');
    await assert.rejects(exportDocumentToFile(v2.id, 'markdown', { version: '—', now: NOW }), /version de l'application est inconnue/);
    await assert.rejects(exportDocumentToFile(99999, 'markdown', { version: VERSION }), /introuvable/);
  } finally {
    t.close();
  }
});

test('export : un document importé de la V1 s\'exporte tel quel, sans mention ni version dans le nom (F5-D08)', async () => {
  const t = await migratedDb();
  try {
    const p = await createProject('P');
    t.raw.exec(`INSERT INTO documents (id, project_id, kind, name, status, content, created_at, updated_at) VALUES (50, ${p}, 'cr', 'CR importé', 'validated', '# CR\\n\\nTexte\\n', 'x', 'x')`);
    const out = await exportDocumentToFile(50, 'markdown', { version: VERSION, now: NOW });
    assert.ok(out!.name.startsWith('CR importé-2026'), out!.name);
    const text = fs.readFileSync(out!.path, 'utf8');
    assert.ok(!text.includes('Document :'), 'aucune mention pour un document sans série');
    assert.ok(text.includes('# CR') && text.includes('Texte'));
    const [d] = await listProjectDocuments(p);
    assert.deepEqual([d.series_key, d.version, d.replaced_by_id, displayState(d.status, d.replaced_by_id)], [null, 1, null, 'Validé']);
  } finally {
    t.close();
  }
});

test('export : un titre très long garde sa version dans le nom du fichier', async () => {
  const t = await migratedDb();
  try {
    const projectId = await createProject('P'.repeat(150));
    await createRequirement({ projectId, title: 'x' });
    const r = await saveDeliverable(projectId, 'requirements', OPT);
    const out = await exportDocumentToFile(r.id, 'markdown', { version: VERSION, now: NOW });
    assert.ok(/ v1-2026\d{4}-\d{6}\.md$/.test(out!.name), out!.name);
  } finally {
    t.close();
  }
});

// ------------------------------------------------------------------ journal, suppression de projet

test('journal : un document créé s\'affiche avec son nom et « Version N » ; un enregistrement identique et un export ne laissent rien (F5-D12)', async () => {
  const t = await migratedDb();
  try {
    const { projectId, reqId } = await projectWithRequirement();
    const v1 = await saveDeliverable(projectId, 'requirements', OPT);
    await saveDeliverable(projectId, 'requirements', OPT);
    await exportDocumentToFile(v1.id, 'markdown', { version: VERSION, now: NOW });
    await updateRequirement(reqId, { title: 'Autre titre' });
    await saveDeliverable(projectId, 'requirements', OPT);
    const rows = (await listJournal(projectId, { group: 'document', action: 'all' }, 1)).map(journalLine);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => [r.object, r.action, r.detail]), [['Document', 'Créé', 'Version 2'], ['Document', 'Créé', 'Version 1']]);
    assert.ok(rows.every((r) => r.label.startsWith('Registre des exigences')));
  } finally {
    t.close();
  }
});

test('suppression d\'un projet : ses documents et leurs versions liées sont comptés puis supprimés, avec une ligne de journal chacun', async () => {
  const t = await migratedDb();
  try {
    const { projectId, reqId } = await projectWithRequirement();
    await saveDeliverable(projectId, 'requirements', OPT);
    await updateRequirement(reqId, { title: 'v2' });
    await saveDeliverable(projectId, 'requirements', OPT);
    await updateRequirement(reqId, { title: 'v3' });
    await saveDeliverable(projectId, 'requirements', OPT);
    const other = await createProject('Autre');
    await createRequirement({ projectId: other, title: 'ailleurs' });
    await saveDeliverable(other, 'requirements', OPT);
    assert.equal((await projectDeletionImpact(projectId)).documents, 3);
    await deleteProject(projectId);
    assert.equal(Number((await query<{ n: number }>('SELECT count(*) AS n FROM documents WHERE project_id = ?', [projectId]))[0].n), 0);
    assert.equal(Number((await query<{ n: number }>('SELECT count(*) AS n FROM documents'))[0].n), 1, 'les documents de l\'autre projet restent');
    const del = await query<{ n: number }>("SELECT count(*) AS n FROM activity_log WHERE object_type = 'document' AND action = 'deleted'");
    assert.equal(Number(del[0].n), 3);
  } finally {
    t.close();
  }
});

// ------------------------------------------------------------------ branchement

test('branchement : Documents lit sans écrire, Livrables passe par le service, plus d\'export direct ni de carte d\'export (F5-D01, F5-D09, F5-D10)', () => {
  const read = (p: string) => fs.readFileSync(p, 'utf8');
  for (const f of ['DocumentsScreen.tsx', 'DocumentsView.tsx', 'logic.ts']) assert.ok(!/mutate|INSERT|UPDATE|DELETE/.test(read(`src/modules/documents/${f}`)), `${f} n'écrit pas`);
  const screen = read('src/modules/documents/DocumentsScreen.tsx');
  assert.match(screen, /exportDocumentToFile\(selectedId, format,/);
  assert.match(screen, /onOpenHandled\?\.\(\)/);
  assert.match(screen, /listProjectDocuments\(projectId\)/);
  const app = read('src/app/App.tsx');
  assert.match(app, /screen === 'documents'[\s\S]*?<DocumentsScreen[\s\S]*?openId=\{documentRequest\}/);
  assert.match(app, /onOpenDocument=\{openDocument\}/);
  assert.equal((app.match(/setDocumentRequest\(null\)/g) ?? []).length, 3, 'effacée par navigate(), par openOrphans() et par clearDocumentRequest()');
  assert.ok(!app.includes('ExportPanel'));
  assert.equal(fs.existsSync('src/app/ExportPanel.tsx'), false);
  assert.ok(!read('src/export/service.ts').includes('exportGeneratedToFile'));
  assert.ok(!/exportGeneratedToFile|listDocuments/.test(read('src/modules/deliverables/DeliverablesScreen.tsx')));
  const nav = read('src/app/navigation.ts');
  assert.match(nav, /\{ id: 'deliverables', label: 'Livrables' \}, \{ id: 'documents', label: 'Documents' \}/);
  assert.match(read('src/data/migrations/index.ts'), /m0008/);
});
