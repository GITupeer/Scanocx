import { getSearchDb } from '@/src/search/db';
import { buildFtsQuery } from '@/src/search/normalize';

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

type SearchRow = {
  page_id: string;
  book_id: string;
  book_title: string;
  page_index: number;
  printed_page_number: string | null;
  source: 'ai' | 'ocr';
  snippet: string;
  rank: number;
};

function cleanSnippet(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Full-text search po treści stron (FTS5 + bm25). */
export async function searchInBooks(
  rawQuery: string,
  limit = 40
): Promise<SearchHit[]> {
  const match = buildFtsQuery(rawQuery);
  if (!match) return [];

  const db = await getSearchDb();
  const rows = await db.getAllAsync<SearchRow>(
    `
    SELECT
      p.page_id,
      p.book_id,
      p.book_title,
      p.page_index,
      p.printed_page_number,
      p.source,
      snippet(search_pages_fts, 0, '', '', '…', 16) AS snippet,
      bm25(search_pages_fts) AS rank
    FROM search_pages_fts
    JOIN search_pages p ON p.id = search_pages_fts.rowid
    WHERE search_pages_fts MATCH ?
    ORDER BY rank
    LIMIT ?
    `,
    [match, limit]
  );

  return rows.map((row) => ({
    pageId: row.page_id,
    bookId: row.book_id,
    bookTitle: row.book_title,
    pageIndex: row.page_index,
    printedPageNumber: row.printed_page_number,
    source: row.source,
    snippet: cleanSnippet(row.snippet || ''),
    rank: row.rank,
  }));
}
