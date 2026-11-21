// Rendu Word (.docx) du modèle de blocs (lot V2.3b). Même contenu que l'HTML : le texte saisi dans un livrable n'est jamais interprété,
// les images sont remplacées par leur texte alternatif (modèle), seuls les liens http, https et mailto deviennent des liens Word.
// Les ancres et chemins relatifs n'ont pas de cible dans un document Word : leur texte reste, sans lien.
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableLayoutType,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { ILevelsOptions } from 'docx';
import type { Align, Block, Inline, ListItem } from './model.ts';
import type { Signature } from '../shared/signature.ts';

type Child = Paragraph | Table;
type Run = TextRun | ExternalHyperlink;

const FONT = 'Calibri';
const MONO = 'Consolas';
const CONTENT_WIDTH = 9638; // A4 (11906) moins deux marges de 2 cm (1134), en vingtièmes de point
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

/** Retire ce que XML 1.0 interdit (sinon Word propose de « réparer » le fichier) : caractères de contrôle, demi-paires de substitution. */
export function xmlSafe(s: string): string {
  return s
    .replace(/\t/g, '    ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');
}

const softWrap = (s: string): string => xmlSafe(s).replace(/\s*\n\s*/g, ' ');

interface RunStyle {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: boolean;
  headerCell?: boolean;
}

const isWordLink = (href: string): boolean => /^(https?|mailto):/i.test(href.trim());

function runs(list: Inline[], base: RunStyle = {}): Run[] {
  const out: Run[] = [];
  for (const i of list) {
    if (i.kind === 'break') {
      out.push(new TextRun({ break: 1 }));
    } else if (i.kind === 'link') {
      if (isWordLink(i.href)) out.push(new ExternalHyperlink({ link: i.href.trim(), children: runs(i.children, { ...base, link: true }) as TextRun[] }));
      else out.push(...runs(i.children, base));
    } else {
      const bold = i.bold || base.bold;
      const italic = i.italic || base.italic;
      out.push(
        new TextRun({
          text: softWrap(i.text),
          bold: bold || undefined,
          italics: italic || undefined,
          strike: i.strike || base.strike || undefined,
          font: i.code || base.code ? MONO : undefined,
          shading: i.code ? { type: ShadingType.CLEAR, fill: 'EDEDED', color: 'auto' } : undefined,
          color: base.link ? '0563C1' : undefined,
          underline: base.link ? {} : undefined,
        }),
      );
    }
  }
  return out;
}

interface Ctx {
  /** Profondeur de liste (0 hors liste). */
  depth: number;
  /** Profondeur de citation (0 hors citation). */
  quote: number;
  /** Listes numérotées rencontrées : chacune redémarre à son numéro de départ. */
  ordered: Array<{ reference: string; start: number; depth: number }>;
}

const quoteBorder = (q: number) => (q > 0 ? { left: { style: BorderStyle.SINGLE, size: 12, color: 'A0A0A0', space: 8 } } : undefined);
const indentLeft = (ctx: Ctx, extra = 0): number => ctx.quote * 567 + ctx.depth * 720 + extra;

function paragraph(inl: Inline[], ctx: Ctx, extra: { numbering?: { reference: string; level: number }; prefix?: string; hanging?: boolean } = {}): Paragraph {
  const children = runs(inl);
  if (extra.prefix) children.unshift(new TextRun({ text: extra.prefix, font: 'Segoe UI Symbol' }));
  return new Paragraph({
    children,
    numbering: extra.numbering,
    border: quoteBorder(ctx.quote),
    indent: extra.numbering ? undefined : { left: indentLeft(ctx, extra.hanging ? 720 : 0), hanging: extra.hanging ? 360 : undefined },
    spacing: { after: 120 },
  });
}

const alignOf = (a: Align | undefined) => (a === 'center' ? AlignmentType.CENTER : a === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT);

function table(b: Extract<Block, { kind: 'table' }>): Table {
  const cols = Math.max(b.header.length, ...b.rows.map((r) => r.length), 1);
  const w = Math.floor(CONTENT_WIDTH / cols);
  const cell = (content: Inline[] | undefined, col: number, header: boolean) =>
    new TableCell({
      width: { size: w, type: WidthType.DXA },
      shading: header ? { type: ShadingType.CLEAR, fill: 'E7ECF4', color: 'auto' } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ alignment: alignOf(b.align[col]), children: runs(content ?? [], header ? { bold: true } : {}) })],
    });
  const row = (cells: Inline[][], header: boolean) => new TableRow({ tableHeader: header, cantSplit: true, children: Array.from({ length: cols }, (_, c) => cell(cells[c], c, header)) });
  return new Table({
    width: { size: w * cols, type: WidthType.DXA },
    columnWidths: Array.from({ length: cols }, () => w),
    layout: TableLayoutType.FIXED,
    rows: [row(b.header, true), ...b.rows.map((r) => row(r, false))],
  });
}

