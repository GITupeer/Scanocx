import * as SQLite from 'expo-sqlite';

const DB_NAME = 'scanocx-search.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS search_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id TEXT NOT NULL UNIQUE,
      book_id TEXT NOT NULL,
      book_title TEXT NOT NULL,
      page_index INTEGER NOT NULL,
      printed_page_number TEXT,
      body TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('ai', 'ocr'))
    );

    CREATE INDEX IF NOT EXISTS idx_search_pages_book
      ON search_pages(book_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS search_pages_fts USING fts5(
      body,
      book_title,
      content='search_pages',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER IF NOT EXISTS search_pages_ai
    AFTER INSERT ON search_pages BEGIN
      INSERT INTO search_pages_fts(rowid, body, book_title)
      VALUES (new.id, new.body, new.book_title);
    END;

    CREATE TRIGGER IF NOT EXISTS search_pages_ad
    AFTER DELETE ON search_pages BEGIN
      INSERT INTO search_pages_fts(search_pages_fts, rowid, body, book_title)
      VALUES ('delete', old.id, old.body, old.book_title);
    END;

    CREATE TRIGGER IF NOT EXISTS search_pages_au
    AFTER UPDATE ON search_pages BEGIN
      INSERT INTO search_pages_fts(search_pages_fts, rowid, body, book_title)
      VALUES ('delete', old.id, old.body, old.book_title);
      INSERT INTO search_pages_fts(rowid, body, book_title)
      VALUES (new.id, new.body, new.book_title);
    END;
  `);
}

/** Otwarta (singleton) baza indeksu wyszukiwania. */
export async function getSearchDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await migrate(db);
      return db;
    })().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}
