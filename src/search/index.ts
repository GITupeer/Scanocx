import { getDisplayText } from '@/src/ai/displayText';
import type { Book, BookPage } from '@/src/domain/types';
import { getSearchDb } from '@/src/search/db';

export type SearchPageSource = 'ai' | 'ocr';

function pageSource(page: BookPage): SearchPageSource {
  return page.aiStatus === 'done' && page.aiText.trim() ? 'ai' : 'ocr';
}

function indexableBody(page: BookPage): string | null {
  const display = getDisplayText(page).trim();
  if (!display) return null;
  // ł nie jest diakrytykiem unicode — składamy ręcznie; ąęć… zdejmie FTS tokenize.
  const folded = display.replace(/ł/g, 'l').replace(/Ł/g, 'L');
  return folded.length > 0 ? folded : null;
}

/** Synchronizuje wszystkie strony książki w indeksie FTS (AI tekst ma pierwszeństwo). */
export async function upsertBookInSearchIndex(book: Book): Promise<void> {
  const db = await getSearchDb();
  const keepIds: string[] = [];

  await db.withTransactionAsync(async () => {
    for (const page of book.pages) {
      const body = indexableBody(page);
      if (!body) continue;
      keepIds.push(page.id);

      await db.runAsync(
        `
        INSERT INTO search_pages (
          page_id, book_id, book_title, page_index,
          printed_page_number, body, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(page_id) DO UPDATE SET
          book_id = excluded.book_id,
          book_title = excluded.book_title,
          page_index = excluded.page_index,
          printed_page_number = excluded.printed_page_number,
          body = excluded.body,
          source = excluded.source
        `,
        [
          page.id,
          book.id,
          book.title,
          page.index,
          page.printedPageNumber,
          body,
          pageSource(page),
        ]
      );
    }

    if (keepIds.length === 0) {
      await db.runAsync(`DELETE FROM search_pages WHERE book_id = ?`, [book.id]);
      return;
    }

    const placeholders = keepIds.map(() => '?').join(', ');
    await db.runAsync(
      `DELETE FROM search_pages WHERE book_id = ? AND page_id NOT IN (${placeholders})`,
      [book.id, ...keepIds]
    );
  });
}

export async function removeBookFromSearchIndex(bookId: string): Promise<void> {
  const db = await getSearchDb();
  await db.runAsync(`DELETE FROM search_pages WHERE book_id = ?`, [bookId]);
}

export async function removePageFromSearchIndex(pageId: string): Promise<void> {
  const db = await getSearchDb();
  await db.runAsync(`DELETE FROM search_pages WHERE page_id = ?`, [pageId]);
}

/** Fire-and-forget: nie blokuj zapisu meta przy błędzie indeksu. */
export function scheduleBookSearchIndex(book: Book): void {
  void upsertBookInSearchIndex(book).catch((error) => {
    console.warn('[search] upsert failed', error);
  });
}

export function scheduleRemoveBookSearchIndex(bookId: string): void {
  void removeBookFromSearchIndex(bookId).catch((error) => {
    console.warn('[search] remove book failed', error);
  });
}
