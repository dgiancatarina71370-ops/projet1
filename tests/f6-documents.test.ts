// Lot F6 : valider, archiver, désarchiver et comparer un document (décisions F6-D01 à F6-D12). Base SQLite réelle (node:sqlite).
// Le rendu et la logique des écrans sont dans ui-f6.test.ts ; les clics, deux fenêtres ouvertes et les fichiers ouverts dans Word
// sont à la recette sur clé (TESTS-F6.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { migratedDb } from './helpers/setup.ts';
import { snapshot } from './helpers/seed.ts';
import { query } from '../src/data/db.ts';
import { createProject, deleteProject } from '../src/data/repositories/projects.ts';
import { changeItemStatus, deleteItem } from '../src/data/repositories/items.ts';
import { createRequirement, updateRequirement } from '../src/data/repositories/requirements.ts';
import { createSampleProject } from '../src/data/repositories/sample-project.ts';
import { DocumentStateError, archiveDocument, getDocument, listProjectDocuments, unarchiveDocument, validateDocument } from '../src/data/repositories/documents.ts';
import { listJournal } from '../src/data/repositories/journal.ts';
import { compareDocumentWithCurrent, exportDocumentToFile, saveDeliverable } from '../src/export/service.ts';
import {
  availableActions, compareCodes, compareSnapshots, hasDifferences, mentionLine, normalizeValidationComment, unarchiveTarget,
} from '../src/domain/documents.ts';
import { journalLine } from '../src/modules/journal/logic.ts';

const NOW = new Date(2026, 10, 27, 15, 0, 0);
const VERSION = '0.16.0';
const OPT = { includeArchived: false };

async function projectWithRequirement(): Promise<{ projectId: number; reqId: number }> {
  const projectId = await createProject('Projet F6');
  const r = await createRequirement({ projectId, title: 'Exporter en Word', priority: 'must', criteria: 'Critère' });
  await createRequirement({ projectId, title: 'Autre exigence' });
  return { projectId, reqId: r.id };
}

const savedId = async (projectId: number): Promise<number> => (await saveDeliverable(projectId, 'requirements', OPT)).id;
const docLog = (): Promise<Array<{ action: string; detail: string; object_id: number }>> =>
  query<{ action: string; detail: string; object_id: number }>("SELECT action, detail, object_id FROM activity_log WHERE object_type = 'document' AND action = 'status_changed' ORDER BY id").then((r) => r.map((x) => ({ ...x })));

// ------------------------------------------------------------------ domaine pur

test('domaine : gestes permis selon l\'état et l\'existence d\'une version suivante (F6-D01, D03, D04)', () => {
  assert.deepEqual(availableActions('draft', false), ['validate', 'archive']);
  assert.deepEqual(availableActions('validated', false), ['archive']);
  assert.deepEqual(availableActions('archived', false), ['unarchive']);
  for (const s of ['draft', 'validated', 'archived']) assert.deepEqual(availableActions(s, true), [], `un document remplacé (${s}) n'a aucun geste`);
  assert.deepEqual(availableActions('inconnu', false), []);
  assert.equal(unarchiveTarget('2026-11-27T10:00:00.000Z'), 'validated');
  assert.equal(unarchiveTarget(null), 'draft');
  assert.equal(unarchiveTarget(''), 'draft');
});

test('domaine : commentaire de validation — espaces retirés, vide = absent, plus de 500 caractères refusé (F6-D01)', () => {
  assert.equal(normalizeValidationComment(null), null);
  assert.equal(normalizeValidationComment('   '), null);
  assert.equal(normalizeValidationComment('  Relu en COPIL  '), 'Relu en COPIL');
  assert.equal(normalizeValidationComment('é'.repeat(500)), 'é'.repeat(500));
  assert.throws(() => normalizeValidationComment('é'.repeat(501)), /limité à 500 caractères/);
});

