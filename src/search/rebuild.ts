import { getSearchDb } from '@/src/search/db';
import { upsertBookInSearchIndex } from '@/src/search/index';
import { getBook, listBooks } from '@/src/storage/books';

/** Pełny rebuild indeksu z lokalnych meta.json (np. po aktualizacji / pierwszym starcie). */
export async function rebuildSearchIndex(): Promise<void> {
  const db = await getSearchDb();
  await db.runAsync(`DELETE FROM search_pages`);

  const summaries = await listBooks();
  for (const summary of summaries) {
    try {
      const book = await getBook(summary.id);
      await upsertBookInSearchIndex(book);
    } catch {
      // pomiń uszkodzone książki
    }
  }
}
