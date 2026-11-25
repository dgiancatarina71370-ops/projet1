// Chargement du rendu statique des écrans (partagé par les tests d'interface). Compile tests/helpers/ui-entry.tsx avec esbuild, déjà présent avec Vite.
// Si l'outil est introuvable, le chargement retourne null et les tests concernés sont signalés « ignorés », jamais « réussis ».
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

function findEsbuild(): string | null {
  const names = process.platform === 'win32' ? ['esbuild.cmd', 'esbuild.exe', 'esbuild'] : ['esbuild'];
  const dirs = [path.join(root, 'node_modules', '.bin'), '/opt/npm-tools/node_modules/.bin'];
  for (const d of dirs) for (const n of names) if (fs.existsSync(path.join(d, n))) return path.join(d, n);
  return null;
}

export function loadRender<T>(): T | null {
  const bin = findEsbuild();
  if (!bin) return null;
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bamentor-ui-')), 'ui.cjs');
  execFileSync(bin, [path.join(here, 'ui-entry.tsx'), '--bundle', '--platform=node', '--format=cjs', '--jsx=automatic', `--outfile=${out}`, '--log-level=error'], { cwd: root, stdio: 'pipe', shell: process.platform === 'win32' });
  return (createRequire(import.meta.url)(out) as { render: T }).render;
}
