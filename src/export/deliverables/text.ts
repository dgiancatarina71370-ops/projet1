// Mise en forme sûre du texte saisi dans un livrable généré (lot M8, décision D93).
// Le texte de l'utilisateur ne doit JAMAIS être interprété comme du Markdown : un titre contenant « | » casserait un tableau,
// des notes commençant par « # » deviendraient un titre. Tout texte passe donc par ces fonctions avant d'entrer dans le document.

const INLINE_SPECIAL = /[\\`*_[\]<>|~&]/g;

/** Texte sur une ligne : retours à la ligne et espaces multiples ramenés à un espace, caractères du Markdown neutralisés. */
export function inline(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(INLINE_SPECIAL, '\\$&');
}

/** Texte de cellule de tableau ou valeur courte : comme `inline`, « — » quand c'est vide. */
export function cell(text: string): string {
  const t = inline(text);
  return t === '' ? '—' : t;
}

/** Début de ligne qui deviendrait une structure (titre, liste, séparateur, liste numérotée) : neutralisé par une barre oblique inverse. */
function guardLineStart(line: string): string {
  if (/^[#+\-=:]/.test(line)) return `\\${line}`;
  return line.replace(/^(\d+)([.)])/, '$1\\$2');
}

/** Titre : le texte est sur une ligne et des « # » en fin de ligne ne sont pas pris pour une fermeture de titre. */
export function headingText(text: string): string {
  return inline(text).replace(/#+$/, (m) => m.replace(/#/g, '\\#'));
}

export const heading = (level: number, text: string): string => `${'#'.repeat(level)} ${headingText(text)}`;

/** Lignes d'un texte libre : sans espaces de bord, sans lignes vides en tête, en queue ni doublées. */
function cleanLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim());
  const out: string[] = [];
  for (const l of lines) {
    if (l === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(l);
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}

/**
 * Texte libre (notes, critères, étapes…) en paragraphes ordinaires, sans barre de citation (retour de recette M8).
 * Les retours à la ligne saisis sont conservés (saut de ligne forcé), les paragraphes aussi. Chaque ligne est neutralisée :
 * c'est cette neutralisation, et non la citation, qui empêche le texte saisi de devenir un titre, une liste ou un tableau (D93).
 */
export function freeText(text: string): string {
  const lines = cleanLines(text);
  return lines
    .map((l, i) => {
      if (l === '') return '';
      const next = lines[i + 1];
      const hardBreak = next !== undefined && next !== '' ? '  ' : '';
      return `${guardLineStart(inline(l))}${hardBreak}`;
    })
    .join('\n');
}

/** Texte libre en paragraphes ; `none` (texte courant, déjà sûr) quand il est vide. */
export function body(text: string, none: string): string {
  return cleanLines(text).length === 0 ? none : freeText(text);
}

/** Un champ à texte libre : intitulé en gras puis paragraphes ; « Non renseigné. » quand il est vide. */
export function field(label: string, text: string): string {
  return `**${label} :**\n\n${body(text, 'Non renseigné.')}`;
}

/** Ligne de tableau ; les cellules sont déjà neutralisées par l'appelant. */
export const row = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;

export function table(header: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  return [row(header), row(header.map(() => '---')), ...rows.map(row)].join('\n');
}
