import * as FileSystem from 'expo-file-system/legacy';

import type { AiStatus, Book, BookPage, BookSummary, OcrQuality, OcrStatus } from '@/src/domain/types';
import { ensurePortraitUri, rotateUri } from '@/src/images/ensurePortrait';
import {
  scheduleBookSearchIndex,
  scheduleRemoveBookSearchIndex,
} from '@/src/search/index';
import { createId } from '@/src/storage/id';
import {
  bookCoverPath,
  bookDir,
  bookMetaPath,
  bookPagesDir,
  booksRoot,
  pageImagePath,
} from '@/src/storage/paths';

function normalizePage(page: BookPage): BookPage {
  const ocrStatus = page.ocrStatus ?? 'idle';
  const rawQuality = page.ocrQuality ?? null;
  const ocrQuality =
    rawQuality && rawQuality.confidence
      ? { confidence: rawQuality.confidence }
      : null;
  return {
    ...page,
    ocrText: page.ocrText ?? '',
    aiText: page.aiText ?? '',
    printedPageNumber: page.printedPageNumber ?? null,
    ocrQuality,
    ocrStatus:
      ocrStatus === 'idle' ||
      ocrStatus === 'pending' ||
      ocrStatus === 'done' ||
      ocrStatus === 'error'
        ? ocrStatus
        : 'idle',
    aiStatus: page.aiStatus ?? 'idle',
    aiError: page.aiError ?? null,
  };
}

function normalizeBook(book: Book): Book {
  return {
    ...book,
    coverUri: book.coverUri ?? null,
    pages: (book.pages ?? []).map(normalizePage),
  };
}

function freshAiFields(): Pick<BookPage, 'aiText' | 'aiStatus' | 'aiError'> {
  return { aiText: '', aiStatus: 'idle', aiError: null };
}

async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

async function readBook(bookId: string): Promise<Book> {
  const metaPath = bookMetaPath(bookId);
  const info = await FileSystem.getInfoAsync(metaPath);
  if (!info.exists) {
    throw new Error(`Book not found: ${bookId}`);
  }
  const raw = await FileSystem.readAsStringAsync(metaPath);
  return normalizeBook(JSON.parse(raw) as Book);
}

async function writeBook(book: Book): Promise<Book> {
  const updated: Book = {
    ...book,
    updatedAt: new Date().toISOString(),
  };
  await ensureDir(bookDir(book.id));
  await ensureDir(bookPagesDir(book.id));
  await FileSystem.writeAsStringAsync(bookMetaPath(book.id), JSON.stringify(updated, null, 2));
  scheduleBookSearchIndex(updated);
  return updated;
}

