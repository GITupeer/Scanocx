import * as api from '@/src/api/endpoints';
import type { ApiBook, ApiBookPage, ApiBookSummary } from '@/src/api/types';
import { resolvePageOcrStatus } from '@/src/ai/displayText';
import type {
  AiAnalysis,
  AiPageText,
  AiStatus,
  Book,
  BookPage,
  BookSummary,
} from '@/src/domain/types';
import { hasAuthToken, pushBookToRemote } from '@/src/library/remote';
import {
  getBook as getLocalBook,
  listBooks as listLocalBooks,
  writeBookShell,
} from '@/src/storage/books';
import { bookDir, bookPagesDir, pageImagePath } from '@/src/storage/paths';
import * as FileSystem from 'expo-file-system/legacy';

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

function normalizeTokenCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

function mapApiAiPage(raw: unknown): AiPageText | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const text = typeof item.text === 'string' ? item.text.trim() : '';
  if (!text) return null;
  const ocrRaw = item.ocr_quality ?? item.ocrQuality;
  const pageRaw = item.page_number ?? item.pageNumber;
  return {
    text,
    title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : null,
    subtitle:
      typeof item.subtitle === 'string' && item.subtitle.trim() ? item.subtitle.trim() : null,
    pageNumber: typeof pageRaw === 'string' && pageRaw.trim() ? pageRaw.trim() : null,
    ocrQuality: typeof ocrRaw === 'number' ? clampScore(ocrRaw) : 0,
    coherence: typeof item.coherence === 'number' ? clampScore(item.coherence) : 0,
  };
}

/** Mapuje ai_meta z backendu (snake_case lub camelCase) na AiAnalysis. */
export function mapApiAiMeta(raw: unknown): AiAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const meta = raw as Record<string, unknown>;
  const ocrRaw = meta.ocr_quality ?? meta.ocrQuality;
  const coherenceRaw = meta.coherence;
  const pageRaw = meta.page_number ?? meta.pageNumber;
  const titleRaw = meta.title;
  const subtitleRaw = meta.subtitle;
  const pages = Array.isArray(meta.pages)
    ? meta.pages
        .map((p) => mapApiAiPage(p))
        .filter((p): p is AiPageText => p != null)
    : undefined;

  return {
    title: typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : null,
    subtitle:
      typeof subtitleRaw === 'string' && subtitleRaw.trim() ? subtitleRaw.trim() : null,
    ocrQuality: typeof ocrRaw === 'number' ? clampScore(ocrRaw) : 0,
    coherence: typeof coherenceRaw === 'number' ? clampScore(coherenceRaw) : 0,
    pageNumber:
      typeof pageRaw === 'string' && pageRaw.trim() ? pageRaw.trim() : null,
    promptTokens: normalizeTokenCount(meta.prompt_tokens ?? meta.promptTokens),
    outputTokens: normalizeTokenCount(meta.output_tokens ?? meta.outputTokens),
    totalTokens: normalizeTokenCount(meta.total_tokens ?? meta.totalTokens),
    ...(pages && pages.length > 0 ? { pages } : {}),
  };
}

function mapAiStatus(raw: string | null | undefined): AiStatus {
  if (raw === 'pending' || raw === 'done' || raw === 'error' || raw === 'idle') {
    return raw;
  }
  return 'idle';
}

async function fileExists(uri: string | null | undefined): Promise<boolean> {
  if (!uri?.trim()) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

/** Szuka lokalnego JPEG strony (stała ścieżka lub pageId-*.jpg). */
export async function resolveLocalPageImageUri(
  bookId: string,
  pageId: string,
  hintUri?: string | null
): Promise<string | null> {
  if (hintUri && (await fileExists(hintUri))) {
    return hintUri;
  }

  const canonical = pageImagePath(bookId, pageId);
  if (await fileExists(canonical)) {
    return canonical;
  }

  try {
    const dir = bookPagesDir(bookId);
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) return null;
    const entries = await FileSystem.readDirectoryAsync(dir);
    const match = entries
      .filter(
        (name) =>
          !name.includes('-original') &&
          (name === `${pageId}.jpg` ||
            (name.startsWith(`${pageId}-`) && name.endsWith('.jpg')))
      )
      .sort()
      .at(-1);
    return match ? `${dir}${match}` : null;
  } catch {
    return null;
  }
}

async function resolveLocalCoverUri(
  bookId: string,
  hintUri?: string | null
): Promise<string | null> {
  if (hintUri && (await fileExists(hintUri))) {
    return hintUri;
  }

  try {
    const dir = bookDir(bookId);
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) return null;
    const entries = await FileSystem.readDirectoryAsync(dir);
    const cover = entries
      .filter((name) => name.startsWith('cover-') && name.endsWith('.jpg'))
      .sort()
      .at(-1);
    return cover ? `${dir}${cover}` : null;
  } catch {
    return null;
  }
}

