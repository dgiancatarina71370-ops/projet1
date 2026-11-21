// Lot V2.3a : pipeline d'export signé (Markdown, HTML), noms de fichiers, HTML piégé, écriture par le pilote (exigence E5, E11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { migratedDb } from './helpers/setup.ts';
import { mutate } from '../src/data/mutate.ts';
import { exportDocument, assertSigned, ExportSignatureError, FORMATS } from '../src/export/pipeline.ts';
import { parseMarkdown, decodeEntities, isSafeHref } from '../src/export/model.ts';
import { safeFileStem, exportFileName, truncateBytes, localStamp } from '../src/export/filename.ts';
import { exportDocumentToFile } from '../src/export/service.ts';
import { buildSignature, signatureLines } from '../src/shared/signature.ts';
import { listDocuments } from '../src/data/repositories/documents.ts';
import { runImport } from '../src/data/import-v1.ts';
import path from 'node:path';
import crypto from 'node:crypto';

const NOW = new Date(2026, 10, 21, 17, 5, 9); // heure locale : le test ne dépend pas du fuseau de la machine
const CTX = { version: '0.2.4', now: NOW };
const SIG = signatureLines(buildSignature('0.2.4', NOW));

// ---------------------------------------------------------------------------------------------------------------------
// Signature (E5, E11)
// ---------------------------------------------------------------------------------------------------------------------

test('E5 Markdown : les quatre éléments de la signature, le commentaire en tête, le bloc après « --- »', async () => {
  const r = await exportDocument({ title: 'CR atelier', markdown: '# Compte rendu\n\nTexte accentué : é à ç.' }, 'markdown', CTX);
  assert.deepEqual(SIG, ['BA-Mentor Portable Ultimate Edition', 'Développé par David Giancatarina', 'Version : 0.2.4', 'Date de génération : 21/11/2026 17:05']);
  for (const line of SIG) assert.ok(r.text.includes(line), line);
  assert.match(r.text, /^<!-- generator: BA-Mentor Portable Ultimate Edition — Développé par David Giancatarina — Version : 0\.2\.4 — generated: \d{4}-\d\d-\d\dT[\d:.]+Z -->\n/);
  const [body, foot] = r.text.split('\n---\n');
  assert.ok(body.includes('# Compte rendu') && body.includes('é à ç'), 'le contenu est repris tel quel');
  assert.deepEqual(foot.trim().split('  \n'), SIG, 'le bloc final contient les quatre lignes, dans l\'ordre');
  assert.equal(r.fileName, 'CR atelier-20261121-170509.md');
});

