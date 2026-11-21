// Rendu HTML d'un document (lot V2.3a). Chaque texte est échappé ; aucune balise du livrable n'est reprise ; un seul bloc de signature.
import type { Block, Inline, ListItem } from './model.ts';
import { signatureLines } from '../shared/signature.ts';
import type { Signature } from '../shared/signature.ts';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inline(i: Inline): string {
  switch (i.kind) {
    case 'break':
      return '<br>';
    case 'link':
      return `<a href="${escapeHtml(i.href)}" rel="noopener noreferrer">${i.children.map(inline).join('')}</a>`;
    case 'text': {
      let h = escapeHtml(i.text).replace(/\n/g, '<br>');
      if (i.code) h = `<code>${h}</code>`;
      if (i.bold) h = `<strong>${h}</strong>`;
      if (i.italic) h = `<em>${h}</em>`;
      if (i.strike) h = `<del>${h}</del>`;
      return h;
    }
  }
}
const inlines = (l: Inline[]): string => l.map(inline).join('');

function item(i: ListItem): string {
  const box = i.checked === null ? '' : `<input type="checkbox" disabled${i.checked ? ' checked' : ''}> `;
  if (i.blocks.length === 0) return `<li>${box}</li>`;
  // Liste serrée : un seul paragraphe, sans <p> imbriqué. Plusieurs paragraphes : chacun garde son <p>.
  const loose = i.blocks.filter((x) => x.kind === 'paragraph').length > 1;
  const parts = i.blocks.map((x, n) => {
    const lead = n === 0 ? box : '';
    if (x.kind !== 'paragraph') return lead + block(x);
    return loose ? `<p>${lead}${inlines(x.inlines)}</p>` : lead + inlines(x.inlines);
  });
  return `<li>${parts.join('\n')}</li>`;
}

function block(b: Block): string {
  switch (b.kind) {
    case 'heading':
      return `<h${b.level}>${inlines(b.inlines)}</h${b.level}>`;
    case 'paragraph':
      return `<p>${inlines(b.inlines)}</p>`;
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      const start = b.ordered && b.start !== 1 ? ` start="${b.start}"` : '';
      return `<${tag}${start}>\n${b.items.map(item).join('\n')}\n</${tag}>`;
    }
    case 'table': {
      const al = (n: number) => (b.align[n] ? ` style="text-align:${b.align[n]}"` : '');
      const head = b.header.map((c, n) => `<th${al(n)}>${inlines(c)}</th>`).join('');
      const rows = b.rows.map((r) => `<tr>${r.map((c, n) => `<td${al(n)}>${inlines(c)}</td>`).join('')}</tr>`).join('\n');
      return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>`;
    }
    case 'code':
      return `<pre><code${b.lang ? ` class="language-${escapeHtml(b.lang.replace(/[^a-zA-Z0-9_+-]/g, ''))}"` : ''}>${escapeHtml(b.text)}</code></pre>`;
    case 'quote':
      return `<blockquote>\n${b.blocks.map(block).join('\n')}\n</blockquote>`;
    case 'rule':
      return '<hr>';
  }
}

const CSS = `body{font-family:Segoe UI,Arial,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;line-height:1.55;color:#1b2430}
h1,h2,h3{line-height:1.25}table{border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #b8c2d0;padding:.35rem .6rem;text-align:left}
pre{background:#f1f4f8;padding:.75rem;overflow:auto}code{font-family:Consolas,monospace}blockquote{margin:1rem 0;padding:.1rem 1rem;border-left:4px solid #b8c2d0;color:#44505f}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid #b8c2d0;font-size:.85rem;color:#44505f}`;

/** Document HTML complet et autonome (aucune ressource externe). `generatedIso` : date de génération en ISO 8601 UTC. */
export function renderHtml(title: string, blocks: Block[], sig: Signature, generatedIso: string): string {
  const footer = signatureLines(sig).map((l, n) => (n === 0 ? `<strong>${escapeHtml(l)}</strong>` : escapeHtml(l))).join('<br>\n');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="generator" content="${escapeHtml(`${sig.name} — ${sig.author} — ${sig.version}`)}">
<meta name="generated" content="${escapeHtml(generatedIso)}">
<style>${CSS}</style>
</head>
<body>
<main>
${blocks.map(block).join('\n')}
</main>
<footer>
${footer}
</footer>
</body>
</html>
`;
}
