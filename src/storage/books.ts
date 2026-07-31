import * as FileSystem from 'expo-file-system/legacy';

import { resolvePageOcrStatus } from '@/src/ai/displayText';
import type {
  AiAnalysis,
  AiPageText,
  AiStatus,
  Book,
  BookPage,
  BookSummary,
  OcrQuality,
  OcrStatus,
} from '@/src/domain/types';
import { ensurePortraitUri, rotateUri } from '@/src/images/ensurePortrait';
import {
  deleteBookFromRemote,
  deletePageFromRemote,
  hasAuthToken,
  pushBookMetaToRemote,
  pushBookToRemote,
  pushPageOcrToRemote,
  pushPageToRemote,
} from '@/src/library/remote';
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
  pageOriginalImagePath,
} from '@/src/storage/paths';

function syncRemoteQuietly(task: Promise<unknown>): void {
  void task.catch(() => undefined);
}

function normalizePage(page: BookPage): BookPage {
  const rawQuality = page.ocrQuality ?? null;
  const ocrQuality =
    rawQuality && rawQuality.confidence
      ? { confidence: rawQuality.confidence }
      : null;
  const ocrText = page.ocrText ?? '';
  const aiText = page.aiText ?? '';
  const aiStatus = page.aiStatus ?? 'idle';
  return {
    ...page,
    imageUri: page.imageUri?.trim() ? page.imageUri : null,
    originalImageUri: page.originalImageUri?.trim() ? page.originalImageUri : null,
    ocrText,
    aiText,
    printedPageNumber: page.printedPageNumber ?? null,
    ocrQuality,
    aiAnalysis: normalizeAiAnalysis(page.aiAnalysis),
    ocrStatus: resolvePageOcrStatus({
      ocrText,
      aiText,
      aiStatus,
      ocrStatus: page.ocrStatus,
    }),
    aiStatus,
    aiError: page.aiError ?? null,
    ...(page.aiOnly ? { aiOnly: true as const } : {}),
  };
}

async function deleteUriQuietly(uri: string | null | undefined): Promise<void> {
  if (!uri?.trim()) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

async function copyPageImagePair(
  bookId: string,
  pageId: string,
  croppedUri: string,
  originalUri?: string | null
): Promise<{ imageUri: string; originalImageUri: string | null }> {
  const stamp = Date.now();
  const imageUri = pageImagePath(bookId, pageId, stamp);
  await FileSystem.copyAsync({ from: croppedUri, to: imageUri });

  let originalImageUri: string | null = null;
  if (originalUri?.trim()) {
    originalImageUri = pageOriginalImagePath(bookId, pageId, stamp);
    await FileSystem.copyAsync({ from: originalUri, to: originalImageUri });
  }

  return { imageUri, originalImageUri };
}

function normalizeAiPageText(raw: unknown): AiPageText | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const text = typeof item.text === 'string' ? item.text.trim() : '';
  if (!text) return null;
  return {
    text,
    title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : null,
    subtitle:
      typeof item.subtitle === 'string' && item.subtitle.trim() ? item.subtitle.trim() : null,
    pageNumber:
      typeof item.pageNumber === 'string' && item.pageNumber.trim()
        ? item.pageNumber.trim()
        : typeof item.page_number === 'string' && item.page_number.trim()
          ? item.page_number.trim()
          : null,
    ocrQuality: clampScore(
      typeof item.ocrQuality === 'number'
        ? item.ocrQuality
        : typeof item.ocr_quality === 'number'
          ? item.ocr_quality
          : 0
    ),
    coherence: clampScore(typeof item.coherence === 'number' ? item.coherence : 0),
  };
}

function normalizeAiAnalysis(raw: BookPage['aiAnalysis'] | undefined): AiAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const ocrQ = typeof raw.ocrQuality === 'number' ? clampScore(raw.ocrQuality) : 0;
  const coherence = typeof raw.coherence === 'number' ? clampScore(raw.coherence) : 0;
  const pagesRaw = Array.isArray(raw.pages) ? raw.pages : null;
  const pages = pagesRaw
    ? pagesRaw
        .map((p) => normalizeAiPageText(p))
        .filter((p): p is NonNullable<typeof p> => p != null)
    : undefined;
  return {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : null,
    subtitle:
      typeof raw.subtitle === 'string' && raw.subtitle.trim() ? raw.subtitle.trim() : null,
    ocrQuality: ocrQ,
    coherence,
    pageNumber:
      typeof raw.pageNumber === 'string' && raw.pageNumber.trim()
        ? raw.pageNumber.trim()
        : null,
    promptTokens: normalizeTokenCount(raw.promptTokens),
    outputTokens: normalizeTokenCount(raw.outputTokens),
    totalTokens: normalizeTokenCount(raw.totalTokens),
    ...(pages && pages.length > 0 ? { pages } : {}),
  };
}

function normalizeTokenCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

function normalizeBook(book: Book): Book {
  return {
    ...book,
    coverUri: book.coverUri ?? null,
    pages: (book.pages ?? []).map(normalizePage),
  };
}

