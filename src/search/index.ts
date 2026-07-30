import type { Book } from '@/src/domain/types';

/**
 * Lokalny indeks FTS został zastąpiony wyszukiwaniem na backendzie.
 * Funkcje zostawione jako no-op, żeby nie ruszać istniejących call-site'ów.
 */

export type SearchPageSource = 'ai' | 'ocr';

export async function upsertBookInSearchIndex(_book: Book): Promise<void> {
  // no-op — indeks jest na serwerze (kolumny pages.ocr_text / ai_text)
}

export async function removeBookFromSearchIndex(_bookId: string): Promise<void> {
  // no-op
}

export async function removePageFromSearchIndex(_pageId: string): Promise<void> {
  // no-op
}

export function scheduleBookSearchIndex(_book: Book): void {
  // no-op
}

export function scheduleRemoveBookSearchIndex(_bookId: string): void {
  // no-op
}
