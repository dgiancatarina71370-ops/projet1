// Modèle de document des exports (lot V2.3a) : le Markdown d'un livrable est analysé en blocs, que chaque format sait rendre.
// Analyse seule : `marked` ne produit jamais de HTML ici. Le HTML brut écrit dans un livrable n'est jamais interprété (décision D7).
// Ce modèle servira aussi aux rendus Word et PDF (lot V2.3b).
import { marked } from 'marked';

export type Inline =
  | { kind: 'text'; text: string; bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean }
  | { kind: 'link'; href: string; children: Inline[] }
  | { kind: 'break' };

export type Align = 'left' | 'center' | 'right' | null;

export interface ListItem {
  /** null : pas une case à cocher. */
  checked: boolean | null;
  blocks: Block[];
}

export type Block =
  | { kind: 'heading'; level: number; inlines: Inline[] }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { kind: 'table'; align: Align[]; header: Inline[][]; rows: Inline[][][] }
  | { kind: 'code'; text: string; lang: string }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'rule' };

/** Jeton de `marked` : seule la forme utilisée ici est décrite. */
interface Tok {
  type: string;
  text?: string;
  raw?: string;
  tokens?: Tok[];
  depth?: number;
  ordered?: boolean;
  start?: number | '';
  items?: Array<{ task?: boolean; checked?: boolean; tokens?: Tok[] }>;
  header?: Array<{ tokens?: Tok[]; text?: string }>;
  rows?: Array<Array<{ tokens?: Tok[]; text?: string }>>;
  align?: Align[];
  lang?: string;
  href?: string;
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** `marked` laisse les entités telles quelles dans le texte (« &amp; ») : on les décode, le rendu rééchappe ensuite. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body] ?? whole;
  });
}

/** Un lien n'est conservé que s'il est sûr : http, https, mailto, ancre ou chemin relatif. javascript:, data:, file:… sont écartés. */
export function isSafeHref(href: string): boolean {
  const h = href.trim().replace(/[\u0000-\u001f\u007f\s]/g, '');
  if (h === '') return false;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(h);
  if (!scheme) return true;
  return ['http', 'https', 'mailto'].includes(scheme[1].toLowerCase());
}

type Style = { bold?: boolean; italic?: boolean; strike?: boolean };

function inlines(tokens: Tok[] | undefined, style: Style = {}): Inline[] {
  const out: Inline[] = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'text':
        if (t.tokens && t.tokens.length > 0) out.push(...inlines(t.tokens, style));
        else out.push({ kind: 'text', text: decodeEntities(t.text ?? ''), ...style });
        break;
      case 'escape':
        out.push({ kind: 'text', text: t.text ?? '', ...style });
        break;
      case 'strong':
        out.push(...inlines(t.tokens, { ...style, bold: true }));
        break;
      case 'em':
        out.push(...inlines(t.tokens, { ...style, italic: true }));
        break;
      case 'del':
        out.push(...inlines(t.tokens, { ...style, strike: true }));
        break;
      case 'codespan':
        out.push({ kind: 'text', text: t.text ?? '', ...style, code: true });
        break;
      case 'br':
        out.push({ kind: 'break' });
        break;
      case 'link': {
        const children = inlines(t.tokens, style);
        if (t.href && isSafeHref(t.href)) out.push({ kind: 'link', href: t.href, children });
        else out.push(...children); // lien dangereux : le texte reste, le lien disparaît
        break;
      }
      case 'image':
        // Hors ligne : une image n'est jamais chargée ni intégrée ; son texte alternatif la remplace.
        out.push({ kind: 'text', text: `[image : ${decodeEntities(t.text ?? '').trim() || 'sans description'}]`, ...style, italic: true });
        break;
      case 'html': {
        const raw = t.raw ?? t.text ?? '';
        if (/^<br\s*\/?>$/i.test(raw.trim())) out.push({ kind: 'break' });
        else out.push({ kind: 'text', text: raw, ...style }); // HTML brut : conservé comme TEXTE, jamais interprété
        break;
      }
      case 'checkbox':
        break; // porté par ListItem.checked
      default:
        out.push({ kind: 'text', text: decodeEntities(t.text ?? t.raw ?? ''), ...style });
    }
  }
  return out;
}

function blocks(tokens: Tok[] | undefined): Block[] {
  const out: Block[] = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'space':
      case 'checkbox': // porté par ListItem.checked
        break;
      case 'heading':
        out.push({ kind: 'heading', level: Math.min(Math.max(t.depth ?? 1, 1), 6), inlines: inlines(t.tokens) });
        break;
      case 'paragraph':
        out.push({ kind: 'paragraph', inlines: inlines(t.tokens) });
        break;
      case 'text': // texte de bloc (listes serrées)
        out.push({ kind: 'paragraph', inlines: t.tokens ? inlines(t.tokens) : [{ kind: 'text', text: decodeEntities(t.text ?? '') }] });
        break;
      case 'list':
        out.push({
          kind: 'list',
          ordered: t.ordered === true,
          start: typeof t.start === 'number' ? t.start : 1,
          items: (t.items ?? []).map((i) => ({ checked: i.task ? i.checked === true : null, blocks: blocks(i.tokens) })),
        });
        break;
      case 'table':
        out.push({
          kind: 'table',
          align: (t.align ?? []).map((a) => a ?? null),
          header: (t.header ?? []).map((c) => inlines(c.tokens)),
          rows: (t.rows ?? []).map((r) => r.map((c) => inlines(c.tokens))),
        });
        break;
      case 'code':
        out.push({ kind: 'code', text: t.text ?? '', lang: (t.lang ?? '').split(/\s/)[0] });
        break;
      case 'blockquote':
        out.push({ kind: 'quote', blocks: blocks(t.tokens) });
        break;
      case 'hr':
        out.push({ kind: 'rule' });
        break;
      case 'html': // bloc HTML brut : jamais interprété, affiché comme texte
        out.push({ kind: 'paragraph', inlines: [{ kind: 'text', text: (t.raw ?? t.text ?? '').trim() }] });
        break;
      default:
        if (t.raw && t.raw.trim() !== '') out.push({ kind: 'paragraph', inlines: [{ kind: 'text', text: t.raw.trim() }] });
    }
  }
  return out;
}

export function parseMarkdown(markdown: string): Block[] {
  return blocks(marked.lexer(markdown.replace(/\r\n?/g, '\n')) as unknown as Tok[]);
}

/** Texte brut d'un contenu en ligne (pour les titres, les tests). */
export function plainText(list: Inline[]): string {
  return list.map((i) => (i.kind === 'text' ? i.text : i.kind === 'break' ? '\n' : plainText(i.children))).join('');
}