test('domaine : comparaison par code — ajoutés, retirés, statut modifié, titre modifié, un élément dans les deux groupes (F6-D06, D07)', () => {
  const frozen = [
    { code: 'EX-001', title: 'A', status: 'draft' },
    { code: 'EX-002', title: 'B', status: 'draft' },
    { code: 'EX-003', title: 'C', status: 'draft' },
    { code: 'EX-010', title: 'J', status: 'draft' },
    { code: 'EX-004', title: 'D', status: 'draft' },
  ];
  const current = [
    { code: 'EX-001', title: 'A', status: 'draft' },
    { code: 'EX-002', title: 'B', status: 'validated' },
    { code: 'EX-003', title: 'C bis', status: 'draft' },
    { code: 'EX-004', title: 'D 2', status: 'validated' },
    { code: 'EX-012', title: 'L', status: 'draft' },
    { code: 'EX-011', title: 'K', status: 'draft' },
  ];
  const c = compareSnapshots(frozen, current);
  assert.deepEqual(c.added.map((i) => i.code), ['EX-011', 'EX-012'], 'ajoutés, triés par numéro');
  assert.deepEqual(c.removed.map((i) => i.code), ['EX-010']);
  assert.deepEqual(c.statusChanged.map((i) => [i.code, i.from, i.to]), [['EX-002', 'draft', 'validated'], ['EX-004', 'draft', 'validated']]);
  assert.deepEqual(c.titleChanged.map((i) => [i.code, i.from, i.to]), [['EX-003', 'C', 'C bis'], ['EX-004', 'D', 'D 2']]);
  assert.equal(hasDifferences(c), true);
  const same = compareSnapshots(frozen, [...frozen].reverse());
  assert.equal(hasDifferences(same), false, 'même liste dans un autre ordre : aucun écart');
  assert.equal(hasDifferences(compareSnapshots([], [])), false);
  assert.ok(compareCodes('EX-002', 'EX-010') < 0 && compareCodes('BES-009', 'EX-001') < 0 && compareCodes('EX-001', 'EX-001') === 0);
  assert.ok(compareCodes('EX-999', 'EX-1000') < 0, 'ordre numérique : EX-1000 vient après EX-999');
});

test('domaine : mention d\'un document validé avec sa date, archivé sans date, remplacé (F6-D10)', () => {
  assert.equal(mentionLine(2, 'validated', null, '27/11/2026'), '**Document :** version 2, validé le 27/11/2026');
  assert.equal(mentionLine(2, 'validated'), '**Document :** version 2, validé', 'date inconnue : pas de « le »');
  assert.equal(mentionLine(2, 'archived', null, '27/11/2026'), '**Document :** version 2, archivé');
  assert.equal(mentionLine(2, 'draft', null, '27/11/2026'), '**Document :** version 2, brouillon');
  assert.equal(mentionLine(1, 'validated', 2, '27/11/2026'), '**Document :** version 1, validé le 27/11/2026, remplacée par la version 2');
});

// ------------------------------------------------------------------ valider

test('valider : un brouillon devient validé avec date et commentaire ; une ligne de journal « draft>validated » sans le commentaire (F6-D01, D09)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const id = await savedId(projectId);
    const contentBefore = (await getDocument(id))!;
    const logBefore = (await query<{ n: number }>('SELECT count(*) AS n FROM activity_log'))[0].n;
    await validateDocument(id, '  Relu en COPIL du 27/11  ');
    const d = (await getDocument(id))!;
    assert.equal(d.status, 'validated');
    assert.equal(d.validation_comment, 'Relu en COPIL du 27/11');
    assert.ok(d.validated_at !== null && Math.abs(Date.parse(d.validated_at) - Date.now()) < 60_000);
    assert.equal(d.archived_at, null);
    assert.deepEqual([d.content, d.options_json, d.items_snapshot, d.version, d.name], [contentBefore.content, contentBefore.options_json, contentBefore.items_snapshot, 1, contentBefore.name], 'le contenu figé ne bouge pas');
    assert.deepEqual(await docLog(), [{ action: 'status_changed', detail: 'draft>validated', object_id: id }]);
    assert.equal((await query<{ n: number }>('SELECT count(*) AS n FROM activity_log'))[0].n, logBefore + 1);
    assert.ok(!JSON.stringify(await query('SELECT * FROM activity_log')).includes('COPIL'), 'le commentaire n\'entre jamais au journal');
  } finally {
    t.close();
  }
});

