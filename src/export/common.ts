import { getDisplayText } from '@/src/ai/displayText';
import type { Book, BookPage } from '@/src/domain/types';

export function sanitizeFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return cleaned || 'scanocx-export';
}

/** Czysty tekst strony — bez numerów, nagłówków ani placeholderów. */
export function pageBody(page: BookPage): string {
  return getDisplayText(page).trim();
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/**
 * Pełny tekst książki do TXT/udostępniania.
 * Jedna strona skanu = jedna „strona” pliku (separator form-feed), bez numerów stron.
 */
export function buildBookPlainText(book: Book): string {
  return book.pages.map((page) => pageBody(page)).join('\f');
}

/** Krótki fragment do spisu treści eBooka (nie numer strony). */
export function pageExcerpt(page: BookPage, maxLen = 42): string {
  const text = pageBody(page).replace(/\s+/g, ' ').trim();
  if (!text) return '…';
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const space = cut.lastIndexOf(' ');
  return `${(space > 16 ? cut.slice(0, space) : cut).trim()}…`;
}

/**
 * Akapity z OCR/AI: puste linie = nowy akapit, pojedyncze łamania = spacje.
 */
export function splitParagraphs(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const blocks = trimmed
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
    )
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length > 0) return blocks;

  return [
    trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' '),
  ].filter(Boolean);
}

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function assertBookHasPages(book: Book): void {
  if (book.pages.length === 0) {
    throw new Error('Książka nie ma jeszcze żadnych stron.');
  }
}