test('E5 HTML : pied de page visible une seule fois, balises meta, aucune ressource externe', async () => {
  const r = await exportDocument({ title: 'SFD <règles> & co', markdown: '# Titre\n\nTexte.' }, 'html', CTX);
  assert.equal((r.text.match(/<footer>/g) ?? []).length, 1);
  const footer = r.text.slice(r.text.indexOf('<footer>'), r.text.indexOf('</footer>'));
  for (const line of SIG) assert.ok(footer.includes(line), `pied de page : ${line}`);
  assert.match(r.text, /<meta name="generator" content="BA-Mentor Portable Ultimate Edition — Développé par David Giancatarina — Version : 0\.2\.4">/);
  assert.match(r.text, /<meta name="generated" content="\d{4}-\d\d-\d\dT[\d:.]+Z">/);
  assert.match(r.text, /<title>SFD &lt;règles&gt; &amp; co<\/title>/);
  assert.match(r.text, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"/);
  assert.ok(!/\b(src|srcset)=|<link |@import|url\(/i.test(r.text), 'aucune ressource externe');
  assert.equal(r.fileName, 'SFD -règles- & co-20261121-170509.html');
});

test('la date de génération est celle de l\'instant de l\'export, à la minute', async () => {
  const t0 = new Date(2026, 0, 5, 9, 7, 59);
  const r = await exportDocument({ title: 'x', markdown: 'a' }, 'markdown', { version: '1.2.3', now: t0 });
  assert.ok(r.text.includes('Date de génération : 05/01/2026 09:07'));
  assert.equal(localStamp(t0), '20260105-090759');
});

test('un export sans signature complète est refusé', async () => {
  const sig = buildSignature('0.2.4', NOW);
  assert.throws(() => assertSigned('rien', sig), ExportSignatureError);
  const almost = signatureLines(sig).slice(0, 3).join('\n'); // manque la date
  assert.throws(() => assertSigned(almost, sig), (e: unknown) => e instanceof ExportSignatureError && /Date de génération/.test(e.message));
  assert.doesNotThrow(() => assertSigned(signatureLines(sig).join('\n'), sig));
  // version inconnue : refus avant tout rendu
  await assert.rejects(exportDocument({ title: 'x', markdown: 'a' }, 'html', { version: '—', now: NOW }), ExportSignatureError);
  await assert.rejects(exportDocument({ title: 'x', markdown: 'a' }, 'html', { version: ' ', now: NOW }), ExportSignatureError);
  await assert.rejects(exportDocument({ title: 'x', markdown: 'a' }, 'docx', { version: '—', now: NOW }), ExportSignatureError);
  await assert.rejects(exportDocument({ title: 'x', markdown: 'a' }, 'pdf' as never, CTX), /Format d'export inconnu/);
  assert.deepEqual(Object.keys(FORMATS), ['markdown', 'html', 'docx']);
});

test('contenu vide : l\'export existe et porte la signature', async () => {
  for (const f of ['markdown', 'html'] as const) {
    const r = await exportDocument({ title: 'Vide', markdown: '' }, f, CTX);
    for (const line of SIG) assert.ok(r.text.includes(line));
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Sécurité du HTML (décision D7)
// ---------------------------------------------------------------------------------------------------------------------

const ALLOWED_TAGS = new Set(['html', 'head', 'meta', 'title', 'style', 'body', 'main', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'a', 'strong', 'em', 'del', 'code', 'pre', 'ul', 'ol', 'li', 'input', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'hr']);

const TRAP = [
  '# Titre <iframe src="http://evil"></iframe>',
  '<script>alert(1)</script>',
  'Texte <b onclick="alert(2)">gras HTML</b> et <img src=x onerror=alert(3)> et <br> saut.',
  '[js](javascript:alert(4)) [JS](JaVaScRiPt:alert(5)) [tab](java\tscript:alert(6)) [data](data:text/html,<b>x</b>) [file](file:///C:/secret) [ok](https://exemple.test/a?b=1&c=2) [mail](mailto:a@b.test) [rel](#ancre)',
  '![pixel espion](http://evil.test/pixel.png)',
  '| A <script> | B |\n|---|---|\n| <img src=x onerror=alert(7)> | `x</td><script>` |',
  '```html\n</code></pre><script>alert(8)</script>\n```',
  '> citation <svg onload=alert(9)>',
  '- item <style>body{display:none}</style>\n- [x] fait',
  '&lt;script&gt;alert(10)&lt;/script&gt; &amp; &#60;b&#62;',
].join('\n\n');

test('D7 : un livrable piégé donne un HTML inerte', async () => {
  const html = (await exportDocument({ title: '<script>alert(0)</script>', markdown: TRAP }, 'html', CTX)).text;
  const tags = [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase());
  const unexpected = [...new Set(tags.filter((t) => !ALLOWED_TAGS.has(t)))];
  assert.deepEqual(unexpected, [], `balises inattendues : ${unexpected.join(', ')}`);
  assert.ok(!/<script/i.test(html.replace(/&lt;script/gi, '')), 'aucune balise script');
  assert.ok(!/\son[a-z]+\s*=/i.test(html.replace(/&quot;|&#39;|&lt;[^>]*?&gt;/g, '')), 'aucun attribut d\'événement');
  const hrefs = [...html.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ['https://exemple.test/a?b=1&amp;c=2', 'mailto:a@b.test', '#ancre'], 'seuls les liens sûrs subsistent');
  assert.ok(!/javascript:|data:text|file:/i.test(hrefs.join(' ')));
  assert.ok(html.includes('[image : pixel espion]') && !html.includes('pixel.png'), 'une image n\'est jamais chargée');
  // Le texte piégé reste visible, mais comme texte.
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(3)&gt;'));
  assert.ok(html.includes('&lt;/code&gt;&lt;/pre&gt;&lt;script&gt;alert(8)&lt;/script&gt;'));
  // Les entités saisies par l'auteur sont décodées une fois, puis rééchappées une fois (pas de double échappement).
  assert.ok(html.includes('&lt;script&gt;alert(10)&lt;/script&gt; &amp; &lt;b&gt;'), html.slice(html.indexOf('alert(10)') - 40, html.indexOf('alert(10)') + 80));
  assert.ok(!html.includes('&amp;amp;') && !html.includes('&amp;lt;'));
});

test('liens : seuls http, https, mailto, ancres et chemins relatifs sont sûrs', async () => {
  for (const ok of ['https://a.b', 'HTTP://a.b', 'mailto:x@y.z', '#a', '/chemin', './x', 'x/y.md', '?q=1']) assert.equal(isSafeHref(ok), true, ok);
  for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:1', 'java\tscript:1', 'java\nscript:1', 'data:text/html,x', 'file:///x', 'vbscript:x', 'ftp://x', 'blob:x', '', '   ', '\u0001javascript:1']) assert.equal(isSafeHref(bad), false, JSON.stringify(bad));
});

// ---------------------------------------------------------------------------------------------------------------------
// Modèle de blocs
// ---------------------------------------------------------------------------------------------------------------------

test('modèle : titres, listes imbriquées et à cocher, tableau aligné, code, citation, règle', async () => {
  const b = parseMarkdown('## Titre *fort*\n\n- a\n  - b\n- [x] fait\n- [ ] à faire\n\n3. trois\n4. quatre\n\n| A | B |\n|:--|--:|\n| 1 | **2** |\n\n```js\nlet x = 1;\n```\n\n> cité\n\n---\n');
  assert.deepEqual(b.map((x) => x.kind), ['heading', 'list', 'list', 'table', 'code', 'quote', 'rule']);
  const list = b[1] as Extract<(typeof b)[number], { kind: 'list' }>;
  assert.deepEqual(list.items.map((i) => i.checked), [null, true, false]);
  assert.equal(list.items[0].blocks.some((x) => x.kind === 'list'), true, 'liste imbriquée');
  const ordered = b[2] as Extract<(typeof b)[number], { kind: 'list' }>;
  assert.equal(ordered.ordered, true);
  assert.equal(ordered.start, 3);
  const table = b[3] as Extract<(typeof b)[number], { kind: 'table' }>;
  assert.deepEqual(table.align, ['left', 'right']);
  assert.equal(table.rows.length, 1);
  const html = (await exportDocument({ title: 't', markdown: '3. trois\n4. quatre\n\n| A | B |\n|:--|--:|\n| 1 | **2** |\n\n```js\nlet x = 1 < 2;\n```' }, 'html', CTX)).text;
  assert.ok(html.includes('<ol start="3">'));
  assert.ok(html.includes('<th style="text-align:left">A</th>') && html.includes('<td style="text-align:right"><strong>2</strong></td>'));
  assert.ok(html.includes('<code class="language-js">let x = 1 &lt; 2;</code>'));
});

test('cases à cocher : une seule case par item, le texte à côté, jamais « [x] » en clair (livrable réel de la V1)', async () => {
  const html = (await exportDocument({ title: 't', markdown: '## Décisions\n- [x] Le CRM reste la source\n- [ ] Seuil à confirmer\n- simple\n' }, 'html', CTX)).text;
  assert.ok(html.includes('<li><input type="checkbox" disabled checked> Le CRM reste la source</li>'), html);
  assert.ok(html.includes('<li><input type="checkbox" disabled> Seuil à confirmer</li>'));
  assert.ok(html.includes('<li>simple</li>'));
  assert.ok(!html.includes('[x]') && !html.includes('[ ]'));
  const b = parseMarkdown('- [x] a\n- [ ] b\n');
  const list = b[0] as Extract<(typeof b)[number], { kind: 'list' }>;
  assert.deepEqual(list.items.map((i) => [i.checked, i.blocks.length]), [[true, 1], [false, 1]]);
});

test('entités : décodées une fois', async () => {
  assert.equal(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#233; &#xE9; &nbsp;|&inconnue; &#0; &#xD800;'), 'a & b <c> "d" \'e\' é é \u00a0|&inconnue; &#0; &#xD800;');
});

// ---------------------------------------------------------------------------------------------------------------------
// Noms de fichiers
// ---------------------------------------------------------------------------------------------------------------------

test('safeFileStem : caractères interdits, noms réservés, vide, longueur', async () => {
  assert.equal(safeFileStem('CR atelier — fusion des fiches (exemple)'), 'CR atelier — fusion des fiches (exemple)');
  assert.equal(safeFileStem('a/b\\c:d*e?f"g<h>i|j'), 'a-b-c-d-e-f-g-h-i-j');
  assert.equal(safeFileStem('..\\..\\evil'), 'evil');
  assert.equal(safeFileStem('CON'), '_CON');
  assert.equal(safeFileStem('con.txt'), '_con.txt');
  assert.equal(safeFileStem('lpt1'), '_lpt1');
  assert.equal(safeFileStem('CONSOLE'), 'CONSOLE');
  for (const empty of ['', '   ', '...', '---', ' . - ', '***']) assert.equal(safeFileStem(empty), 'export', JSON.stringify(empty));
  assert.equal(safeFileStem('a\u0000b\nc'), 'a-b-c');
  const long = safeFileStem('é'.repeat(300));
  assert.ok(new TextEncoder().encode(long).length <= 100);
  assert.equal(long, 'é'.repeat(50));
  assert.equal(truncateBytes('ab😀cd', 5), 'ab', 'un emoji (4 octets) n\'est jamais coupé en deux');
  assert.equal(truncateBytes('ab😀cd', 6), 'ab😀');
});

test('exportFileName : toujours accepté par le contrôle du noyau, quel que soit le titre', async () => {
  const t = await migratedDb();
  try {
    const titles = ['Normal', 'CON', 'con.txt', 'a/b', '', '...', '😀'.repeat(60), 'é'.repeat(400), '  espaces  ', 'point.', 'x\u0000y', 'COM1', 'Aux. fichier'];
    for (const title of titles) {
      const name = exportFileName(title, 'md', NOW);
      assert.ok(Buffer.byteLength(name) <= 150, name);
      const saved = await t.driver.exportSave(name, new TextEncoder().encode('x'), false);
      assert.ok(saved && fs.existsSync(saved.path), `refusé : ${JSON.stringify(title)} → ${name}`);
      assert.equal(path.dirname(saved.path), t.exportsDir, 'toujours dans exports/');
    }
  } finally {
    t.close();
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Écriture par le pilote
// ---------------------------------------------------------------------------------------------------------------------

test('le pilote refuse un nom qui sort du dossier ou n\'a pas une extension d\'export', async () => {
  const t = await migratedDb();
  try {
    for (const bad of ['../evade.md', 'a/b.md', 'a\\b.md', 'CON.md', 'x.exe', 'x', '', 'x.md.', ' x.md']) {
      await assert.rejects(t.driver.exportSave(bad, new Uint8Array([1]), false), /refusé/, JSON.stringify(bad));
    }
    assert.equal(fs.existsSync(t.exportsDir), false, 'rien n\'a été créé');
  } finally {
    t.close();
  }
});

test('exportDocumentToFile : livrable de la base → fichier signé dans exports/, sans écrasement', async () => {
  const t = await migratedDb();
  try {
    await mutate([
      { sql: "INSERT INTO projects (id, parent_id, kind, name, created_at, updated_at) VALUES (1, NULL, 'project', 'Projet A', '2026-03-01T08:00:00.000Z', '2026-03-01T08:00:00.000Z')", activity: { objectType: 'project', action: 'created', objectId: 1, projectId: 1 } },
      { sql: "INSERT INTO documents (id, project_id, kind, name, status, content, created_at, updated_at) VALUES (1, 1, 'cr', 'CR du 12/03', 'draft', ?, '2026-03-12T08:00:00.000Z', '2026-03-12T08:00:00.000Z')", params: ['# CR\n\nDécision : **valider** é à ç.\n'], activity: { objectType: 'document', action: 'created', objectId: 1, projectId: 1 } },
    ]);
    const docs = await listDocuments();
    assert.deepEqual(docs.map((d) => [d.id, d.name, d.projectName, d.status]), [[1, 'CR du 12/03', 'Projet A', 'draft']]);

    const a = await exportDocumentToFile(1, 'markdown', { version: '0.2.4', now: NOW });
    const b = await exportDocumentToFile(1, 'markdown', { version: '0.2.4', now: NOW }); // même seconde : jamais d'écrasement
    const h = await exportDocumentToFile(1, 'html', { version: '0.2.4', now: NOW });
    assert.equal(a!.name, 'CR du 12-03-20261121-170509.md'); // « / » assaini
    assert.equal(b!.name, 'CR du 12-03-20261121-170509-2.md');
    assert.equal(h!.name, 'CR du 12-03-20261121-170509.html');
    const text = fs.readFileSync(a!.path, 'utf8');
    for (const line of SIG) assert.ok(text.includes(line));
    assert.ok(text.includes('Décision : **valider** é à ç.'));
    assert.equal(a!.sizeBytes, Buffer.byteLength(text));
    assert.ok(fs.readFileSync(h!.path, 'utf8').includes('<strong>valider</strong>'));
    assert.deepEqual(fs.readdirSync(t.exportsDir).sort(), ['CR du 12-03-20261121-170509-2.md', 'CR du 12-03-20261121-170509.html', 'CR du 12-03-20261121-170509.md']);

    assert.equal(await exportDocumentToFile(1, 'html', { version: '0.2.4', now: NOW, askWhere: true }), null, '« Enregistrer sous » annulé : aucun fichier');
    await assert.rejects(exportDocumentToFile(99, 'html', { version: '0.2.4' }), /introuvable/);
    // Un export ne modifie aucune donnée : rien de plus au journal.
    assert.equal(Number((await (await import('../src/data/db.ts')).query<{ n: number }>('SELECT count(*) AS n FROM activity_log'))[0].n), 2);
  } finally {
    t.close();
  }
});

test('E9 + E5 : le livrable importé de la V1 s\'exporte dans les deux formats', async () => {
  const t = await migratedDb();
  try {
    const bytes = fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures/v1-export-minimal.json'));
    await runImport({ name: 'v1.json', text: bytes.toString('utf8'), sha256: crypto.createHash('sha256').update(bytes).digest('hex') }, { now: NOW });
    const [doc] = await listDocuments();
    for (const f of ['markdown', 'html'] as const) {
      const saved = await exportDocumentToFile(doc.id, f, { version: '0.2.4', now: NOW });
      const text = fs.readFileSync(saved!.path, 'utf8');
      for (const line of SIG) assert.ok(text.includes(line), `${f} : ${line}`);
      assert.ok(text.length > 400);
    }
  } finally {
    t.close();
  }
});

test('jeu synthétique piégé : import puis export, HTML inerte et fichiers créés malgré un titre hostile et le nom « CON »', async () => {
  const t = await migratedDb();
  try {
    const bytes = fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures/v1-export-synthetic-trap.json'));
    await runImport({ name: 'trap.json', text: bytes.toString('utf8'), sha256: crypto.createHash('sha256').update(bytes).digest('hex') }, { now: NOW });
    const docs = await listDocuments();
    assert.equal(docs.length, 2);
    const names: string[] = [];
    for (const d of docs) {
      for (const f of ['markdown', 'html'] as const) {
        const saved = await exportDocumentToFile(d.id, f, { version: '0.2.4', now: NOW });
        names.push(saved!.name);
        const text = fs.readFileSync(saved!.path, 'utf8');
        for (const line of SIG) assert.ok(text.includes(line));
        if (f === 'html') {
          const tags = [...new Set([...text.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase()))].filter((x) => !ALLOWED_TAGS.has(x));
          assert.deepEqual(tags, []);
          assert.ok(!/<script|<iframe|<img|<svg|\sonerror=|\sonclick=|javascript:/i.test(text.replace(/&lt;[^]*?&gt;/g, '')));
        }
      }
    }
    assert.ok(names.some((n) => n.startsWith('_CON-')), names.join(' | '));
    assert.ok(names.some((n) => n.startsWith('Livrable piégé - b -test- b - « 12 »')) || names.some((n) => n.startsWith('Livrable piégé')), names.join(' | '));
    assert.equal(fs.readdirSync(t.exportsDir).length, 4);
  } finally {
    t.close();
  }
});