test('valider : commentaire facultatif (NULL), trop long refusé sans rien écrire (F6-D01)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const id = await savedId(projectId);
    const before = snapshot(t.raw);
    await assert.rejects(validateDocument(id, 'x'.repeat(501)), /limité à 500 caractères/);
    assert.deepEqual(snapshot(t.raw), before);
    await validateDocument(id, '   ');
    assert.equal((await getDocument(id))!.validation_comment, null);
  } finally {
    t.close();
  }
});

test('valider : refusé pour un document déjà validé, archivé ou remplacé, introuvable ; rien n\'est écrit, pas de journal (F6-D02)', async () => {
  const t = await migratedDb();
  try {
    const { projectId, reqId } = await projectWithRequirement();
    const v1 = await savedId(projectId);
    await updateRequirement(reqId, { title: 'Autre titre' });
    const v2 = await savedId(projectId);
    const before = snapshot(t.raw);
    await assert.rejects(validateDocument(v1, null), DocumentStateError, 'v1 est remplacée');
    await assert.rejects(validateDocument(99999, null), /introuvable/);
    assert.deepEqual(snapshot(t.raw), before);

    await validateDocument(v2, 'ok');
    const afterValidation = snapshot(t.raw);
    await assert.rejects(validateDocument(v2, 'encore'), DocumentStateError, 'une validation ne se refait pas et ne se modifie pas');
    assert.equal((await getDocument(v2))!.validation_comment, 'ok');
    await archiveDocument(v2);
    await assert.rejects(validateDocument(v2, null), DocumentStateError, 'un archivé ne se valide pas');
    assert.notDeepEqual(snapshot(t.raw), afterValidation);
    assert.equal((await docLog()).length, 2, 'seuls la validation et l\'archivage ont écrit');
  } finally {
    t.close();
  }
});

test('valider : la garde en écriture refuse un état périmé (document remplacé ou changé entre la lecture et l\'écriture), sans journal (F6-D02)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const id = await savedId(projectId);
    // Un autre acteur valide entre-temps : le deuxième geste, fondé sur un affichage périmé, doit être refusé par l'UPDATE lui-même.
    t.raw.exec(`UPDATE documents SET status = 'validated', validated_at = 'x' WHERE id = ${id}`);
    const logs = (await query<{ n: number }>('SELECT count(*) AS n FROM activity_log'))[0].n;
    await assert.rejects(archiveDocument(id).then(() => validateDocument(id, null)), DocumentStateError);
    const after = (await getDocument(id))!;
    assert.equal(after.status, 'archived', 'l\'archivage de l\'état réellement validé a réussi, la validation suivante est refusée');
    assert.equal((await query<{ n: number }>('SELECT count(*) AS n FROM activity_log'))[0].n, logs + 1);
    // Une version suivante apparaît entre-temps : l'UPDATE gardé ne trouve rien.
    const p2 = await createProject('P2');
    await createRequirement({ projectId: p2, title: 'X' });
    const a = await savedId(p2);
    t.raw.exec(`INSERT INTO documents (project_id, kind, name, status, content, created_at, updated_at, series_key, version, replaces_id) VALUES (${p2}, 'generated', 'n', 'draft', 'autre', 'x', 'x', 'requirements', 2, ${a})`);
    const before = snapshot(t.raw);
    await assert.rejects(validateDocument(a, null), DocumentStateError);
    assert.deepEqual(snapshot(t.raw), before);
  } finally {
    t.close();
  }
});

