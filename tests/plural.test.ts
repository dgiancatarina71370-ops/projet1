// Correction de la coquille « 1 étapes PSPO déjà présentes » : accord en nombre et en genre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plural, count } from '../src/shared/plural.ts';
import { buildPlan, keptSentence } from '../src/data/import-v1.ts';
import { parseV1Export } from '../src/data/import-v1-parse.ts';

test('plural : 0 et 1 au singulier, 2 et plus au pluriel (usage français)', () => {
  assert.equal(plural(0, 'étape', 'étapes'), 'étape');
  assert.equal(plural(1, 'étape', 'étapes'), 'étape');
  assert.equal(plural(2, 'étape', 'étapes'), 'étapes');
  assert.equal(plural(11, 'étape', 'étapes'), 'étapes');
  assert.equal(count(1, 'étape', 'étapes'), '1 étape');
  assert.equal(count(3, 'étape', 'étapes'), '3 étapes');
});

test('la phrase « déjà présentes » s\'accorde : 1 étape PSPO au singulier féminin, plusieurs au pluriel', async () => {
  const text = JSON.stringify({ format: 'ba-mentor-v1-export', formatVersion: 1, exportedAt: '2026-04-01T08:00:00.000Z', state: { pspo: { p1: true, p2: true, p3: false }, settings: { author: 'X' }, theme: 'dark' } });
  const parsed = await parseV1Export({ text, sha256: 'x' });
  const base = { nextProjectId: 1, nextDocumentId: 1, settings: new Set<string>(), flags: new Set<string>(), emails: new Set<string>(), pspo: new Set<string>(), dodCount: 0, notesExist: false };
  const one = buildPlan(parsed, { ...base, pspo: new Set(['p1']), settings: new Set(['author', 'theme']) }, '2026-11-21T00:00:00.000Z');
  assert.deepEqual(one.kept.map(keptSentence), ['1 étape PSPO déjà présente : conservée telle quelle, non écrasée.', '2 réglages déjà présents : conservés tels quels, non écrasés.']);
  const many = buildPlan(parsed, { ...base, pspo: new Set(['p1', 'p2', 'p3']) }, '2026-11-21T00:00:00.000Z');
  assert.deepEqual(many.kept.map(keptSentence), ['3 étapes PSPO déjà présentes : conservées telles quelles, non écrasées.']);
  assert.ok(![...one.kept, ...many.kept].some((k) => /1 étapes/.test(keptSentence(k))));
});
