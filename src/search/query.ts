import * as api from '@/src/api/endpoints';

export type SearchHit = {
  pageId: string;
  bookId: string;
  bookTitle: string;
  pageIndex: number;
  printedPageNumber: string | null;
  source: 'ai' | 'ocr';
  snippet: string;
  rank: number;
};

function cleanSnippet(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Full-text search po treści stron (backend: Postgres FTS / MySQL FULLTEXT / LIKE). */
export async function searchInBooks(
  rawQuery: string,
  limit = 40
): Promise<SearchHit[]> {
  const q = rawQuery.trim();
  if (!q) return [];

  const { data } = await api.searchBooks(q, limit);
  return data.map((row) => ({
    pageId: row.page_local_id,
    bookId: row.book_local_id,
    bookTitle: row.book_title,
    pageIndex: row.page_index,
    printedPageNumber: row.printed_page_number,
    source: row.source === 'ai' ? 'ai' : 'ocr',
    snippet: cleanSnippet(row.snippet || ''),
    rank: row.rank,
  }));
}
