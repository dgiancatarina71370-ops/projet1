// Lot F4 : rendu statique des écrans Journal et À propos, et du menu (décisions F4-D01, F4-D02, F4-D04, F4-D05, F4-D07, F4-D09, F4-D10).
// Aucun clic simulé : pagination, filtres et code cliquable se vérifient à la recette sur clé (TESTS-F4.md). Si esbuild est introuvable, les rendus sont « ignorés ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRender } from './helpers/ui-loader.ts';
import { journalLine } from '../src/modules/journal/logic.ts';
import type { JournalLine, JournalRowInput } from '../src/modules/journal/logic.ts';

type Props = { projectName: string; lines: JournalLine[]; total: number; unfilteredTotal: number; page: number; pages: number; group: string; action: string };
interface Render {
  journal: (p: Props) => string;
  about: (p: { version: string; buildDate: string; dataDir: string; schema: number | null }) => string;
  shell: (p: { navigable: boolean; screen: string; projects: Array<{ id: number; name: string }>; activeId: number | null }) => string;
}

const render = loadRender<Render>();
const ui = (name: string, fn: (r: Render) => void) => test(name, { skip: render === null ? 'esbuild introuvable : rendu des écrans non vérifié' : false }, () => fn(render as Render));

const row = (over: Partial<JournalRowInput>): JournalRowInput => ({
  id: 1, at: '2026-11-27T14:08:09.000Z', object_type: 'item', object_id: 5, action: 'created', detail: 'requirement',
  item_kind: 'requirement', item_code: 'EX-009', item_title: 'Test F4', link_type: null, from_code: null, to_code: null, document_name: null, project_name: null, ...over,
});
const base = { projectName: 'Exemple', unfilteredTotal: 118, group: 'all', action: 'all' };

ui('rendu journal : filtres, lignes, pagination d\'une page du milieu', (r) => {
  const lines = [
    journalLine(row({ id: 5, object_type: 'link', object_id: 9, detail: 'derives', item_kind: null, item_code: null, item_title: null, link_type: 'derives', from_code: 'BES-001', to_code: 'EX-001' })),
    journalLine(row({ id: 4, action: 'updated', detail: 'title,priority' })),
    journalLine(row({ id: 3, action: 'status_changed', detail: 'draft>validated' })),
    journalLine(row({ id: 2, action: 'deleted', detail: 'risk', item_kind: null, item_code: null, item_title: null })),
  ];
  const html = r.journal({ ...base, lines, total: 118, page: 2, pages: 5 });
  assert.match(html, /<label[^>]*for="journal-group"[^>]*>Type d’objet</);
  assert.match(html, /<label[^>]*for="journal-action"[^>]*>Action</);
  for (const t of ['>Tous<', '>Éléments<', '>Liens<', '>Documents<', '>Projet<', '>Toutes<', '>Créé<', '>Modifié<', '>Statut changé<', '>Supprimé<', '>Importé<']) assert.ok(html.includes(t), t);
  assert.equal((html.match(/<tr class="border-t/g) ?? []).length, 4, 'quatre lignes');
  assert.ok(html.includes('BES-001 → EX-001') && html.includes('dérive en'));
  assert.ok(html.includes('Champs : Titre, Priorité'));
  assert.ok(html.includes('Brouillon → Validé'));
  assert.ok(html.includes('Risque supprimé'));
  assert.equal((html.match(/>EX-009</g) ?? []).length, 2, 'deux lignes cliquables (modifié, statut) ; lien et suppression sans bouton');
  assert.ok(html.includes('Page 2 sur 5 · 118 entrées'));
  assert.ok(!/<button[^>]*disabled=""[^>]*>Précédent/.test(html) && !/<button[^>]*disabled=""[^>]*>Suivant/.test(html), 'page du milieu : les deux boutons actifs');
  assert.match(html, /\d{2}\/\d{2}\/2026 \d{2}:\d{2}:\d{2}/);
});

ui('rendu journal : première et dernière page désactivent Précédent puis Suivant', (r) => {
  const first = r.journal({ ...base, lines: [journalLine(row({}))], total: 118, page: 1, pages: 5 });
  assert.match(first, /<button[^>]*disabled=""[^>]*>Précédent/);
  assert.ok(!/<button[^>]*disabled=""[^>]*>Suivant/.test(first));
  const last = r.journal({ ...base, lines: [journalLine(row({}))], total: 118, page: 5, pages: 5 });
  assert.match(last, /<button[^>]*disabled=""[^>]*>Suivant/);
});

ui('rendu journal : filtres sans résultat, journal vide, jamais « Page 1 sur 0 »', (r) => {
  const none = r.journal({ ...base, lines: [], total: 0, page: 1, pages: 1, group: 'document' });
  assert.ok(none.includes('Aucune entrée pour ces filtres (118 au total dans ce projet).'));
  assert.ok(none.includes('Page 1 sur 1 · 0 entrée'));
  assert.match(none, /<option value="document" selected="">Documents</);
  const empty = r.journal({ ...base, unfilteredTotal: 0, lines: [], total: 0, page: 1, pages: 1 });
  assert.ok(empty.includes('Aucune entrée dans le journal de ce projet.'));
  assert.ok(!empty.includes('Page 1 sur 0'));
});

ui('rendu à propos : les quatre lignes d\'identité, le schéma et le dossier de données', (r) => {
  const html = r.about({ version: '0.14.0', buildDate: '2026-11-27 15:00 UTC', dataDir: 'E:\\BAMentorData', schema: 7 });
  assert.ok(html.includes('0.14.0'));
  assert.ok(html.includes('version 7') && html.includes('E:\\BAMentorData') && html.includes('Compilation'));
});

ui('rendu menu : Journal dans Contrôle après Traçabilité, Technique puis À propos en fin de menu', (r) => {
  const html = r.shell({ navigable: true, screen: 'journal', projects: [{ id: 1, name: 'P' }], activeId: 1 });
  const at = (t: string) => html.indexOf(`>${t}<`);
  assert.ok(at('Traçabilité') > 0 && at('Traçabilité') < at('Journal') && at('Journal') < at('Technique') && at('Technique') < at('À propos'));
  assert.match(html, /aria-current="page"[^>]*>Journal</);
  assert.ok(at('Contrôle') > 0 && at('Contrôle') < at('Traçabilité'));
});