test('valider et archiver lancés en même temps sur le même brouillon : un seul passe, l\'autre est refusé par la garde, une seule ligne de journal (F6-D02)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const id = await savedId(projectId);
    const [a, b] = await Promise.allSettled([validateDocument(id, null), archiveDocument(id)]);
    assert.deepEqual([a.status, b.status], ['fulfilled', 'rejected'], 'les deux ont lu « brouillon » : la deuxième écriture trouve un autre état');
    assert.ok(b.status === 'rejected' && b.reason instanceof DocumentStateError);
    assert.equal((await getDocument(id))!.status, 'validated');
    assert.deepEqual((await docLog()).map((l) => l.detail), ['draft>validated'], 'le geste refusé ne laisse pas de ligne de journal');
  } finally {
    t.close();
  }
});

// ------------------------------------------------------------------ archiver et désarchiver

test('archiver : brouillon et validé ; date d\'archivage, validation conservée, journal « draft>archived » / « validated>archived » (F6-D03)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const draft = await savedId(projectId);
    await archiveDocument(draft);
    const d = (await getDocument(draft))!;
    assert.deepEqual([d.status, d.validated_at], ['archived', null]);
    assert.ok(d.archived_at !== null);

    const p2 = await createProject('P2');
    await createRequirement({ projectId: p2, title: 'Y' });
    const val = await savedId(p2);
    await validateDocument(val, 'Validé tel quel');
    const validatedAt = (await getDocument(val))!.validated_at;
    await archiveDocument(val);
    const v = (await getDocument(val))!;
    assert.deepEqual([v.status, v.validated_at, v.validation_comment], ['archived', validatedAt, 'Validé tel quel'], 'la validation passée reste visible');
    assert.ok(v.archived_at !== null);
    assert.deepEqual((await docLog()).map((l) => l.detail), ['draft>archived', 'draft>validated', 'validated>archived']);
    await assert.rejects(archiveDocument(val), DocumentStateError, 'déjà archivé');
    await assert.rejects(archiveDocument(99999), /introuvable/);
  } finally {
    t.close();
  }
});

test('archiver : un document remplacé ne s\'archive pas ; l\'archivé reste consultable et exportable (F6-D03)', async () => {
  const t = await migratedDb();
  try {
    const { projectId, reqId } = await projectWithRequirement();
    const v1 = await savedId(projectId);
    await updateRequirement(reqId, { title: 'Titre v2' });
    const v2 = await savedId(projectId);
    await assert.rejects(archiveDocument(v1), DocumentStateError);
    assert.equal((await getDocument(v1))!.status, 'draft');
    await archiveDocument(v2);
    const out = await exportDocumentToFile(v2, 'markdown', { version: VERSION, now: NOW });
    const text = fs.readFileSync(out!.path, 'utf8');
    assert.ok(text.includes('**Document :** version 2, archivé\n'), text.slice(0, 300));
    assert.ok(text.includes('Titre v2'));
  } finally {
    t.close();
  }
});

test('désarchiver : retour en validé si le document l\'avait été, sinon en brouillon ; date d\'archivage vidée ; journal « archived>… » (F6-D04)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const a = await savedId(projectId);
    await archiveDocument(a);
    assert.equal(await unarchiveDocument(a), 'draft');
    const da = (await getDocument(a))!;
    assert.deepEqual([da.status, da.archived_at], ['draft', null]);

    const p2 = await createProject('P2');
    await createRequirement({ projectId: p2, title: 'Z' });
    const b = await savedId(p2);
    await validateDocument(b, 'ok');
    await archiveDocument(b);
    assert.equal(await unarchiveDocument(b), 'validated');
    const db = (await getDocument(b))!;
    assert.deepEqual([db.status, db.archived_at, db.validation_comment], ['validated', null, 'ok']);
    assert.deepEqual((await docLog()).map((l) => l.detail), ['draft>archived', 'archived>draft', 'draft>validated', 'validated>archived', 'archived>validated']);
    await assert.rejects(unarchiveDocument(b), DocumentStateError, 'seul un archivé se désarchive');
    await assert.rejects(unarchiveDocument(99999), /introuvable/);
  } finally {
    t.close();
  }
});

