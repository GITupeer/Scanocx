import { countWords } from '@/src/export/common';

/** Wariant typografii dopasowany do ilości tekstu na stronie. */
export type PageLayoutDensity = 'airy' | 'comfortable' | 'book' | 'compact' | 'dense';

export type BookPageFormat = {
  /** Nazwa formatu papieru. */
  id: 'pocket' | 'a5' | 'trade' | 'a4';
  /** Szerokość PDF w punktach (72 dpi). */
  width: number;
  /** Wysokość PDF w punktach (72 dpi). */
  height: number;
  label: string;
};

/**
 * Format „książkowy” — domyślnie A5 / trade.
 * Przy gęstym tekście przechodzimy na większą stronę (A4), żeby nie ściskać.
 */
export function pickBookPageFormat(wordCounts: number[]): BookPageFormat {
  const nonempty = wordCounts.filter((w) => w > 0).sort((a, b) => a - b);
  const median =
    nonempty.length === 0
      ? 0
      : nonempty.length % 2 === 1
        ? nonempty[(nonempty.length - 1) / 2]!
        : (nonempty[nonempty.length / 2 - 1]! + nonempty[nonempty.length / 2]!) / 2;

  // A4 — dużo tekstu na stronę
  if (median >= 480) {
    return { id: 'a4', width: 595, height: 842, label: 'A4' };
  }
  // Trade paperback ~6×9″
  if (median >= 220) {
    return { id: 'trade', width: 432, height: 648, label: '6×9″' };
  }
  // A5 — klasyczna książka
  if (median >= 90) {
    return { id: 'a5', width: 420, height: 595, label: 'A5' };
  }
  // Kieszonkowy — mało tekstu, większa czcionka lepiej wypełni stronę
  return { id: 'pocket', width: 360, height: 540, label: 'pocket' };
}

export function pickPageDensity(wordCount: number): PageLayoutDensity {
  if (wordCount <= 0) return 'airy';
  if (wordCount <= 70) return 'airy';
  if (wordCount <= 160) return 'comfortable';
  if (wordCount <= 320) return 'book';
  if (wordCount <= 500) return 'compact';
  return 'dense';
}

export function analyzePageWords(text: string): {
  words: number;
  density: PageLayoutDensity;
} {
  const words = countWords(text);
  return { words, density: pickPageDensity(words) };
}
