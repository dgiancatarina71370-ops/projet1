// Lot V2.3b : export Word (.docx) signé. On ouvre le fichier réellement produit (archive ZIP) et on relit son contenu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import { migratedDb } from './helpers/setup.ts';
import { mutate } from '../src/data/mutate.ts';
import { query } from '../src/data/db.ts';
import { exportDocument, ExportSignatureError, FORMATS } from '../src/export/pipeline.ts';
import { readDocx, missingFromDocx } from '../src/export/docx-check.ts';
import { xmlSafe } from '../src/export/render-docx.ts';
import { exportDocumentToFile } from '../src/export/service.ts';
import { buildSignature, signatureLines } from '../src/shared/signature.ts';
import { listDocuments } from './helpers/documents.ts';
import { runImport } from '../src/data/import-v1.ts';

const NOW = new Date(2026, 10, 21, 17, 5, 9);
const VERSION = '0.2.6';
const CTX = { version: VERSION, now: NOW };
const sig = buildSignature(VERSION, NOW);
const SIG = signatureLines(sig);

const RICH = `# Spécification

Texte avec **gras**, *italique*, ~~barré~~, \`code\`, [lien sûr](https://exemple.test/a?b=1&c=2) et [mail](mailto:nom@exemple.test).

## Listes
- A
  - A1
- B

3. trois
4. quatre

- [x] fait
- [ ] à faire

| Règle | Statut |
|:--|--:|
| RG-1 | **Validé** |

> citation

\`\`\`sql
SELECT 1;
\`\`\`

---
Fin.
`;

const docxOf = async (markdown: string, title = 'Spec') => (await exportDocument({ title, markdown }, 'docx', CTX)).bytes;
const entry = async (bytes: Uint8Array, name: string) => (await (await JSZip.loadAsync(bytes)).file(name)!.async('string'));

test('Word : format déclaré, fichier .docx valide (archive ZIP aux parties attendues), pas de texte', async () => {
  assert.equal(FORMATS.docx.ext, 'docx');
  assert.equal(FORMATS.docx.mime, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const r = await exportDocument({ title: 'CR atelier', markdown: RICH }, 'docx', CTX);
  assert.equal(r.text, null);
  assert.equal(r.fileName, 'CR atelier-20261121-170509.docx');
  assert.equal(Buffer.from(r.bytes.slice(0, 2)).toString('latin1'), 'PK');
  const d = await readDocx(r.bytes);
  for (const f of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'docProps/core.xml', 'docProps/custom.xml']) assert.ok(d.files.includes(f), `partie manquante : ${f}`);
  assert.ok(d.files.some((f) => /^word\/footer\d*\.xml$/.test(f)));
});

test('E5 Word : signature complète dans le corps (4 lignes, une par paragraphe), propriétés et pied de page', async () => {
  const d = await readDocx(await docxOf(RICH));
  for (const line of SIG) assert.ok(d.paragraphs.includes(line), `ligne absente : ${line}`);
  const tail = d.paragraphs.slice(-4);
  assert.deepEqual(tail, SIG, 'le bloc de signature est le dernier élément du document, une seule fois');
  assert.equal(d.paragraphs.filter((p) => p === SIG[0]).length, 1);
  // propriétés du document
  assert.match(d.core, /<dc:creator>BA-Mentor Portable Ultimate Edition<\/dc:creator>/);
  assert.ok(d.core.includes('Développé par David Giancatarina — Version : 0.2.6 — Date de génération : 21/11/2026 17:05'));
  assert.ok(d.core.includes('<dc:title>Spec</dc:title>'));
  assert.match(d.custom, /BAMentorVersion[\s\S]*?0\.2\.6/);
  assert.match(d.custom, /BAMentorGeneratedAt[\s\S]*?\d{4}-\d\d-\d\dT/);
  // pied de page court
  assert.ok(d.footer.join(' ').includes('BA-Mentor Portable Ultimate Edition — Version : 0.2.6 — Page'));
});

test('Word : titres, tableau, listes (numérotation à 3), cases à cocher, citation, code, règle, liens sûrs', async () => {
  const bytes = await docxOf(RICH);
  const doc = await entry(bytes, 'word/document.xml');
  const d = await readDocx(bytes);
  assert.ok(doc.includes('<w:pStyle w:val="Heading1"/>') && doc.includes('<w:pStyle w:val="Heading2"/>'));
  assert.equal((doc.match(/<w:tbl>/g) ?? []).length, 1);
  assert.ok(doc.includes('<w:tblHeader'), 'ligne d\'en-tête répétée');
  assert.ok(d.paragraphs.includes('Règle') && d.paragraphs.includes('Validé') && d.paragraphs.includes('RG-1'));
  assert.ok(doc.includes('<w:b/>') && doc.includes('<w:i/>') && doc.includes('<w:strike'));
  const numbering = await entry(bytes, 'word/numbering.xml');
  assert.match(numbering, /<w:start w:val="3"\/>/, 'la liste numérotée démarre à 3');
  assert.ok(d.paragraphs.some((p) => p === '☑ fait') && d.paragraphs.some((p) => p === '☐ à faire'));
  assert.ok(d.paragraphs.some((p) => p === 'citation') && d.paragraphs.includes('SELECT 1;'));
  const rels = await entry(bytes, 'word/_rels/document.xml.rels');
  const targets = [...rels.matchAll(/Target="([^"]+)"[^>]*TargetMode="External"|TargetMode="External"[^>]*Target="([^"]+)"/g)].map((m) => m[1] ?? m[2]);
  assert.deepEqual(targets.sort(), ['https://exemple.test/a?b=1&amp;c=2', 'mailto:nom@exemple.test']);
});

