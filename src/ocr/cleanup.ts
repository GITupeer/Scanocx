/**
 * Lekki, lokalny cleanup tekstu OCR (bez AI).
 * Cel: typowe artefakty skanów książek — nie korekta językowa.
 * Reguły są świadomie language-agnostic (Unicode letters), pod przyszłe języki.
 */

/** Scal wyrazy przeniesione dywizem na końcu wiersza (EN/DE/FR/PL/ES…). */
function joinHyphenatedLineBreaks(text: string): string {
  // „exam-\nple” / „rozcią- \ngnięte” → jedno słowo
  return text.replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, '$1$2');
}

/** Usuń znaki kontroli, znormalizuj spacje w wierszu. */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Bezpieczne poprawki typografii OCR — bez preferowania jednego locale
 * (cudzysłów PL/FR/DE zostawiamy jak ML Kit zwrócił).
 */
function fixSafeGlyphGlitches(text: string): string {
  return (
    text
      // spacja przed przecinkiem / kropką (częsty artefakt)
      .replace(/\s+([,.;:!?…])/g, '$1')
      // brak spacji po interpunkcji przed literą (nie cyfrą — „1,5” / „3.14” zostają)
      .replace(/([,.;:!?…])(\p{L})/gu, '$1 $2')
  );
}

/** Lokalna poprawa tekstu z darmowego OCR. */
export function cleanupOcrText(text: string): string {
  if (!text) return '';
  let out = text.replace(/\r\n/g, '\n');
  out = joinHyphenatedLineBreaks(out);
  out = fixSafeGlyphGlitches(out);
  out = normalizeWhitespace(out);
  return out;
}