test('désarchiver un import V1 archivé : validé s\'il porte une date de validation, brouillon sinon ; un import peut être validé et archivé (F6-D04)', async () => {
  const t = await migratedDb();
  try {
    const p = await createProject('Import');
    t.raw.exec(`INSERT INTO documents (id, project_id, kind, name, status, content, created_at, updated_at, validated_at, archived_at) VALUES
      (60, ${p}, 'cr', 'Validé puis archivé', 'archived', '# A', 'x', 'x', '2026-03-13T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
      (61, ${p}, 'cr', 'Archivé sans validation', 'archived', '# B', 'x', 'x', NULL, '2026-04-01T09:00:00.000Z'),
      (62, ${p}, 'cr', 'Brouillon', 'draft', '# C', 'x', 'x', NULL, NULL)`);
    assert.equal(await unarchiveDocument(60), 'validated');
    assert.equal(await unarchiveDocument(61), 'draft');
    await validateDocument(62, 'Import validé');
    await archiveDocument(62);
    const list = await listProjectDocuments(p);
    assert.deepEqual(list.map((d) => [d.id, d.status]).sort(), [[60, 'validated'], [61, 'draft'], [62, 'archived']]);
  } finally {
    t.close();
  }
});

// ------------------------------------------------------------------ régénération (F6-D02, D05)

test('régénérer : après validation, contenu identique = rien ; contenu modifié = version 2 en brouillon, la v1 validée reste intacte et « Remplacée » (F6-D02, D05)', async () => {
  const t = await migratedDb();
  try {
    const { projectId, reqId } = await projectWithRequirement();
    const v1 = await savedId(projectId);
    await validateDocument(v1, 'Validé');
    const before = snapshot(t.raw);
    const same = await saveDeliverable(projectId, 'requirements', OPT);
    assert.deepEqual([same.outcome, same.id], ['identical', v1]);
    assert.equal(same.outcome === 'identical' && same.status, 'validated');
    assert.deepEqual(snapshot(t.raw), before);

    const v1Row = JSON.stringify(await getDocument(v1));
    await updateRequirement(reqId, { title: 'Correction après validation' });
    const v2 = await saveDeliverable(projectId, 'requirements', OPT);
    assert.equal(v2.outcome, 'created');
    assert.equal((await getDocument(v2.id))!.status, 'draft');
    const d1 = (await getDocument(v1))!;
    assert.equal(d1.status, 'validated', 'la validation de la v1 est conservée en base');
    assert.equal(d1.replaced_by_id, v2.id);
    const strip = (d: unknown): unknown => { const { replaced_by_id, replaced_by_version, ...rest } = d as Record<string, unknown>; void replaced_by_id; void replaced_by_version; return rest; };
    assert.deepEqual(strip(d1), strip(JSON.parse(v1Row)), 'la version validée n\'a pas bougé');
    await assert.rejects(validateDocument(v1, null), DocumentStateError);
  } finally {
    t.close();
  }
});

test('régénérer : dernière version archivée — contenu identique = rien d\'écrit et état « archived » signalé ; contenu modifié = nouvelle version (F6-D05)', async () => {
  const t = await migratedDb();
  try {
    const { projectId, reqId } = await projectWithRequirement();
    const v1 = await savedId(projectId);
    await archiveDocument(v1);
    const before = snapshot(t.raw);
    const same = await saveDeliverable(projectId, 'requirements', OPT);
    assert.deepEqual([same.outcome, same.id], ['identical', v1]);
    assert.equal(same.outcome === 'identical' && same.status, 'archived');
    assert.deepEqual(snapshot(t.raw), before, 'aucune nouvelle version, aucune écriture, aucun journal');
    assert.equal((await listProjectDocuments(projectId)).length, 1);

    await updateRequirement(reqId, { title: 'Série relancée' });
    const v2 = await saveDeliverable(projectId, 'requirements', OPT);
    assert.equal(v2.outcome, 'created');
    assert.equal(v2.outcome === 'created' && v2.version, 2);
    const d1 = (await getDocument(v1))!;
    assert.equal(d1.status, 'archived', 'l\'archivé reste archivé en base');
    assert.equal(d1.replaced_by_id, v2.id, 'il s\'affiche désormais « Remplacé »');
    await assert.rejects(unarchiveDocument(v1), DocumentStateError, 'un remplacé ne se désarchive pas');
  } finally {
    t.close();
  }
});

