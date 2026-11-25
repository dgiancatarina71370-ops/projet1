// Lot M1 : modèle de domaine commun (décisions D16 à D24).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { emptyDb, migratedDb } from './helpers/setup.ts';
import { seedAllTables, snapshot } from './helpers/seed.ts';
import { query } from '../src/data/db.ts';
import { mutate } from '../src/data/mutate.ts';
import { migrate, getSchemaVersion } from '../src/data/migrate.ts';
import { migrations, SCHEMA_VERSION } from '../src/data/migrations/index.ts';
import { createBackup, restoreBackup } from '../src/data/backup-service.ts';
import { createProject, deleteProject } from '../src/data/repositories/projects.ts';
import { changeItemStatus, createItem, deleteItem, getItem, getItemByCode, listItems } from '../src/data/repositories/items.ts';
import { createLink, deleteLink, linksOfItem, listLinks } from '../src/data/repositories/links.ts';
import { checkModelIntegrity } from '../src/data/repositories/integrity.ts';
import { KINDS, initialStatus, isKind, isValidStatus } from '../src/domain/kinds.ts';
import type { ItemKind } from '../src/domain/kinds.ts';
import { codeMatches, formatCode, sequenceName } from '../src/domain/codes.ts';
import { LINK_RULES, assertLinkAllowed, isLinkAllowed, linksFrom } from '../src/domain/links.ts';
import type { LinkType } from '../src/domain/links.ts';

const count = async (table: string): Promise<number> => Number((await query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))[0].n);
const journal = async (objectType: string, action: string): Promise<number> =>
  Number((await query<{ n: number }>('SELECT count(*) AS n FROM activity_log WHERE object_type = ? AND action = ?', [objectType, action]))[0].n);

// ------------------------------------------------------------------ couche domain (pure)

test('domain : sept types, préfixes distincts, premier statut = statut de création', () => {
  assert.equal(KINDS.length, 7);
  assert.equal(new Set(KINDS.map((k) => k.prefix)).size, 7);
  for (const k of KINDS) {
    assert.ok(isKind(k.kind));
    assert.equal(initialStatus(k.kind), k.statuses[0]);
    assert.ok(isValidStatus(k.kind, k.statuses[0]));
    assert.ok(k.statuses.length >= 2);
    assert.ok(!isValidStatus(k.kind, 'inconnu'));
  }
  assert.ok(!isKind('autre'));
});

test('domain : codes lisibles, trois chiffres minimum, jamais ambigus', () => {
  assert.equal(formatCode('requirement', 1), 'EX-001');
  assert.equal(formatCode('decision', 14), 'DEC-014');
  assert.equal(formatCode('test', 1000), 'TEST-1000');
  assert.throws(() => formatCode('risk', 0), /invalide/);
  assert.equal(sequenceName(3, 'story'), 'item:3:story');
  assert.ok(codeMatches('risk', 7, 'RIS-007'));
  assert.ok(!codeMatches('risk', 7, 'RIS-07'));
  assert.ok(!codeMatches('risk', 7, 'EX-007'));
});

test('domain : matrice des liens, chaque couple autorisé et chaque couple interdit', () => {
  const kinds = KINDS.map((k) => k.kind);
  let allowed = 0;
  for (const rule of LINK_RULES) {
    for (const from of kinds) {
      for (const to of kinds) {
        const expected = rule.from.includes(from) && rule.to.includes(to);
        assert.equal(isLinkAllowed(rule.type, from, to), expected, `${rule.type} ${from} -> ${to}`);
        if (expected) allowed++;
      }
    }
  }
  // 1 + 1 + 1 + 1 + 2 + 4 + 2 + 2 couples : la matrice validée (D19).
  assert.equal(allowed, 14);
  assert.equal(LINK_RULES.length, 8);
  assert.throws(() => assertLinkAllowed('verifies', 'requirement', 'test'), /Lien refusé : « vérifie » relie Test vers Exigence ou User story, pas Exigence vers Test/);
  assert.ok(!isLinkAllowed('inconnu' as LinkType, 'need', 'requirement'));
  assert.deepEqual(linksFrom('decision').map((r) => r.type).sort(), ['concerns', 'mitigates']);
});

