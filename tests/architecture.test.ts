// Exigence E13 : les règles d'architecture sont vérifiées par un script qui bloque la livraison.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir } from './helpers/setup.ts';
import { checkArchitecture } from '../scripts/check-architecture.mjs';
import { checkVersions } from '../scripts/check-versions.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function fixture(files: Record<string, string>): string {
  const root = tempDir();
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

const rulesOf = (root: string) => checkArchitecture(root).map((v: { rule: string }) => v.rule).sort();

test('le dépôt réel respecte toutes les règles', () => {
  assert.deepEqual(checkArchitecture(ROOT), []);
});

test('R1 : un module qui importe un autre module est détecté', () => {
  const root = fixture({ 'src/modules/a/x.ts': "import { y } from '../b/y.ts';", 'src/modules/b/y.ts': 'export const y = 1;' });
  assert.deepEqual(rulesOf(root), ['R1-module-isolation']);
});

test('R1 : l\'alias @/ est résolu aussi', () => {
  const root = fixture({ 'src/modules/a/x.ts': "import { y } from '@/modules/b/y';", 'src/modules/b/y.ts': 'export const y = 1;' });
  assert.deepEqual(rulesOf(root), ['R1-module-isolation']);
});

test('R2 et R3 : un module n\'importe pas app/, data/ n\'importe pas les couches hautes', () => {
  const root = fixture({
    'src/modules/a/x.ts': "import '../../app/App.tsx';",
    'src/app/App.tsx': 'export {};',
    'src/data/d.ts': "import '../modules/a/x.ts';",
  });
  assert.deepEqual(rulesOf(root), ['R2-modules-not-app', 'R3-data-lowest']);
});

test('R4 : shared/ ne dépend que de shared/', () => {
  const root = fixture({ 'src/shared/s.ts': "import '../data/db.ts';", 'src/data/db.ts': 'export {};' });
  assert.deepEqual(rulesOf(root), ['R4-shared-leaf']);
});

test('R6 : un module ou un dépôt qui touche le moteur sans passer par query() et mutate() est détecté', () => {
  const root = fixture({
    'src/data/internal.ts': 'export const rawExecute = 1;',
    'src/data/repositories/r.ts': "import { rawExecute } from '../internal.ts';",
    'src/modules/m/x.ts': "import { rawExecute } from '../../data/internal.ts';",
    'src/data/mutate.ts': "import { rawExecute } from './internal.ts';",
  });
  assert.deepEqual(rulesOf(root), ['R6-raw-engine-access', 'R6-raw-engine-access']);
});

test('R7 : Tauri n\'est appelé que par tauri-driver.ts', () => {
  const root = fixture({
    'src/modules/m/x.ts': "const g = window.__TAURI__; import('@tauri-apps/api/core');",
    'src/data/tauri-driver.ts': 'const t = globalThis.__TAURI__;',
  });
  assert.deepEqual(rulesOf(root), ['R7-tauri-isolation']);
});

test('R8 : une écriture SQL hors de src/data/ est détectée, un commentaire ne compte pas', () => {
  const root = fixture({
    'src/modules/m/x.ts': "const q = 'INSERT INTO projects (name) VALUES (1)';",
    'src/modules/m/y.ts': "// INSERT INTO projects (name) VALUES (1)\nconst ok = 'SELECT * FROM projects';",
    'src/data/repositories/p.ts': "const q = 'INSERT INTO projects (name) VALUES (1)';",
  });
  assert.deepEqual(rulesOf(root), ['R8-sql-writes-in-data']);
});

test('versions : alignées dans le dépôt réel, écart détecté sinon', () => {
  assert.deepEqual(checkVersions(ROOT), []);
  const root = fixture({
    'package.json': '{"version":"1.0.0"}',
    'src-tauri/tauri.conf.json': '{"version":"1.0.1"}',
    'src-tauri/Cargo.toml': '[package]\nname = "x"\nversion = "1.0.1"\n\n[dependencies]\nfoo = { version = "9" }\n',
  });
  const errors = checkVersions(root);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /package\.json/);
});

test('R9 : la couche domain est pure (ni base, ni interface, ni paquet externe)', () => {
  const ok = fixture({ 'src/domain/a.ts': "import { b } from './b.ts';", 'src/domain/b.ts': 'export const b = 1;' });
  assert.deepEqual(rulesOf(ok), []);
  const bad = fixture({
    'src/domain/a.ts': "import { query } from '../data/db.ts';",
    'src/domain/b.ts': "import { marked } from 'marked';",
    'src/domain/c.ts': "import '../shared/plural.ts';",
    'src/data/db.ts': 'export const query = 1;',
    'src/shared/plural.ts': 'export {};',
  });
  assert.deepEqual(rulesOf(bad), ['R9-domain-pure', 'R9-domain-pure', 'R9-domain-pure']);
});

test('R9 : la couche data et la couche app peuvent importer domain', () => {
  const root = fixture({ 'src/domain/k.ts': 'export const k = 1;', 'src/data/r.ts': "import { k } from '../domain/k.ts';", 'src/app/A.tsx': "import { k } from '../domain/k.ts';" });
  assert.deepEqual(rulesOf(root), []);
});