// ------------------------------------------------------------------ comparaison

test('comparer : juste après l\'enregistrement, aucun écart ; la comparaison n\'écrit rien (F6-D06, D96)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const id = await savedId(projectId);
    const before = snapshot(t.raw);
    const r = await compareDocumentWithCurrent(id);
    assert.equal(r.available, true);
    assert.equal(r.available && hasDifferences(r.comparison), false);
    assert.deepEqual(snapshot(t.raw), before, 'ni donnée ni journal');
    await assert.rejects(compareDocumentWithCurrent(99999), /introuvable/);
  } finally {
    t.close();
  }
});

test('comparer : statut modifié, titre modifié, élément ajouté, élément archivé ou supprimé = retiré (F6-D06, D07)', async () => {
  const t = await migratedDb();
  try {
    const projectId = await createProject('Projet F6');
    const a = await createRequirement({ projectId, title: 'Alpha' });
    const b = await createRequirement({ projectId, title: 'Bravo' });
    const c = await createRequirement({ projectId, title: 'Charlie' });
    const id = await savedId(projectId);
    await changeItemStatus(a.id, 'validated');
    await updateRequirement(b.id, { title: 'Bravo renommé' });
    await changeItemStatus(c.id, 'archived');
    await createRequirement({ projectId, title: 'Delta' });
    const r = await compareDocumentWithCurrent(id);
    assert.ok(r.available);
    if (!r.available) return;
    const k = r.comparison;
    assert.deepEqual(k.added.map((i) => [i.code, i.title]), [['EX-004', 'Delta']]);
    assert.deepEqual(k.removed.map((i) => i.code), ['EX-003'], 'archivé : sorti du périmètre');
    assert.deepEqual(k.statusChanged.map((i) => [i.code, i.from, i.to]), [['EX-001', 'draft', 'validated']]);
    assert.deepEqual(k.titleChanged.map((i) => [i.code, i.from, i.to]), [['EX-002', 'Bravo', 'Bravo renommé']]);
  } finally {
    t.close();
  }
});

test('comparer : un document créé avec les archivés inclus garde ce périmètre (les options sont relues, pas recalculées autrement) (F6-D06)', async () => {
  const t = await migratedDb();
  try {
    const projectId = await createProject('Projet F6');
    const a = await createRequirement({ projectId, title: 'Alpha' });
    await createRequirement({ projectId, title: 'Bravo' });
    await changeItemStatus(a.id, 'archived');
    const withArchived = await saveDeliverable(projectId, 'requirements', { includeArchived: true });
    const without = await saveDeliverable(projectId, 'requirements', { includeArchived: false });
    const r1 = await compareDocumentWithCurrent(withArchived.id);
    const r2 = await compareDocumentWithCurrent(without.id);
    assert.ok(r1.available && r2.available);
    assert.equal(r1.available && hasDifferences(r1.comparison), false, 'même périmètre, aucun écart');
    assert.equal(r2.available && hasDifferences(r2.comparison), false);
    await changeItemStatus(a.id, 'draft');
    const r3 = await compareDocumentWithCurrent(withArchived.id);
    assert.ok(r3.available && r3.comparison.statusChanged.length === 1 && r3.comparison.added.length === 0);
    const r4 = await compareDocumentWithCurrent(without.id);
    assert.ok(r4.available && r4.comparison.added.map((i) => i.code).join() === 'EX-001', 'l\'exigence réactivée entre dans le périmètre sans archivés');
  } finally {
    t.close();
  }
});