const TRAP = [
  '# Titre <iframe src="http://evil.test"></iframe>',
  '<script>alert("script-bloc")</script>',
  'Texte <b onclick="alert(1)">gras HTML</b> et <img src=x onerror=alert("img")>.',
  '[js](javascript:alert("lien")) [data](data:text/html;base64,AAAA) [file](file:///C:/secret) [ok](https://exemple.test/p) [ancre](#fin) [rel](../doc.md)',
  '![pixel espion](http://evil.test/pixel.png)',
  '| A <script> | B |\n|---|---|\n| <img src=x onerror=alert("tableau")> | `x</td><script>` |',
  '```html\n</code></pre><script>alert("code")</script>\n```',
  '> citation <svg onload=alert("svg")>',
].join('\n\n');

test('D15 Word : contenu piégé affiché comme texte, aucun lien dangereux, aucune image, aucune ressource externe', async () => {
  const bytes = await docxOf(TRAP, '<script>alert(0)</script>');
  const d = await readDocx(bytes);
  const zip = await JSZip.loadAsync(bytes);
  // le HTML saisi reste du TEXTE, visible
  assert.ok(d.paragraphs.includes('<script>alert("script-bloc")</script>'));
  assert.ok(d.paragraphs.some((p) => p.includes('<b onclick="alert(1)">gras HTML</b>')));
  assert.ok(d.paragraphs.some((p) => p.includes('[image : pixel espion]')));
  // liens : seul https est un lien Word ; javascript:, data:, file:, ancre et chemin relatif disparaissent (texte conservé)
  const allRels = (await Promise.all(Object.keys(zip.files).filter((f) => f.endsWith('.rels')).map((f) => zip.file(f)!.async('string')))).join('\n');
  const external = [...allRels.matchAll(/<Relationship [^>]*>/g)].map((m) => m[0]).filter((r) => /TargetMode="External"/.test(r)).map((r) => /Target="([^"]+)"/.exec(r)![1]);
  assert.deepEqual(external, ['https://exemple.test/p']);
  assert.ok(!/javascript:|data:text|file:\/\/|evil\.test/.test(allRels));
  assert.ok(d.paragraphs.some((p) => p.includes('js') && p.includes('ancre') && p.includes('rel')));
  // aucune image, aucun objet intégré, aucune macro
  const names = Object.keys(zip.files);
  assert.ok(!names.some((n) => /media\/|embeddings\/|vbaProject|\.bin$/.test(n)), names.join(', '));
  const doc = await entry(bytes, 'word/document.xml');
  assert.ok(!/<w:drawing|<w:pict|<w:object|<w:altChunk|<w:fldSimple|<w:instrText[^>]*>[^<]*(INCLUDE|LINK|DDE)/i.test(doc));
  // la signature est intacte malgré le contenu hostile
  for (const line of SIG) assert.ok(d.paragraphs.includes(line));
});

test('Word : XML toujours valide (caractères de contrôle et demi-paires retirés, tabulations en espaces)', async () => {
  assert.equal(xmlSafe('a\u0000b\u0001c\u001fd\u000be\ufffe\tf'), 'abcde    f'.replace('    f', '    f'));
  assert.equal(xmlSafe('x\ud800y'), 'x\ufffdy');
  assert.equal(xmlSafe('😀'), '😀');
  const bytes = await docxOf('Texte avec \u0001 contrôle \u0008 et \ud800 isolé\tet tab.\n\n```\nligne\u0002 un\n\tligne deux\n```');
  const zip = await JSZip.loadAsync(bytes);
  for (const f of Object.keys(zip.files).filter((n) => n.endsWith('.xml') || n.endsWith('.rels'))) {
    const xml = await zip.file(f)!.async('string');
    assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(xml), `caractère interdit dans ${f}`);
    assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(xml), `demi-paire dans ${f}`);
  }
});

