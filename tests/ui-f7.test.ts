// Lot F7 : rendu statique de la section « Historique » (décisions F7-D01, F7-D02, F7-D04, F7-D05).
// Aucun clic simulé : le bouton « Afficher les suivantes », le rafraîchissement après écriture et la place dans la fiche se vérifient à la recette sur clé (TESTS-F7.md).
// Si esbuild est introuvable, les rendus sont « ignorés ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRender } from './helpers/ui-loader.ts';
import { HISTORY_EMPTY, HISTORY_LIMIT_NOTE, historyCountText, moreLabel } from '../src/app/history-logic.ts';

interface Render {
  history: (p: { lines: Array<{ id: number; when: string; text: string }>; countText: string; emptyText: string; limitNote: string; moreLabel: string | null; busy?: boolean; error?: string }) => string;
}

const render = loadRender<Render>();
const ui = (name: string, fn: (r: Render) => void) => test(name, { skip: render === null ? 'esbuild introuvable : rendu des écrans non vérifié' : false }, () => fn(render as Render));

// React écrit l'apostrophe « &#x27; » dans le HTML statique : on la rétablit pour comparer les textes.
const plain = (html: string): string => html.replace(/&#x27;/g, "'");

const lines = [
  { id: 9, when: '28/11/2026 11:40:02', text: 'Lien ajouté : implémentée par US-001' },
  { id: 5, when: '28/11/2026 11:39:10', text: 'Statut : Brouillon → Validé' },
  { id: 1, when: '28/11/2026 11:30:00', text: 'Créé' },
];

ui('rendu : titre, nombre, lignes dans l\'ordre reçu, bouton, phrase de limite', (r) => {
  const html = plain(r.history({ lines, countText: historyCountText(13), emptyText: HISTORY_EMPTY, limitNote: HISTORY_LIMIT_NOTE, moreLabel: moreLabel(13, 3) }));
  assert.match(html, /<section[^>]*aria-label="Historique"/);
  assert.match(html, /<h4[^>]*>Historique<\/h4>/);
  assert.ok(html.includes('13 entrées'));
  assert.equal((html.match(/<li/g) ?? []).length, 3);
  assert.ok(html.indexOf('Lien ajouté') < html.indexOf('Statut :') && html.indexOf('Statut :') < html.indexOf('Créé'), 'ordre conservé');
  assert.ok(html.includes('28/11/2026 11:40:02'));
  assert.ok(html.includes('Afficher les 10 suivantes'));
  assert.ok(html.includes(HISTORY_LIMIT_NOTE), 'la limite est toujours visible');
  assert.ok(html.includes('Brouillon → Validé'));
});

ui('rendu : liste vide, sans bouton, avec la phrase de limite', (r) => {
  const html = plain(r.history({ lines: [], countText: historyCountText(0), emptyText: HISTORY_EMPTY, limitNote: HISTORY_LIMIT_NOTE, moreLabel: null }));
  assert.ok(html.includes(HISTORY_EMPTY));
  assert.ok(!html.includes('<ul'));
  assert.ok(!html.includes('<button'));
  assert.ok(html.includes(HISTORY_LIMIT_NOTE));
});

ui('rendu : dernière tranche sans bouton ; erreur annoncée ; bouton désactivé pendant la lecture', (r) => {
  const done = r.history({ lines, countText: historyCountText(3), emptyText: HISTORY_EMPTY, limitNote: HISTORY_LIMIT_NOTE, moreLabel: moreLabel(3, 3) });
  assert.ok(!done.includes('<button'));
  const busy = r.history({ lines, countText: historyCountText(13), emptyText: HISTORY_EMPTY, limitNote: HISTORY_LIMIT_NOTE, moreLabel: 'Afficher les 10 suivantes', busy: true });
  assert.match(busy, /<button[^>]*disabled/);
  const err = r.history({ lines, countText: historyCountText(3), emptyText: HISTORY_EMPTY, limitNote: HISTORY_LIMIT_NOTE, moreLabel: null, error: 'Lecture impossible' });
  assert.match(err, /role="alert"[^>]*>Lecture impossible/);
});

ui('rendu : le texte d\'une ligne est échappé', (r) => {
  const html = r.history({ lines: [{ id: 1, when: 'x', text: '<b>x</b>' }], countText: '1 entrée', emptyText: HISTORY_EMPTY, limitNote: HISTORY_LIMIT_NOTE, moreLabel: null });
  assert.ok(!html.includes('<b>x</b>') && html.includes('&lt;b&gt;'));
});
