// Garde de la politique CI (V1-D15) : le contrôle des types ne doit pas redevenir non bloquant par accident.
// Le fichier du workflow est lu comme du texte ; aucune dépendance supplémentaire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const workflow = readFileSync(path.join(ROOT, '.github', 'workflows', 'build.yml'), 'utf8');

/** Bloc d'un job : de « ␣␣nom: » jusqu'au prochain job de premier niveau (ou la fin du fichier). */
function jobBlock(name: string): string {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `  ${name}:`);
  assert.ok(start >= 0, `le job « ${name} » est absent de build.yml`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

/** Lignes de code uniquement (les commentaires peuvent citer le mot sans l'activer). */
const code = (text: string) => text.split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n');

test('CI : aucune étape n\'est marquée continue-on-error (le contrôle des types ne peut pas redevenir non bloquant)', () => {
  assert.doesNotMatch(code(workflow), /continue-on-error/);
});

test('CI : un job « types » séparé lance npm run typecheck, et « verify » ne le porte plus', () => {
  assert.match(code(jobBlock('types')), /run:\s*npm run typecheck\s*$/m);
  assert.doesNotMatch(code(jobBlock('verify')), /typecheck/);
});

test('CI : « build » et « rust-tests » ne dépendent que de « verify » (l\'exécutable reste produit si les types échouent)', () => {
  for (const job of ['build', 'rust-tests']) {
    const needs = code(jobBlock(job)).match(/^\s+needs:\s*(.+)$/m);
    assert.ok(needs, `le job « ${job} » doit déclarer needs`);
    assert.equal(needs[1].trim(), 'verify', `le job « ${job} » ne doit dépendre que de verify`);
  }
});
