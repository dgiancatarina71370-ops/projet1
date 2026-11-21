// Rendu Markdown (lot V2.3a) : le contenu du livrable tel qu'il est, encadré par la signature.
// Commentaire <!-- generator: … --> en tête ; bloc final après une ligne --- (spécification, section 10).
import { signatureLines } from '../shared/signature.ts';
import type { Signature } from '../shared/signature.ts';

export function renderMarkdown(content: string, sig: Signature, generatedIso: string): string {
  const body = content.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  const head = `<!-- generator: ${sig.name} — ${sig.author} — ${sig.version} — generated: ${generatedIso} -->`;
  // Deux espaces en fin de ligne : saut de ligne Markdown à l'affichage.
  const foot = signatureLines(sig).join('  \n');
  return `${head}\n\n${body === '' ? '' : `${body}\n\n`}---\n\n${foot}\n`;
}