function freshAiFields(): Pick<BookPage, 'aiText' | 'aiStatus' | 'aiError' | 'aiAnalysis'> {
  return { aiText: '', aiStatus: 'idle', aiError: null, aiAnalysis: null };
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

/** Zapisuje meta bez nadpisywania updatedAt (shell z backendu). */
export async function writeBookShell(book: Book): Promise<Book> {
  const normalized = normalizeBook(book);
  await ensureDir(bookDir(normalized.id));
  await ensureDir(bookPagesDir(normalized.id));
  await FileSystem.writeAsStringAsync(
    bookMetaPath(normalized.id),
    JSON.stringify(normalized, null, 2)
  );
  scheduleBookSearchIndex(normalized);
  return normalized;
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
  const saved = await writeBook(book);
  try {
    if (!(await hasAuthToken())) {
      throw new Error('Zaloguj się, aby utworzyć książkę.');
    }
    await pushBookToRemote(saved);
  } catch (error) {
    await FileSystem.deleteAsync(bookDir(saved.id), { idempotent: true });
    scheduleRemoveBookSearchIndex(saved.id);
    throw error;
  }
  return saved;
}

export async function renameBook(bookId: string, title: string): Promise<Book> {
  const book = await readBook(bookId);
  book.title = title.trim() || book.title;
  const saved = await writeBook(book);
  syncRemoteQuietly(pushBookMetaToRemote(saved.id, saved.title));
  return saved;
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
  syncRemoteQuietly(deleteBookFromRemote(bookId));
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
    originalImageUri: null,
    ocrText: '',
    ...freshAiFields(),
    printedPageNumber: null,
    ocrQuality: null,
    ocrStatus: 'idle',
    createdAt: new Date().toISOString(),
  };

  book.pages = [...book.pages, page];
  const saved = await writeBook(book);
  syncRemoteQuietly(pushPageToRemote(bookId, page));
  return { book: saved, page };
}

/**
 * Capture v2: sam copy pliku kamery → meta. Zero ImageManipulator.
 * Orientację / OCR ogarnia późniejszy runPageOcr (gdy limit na to pozwala).
 * `cameraUri` = wersja przycięta/poprawiona; opcjonalnie `originalUri` = pełna klatka.
 */
export async function addPageFromCameraUri(
  bookId: string,
  cameraUri: string,
  options: { originalUri?: string | null; aiOnly?: boolean } = {}
): Promise<{ book: Book; page: BookPage }> {
  const book = await readBook(bookId);
  await ensureDir(bookPagesDir(bookId));

  const pageId = createId('page');
  const { imageUri, originalImageUri } = await copyPageImagePair(
    bookId,
    pageId,
    cameraUri,
    options.originalUri
  );

  const page: BookPage = {
    id: pageId,
    index: book.pages.length + 1,
    imageUri,
    originalImageUri,
    ocrText: '',
    ...freshAiFields(),
    printedPageNumber: null,
    ocrQuality: null,
    ocrStatus: 'idle',
    ...(options.aiOnly ? { aiOnly: true } : {}),
    createdAt: new Date().toISOString(),
  };

  book.pages = [...book.pages, page];
  const saved = await writeBook(book);
  syncRemoteQuietly(pushPageToRemote(bookId, page));
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
  const saved = await writeBook(book);
  const updatedPage = saved.pages.find((p) => p.id === pageId);
  if (updatedPage) {
    syncRemoteQuietly(pushPageOcrToRemote(bookId, updatedPage));
  }
  return saved;
}

export async function updatePageAi(
  bookId: string,
  pageId: string,
  patch: {
    aiText?: string;
    aiStatus?: AiStatus;
    aiError?: string | null;
    aiAnalysis?: AiAnalysis | null;
    printedPageNumber?: string | null;
  },
  options?: { syncRemote?: boolean }
): Promise<Book> {
  return updatePagesAi(bookId, [{ pageId, ...patch }], options);
}

