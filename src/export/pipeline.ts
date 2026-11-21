// Pipeline d'export (lot V2.3a). Les modules appellent exportDocument(source, format) et ne fabriquent jamais de fichier eux-mêmes.
// La signature est ajoutée UNE fois, ici, avant le rendu ; un rendu qui ne la contient pas lève une erreur : un export sans signature
// ne peut pas être produit. Word (V2.3b) lit la signature dans le fichier réellement généré ; le PDF s'ajoutera au lot V2.3c.
import { buildSignature, signatureLines } from '../shared/signature.ts';
import type { Signature } from '../shared/signature.ts';
import { parseMarkdown } from './model.ts';
import { renderHtml } from './render-html.ts';
import { renderMarkdown } from './render-markdown.ts';
import { renderDocx } from './render-docx.ts';
import { missingFromDocx } from './docx-check.ts';
import { exportFileName } from './filename.ts';

export type ExportFormat = 'markdown' | 'html' | 'docx';

export const FORMATS: Record<ExportFormat, { ext: string; mime: string; label: string }> = {
  markdown: { ext: 'md', mime: 'text/markdown;charset=utf-8', label: 'Markdown' },
  html: { ext: 'html', mime: 'text/html;charset=utf-8', label: 'HTML' },
  docx: { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word' },
};

export interface ExportSource {
  title: string;
  markdown: string;
}

export interface ExportContext {
  /** Version de l'application, lue à l'exécution (app_info) : source unique, jamais écrite en dur. */
  version: string;
  /** Instant de l'export (injecté pour les tests). */
  now?: Date;
}

export interface ExportResult {
  format: ExportFormat;
  fileName: string;
  mime: string;
  /** Contenu texte (Markdown, HTML) ; null pour un format binaire (Word). */
  text: string | null;
  bytes: Uint8Array;
  signature: Signature;
}

export class ExportSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportSignatureError';
  }
}

/** Vérifie que les quatre éléments de la signature figurent dans le rendu. */
export function assertSigned(output: string, sig: Signature): void {
  const missing = signatureLines(sig).filter((line) => !output.includes(line));
  if (missing.length > 0) throw new ExportSignatureError(`Export refusé : signature incomplète (manque : ${missing.join(' | ')}).`);
}

export async function exportDocument(source: ExportSource, format: ExportFormat, ctx: ExportContext): Promise<ExportResult> {
  if (!(format in FORMATS)) throw new Error(`Format d'export inconnu : ${String(format)}`);
  if (ctx.version.trim() === '' || ctx.version === '—') throw new ExportSignatureError('Export refusé : la version de l\'application est inconnue.');
  const now = ctx.now ?? new Date();
  const sig = buildSignature(ctx.version, now);
  const iso = now.toISOString();
  const common = { format, fileName: exportFileName(source.title, FORMATS[format].ext, now), mime: FORMATS[format].mime, signature: sig };

  if (format === 'docx') {
    const bytes = await renderDocx({ title: source.title, blocks: parseMarkdown(source.markdown), signature: sig, iso, version: ctx.version.trim() });
    const missing = await missingFromDocx(bytes, sig);
    if (missing.length > 0) throw new ExportSignatureError(`Export refusé : signature incomplète dans le fichier Word (manque : ${missing.join(' | ')}).`);
    return { ...common, text: null, bytes };
  }

  const text = format === 'markdown' ? renderMarkdown(source.markdown, sig, iso) : renderHtml(source.title, parseMarkdown(source.markdown), sig, iso);
  assertSigned(text, sig);
  return { ...common, text, bytes: new TextEncoder().encode(text) };
}
