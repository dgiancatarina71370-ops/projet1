// Signature de l'application. Les exports (lot V2.3), l'écran À propos et le pied de page la lisent ici : une seule définition.
export const PRODUCT_NAME = 'BA-Mentor Portable Ultimate Edition';
export const AUTHOR_LINE = 'Développé par David Giancatarina';

export interface Signature {
  name: string;
  author: string;
  version: string;
  generatedAt: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Date locale au format JJ/MM/AAAA HH:MM. */
export function formatLocalDateTime(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function buildSignature(version: string, at: Date = new Date()): Signature {
  return { name: PRODUCT_NAME, author: AUTHOR_LINE, version: `Version : ${version}`, generatedAt: `Date de génération : ${formatLocalDateTime(at)}` };
}

export function signatureLines(s: Signature): string[] {
  return [s.name, s.author, s.version, s.generatedAt];
}