export async function mapApiPageToBookPage(
  bookId: string,
  page: ApiBookPage,
  localHint?: BookPage | null
): Promise<BookPage> {
  const aiStatus = mapAiStatus(page.ai_status);
  const ocrText = page.ocr_text ?? '';
  const aiText = page.ai_text ?? '';
  const aiAnalysis = mapApiAiMeta(page.ai_meta);
  const imageUri = await resolveLocalPageImageUri(
    bookId,
    page.local_id,
    localHint?.imageUri
  );
  const originalImageUri =
    localHint?.originalImageUri && (await fileExists(localHint.originalImageUri))
      ? localHint.originalImageUri
      : null;

  return {
    id: page.local_id,
    index: page.index,
    imageUri,
    originalImageUri,
    ocrText,
    aiText,
    printedPageNumber: page.printed_page_number ?? null,
    ocrQuality: localHint?.ocrQuality ?? null,
    aiAnalysis,
    ocrStatus: resolvePageOcrStatus({
      ocrText,
      aiText,
      aiStatus,
      ocrStatus: localHint?.ocrStatus,
    }),
    aiStatus,
    aiError: aiStatus === 'error' ? (localHint?.aiError ?? null) : null,
    ...(localHint?.aiOnly ? { aiOnly: true as const } : {}),
    createdAt: page.created_at ?? localHint?.createdAt ?? new Date().toISOString(),
  };
}

export async function mapApiBookToBook(
  remote: ApiBook,
  local?: Book | null
): Promise<Book> {
  const localById = new Map((local?.pages ?? []).map((p) => [p.id, p]));
  const pages: BookPage[] = [];
  for (const page of remote.pages) {
    pages.push(
      await mapApiPageToBookPage(remote.local_id, page, localById.get(page.local_id))
    );
  }

  const coverUri = await resolveLocalCoverUri(remote.local_id, local?.coverUri);

  return {
    id: remote.local_id,
    title: remote.title,
    coverUri,
    createdAt: remote.created_at ?? local?.createdAt ?? new Date().toISOString(),
    updatedAt: remote.updated_at ?? local?.updatedAt ?? new Date().toISOString(),
    pages,
  };
}

export function mapApiSummaryToBookSummary(
  remote: ApiBookSummary,
  coverUri: string | null
): BookSummary {
  return {
    id: remote.local_id,
    title: remote.title,
    coverUri,
    createdAt: remote.created_at ?? new Date().toISOString(),
    updatedAt: remote.updated_at ?? new Date().toISOString(),
    pageCount: remote.page_count,
  };
}

/** Lista książek z backendu + lokalne okładki. */
export async function listLibraryBooks(): Promise<BookSummary[]> {
  if (!(await hasAuthToken())) {
    return [];
  }

  const { data } = await api.fetchBooks();
  const localList = await listLocalBooks().catch(() => [] as BookSummary[]);
  const localCoverById = new Map(localList.map((b) => [b.id, b.coverUri]));

  const summaries: BookSummary[] = [];
  for (const remote of data) {
    const coverUri = await resolveLocalCoverUri(
      remote.local_id,
      localCoverById.get(remote.local_id) ?? null
    );
    summaries.push(mapApiSummaryToBookSummary(remote, coverUri));
  }

  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Pobiera książkę z API, dokleja lokalne zdjęcia i zapisuje lokalny shell meta.json,
 * żeby OCR/AI/mutacje dalej działały na storage.
 */
export async function getLibraryBook(bookId: string): Promise<Book> {
  if (!(await hasAuthToken())) {
    throw new Error('Zaloguj się, aby otworzyć książkę.');
  }

  let local: Book | null = null;
  try {
    local = await getLocalBook(bookId);
  } catch {
    local = null;
  }

  try {
    const remote = await api.fetchBook(bookId);
    const merged = await mapApiBookToBook(remote, local);
    await writeBookShell(merged);
    return merged;
  } catch (error) {
    // Lokalna książka jeszcze nie zsynchronizowana — wypchnij i użyj lokalnej.
    if (local) {
      await pushBookToRemote(local).catch(() => undefined);
      return local;
    }
    throw error;
  }
}

/**
 * Gwarantuje lokalny meta.json przed mutacjami (capture itd.).
 * Cloud-only książki z listy nie mają shella — ściąga go z API tylko gdy brak lokalnie.
 */
export async function ensureLocalBook(bookId: string): Promise<Book> {
  try {
    return await getLocalBook(bookId);
  } catch {
    return getLibraryBook(bookId);
  }
}

/**
 * Upload lokalnych książek nieobecnych na backendzie (migracja po zmianie modelu).
 */
export async function migrateLocalBooksToRemote(): Promise<void> {
  if (!(await hasAuthToken())) return;

  const [{ data: remote }, localBooks] = await Promise.all([
    api.fetchBooks(),
    listLocalBooks(),
  ]);
  const remoteIds = new Set(remote.map((b) => b.local_id));

  for (const summary of localBooks) {
    if (remoteIds.has(summary.id)) continue;
    try {
      const book = await getLocalBook(summary.id);
      await pushBookToRemote(book);
    } catch {
      // pomiń uszkodzone / niedostępne lokalne książki
    }
  }
}
