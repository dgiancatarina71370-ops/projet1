// Nom d'un fichier d'export : <titre>-AAAAMMJJ-HHMMSS.<extension> (heure locale, comme la signature).
// Le noyau Rust revalide ce nom (files.rs::validate_export_name) : ici on le construit de façon à toujours passer ce contrôle.
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/** Plus longue partie de `s` tenant dans `max` octets UTF-8, coupée entre deux caractères. */
export function truncateBytes(s: string, max: number): string {
  const enc = new TextEncoder();
  let out = '';
  let used = 0;
  for (const ch of s) {
    const n = enc.encode(ch).length;
    if (used + n > max) break;
    out += ch;
    used += n;
  }
  return out;
}

/** Titre assaini pour servir de début de nom de fichier : jamais vide, jamais réservé par Windows, au plus 100 octets. */
export function safeFileStem(title: string): string {
  let s = title
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    .trim();
  s = truncateBytes(s, 100).replace(/^[.\s-]+|[.\s-]+$/g, '');
  if (s === '') return 'export';
  if (RESERVED.test(s.split('.')[0].trim())) s = `_${s}`; // « CON » ou « con.txt » : le préfixe sort le premier segment des noms réservés
  return s;
}

const p2 = (n: number): string => String(n).padStart(2, '0');

/** AAAAMMJJ-HHMMSS en heure locale. */
export function localStamp(d: Date): string {
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}

export function exportFileName(title: string, ext: string, now: Date): string {
  return `${safeFileStem(title)}-${localStamp(now)}.${ext}`;
}
