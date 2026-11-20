// Une seule version pour l'exécutable, l'écran À propos et les exports : tauri.conf.json fait foi.
// Ce script échoue si package.json ou Cargo.toml portent un autre numéro. Usage : node scripts/check-versions.mjs [racine]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function readVersions(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const tauri = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8')).version;
  const cargoText = fs.readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
  const section = /\[package\]([\s\S]*?)(?:\n\[|$)/.exec(cargoText);
  const cargo = section ? /^\s*version\s*=\s*"([^"]+)"/m.exec(section[1])?.[1] : undefined;
  return { 'package.json': pkg, 'tauri.conf.json': tauri, 'Cargo.toml': cargo };
}

export function checkVersions(root) {
  const v = readVersions(root);
  const ref = v['tauri.conf.json'];
  const errors = [];
  if (!ref) errors.push('tauri.conf.json : version absente.');
  for (const [file, ver] of Object.entries(v)) {
    if (ver !== ref) errors.push(`${file} porte « ${ver ?? 'rien'} » au lieu de « ${ref} » (version de tauri.conf.json).`);
  }
  return errors;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(process.argv[2] ?? '.');
  const errors = checkVersions(root);
  if (errors.length) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  console.log('Versions alignées : ' + readVersions(root)['tauri.conf.json']);
}