test('comparer : compte rendu d\'atelier, périmètre de l\'atelier ; atelier supprimé = comparaison impossible avec un message (F6-D06)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await createSampleProjectWithWorkshop();
    const w = (await query<{ id: number }>("SELECT id FROM items WHERE kind = 'workshop' ORDER BY id LIMIT 1"))[0].id;
    const saved = await saveDeliverable(projectId, 'workshop-report', { includeArchived: false, workshopId: w });
    const r = await compareDocumentWithCurrent(saved.id);
    assert.ok(r.available && !hasDifferences(r.comparison));
    await deleteItem(w);
    const gone = await compareDocumentWithCurrent(saved.id);
    assert.equal(gone.available, false);
    assert.match(gone.available ? '' : gone.reason, /n'existe plus\. La comparaison est impossible/);
  } finally {
    t.close();
  }
});

async function createSampleProjectWithWorkshop(): Promise<{ projectId: number }> {
  const { projectId } = await createSampleProject();
  return { projectId };
}

test('comparer : un import V1 n\'a pas de liste figée, une liste illisible ou des options absentes rendent la comparaison impossible, avec un message (F6-D06)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const p = await createProject('Import');
    t.raw.exec(`INSERT INTO documents (id, project_id, kind, name, status, content, created_at, updated_at) VALUES (70, ${p}, 'cr', 'Import', 'validated', '# CR', 'x', 'x')`);
    const imp = await compareDocumentWithCurrent(70);
    assert.equal(imp.available, false);
    assert.match(imp.available ? '' : imp.reason, /importé de la V1/);
    const id = await savedId(projectId);
    t.raw.exec(`UPDATE documents SET items_snapshot = 'pas du json' WHERE id = ${id}`);
    const bad = await compareDocumentWithCurrent(id);
    assert.match(bad.available ? '' : bad.reason, /absente ou illisible/);
    t.raw.exec(`UPDATE documents SET items_snapshot = '[]', options_json = NULL WHERE id = ${id}`);
    const noOpt = await compareDocumentWithCurrent(id);
    assert.match(noOpt.available ? '' : noOpt.reason, /options de ce document ne sont pas enregistrées/);
  } finally {
    t.close();
  }
});

// ------------------------------------------------------------------ exports et journal

test('export : un document validé porte sa date de validation ; le commentaire n\'est pas exporté ; l\'export n\'écrit rien (F6-D10, D96)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const id = await savedId(projectId);
    await validateDocument(id, 'Commentaire secret de validation');
    const validatedAt = (await getDocument(id))!.validated_at!;
    const ms = Date.parse(validatedAt);
    const p = (n: number): string => String(n).padStart(2, '0');
    const d = new Date(ms);
    const expectedDate = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    const before = snapshot(t.raw);
    const md = fs.readFileSync((await exportDocumentToFile(id, 'markdown', { version: VERSION, now: NOW }))!.path, 'utf8');
    assert.ok(md.includes(`**Document :** version 1, validé le ${expectedDate}\n`), md.slice(0, 300));
    assert.ok(!md.includes('Commentaire secret'));
    const html = fs.readFileSync((await exportDocumentToFile(id, 'html', { version: VERSION, now: NOW }))!.path, 'utf8');
    assert.ok(html.includes(`version 1, validé le ${expectedDate}`));
    assert.ok(!html.includes('Commentaire secret'));
    const docx = await exportDocumentToFile(id, 'docx', { version: VERSION, now: NOW });
    assert.ok(docx && fs.statSync(docx.path).size > 1000);
    assert.deepEqual(snapshot(t.raw), before);
    const stored = (await getDocument(id))!;
    assert.ok(!stored.content.includes('Document :'), 'le texte stocké ne porte jamais la mention');
  } finally {
    t.close();
  }
});