// ------------------------------------------------------------------ migration additive

test('migration : une base du schéma 1 avec des données passe au schéma 2, rien n\'est perdu, la sauvegarde pre-migration existe', async () => {
  const t = emptyDb();
  await migrate(migrations.slice(0, 1), { backup: t.driver.backup });
  assert.equal(await getSchemaVersion(), 1);
  // Données du schéma 1, dont une ligne dans chaque table qui existait alors.
  const raw = t.raw;
  raw.exec("INSERT INTO projects (id, kind, name, created_at, updated_at) VALUES (1, 'project', 'Avant', 'x', 'x')");
  raw.exec("INSERT INTO documents (id, project_id, kind, name, status, content, created_at, updated_at) VALUES (1, 1, 'cr', 'Doc', 'draft', 'Contenu éé', 'x', 'x')");
  raw.exec("INSERT INTO contacts (name, email) VALUES ('A', 'a@b.fr')");
  const before = snapshot(raw);

  const report = await migrate(migrations.slice(0, 2), { backup: t.driver.backup });
  assert.deepEqual(report.applied, [2]);
  assert.equal(report.backup !== null, true, 'une base existante est sauvegardée avant la migration');
  assert.equal(t.backups.filter((b) => b.kind === 'pre-migration').length, 1);
  assert.equal(await getSchemaVersion(), 2);

  const after = snapshot(t.raw);
  for (const [table, snap] of Object.entries(before)) {
    if (table === 'meta') continue; // gagne la ligne migrated_2_at
    assert.deepEqual(after[table], snap, `la table ${table} est inchangée`);
  }
  assert.equal(after.items.count, 0);
  assert.equal(after.links.count, 0);

  // La sauvegarde pre-migration est au schéma 1 et ne contient pas les nouvelles tables.
  const copy = new DatabaseSync(t.backups[0].file, { readOnly: true });
  assert.equal(copy.prepare("SELECT name FROM sqlite_master WHERE name IN ('items', 'links')").all().length, 0);
  copy.close();
  t.close();
});

test('migration : la deuxième migration livrée est celle du modèle de domaine', () => {
  assert.ok(SCHEMA_VERSION >= 2);
  assert.equal(migrations[1].name, 'domain_model');
});

// ------------------------------------------------------------------ éléments

test('création : code attribué, statut initial, journal écrit dans la même transaction', async () => {
  const t = await migratedDb();
  const p = await createProject('Projet');
  const a = await createItem({ projectId: p, kind: 'requirement', title: '  Exporter en Word  ' });
  const b = await createItem({ projectId: p, kind: 'requirement', title: 'Exporter en PDF' });
  const c = await createItem({ projectId: p, kind: 'decision', title: 'Choisir pdfmake' });
  assert.deepEqual([a.code, b.code, c.code], ['EX-001', 'EX-002', 'DEC-001']);
  const item = await getItem(a.id);
  assert.equal(item?.title, 'Exporter en Word');
  assert.equal(item?.status, 'draft');
  assert.equal(item?.number, 1);
  assert.equal((await getItemByCode(p, 'EX-002'))?.id, b.id);
  assert.equal((await listItems(p, 'requirement')).length, 2);
  assert.equal((await listItems(p)).length, 3);
  assert.equal(await journal('item', 'created'), 3);
  // Le journal ne garde aucun contenu : un type et un identifiant.
  const detail = await query<{ detail: string; project_id: number }>("SELECT detail, project_id FROM activity_log WHERE object_type = 'item' ORDER BY id");
  assert.deepEqual(detail.map((d) => d.detail), ['requirement', 'requirement', 'decision']);
  assert.ok(detail.every((d) => d.project_id === p));
  assert.deepEqual(await checkModelIntegrity(), []);
  t.close();
});