function listItem(item: ListItem, ordered: boolean, ref: string, ctx: Ctx): Child[] {
  const inner: Ctx = { ...ctx, depth: ctx.depth + 1 };
  const out: Child[] = [];
  const [first, ...rest] = item.blocks;
  const task = item.checked === null ? undefined : item.checked ? '☑ ' : '☐ ';
  if (first && first.kind === 'paragraph') {
    if (task) out.push(paragraph(first.inlines, ctx, { prefix: task, hanging: true }));
    else out.push(paragraph(first.inlines, ctx, { numbering: { reference: ordered ? ref : 'bullets', level: ordered ? 0 : Math.min(ctx.depth, 5) } }));
  } else {
    // Item sans paragraphe de tête (liste imbriquée seule, ou vide) : une puce vide garde le rang.
    out.push(paragraph([], ctx, task ? { prefix: task, hanging: true } : { numbering: { reference: ordered ? ref : 'bullets', level: ordered ? 0 : Math.min(ctx.depth, 5) } }));
    if (first) rest.unshift(first);
  }
  for (const b of rest) out.push(...block(b, inner));
  return out;
}

function block(b: Block, ctx: Ctx): Child[] {
  switch (b.kind) {
    case 'heading':
      return [new Paragraph({ heading: HEADINGS[b.level - 1], children: runs(b.inlines), border: quoteBorder(ctx.quote), indent: { left: indentLeft(ctx) }, keepNext: true })];
    case 'paragraph':
      return [paragraph(b.inlines, ctx)];
    case 'list': {
      const ref = `ol-${ctx.ordered.length}`;
      if (b.ordered) ctx.ordered.push({ reference: ref, start: b.start, depth: ctx.depth });
      return b.items.flatMap((i) => listItem(i, b.ordered, ref, ctx));
    }
    case 'table':
      return [table(b), new Paragraph({ spacing: { after: 120 }, children: [] })];
    case 'code': {
      const lines = xmlSafe(b.text).split('\n');
      return [
        new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
          border: quoteBorder(ctx.quote),
          indent: { left: indentLeft(ctx) },
          spacing: { after: 160 },
          children: lines.map((l, i) => new TextRun({ text: l, font: MONO, size: 19, break: i === 0 ? undefined : 1 })),
        }),
      ];
    }
    case 'quote':
      return b.blocks.flatMap((x) => block(x, { ...ctx, quote: ctx.quote + 1 }));
    case 'rule':
      return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } }, spacing: { before: 120, after: 120 }, children: [] })];
  }
}

export interface DocxInput {
  title: string;
  blocks: Block[];
  signature: Signature;
  /** Instant ISO de génération (métadonnées). */
  iso: string;
  /** Numéro de version seul (« 0.2.5 »), pour les propriétés personnalisées. */
  version: string;
}

/** Document Word signé : contenu, puis bloc de signature complet (4 lignes), pied de page court, propriétés du document. */
export async function renderDocx(input: DocxInput): Promise<Uint8Array> {
  const sig = input.signature;
  const ctx: Ctx = { depth: 0, quote: 0, ordered: [] };
  const body: Child[] = input.blocks.flatMap((b) => block(b, ctx));

  body.push(new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 6 } }, spacing: { before: 480, after: 60 }, children: [] }));
  [sig.name, sig.author, sig.version, sig.generatedAt].forEach((line, i) =>
    body.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: line, size: 18, color: '595959', bold: i === 0 })] })),
  );

  const bulletLevels: ILevelsOptions[] = Array.from({ length: 6 }, (_, l) => ({
    level: l,
    format: LevelFormat.BULLET,
    text: ['•', '◦', '▪'][l % 3],
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } },
  }));

  const doc = new Document({
    creator: sig.name,
    lastModifiedBy: sig.name,
    title: xmlSafe(input.title),
    description: `${sig.author} — ${sig.version} — ${sig.generatedAt}`,
    customProperties: [
      { name: 'BAMentorGenerator', value: sig.name },
      { name: 'BAMentorVersion', value: input.version },
      { name: 'BAMentorGeneratedAt', value: input.iso },
    ],
    styles: {
      paragraphStyles: [{ id: 'BAMentorFooter', name: 'BA-Mentor pied de page', basedOn: 'Normal', run: { size: 16, color: '7F7F7F' } }],
      default: {
        document: { run: { font: FONT, size: 22, language: { value: 'fr-FR' } } },
        heading1: { run: { font: FONT, size: 34, bold: true, color: '1F3864' }, paragraph: { spacing: { before: 320, after: 140 } } },
        heading2: { run: { font: FONT, size: 28, bold: true, color: '1F3864' }, paragraph: { spacing: { before: 260, after: 120 } } },
        heading3: { run: { font: FONT, size: 24, bold: true, color: '2F5496' }, paragraph: { spacing: { before: 200, after: 100 } } },
        heading4: { run: { font: FONT, size: 22, bold: true, color: '2F5496' }, paragraph: { spacing: { before: 160, after: 80 } } },
        heading5: { run: { font: FONT, size: 22, bold: true, italics: true, color: '2F5496' }, paragraph: { spacing: { before: 140, after: 80 } } },
        heading6: { run: { font: FONT, size: 22, italics: true, color: '2F5496' }, paragraph: { spacing: { before: 120, after: 80 } } },
      },
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: bulletLevels },
        ...ctx.ordered.map((o) => ({
          reference: o.reference,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              start: o.start,
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720 * (o.depth + 1), hanging: 360 } } },
            },
          ],
        })),
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                style: 'BAMentorFooter',
                children: [
                  new TextRun({ text: `${sig.name} — ${sig.version} — Page `, size: 16, color: '7F7F7F' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '7F7F7F' }),
                  new TextRun({ text: ' / ', size: 16, color: '7F7F7F' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '7F7F7F' }),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
