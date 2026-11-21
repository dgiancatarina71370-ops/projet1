// Contrôle d'un .docx produit (lot V2.3b) : on ouvre le fichier réellement généré (c'est une archive ZIP) et on y relit la signature,
// au lieu de se fier à ce que le rendu croit avoir écrit.
import JSZip from 'jszip';
import { decodeEntities } from './model.ts';
import type { Signature } from '../shared/signature.ts';
import { signatureLines } from '../shared/signature.ts';

export interface DocxContent {
  /** Texte de chaque paragraphe du corps (word/document.xml). */
  paragraphs: string[];
  /** Texte de chaque paragraphe du pied de page. */
  footer: string[];
  /** docProps/core.xml (XML brut). */
  core: string;
  /** docProps/custom.xml (XML brut), vide s'il n'existe pas. */
  custom: string;
  /** Noms des fichiers de l'archive. */
  files: string[];
}

function paragraphsOf(xml: string): string[] {
  const out: string[] = [];
  for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    let text = '';
    for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/>|<w:tab\s*\/>/g)) text += m[0].startsWith('<w:t') ? decodeEntities(m[1]) : m[0].startsWith('<w:br') ? '\n' : '\t';
    out.push(text);
  }
  return out;
}

export async function readDocx(bytes: Uint8Array): Promise<DocxContent> {
  const zip = await JSZip.loadAsync(bytes);
  const text = async (name: string) => (zip.file(name) ? await zip.file(name)!.async('string') : '');
  const footerName = Object.keys(zip.files).find((n) => /^word\/footer\d*\.xml$/.test(n));
  return {
    paragraphs: paragraphsOf(await text('word/document.xml')),
    footer: footerName ? paragraphsOf(await text(footerName)) : [],
    core: await text('docProps/core.xml'),
    custom: await text('docProps/custom.xml'),
    files: Object.keys(zip.files),
  };
}

/** Éléments de signature absents du fichier (corps du document : 4 lignes ; propriétés : auteur logiciel, auteur, version). */
export async function missingFromDocx(bytes: Uint8Array, sig: Signature): Promise<string[]> {
  const d = await readDocx(bytes);
  const missing = signatureLines(sig).filter((line) => !d.paragraphs.includes(line));
  const core = decodeEntities(d.core);
  if (!core.includes(`<dc:creator>${sig.name}</dc:creator>`)) missing.push(`propriété « auteur » du document (${sig.name})`);
  if (!core.includes(sig.author) || !core.includes(sig.version)) missing.push('propriété « description » du document (auteur et version)');
  return missing;
}