test('création : titre, type, statut, projet et source invalides sont refusés sans rien écrire', async () => {
  const t = await migratedDb();
  const p = await createProject('Projet');
  const folder = await createProject('Dossier', 'folder');
  const other = await createProject('Autre');
  await mutate([{ sql: "INSERT INTO documents (project_id, kind, name, status, content, created_at, updated_at) VALUES (?, 'cr', 'D', 'draft', '', 'x', 'x')", params: [other], activity: { objectType: 'document', action: 'created', objectId: 'inserted', projectId: other } }]);
  const docOther = Number((await query<{ id: number }>('SELECT id FROM documents'))[0].id);
  const base = { projectId: p, kind: 'need' as ItemKind, title: 'Besoin' };
  await assert.rejects(() => createItem({ ...base, title: '   ' }), /obligatoire/);
  await assert.rejects(() => createItem({ ...base, title: 'x'.repeat(201) }), /limité à 200/);
  await assert.rejects(() => createItem({ ...base, kind: 'autre' as ItemKind }), /inconnu/);
  await assert.rejects(() => createItem({ ...base, status: 'bizarre' }), /Statut/);
  await assert.rejects(() => createItem({ ...base, projectId: 999 }), /n'existe pas/);
  await assert.rejects(() => createItem({ ...base, projectId: folder }), /pas dans un dossier/);
  await assert.rejects(() => createItem({ ...base, sourceDocumentId: 999 }), /document source n'existe pas/);
  await assert.rejects(() => createItem({ ...base, sourceDocumentId: docOther }), /même projet/);
  await assert.rejects(() => createItem({ ...base, sourceExcerpt: 'x'.repeat(2001) }), /limité à 2000/);
  assert.equal(await count('items'), 0);
  assert.equal(await count('sequences'), 0, 'un refus ne consomme aucun numéro');
  t.close();
});

test('codes : un numéro supprimé n\'est jamais réattribué, les projets ont chacun leur numérotation', async () => {
  const t = await migratedDb();
  const p1 = await createProject('P1');
  const p2 = await createProject('P2');
  const a = await createItem({ projectId: p1, kind: 'risk', title: 'R1' });
  const b = await createItem({ projectId: p1, kind: 'risk', title: 'R2' });
  await deleteItem(b.id);
  const c = await createItem({ projectId: p1, kind: 'risk', title: 'R3' });
  assert.deepEqual([a.code, b.code, c.code], ['RIS-001', 'RIS-002', 'RIS-003']);
  await deleteItem(c.id);
  await deleteItem(a.id);
  assert.equal((await createItem({ projectId: p1, kind: 'risk', title: 'R4' })).code, 'RIS-004');
  assert.equal((await createItem({ projectId: p2, kind: 'risk', title: 'Autre projet' })).code, 'RIS-001');
  assert.deepEqual(await checkModelIntegrity(), []);
  t.close();
});

test('codes : une création en échec dans la transaction ne consomme pas de numéro (atomicité)', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  await createItem({ projectId: p, kind: 'story', title: 'S1' });
  // Une écriture invalide dans la même transaction annule aussi l'incrément du compteur.
  await assert.rejects(() =>
    mutate([
      { sql: 'INSERT INTO sequences (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1', params: [sequenceName(p, 'story')] },
      { sql: 'INSERT INTO items (project_id) VALUES (?)', params: [p], activity: { objectType: 'item', action: 'created', objectId: 'inserted', projectId: p } },
    ]),
  );
  assert.equal((await query<{ value: number }>('SELECT value FROM sequences WHERE name = ?', [sequenceName(p, 'story')]))[0].value, 1);
  assert.equal((await createItem({ projectId: p, kind: 'story', title: 'S2' })).code, 'US-002');
  t.close();
});

test('statut : changement validé par le type et journalisé ; un statut inconnu est refusé', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const { id } = await createItem({ projectId: p, kind: 'requirement', title: 'E' });
  await changeItemStatus(id, 'validated');
  assert.equal((await getItem(id))?.status, 'validated');
  assert.equal(await journal('item', 'status_changed'), 1);
  assert.equal((await query<{ detail: string }>("SELECT detail FROM activity_log WHERE action = 'status_changed'"))[0].detail, 'draft>validated');
  await changeItemStatus(id, 'validated');
  assert.equal(await journal('item', 'status_changed'), 1, 'aucun changement, aucune ligne');
  await assert.rejects(() => changeItemStatus(id, 'inconnu'), /Statut/);
  await assert.rejects(() => changeItemStatus(999, 'draft'), /n'existe pas/);
  t.close();
});

// ------------------------------------------------------------------ liens

async function trio() {
  const p = await createProject('Projet');
  const need = await createItem({ projectId: p, kind: 'need', title: 'Besoin' });
  const req = await createItem({ projectId: p, kind: 'requirement', title: 'Exigence' });
  const test_ = await createItem({ projectId: p, kind: 'test', title: 'Test' });
  return { p, need: need.id, req: req.id, test: test_.id };
}

test('liens : un lien autorisé se crée et se journalise ; un couple interdit est refusé', async () => {
  const t = await migratedDb();
  const { p, need, req, test: tst } = await trio();
  const id = await createLink({ type: 'derives', fromId: need, toId: req });
  await createLink({ type: 'verifies', fromId: tst, toId: req });
  assert.equal((await listLinks(p)).length, 2);
  assert.equal((await listLinks(p, 'verifies')).length, 1);
  assert.equal((await linksOfItem(req)).length, 2);
  assert.equal(await journal('link', 'created'), 2);
  await assert.rejects(() => createLink({ type: 'verifies', fromId: req, toId: tst }), /Lien refusé/);
  await assert.rejects(() => createLink({ type: 'derives', fromId: req, toId: need }), /Lien refusé/);
  await assert.rejects(() => createLink({ type: 'inconnu' as LinkType, fromId: need, toId: req }), /inconnu/);
  assert.equal(await count('links'), 2);
  await deleteLink(id);
  assert.equal(await count('links'), 1);
  assert.equal(await journal('link', 'deleted'), 1);
  assert.deepEqual(await checkModelIntegrity(), []);
  t.close();
});

test('liens : doublon, lien vers soi-même, élément absent', async () => {
  const t = await migratedDb();
  const { need, req } = await trio();
  await createLink({ type: 'derives', fromId: need, toId: req });
  await assert.rejects(() => createLink({ type: 'derives', fromId: need, toId: req }), /existe déjà/);
  await assert.rejects(() => createLink({ type: 'refines', fromId: req, toId: req }), /lui-même/);
  await assert.rejects(() => createLink({ type: 'derives', fromId: need, toId: 9999 }), /n'existe pas/);
  assert.equal(await count('links'), 1);
  t.close();
});

test('liens : deux projets ne se mélangent pas, refusé par le dépôt ET par la base elle-même', async () => {
  const t = await migratedDb();
  const a = await trio();
  const b = await trio();
  await assert.rejects(() => createLink({ type: 'derives', fromId: a.need, toId: b.req }), /même projet/);
  // Dernier recours : même si le dépôt était contourné, la clé étrangère composée refuse le lien.
  assert.throws(() =>
    t.raw.exec(`INSERT INTO links (project_id, link_type, from_id, to_id, created_at) VALUES (${a.p}, 'derives', ${a.need}, ${b.req}, 'x')`), /FOREIGN KEY/);
  assert.throws(() =>
    t.raw.exec(`INSERT INTO links (project_id, link_type, from_id, to_id, created_at) VALUES (${b.p}, 'derives', ${a.need}, ${b.req}, 'x')`), /FOREIGN KEY/);
  assert.throws(() => t.raw.exec(`INSERT INTO links (project_id, link_type, from_id, to_id, created_at) VALUES (${a.p}, 'refines', ${a.req}, ${a.req}, 'x')`), /CHECK/);
  assert.equal(await count('links'), 0);
  t.close();
});

test('liens : le schéma ne bloque aucune extension future de la matrice ; le contrôle signale ce qui n\'y est pas encore déclaré', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  const d1 = await createItem({ projectId: p, kind: 'decision', title: 'D1' });
  const d2 = await createItem({ projectId: p, kind: 'decision', title: 'D2' });
  await assert.rejects(() => createLink({ type: 'concerns', fromId: d1.id, toId: d2.id }), /Lien refusé/);
  // Extension simulée : la base accepte un type de lien que la matrice ne connaît pas encore. Ajouter « Décision vers Décision » = une ligne dans la matrice et un test, jamais une migration.
  t.raw.exec(`INSERT INTO links (project_id, link_type, from_id, to_id, created_at) VALUES (${p}, 'supersedes', ${d1.id}, ${d2.id}, 'x')`);
  const issues = await checkModelIntegrity();
  assert.deepEqual(issues.map((i) => i.problem), ['unknown-link-type'], 'le contrôle d\'intégrité signale ce qui n\'est pas encore déclaré dans la matrice');
  t.close();
});

// ------------------------------------------------------------------ suppression

test('suppression d\'un élément : ses liens partent avec lui, chacun dans le journal', async () => {
  const t = await migratedDb();
  const { p, need, req, test: tst } = await trio();
  await createLink({ type: 'derives', fromId: need, toId: req });
  await createLink({ type: 'verifies', fromId: tst, toId: req });
  await deleteItem(req);
  assert.equal(await count('links'), 0);
  assert.equal(await count('items'), 2);
  assert.equal(await journal('link', 'deleted'), 2);
  assert.equal(await journal('item', 'deleted'), 1);
  assert.ok((await listItems(p)).every((i) => i.id !== req));
  await deleteItem(req); // idempotent
  t.close();
});

test('suppression d\'un projet : éléments et liens supprimés et journalisés, rien ne reste', async () => {
  const t = await migratedDb();
  const keep = await trio();
  const gone = await trio();
  await createLink({ type: 'derives', fromId: gone.need, toId: gone.req });
  await createLink({ type: 'verifies', fromId: gone.test, toId: gone.req });
  await createLink({ type: 'derives', fromId: keep.need, toId: keep.req });
  await deleteProject(gone.p);
  assert.equal(await count('items'), 3);
  assert.equal(await count('links'), 1);
  assert.equal(await journal('item', 'deleted'), 3);
  assert.equal(await journal('link', 'deleted'), 2);
  assert.deepEqual(await checkModelIntegrity(), []);
  t.close();
});

test('suppression d\'un document source : l\'élément reste, sa filiation est effacée proprement', async () => {
  const t = await migratedDb();
  const p = await createProject('P');
  await mutate([{ sql: "INSERT INTO documents (project_id, kind, name, status, content, created_at, updated_at) VALUES (?, 'cr', 'Atelier', 'draft', 'Texte', 'x', 'x')", params: [p], activity: { objectType: 'document', action: 'created', objectId: 'inserted', projectId: p } }]);
  const doc = Number((await query<{ id: number }>('SELECT id FROM documents'))[0].id);
  const { id } = await createItem({ projectId: p, kind: 'need', title: 'Issu de l\'atelier', sourceDocumentId: doc, sourceExcerpt: 'Il faut pouvoir exporter.' });
  assert.equal((await getItem(id))?.source_document_id, doc);
  await mutate([{ sql: 'DELETE FROM documents WHERE id = ?', params: [doc], activity: { objectType: 'document', action: 'deleted', objectId: doc, projectId: p } }]);
  const item = await getItem(id);
  assert.equal(item?.source_document_id, null);
  assert.equal(item?.source_excerpt, 'Il faut pouvoir exporter.', 'l\'extrait reste : il garde la trace de l\'origine');
  t.close();
});

// ------------------------------------------------------------------ contrôle d'intégrité

test('contrôle d\'intégrité : chaque anomalie volontaire est signalée, et seulement elle', async () => {
  const t = await migratedDb();
  const { p, need, req } = await trio();
  const link = await createLink({ type: 'derives', fromId: need, toId: req });
  assert.deepEqual(await checkModelIntegrity(), []);

  t.raw.exec(`UPDATE items SET kind = 'martien' WHERE id = ${need}`);
  t.raw.exec(`UPDATE items SET status = 'bizarre' WHERE id = ${req}`);
  const found = (await checkModelIntegrity()).map((i) => i.problem).sort();
  assert.deepEqual(found, ['invalid-status', 'link-not-allowed', 'unknown-kind']);
  t.raw.exec(`UPDATE items SET kind = 'need' WHERE id = ${need}`);
  t.raw.exec(`UPDATE items SET status = 'draft' WHERE id = ${req}`);
  assert.deepEqual(await checkModelIntegrity(), []);

  t.raw.exec(`UPDATE items SET code = 'EX-009' WHERE id = ${req}`);
  assert.deepEqual((await checkModelIntegrity()).map((i) => i.problem), ['code-mismatch']);
  t.raw.exec(`UPDATE items SET code = 'EX-001' WHERE id = ${req}`);

  t.raw.exec(`UPDATE sequences SET value = 0 WHERE name = '${sequenceName(p, 'requirement')}'`);
  assert.deepEqual((await checkModelIntegrity()).map((i) => i.problem), ['counter-behind']);
  t.raw.exec(`UPDATE sequences SET value = 1 WHERE name = '${sequenceName(p, 'requirement')}'`);

  t.raw.exec(`UPDATE links SET link_type = 'zzz' WHERE id = ${link}`);
  assert.deepEqual((await checkModelIntegrity()).map((i) => i.problem), ['unknown-link-type']);
  t.raw.exec(`UPDATE links SET link_type = 'derives' WHERE id = ${link}`);
  assert.deepEqual(await checkModelIntegrity(), []);
  t.close();
});

test('contrôle d\'intégrité : une source d\'un autre projet est signalée', async () => {
  const t = await migratedDb();
  const p1 = await createProject('P1');
  const p2 = await createProject('P2');
  await mutate([{ sql: "INSERT INTO documents (project_id, kind, name, status, content, created_at, updated_at) VALUES (?, 'cr', 'D', 'draft', '', 'x', 'x')", params: [p2], activity: { objectType: 'document', action: 'created', objectId: 'inserted', projectId: p2 } }]);
  const doc = Number((await query<{ id: number }>('SELECT id FROM documents'))[0].id);
  const { id } = await createItem({ projectId: p1, kind: 'need', title: 'N' });
  t.raw.exec(`UPDATE items SET source_document_id = ${doc} WHERE id = ${id}`);
  assert.deepEqual((await checkModelIntegrity()).map((i) => i.problem), ['source-other-project']);
  t.close();
});

// ------------------------------------------------------------------ sauvegarde et restauration

test('sauvegarde et restauration : éléments, liens et compteurs reviennent exactement', async () => {
  const t = await migratedDb();
  const { p, need, req } = await trio();
  await createLink({ type: 'derives', fromId: need, toId: req });
  const { created } = await createBackup('manual');
  const saved = snapshot(t.raw);
  await createItem({ projectId: p, kind: 'risk', title: 'Ajouté après' });
  await deleteItem(need);
  await restoreBackup(created.file);
  const back = snapshot(t.raw);
  for (const table of ['items', 'links', 'sequences', 'projects']) assert.deepEqual(back[table], saved[table], `la table ${table} revient telle qu'elle était`);
  assert.deepEqual(await checkModelIntegrity(), []);
  assert.equal((await createItem({ projectId: p, kind: 'risk', title: 'Après restauration' })).code, 'RIS-001', 'le compteur est revenu avec la sauvegarde');
  t.close();
});

test('E4 : le jeu de test couvre les deux nouvelles tables', async () => {
  const t = await migratedDb();
  seedAllTables(t.raw);
  assert.equal(snapshot(t.raw).items.count, 3);
  assert.equal(snapshot(t.raw).links.count, 1);
  assert.equal(snapshot(t.raw).stakeholder_details.count, 1);
  t.close();
});