/** Jednorazowy zapis AI dla wielu stron (jeden writeBook). */
export async function updatePagesAi(
  bookId: string,
  patches: Array<{
    pageId: string;
    aiText?: string;
    aiStatus?: AiStatus;
    aiError?: string | null;
    aiAnalysis?: AiAnalysis | null;
    printedPageNumber?: string | null;
  }>,
  options?: { syncRemote?: boolean }
): Promise<Book> {
  if (patches.length === 0) {
    return readBook(bookId);
  }

  const syncRemote = options?.syncRemote !== false;
  const byId = new Map(patches.map((patch) => [patch.pageId, patch]));
  const book = await readBook(bookId);
  book.pages = book.pages.map((page) => {
    const patch = byId.get(page.id);
    if (!patch) return page;
    const next = {
      ...page,
      aiText: patch.aiText ?? page.aiText,
      aiStatus: patch.aiStatus ?? page.aiStatus,
      aiError: patch.aiError !== undefined ? patch.aiError : (page.aiError ?? null),
      aiAnalysis:
        patch.aiAnalysis !== undefined
          ? normalizeAiAnalysis(patch.aiAnalysis)
          : (page.aiAnalysis ?? null),
      printedPageNumber:
        patch.printedPageNumber !== undefined
          ? patch.printedPageNumber
          : (page.printedPageNumber ?? null),
    };
    return {
      ...next,
      ocrStatus: resolvePageOcrStatus(next),
    };
  });
  const saved = await writeBook(book);
  if (syncRemote) {
    for (const patch of patches) {
      const updatedPage = saved.pages.find((p) => p.id === patch.pageId);
      if (updatedPage) {
        syncRemoteQuietly(pushPageOcrToRemote(bookId, updatedPage));
      }
    }
  }
  return saved;
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
  options: {
    extraRotate?: 0 | 90 | 180 | 270;
    alreadyNormalized?: boolean;
    originalUri?: string | null;
  } = {}
): Promise<{ book: Book; page: BookPage }> {
  const book = await readBook(bookId);
  const existing = book.pages.find((p) => p.id === pageId);
  if (!existing) {
    throw new Error(`Page not found: ${pageId}`);
  }

  await ensureDir(bookPagesDir(bookId));

  await deleteUriQuietly(existing.imageUri);
  await deleteUriQuietly(existing.originalImageUri);

  const portraitUri = options.alreadyNormalized
    ? sourceUri
    : await ensurePortraitUri(sourceUri, {
        extraRotate: options.extraRotate ?? 0,
      });
  const { imageUri, originalImageUri } = await copyPageImagePair(
    bookId,
    pageId,
    portraitUri,
    options.originalUri
  );

  const page: BookPage = {
    ...existing,
    imageUri,
    originalImageUri,
    ocrText: '',
    ...freshAiFields(),
    printedPageNumber: null,
    ocrQuality: null,
    ocrStatus: 'idle',
  };

  book.pages = book.pages.map((p) => (p.id === pageId ? page : p));
  const saved = await writeBook(book);
  syncRemoteQuietly(pushPageToRemote(bookId, page));
  return { book: saved, page };
}

/** Capture v2: podmiana samym copy, bez ImageManipulator. */
export async function replacePageFromCameraUri(
  bookId: string,
  pageId: string,
  cameraUri: string,
  options: { originalUri?: string | null; aiOnly?: boolean } = {}
): Promise<{ book: Book; page: BookPage }> {
  const book = await readBook(bookId);
  const existing = book.pages.find((p) => p.id === pageId);
  if (!existing) {
    throw new Error(`Page not found: ${pageId}`);
  }

  await ensureDir(bookPagesDir(bookId));

  await deleteUriQuietly(existing.imageUri);
  await deleteUriQuietly(existing.originalImageUri);

  const { imageUri, originalImageUri } = await copyPageImagePair(
    bookId,
    pageId,
    cameraUri,
    options.originalUri
  );

  const page: BookPage = {
    ...existing,
    imageUri,
    originalImageUri,
    ocrText: '',
    ...freshAiFields(),
    printedPageNumber: null,
    ocrQuality: null,
    ocrStatus: 'idle',
    aiOnly: options.aiOnly === true ? true : undefined,
  };

  book.pages = book.pages.map((p) => (p.id === pageId ? page : p));
  const saved = await writeBook(book);
  syncRemoteQuietly(pushPageToRemote(bookId, page));
  return { book: saved, page };
}

/**
 * Podmienia tylko kadr (wersję poprawioną), zachowując oryginalną klatkę.
 * Używane po ręcznym dopasowaniu rogów.
 */
export async function replacePageCroppedImage(
  bookId: string,
  pageId: string,
  croppedUri: string
): Promise<{ book: Book; page: BookPage }> {
  const book = await readBook(bookId);
  const existing = book.pages.find((p) => p.id === pageId);
  if (!existing) {
    throw new Error(`Page not found: ${pageId}`);
  }

  await ensureDir(bookPagesDir(bookId));

  const stamp = Date.now();
  const dest = pageImagePath(bookId, pageId, stamp);
  await FileSystem.copyAsync({ from: croppedUri, to: dest });
  await deleteUriQuietly(existing.imageUri);

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
  syncRemoteQuietly(pushPageToRemote(bookId, page));
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
  if (!existing.imageUri) {
    throw new Error('Brak lokalnego zdjęcia strony do obrotu.');
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
  await deleteUriQuietly(page?.imageUri);
  await deleteUriQuietly(page?.originalImageUri);
  book.pages = book.pages
    .filter((p) => p.id !== pageId)
    .map((p, idx) => ({ ...p, index: idx + 1 }));
  const saved = await writeBook(book);
  syncRemoteQuietly(deletePageFromRemote(bookId, pageId));
  // Renumber remaining pages on remote (best-effort).
  for (const remaining of saved.pages) {
    syncRemoteQuietly(pushPageOcrToRemote(bookId, remaining));
  }
  return saved;
}