test('export : une version validée puis remplacée le dit avec sa date (F6-D10)', async () => {
  const t = await migratedDb();
  try {
    const { projectId, reqId } = await projectWithRequirement();
    const v1 = await savedId(projectId);
    await validateDocument(v1, null);
    await updateRequirement(reqId, { title: 'Après validation' });
    await savedId(projectId);
    const md = fs.readFileSync((await exportDocumentToFile(v1, 'markdown', { version: VERSION, now: NOW }))!.path, 'utf8');
    assert.match(md, /\*\*Document :\*\* version 1, validé le \d{2}\/\d{2}\/\d{4}, remplacée par la version 2\n/);
  } finally {
    t.close();
  }
});

test('journal : valider, archiver et désarchiver s\'affichent « Brouillon → Validé », « Validé → Archivé », « Archivé → Validé » avec le nom du document ; comparer et exporter ne laissent rien (F6-D09)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const id = await savedId(projectId);
    await validateDocument(id, null);
    await archiveDocument(id);
    await unarchiveDocument(id);
    const logCount = (await query<{ n: number }>('SELECT count(*) AS n FROM activity_log'))[0].n;
    await compareDocumentWithCurrent(id);
    await exportDocumentToFile(id, 'markdown', { version: VERSION, now: NOW });
    assert.equal((await query<{ n: number }>('SELECT count(*) AS n FROM activity_log'))[0].n, logCount);
    const rows = (await listJournal(projectId, { group: 'document', action: 'status_changed' }, 1)).map(journalLine);
    assert.deepEqual(rows.map((r) => [r.object, r.action, r.detail]), [
      ['Document', 'Statut changé', 'Archivé → Validé'],
      ['Document', 'Statut changé', 'Validé → Archivé'],
      ['Document', 'Statut changé', 'Brouillon → Validé'],
    ]);
    assert.ok(rows.every((r) => r.label.startsWith('Registre des exigences')));
  } finally {
    t.close();
  }
});

test('suppression d\'un projet : les documents validés ou archivés partent avec le projet comme les autres (F6, non-régression)', async () => {
  const t = await migratedDb();
  try {
    const { projectId } = await projectWithRequirement();
    const id = await savedId(projectId);
    await validateDocument(id, null);
    await deleteProject(projectId);
    assert.equal(await getDocument(id), null);
  } finally {
    t.close();
  }
});

// ------------------------------------------------------------------ branchement

test('branchement : écritures dans le dépôt seulement (R8), gardées par l\'état ; Documents ne contient aucun SQL ; la comparaison lit sans écrire (F6-D02, D06)', () => {
  const read = (p: string) => fs.readFileSync(p, 'utf8');
  const repo = read('src/data/repositories/documents.ts');
  assert.equal((repo.match(/UPDATE documents/g) ?? []).length, 3, 'trois écritures : valider, archiver, désarchiver');
  assert.equal((repo.match(/AND \$\{NOT_REPLACED\}/g) ?? []).length, 3, 'chacune refuse un document qui a une version suivante');
  assert.match(repo, /status = 'draft' AND \$\{NOT_REPLACED\}/);
  assert.match(repo, /status = \? AND \$\{NOT_REPLACED\}/);
  assert.match(repo, /status = 'archived' AND validated_at IS/);
  assert.equal((repo.match(/status_changed/g) ?? []).length >= 3, true);
  for (const f of ['DocumentsScreen.tsx', 'DocumentsView.tsx', 'logic.ts']) assert.ok(!/mutate|INSERT|UPDATE |DELETE/.test(read(`src/modules/documents/${f}`)), `${f} n'écrit pas en SQL`);
  const screen = read('src/modules/documents/DocumentsScreen.tsx');
  for (const fn of ['validateDocument', 'archiveDocument', 'unarchiveDocument', 'compareDocumentWithCurrent']) assert.match(screen, new RegExp(`${fn}\\(`));
  const service = read('src/export/service.ts');
  const cmp = service.slice(service.indexOf('export async function compareDocumentWithCurrent'));
  assert.ok(!/mutate|saveGeneratedDocument|validateDocument|archiveDocument/.test(cmp), 'la comparaison n\'écrit rien');
  assert.equal(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8').includes('"version": "0.16.0"'), true);
});
