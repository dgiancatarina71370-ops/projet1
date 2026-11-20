// Mise en forme pour l'affichage (heure locale, tailles). Les dates sont stockées en UTC ; seule l'interface les convertit.
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** Date et heure locales au format français, à partir de millisecondes Unix. */
export function formatLocal(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