test('Word : contenu vide, gros document, titre hostile : toujours un fichier signé', async () => {
  const empty = await readDocx(await docxOf(''));
  assert.deepEqual(empty.paragraphs.slice(-4), SIG);
  const big = Array.from({ length: 3000 }, (_, i) => `Paragraphe ${i} avec du texte accentué é à ç.`).join('\n\n');
  const t0 = Date.now();
  const d = await readDocx(await docxOf(big));
  assert.equal(d.paragraphs.filter((p) => p.startsWith('Paragraphe ')).length, 3000);
  assert.deepEqual(d.paragraphs.slice(-4), SIG);
  assert.ok(Date.now() - t0 < 15000, 'génération de 3000 paragraphes en moins de 15 s');
  const hostile = await exportDocument({ title: 'CON <b>:</b> "x" \u0001', markdown: 'a' }, 'docx', CTX);
  assert.ok(hostile.fileName.endsWith('.docx') && !/[<>:"\\/|?*\u0001]/.test(hostile.fileName.replace(/-\d{8}-\d{6}\.docx$/, '')));
});

test('E5 Word : un fichier dont la signature est altérée est détecté (corps et propriétés)', async () => {
  const good = await docxOf('texte');
  assert.deepEqual(await missingFromDocx(good, sig), []);
  const tamper = async (file: string, edit: (xml: string) => string) => {
    const zip = await JSZip.loadAsync(good);
    zip.file(file, edit(await zip.file(file)!.async('string')));
    return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
  };
  const noDate = await tamper('word/document.xml', (x) => x.replace('Date de génération : 21/11/2026 17:05', 'Date de génération : ?'));
  assert.deepEqual(await missingFromDocx(noDate, sig), ['Date de génération : 21/11/2026 17:05']);
  const noAuthor = await tamper('word/document.xml', (x) => x.replace('Développé par David Giancatarina', 'Développé par quelqu\'un'));
  assert.ok((await missingFromDocx(noAuthor, sig)).includes('Développé par David Giancatarina'));
  const noCreator = await tamper('docProps/core.xml', (x) => x.replace('<dc:creator>BA-Mentor Portable Ultimate Edition</dc:creator>', '<dc:creator>Autre</dc:creator>'));
  assert.ok((await missingFromDocx(noCreator, sig)).some((m) => m.includes('auteur')));
  const noDesc = await tamper('docProps/core.xml', (x) => x.replace('Version : 0.2.6', 'Version : ?'));
  assert.ok((await missingFromDocx(noDesc, sig)).some((m) => m.includes('description')));
  assert.ok(ExportSignatureError.name);
});

test('exportDocumentToFile : Word dans exports/, sans écrasement, journal inchangé (livrable de la base)', async () => {
  const t = await migratedDb();
  try {
    await mutate([
      { sql: "INSERT INTO projects (id, parent_id, kind, name, created_at, updated_at) VALUES (1, NULL, 'project', 'Projet A', '2026-03-01T08:00:00.000Z', '2026-03-01T08:00:00.000Z')", activity: { objectType: 'project', action: 'created', objectId: 1, projectId: 1 } },
      { sql: "INSERT INTO documents (id, project_id, kind, name, status, content, created_at, updated_at) VALUES (1, 1, 'cr', 'CR du 12/03', 'draft', ?, '2026-03-12T08:00:00.000Z', '2026-03-12T08:00:00.000Z')", params: ['# CR\n\nDécision : **valider** é à ç.\n'], activity: { objectType: 'document', action: 'created', objectId: 1, projectId: 1 } },
    ]);
    const a = await exportDocumentToFile(1, 'docx', { version: VERSION, now: NOW });
    const b = await exportDocumentToFile(1, 'docx', { version: VERSION, now: NOW });
    assert.equal(a!.name, 'CR du 12-03-20261121-170509.docx');
    assert.equal(b!.name, 'CR du 12-03-20261121-170509-2.docx');
    const onDisk = new Uint8Array(fs.readFileSync(a!.path));
    assert.equal(a!.sizeBytes, onDisk.length);
    assert.deepEqual(await missingFromDocx(onDisk, sig), []);
    assert.ok((await readDocx(onDisk)).paragraphs.includes('Décision : valider é à ç.'));
    assert.equal(await exportDocumentToFile(1, 'docx', { version: VERSION, now: NOW, askWhere: true }), null);
    assert.equal(Number((await query<{ n: number }>('SELECT count(*) AS n FROM activity_log'))[0].n), 2);
  } finally {
    t.close();
  }
});

test('E9 + E5 : le livrable réel de la V1 et le jeu piégé s\'exportent en Word', async () => {
  const t = await migratedDb();
  try {
    for (const f of ['v1-export-minimal.json', 'v1-export-synthetic-trap.json']) {
      const bytes = fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures', f));
      await runImport({ name: f, text: bytes.toString('utf8'), sha256: crypto.createHash('sha256').update(bytes).digest('hex') }, { now: NOW });
    }
    const docs = await listDocuments();
    assert.ok(docs.length >= 3);
    const names: string[] = [];
    for (const doc of docs) {
      const saved = await exportDocumentToFile(doc.id, 'docx', { version: VERSION, now: NOW });
      names.push(saved!.name);
      assert.deepEqual(await missingFromDocx(new Uint8Array(fs.readFileSync(saved!.path)), sig), []);
    }
    assert.ok(names.some((n) => n.startsWith('_CON-')), names.join(' | '));
    assert.equal(fs.readdirSync(t.exportsDir).length, docs.length);
  } finally {
    t.close();
  }
});
