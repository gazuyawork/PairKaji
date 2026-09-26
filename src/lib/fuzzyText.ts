/** ひらがな・カタカナ、全角・半角、大文字小文字、空白、長音を揃える */
export function normalizeFuzzy(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.normalize('NFKC').toLowerCase();
  const hira = s.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
  return hira.replace(/[\u30fcー\s\u3000]/g, '');
}

export function fuzzyIncludes(text: unknown, query: unknown): boolean {
  const q = normalizeFuzzy(query);
  if (!q) return true;
  return normalizeFuzzy(text).includes(q);
}
