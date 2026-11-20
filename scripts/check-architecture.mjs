// Vérificateur des règles d'architecture (exigence E13). Échoue (code 1) à la moindre violation.
// Usage : node scripts/check-architecture.mjs [racine]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const posix = (p) => p.split(path.sep).join('/');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function importsOf(code) {
  const specs = [];
  const re = /(?:from\s+|import\s+|import\(\s*|require\(\s*)['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code))) specs.push(m[1]);
  return specs;
}

function resolveTarget(fromRel, spec) {
  let t;
  if (spec.startsWith('@/')) t = 'src/' + spec.slice(2);
  else if (spec.startsWith('.')) t = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  else return null; // paquet externe
  return t.replace(/\.(ts|tsx|js|jsx)$/, '');
}

const WRITE_SQL = /\b(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)\b/i;
const DATA_INFRA = ['src/data/internal', 'src/data/tauri-driver', 'src/data/migrate'];

export function checkArchitecture(root) {
  const violations = [];
  const add = (rule, file, message) => violations.push({ rule, file, message });
  const files = walk(path.join(root, 'src'));

  for (const abs of files) {
    const rel = posix(path.relative(root, abs));
    const parts = rel.split('/'); // src/<layer>/...
    const layer = parts[1];
    const mod = layer === 'modules' ? parts[2] : null;
    const code = stripComments(fs.readFileSync(abs, 'utf8'));

    // R7 : seul tauri-driver.ts parle à Tauri.
    if (rel !== 'src/data/tauri-driver.ts' && (/__TAURI__/.test(code) || /@tauri-apps\//.test(code))) {
      add('R7-tauri-isolation', rel, 'Seul src/data/tauri-driver.ts peut appeler Tauri.');
    }
    // R8 : pas d'écriture SQL en dehors de src/data/.
    if (layer !== 'data' && WRITE_SQL.test(code)) {
      add('R8-sql-writes-in-data', rel, 'Une instruction SQL d\'écriture doit vivre dans un dépôt de src/data/repositories/.');
    }

    for (const spec of importsOf(code)) {
      const target = resolveTarget(rel, spec);
      if (!target) continue;
      const tp = target.split('/');
      const tLayer = tp[1];
      const tMod = tLayer === 'modules' ? tp[2] : null;

      // R1 : un module n'importe jamais un autre module.
      if (layer === 'modules' && tLayer === 'modules' && tMod !== mod) {
        add('R1-module-isolation', rel, `Le module « ${mod} » importe le module « ${tMod} ». Passer par shared/ ou data/.`);
      }
      // R2 : un module n'importe pas app/.
      if (layer === 'modules' && tLayer === 'app') add('R2-modules-not-app', rel, 'Un module n\'importe pas src/app/.');
      // R3 : data/ ne dépend d'aucune couche supérieure.
      if (layer === 'data' && ['modules', 'app', 'ai', 'export'].includes(tLayer)) {
        add('R3-data-lowest', rel, `src/data/ ne peut pas importer src/${tLayer}/.`);
      }
      // R4 : shared/ ne dépend que de shared/.
      if (layer === 'shared' && tLayer !== 'shared') add('R4-shared-leaf', rel, `src/shared/ ne peut pas importer src/${tLayer}/.`);
      // R6 : l'accès brut au moteur est réservé à data/ (db, mutate, migrate) et au démarrage de l'application.
      if (DATA_INFRA.includes(target)) {
        const allowedData = ['src/data/db.ts', 'src/data/mutate.ts', 'src/data/migrate.ts', 'src/data/internal.ts', 'src/data/tauri-driver.ts', 'src/data/backup-service.ts'];
        const inRepo = rel.startsWith('src/data/repositories/');
        const okLayer = layer === 'app' || (layer === 'data' && (allowedData.includes(rel) || rel.startsWith('src/data/migrations/')));
        if (!okLayer || inRepo) {
          add('R6-raw-engine-access', rel, `Accès brut au moteur (${target.replace('src/data/', '')}) interdit ici : lire par query(), écrire par mutate().`);
        }
      }
    }
  }
  return violations;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(process.argv[2] ?? '.');
  const v = checkArchitecture(root);
  if (v.length === 0) {
    console.log('Architecture : aucune violation.');
  } else {
    for (const x of v) console.error(`[${x.rule}] ${x.file} : ${x.message}`);
    console.error(`\n${v.length} violation(s).`);
    process.exit(1);
  }
}
