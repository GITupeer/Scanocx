/** Normalizacja pod FTS / fuzzy PL: diakrytyki, ł, interpunkcja. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/gi, 'l')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Buduje bezpieczne zapytanie FTS5: tokeny AND + prefix (*).
 * Zwraca null, gdy po normalizacji nie ma sensownych tokenów.
 */
export function buildFtsQuery(raw: string): string | null {
  const tokens = normalizeForSearch(raw)
    .split(' ')
    .map((token) => token.replace(/[^a-z0-9]/gi, ''))
    .filter((token) => token.length > 0);

  if (tokens.length === 0) return null;

  return tokens
    .map((token) => (token.length === 1 ? token : `${token}*`))
    .join(' AND ');
}