export async function listBooks(): Promise<BookSummary[]> {
  await ensureDir(booksRoot());
  const entries = await FileSystem.readDirectoryAsync(booksRoot());
  const books: BookSummary[] = [];

  for (const entry of entries) {
    try {
      const book = await readBook(entry);
      books.push({
        id: book.id,
        title: book.title,
        coverUri: book.coverUri,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
        pageCount: book.pages.length,
      });
    } catch {
      // skip broken folders
    }
  }

  return books.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getBook(bookId: string): Promise<Book> {
  return readBook(bookId);
}

export async function createBook(title: string): Promise<Book> {
  const now = new Date().toISOString();
  const book: Book = {
    id: createId('book'),
    title: title.trim() || 'Bez tytułu',
    coverUri: null,
    createdAt: now,
    updatedAt: now,
    pages: [],
  };
  return writeBook(book);
}

export async function renameBook(bookId: string, title: string): Promise<Book> {
  const book = await readBook(bookId);
  book.title = title.trim() || book.title;
  return writeBook(book);
}

/** Kopiuje zdjęcie jako okładkę książki (lokalny JPEG). */
export async function setBookCover(bookId: string, sourceUri: string): Promise<Book> {
  const book = await readBook(bookId);
  await ensureDir(bookDir(bookId));

  if (book.coverUri) {
    await FileSystem.deleteAsync(book.coverUri, { idempotent: true });
  }

  const dest = bookCoverPath(bookId);
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  book.coverUri = dest;
  return writeBook(book);
}

export async function clearBookCover(bookId: string): Promise<Book> {
  const book = await readBook(bookId);
  if (book.coverUri) {
    await FileSystem.deleteAsync(book.coverUri, { idempotent: true });
  }
  book.coverUri = null;
  return writeBook(book);
}

export async function deleteBook(bookId: string): Promise<void> {
  const dir = bookDir(bookId);
  const info = await FileSystem.getInfoAsync(dir);
  if (info.exists) {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  }
  scheduleRemoveBookSearchIndex(bookId);
}

export async function addPageFromImage(
  bookId: string,
  sourceUri: string,
  options: { extraRotate?: 0 | 90 | 180 | 270; alreadyNormalized?: boolean } = {}
): Promise<{ book: Book; page: BookPage }> {
  const book = await readBook(bookId);
  await ensureDir(bookPagesDir(bookId));

  const pageId = createId('page');
  const dest = pageImagePath(bookId, pageId);
  // Capture już zrobił crop+orientację — nie koduj JPEG drugi raz.
  const portraitUri = options.alreadyNormalized
    ? sourceUri
    : await ensurePortraitUri(sourceUri, {
        extraRotate: options.extraRotate ?? 0,
      });
  await FileSystem.copyAsync({ from: portraitUri, to: dest });

  const page: BookPage = {
    id: pageId,
    index: book.pages.length + 1,
    imageUri: dest,
    ocrText: '',
    ...freshAiFields(),
    printedPageNumber: null,
    ocrQuality: null,
    ocrStatus: 'idle',
    createdAt: new Date().toISOString(),
  };

  book.pages = [...book.pages, page];
  const saved = await writeBook(book);
  return { book: saved, page };
}

/**
 * Capture v2: sam copy pliku kamery → meta. Zero ImageManipulator.
 * Orientację / OCR ogarnia późniejszy runPageOcr (gdy limit na to pozwala).
 */
export async function addPageFromCameraUri(
  bookId: string,
  cameraUri: string
): Promise<{ book: Book; page: BookPage }> {
  const book = await readBook(bookId);
  await ensureDir(bookPagesDir(bookId));

  const pageId = createId('page');
  const dest = pageImagePath(bookId, pageId);
  await FileSystem.copyAsync({ from: cameraUri, to: dest });

  const page: BookPage = {
    id: pageId,
    index: book.pages.length + 1,
    imageUri: dest,
    ocrText: '',
    ...freshAiFields(),
    printedPageNumber: null,
    ocrQuality: null,
    ocrStatus: 'idle',
    createdAt: new Date().toISOString(),
  };

  book.pages = [...book.pages, page];
  const saved = await writeBook(book);
  return { book: saved, page };
}

export async function updatePageOcr(
  bookId: string,
  pageId: string,
  patch: {
    ocrText?: string;
    ocrStatus?: OcrStatus;
    printedPageNumber?: string | null;
    ocrQuality?: OcrQuality | null;
    /** Gdy true (domyślnie przy zmianie ocrText), kasuje wynik AI — wymaga ponownej korekty. */
    resetAi?: boolean;
  }
): Promise<Book> {
  const book = await readBook(bookId);
  book.pages = book.pages.map((page) => {
    if (page.id !== pageId) return page;

    const ocrTextChanged =
      patch.ocrText !== undefined && patch.ocrText !== page.ocrText;
    const shouldResetAi = patch.resetAi ?? ocrTextChanged;

    return {
      ...page,
      ocrText: patch.ocrText ?? page.ocrText,
      ocrStatus: patch.ocrStatus ?? page.ocrStatus,
      printedPageNumber:
        patch.printedPageNumber !== undefined
          ? patch.printedPageNumber
          : (page.printedPageNumber ?? null),
      ocrQuality:
        patch.ocrQuality !== undefined ? patch.ocrQuality : (page.ocrQuality ?? null),
      ...(shouldResetAi ? freshAiFields() : {}),
    };
  });
  return writeBook(book);
}

export async function updatePageAi(
  bookId: string,
  pageId: string,
  patch: {
    aiText?: string;
    aiStatus?: AiStatus;
    aiError?: string | null;
  }
): Promise<Book> {
  return updatePagesAi(bookId, [{ pageId, ...patch }]);
}

/** Jednorazowy zapis AI dla wielu stron (jeden writeBook). */
export async function updatePagesAi(
  bookId: string,
  patches: Array<{
    pageId: string;
    aiText?: string;
    aiStatus?: AiStatus;
    aiError?: string | null;
  }>
): Promise<Book> {
  if (patches.length === 0) {
    return readBook(bookId);
  }

  const byId = new Map(patches.map((patch) => [patch.pageId, patch]));
  const book = await readBook(bookId);
  book.pages = book.pages.map((page) => {
    const patch = byId.get(page.id);
    if (!patch) return page;
    return {
      ...page,
      aiText: patch.aiText ?? page.aiText,
      aiStatus: patch.aiStatus ?? page.aiStatus,
      aiError: patch.aiError !== undefined ? patch.aiError : (page.aiError ?? null),
    };
  });
  return writeBook(book);
}

export async function updatePageText(
  bookId: string,
  pageId: string,
  ocrText: string,
  printedPageNumber?: string | null
): Promise<Book> {
  return updatePageOcr(bookId, pageId, {
    ocrText,
    printedPageNumber,
    ocrStatus: 'done',
    resetAi: true,
  });
}

export async function updatePageAiText(
  bookId: string,
  pageId: string,
  aiText: string
): Promise<Book> {
  return updatePageAi(bookId, pageId, {
    aiText,
    aiStatus: 'done',
    aiError: null,
  });
}

/** Podmienia zdjęcie istniejącej strony i zeruje stan OCR. */
export async function replacePageImage(
  bookId: string,
  pageId: string,
  sourceUri: string,
  options: { extraRotate?: 0 | 90 | 180 | 270; alreadyNormalized?: boolean } = {}
): Promise<{ book: Book; page: BookPage }> {
  const book = await readBook(bookId);
  const existing = book.pages.find((p) => p.id === pageId);
  if (!existing) {
    throw new Error(`Page not found: ${pageId}`);
  }

  await ensureDir(bookPagesDir(bookId));

  if (existing.imageUri) {
    await FileSystem.deleteAsync(existing.imageUri, { idempotent: true });
  }

  // Unikalna ścieżka → świeży URI, bez cache starego obrazu
  const dest = `${bookPagesDir(bookId)}${pageId}-${Date.now()}.jpg`;
  const portraitUri = options.alreadyNormalized
    ? sourceUri
    : await ensurePortraitUri(sourceUri, {
        extraRotate: options.extraRotate ?? 0,
      });
  await FileSystem.copyAsync({ from: portraitUri, to: dest });

  const page: BookPage = {
    ...existing,
    imageUri: dest,
    ocrText: '',
    ...freshAiFields(),
    printedPageNumber: null,
    ocrQuality: null,
    ocrStatus: 'idle',
  };

  book.pages = book.pages.map((p) => (p.id === pageId ? page : p));
  const saved = await writeBook(book);
  return { book: saved, page };
}

/** Capture v2: podmiana samym copy, bez ImageManipulator. */
export async function replacePageFromCameraUri(
  bookId: string,
  pageId: string,
  cameraUri: string
): Promise<{ book: Book; page: BookPage }> {
  const book = await readBook(bookId);
  const existing = book.pages.find((p) => p.id === pageId);
  if (!existing) {
    throw new Error(`Page not found: ${pageId}`);
  }

  await ensureDir(bookPagesDir(bookId));

  if (existing.imageUri) {
    await FileSystem.deleteAsync(existing.imageUri, { idempotent: true });
  }

  const dest = `${bookPagesDir(bookId)}${pageId}-${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: cameraUri, to: dest });

  const page: BookPage = {
    ...existing,
    imageUri: dest,
    ocrText: '',
    ...freshAiFields(),
    printedPageNumber: null,
    ocrQuality: null,
    ocrStatus: 'idle',
  };

  book.pages = book.pages.map((p) => (p.id === pageId ? page : p));
  const saved = await writeBook(book);
  return { book: saved, page };
}

/**
 * Zapisuje wskazany JPEG jako obraz strony (nowa ścieżka, bez cache).
 */
export async function persistPageImageFile(
  bookId: string,
  pageId: string,
  sourceUri: string
): Promise<string> {
  const book = await readBook(bookId);
  const existing = book.pages.find((p) => p.id === pageId);
  if (!existing) {
    throw new Error(`Page not found: ${pageId}`);
  }

  await ensureDir(bookPagesDir(bookId));
  const dest = `${bookPagesDir(bookId)}${pageId}-${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });

  if (existing.imageUri && existing.imageUri !== dest) {
    await FileSystem.deleteAsync(existing.imageUri, { idempotent: true });
  }

  book.pages = book.pages.map((page) =>
    page.id === pageId ? { ...page, imageUri: dest } : page
  );
  await writeBook(book);
  return dest;
}

/**
 * Wymusza pionowy JPEG na dysku (EXIF → piksele) i aktualizuje meta strony.
 * Zwraca URI pliku gotowego do OCR / podglądu.
 */
export async function persistPortraitPageImage(
  bookId: string,
  pageId: string,
  sourceUri: string
): Promise<string> {
  const portraitUri = await ensurePortraitUri(sourceUri);
  return persistPageImageFile(bookId, pageId, portraitUri);
}

/** Ręczny obrót strony o 180° (zapis nowego pliku). */
export async function rotatePageImage180(
  bookId: string,
  pageId: string
): Promise<{ book: Book; page: BookPage }> {
  const book = await readBook(bookId);
  const existing = book.pages.find((p) => p.id === pageId);
  if (!existing) {
    throw new Error(`Page not found: ${pageId}`);
  }

  const rotatedUri = await rotateUri(existing.imageUri, 180);
  await persistPageImageFile(bookId, pageId, rotatedUri);
  const updated = await readBook(bookId);
  const page = updated.pages.find((p) => p.id === pageId);
  if (!page) {
    throw new Error(`Page not found after rotate: ${pageId}`);
  }
  return { book: updated, page };
}

export async function deletePage(bookId: string, pageId: string): Promise<Book> {
  const book = await readBook(bookId);
  const page = book.pages.find((p) => p.id === pageId);
  if (page) {
    await FileSystem.deleteAsync(page.imageUri, { idempotent: true });
  }
  book.pages = book.pages
    .filter((p) => p.id !== pageId)
    .map((p, idx) => ({ ...p, index: idx + 1 }));
  return writeBook(book);
}
