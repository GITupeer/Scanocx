/**
 * Globalna kolejka korekty AI przez backend (kolejka Laravel + polling).
 * Stan aktywnego batcha jest zapisywany lokalnie, żeby po restarcie aplikacji
 * wznowić polling i pokazać box statusu.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { useSyncExternalStore } from 'react';

import { AI_POLL_INTERVAL_MS, isApiConfigured } from '@/src/ai/config';
import { canRunAiRewrite, needsAiRewrite } from '@/src/ai/displayText';
import * as api from '@/src/api/endpoints';
import { ApiError } from '@/src/api/types';
import { getAuthToken } from '@/src/api/token';
import { getBook, listBooks, updatePageAi, updatePagesAi } from '@/src/storage/books';
import { withBookMetaLock } from '@/src/storage/lock';

/** Ile stron w jednym requeście — unika OOM i ogromnego JSON z base64. */
const AI_UPLOAD_CHUNK_SIZE = 12;
/** Minimalny odstęp między odświeżeniami UI podczas przygotowania zdjęć. */
const PROGRESS_PUBLISH_MS = 120;

export type AiQueueJob = {
  bookId: string;
  pageId: string;
  pageIndex: number;
};

export type AiQueuePhase =
  | 'idle'
  | 'preparing'
  | 'queued'
  | 'processing'
  | 'sending'
  | 'waiting'
  | 'parsing'
  | 'saving';

export type AiQueueState = {
  total: number;
  completed: number;
  /** Postęp przygotowania/wysyłki (osobno od completed analizy w chmurze). */
  prepared: number;
  failed: number;
  remaining: number;
  currentPageIndex: number | null;
  currentPageId: string | null;
  currentPageIds: string[];
  currentBatchLabel: string | null;
  batchIndex: number;
  batchCount: number;
  phase: AiQueuePhase;
  phaseDetail: string;
  elapsedSec: number;
  lastError: string | null;
  running: boolean;
  queuePosition: number | null;
  cloudBatchId: number | null;
};

type PersistedAiBatch = {
  bookId: string;
  /** Wszystkie chunki jednej sesji wysyłki — po restarcie pollowane po kolei. */
  batchIds: number[];
  chunkTotals: number[];
};

const EMPTY_STATE: AiQueueState = {
  total: 0,
  completed: 0,
  prepared: 0,
  failed: 0,
  remaining: 0,
  currentPageIndex: null,
  currentPageId: null,
  currentPageIds: [],
  currentBatchLabel: null,
  batchIndex: 0,
  batchCount: 0,
  phase: 'idle',
  phaseDetail: '',
  elapsedSec: 0,
  lastError: null,
  running: false,
  queuePosition: null,
  cloudBatchId: null,
};

let total = 0;
let completed = 0;
let prepared = 0;
let failed = 0;
let phase: AiQueuePhase = 'idle';
let phaseDetail = '';
let elapsedSec = 0;
let lastError: string | null = null;
let batchStartedAt: number | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let running = false;
let queuePosition: number | null = null;
let cloudBatchId: number | null = null;
let currentPageIds: string[] = [];
let appliedDone = new Set<number>();
let lastProgressPublishAt = 0;
let progressPublishTimer: ReturnType<typeof setTimeout> | null = null;

let snapshot: AiQueueState = EMPTY_STATE;
const listeners = new Set<() => void>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function activeBatchPath(): string {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error('documentDirectory is unavailable on this platform.');
  }
  return `${root}ai-active-batch.json`;
}

async function persistActiveBatches(
  bookId: string,
  batchIds: number[],
  chunkTotals: number[]
): Promise<void> {
  const payload: PersistedAiBatch = { bookId, batchIds, chunkTotals };
  await FileSystem.writeAsStringAsync(activeBatchPath(), JSON.stringify(payload));
}

async function loadPersistedActiveBatch(): Promise<PersistedAiBatch | null> {
  try {
    const info = await FileSystem.getInfoAsync(activeBatchPath());
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(activeBatchPath());
    const parsed = JSON.parse(raw) as Partial<PersistedAiBatch> & { batchId?: number };
    if (typeof parsed?.bookId !== 'string') return null;

    // Kompatybilność ze starym formatem { bookId, batchId }.
    if (Array.isArray(parsed.batchIds) && parsed.batchIds.length > 0) {
      const batchIds = parsed.batchIds.filter(
        (id): id is number => typeof id === 'number' && Number.isFinite(id)
      );
      if (batchIds.length === 0) return null;
      const chunkTotals = Array.isArray(parsed.chunkTotals)
        ? parsed.chunkTotals.filter(
            (n): n is number => typeof n === 'number' && Number.isFinite(n)
          )
        : [];
      return { bookId: parsed.bookId, batchIds, chunkTotals };
    }

    if (typeof parsed.batchId === 'number' && Number.isFinite(parsed.batchId)) {
      return { bookId: parsed.bookId, batchIds: [parsed.batchId], chunkTotals: [] };
    }

    return null;
  } catch {
    return null;
  }
}

async function clearPersistedActiveBatch(): Promise<void> {
  try {
    await FileSystem.deleteAsync(activeBatchPath(), { idempotent: true });
  } catch {
    // ignore
  }
}

function publish(): void {
  if (progressPublishTimer) {
    clearTimeout(progressPublishTimer);
    progressPublishTimer = null;
  }
  lastProgressPublishAt = Date.now();
  snapshot = {
    total,
    completed,
    prepared,
    failed,
    remaining: Math.max(0, total - completed),
    currentPageIndex: null,
    currentPageId: currentPageIds[0] ?? null,
    currentPageIds: [...currentPageIds],
    currentBatchLabel:
      queuePosition != null && queuePosition > 0
        ? `pozycja w kolejce: ${queuePosition}`
        : null,
    batchIndex: completed,
    batchCount: total,
    phase,
    phaseDetail,
    elapsedSec,
    lastError,
    running,
    queuePosition,
    cloudBatchId,
  };
  listeners.forEach((listener) => listener());
}

/** Odśwież UI postępu wysyłki bez zalewania Reacta setState’ami. */
function publishProgress(): void {
  const now = Date.now();
  const wait = PROGRESS_PUBLISH_MS - (now - lastProgressPublishAt);
  if (wait <= 0) {
    publish();
    return;
  }
  if (progressPublishTimer) return;
  progressPublishTimer = setTimeout(() => {
    progressPublishTimer = null;
    publish();
  }, wait);
}

function stopTicker(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  batchStartedAt = null;
  elapsedSec = 0;
}

function startTicker(): void {
  stopTicker();
  batchStartedAt = Date.now();
  elapsedSec = 0;
  tickTimer = setInterval(() => {
    if (batchStartedAt == null) return;
    elapsedSec = Math.floor((Date.now() - batchStartedAt) / 1000);
    publish();
  }, 1000);
}

function resetCounters(): void {
  total = 0;
  completed = 0;
  prepared = 0;
  failed = 0;
  phase = 'idle';
  phaseDetail = '';
  lastError = null;
  queuePosition = null;
  cloudBatchId = null;
  currentPageIds = [];
  appliedDone = new Set();
  running = false;
  stopTicker();
}

async function applyJobResults(
  bookId: string,
  jobs: Awaited<ReturnType<typeof api.fetchAiBatch>>['jobs']
): Promise<void> {
  for (const job of jobs) {
    if (appliedDone.has(job.id)) continue;

    if (job.status === 'done' && job.ai_text) {
      appliedDone.add(job.id);
      const meta = job.ai_meta;
      const analysis =
        meta != null
          ? {
              title: meta.title,
              subtitle: meta.subtitle,
              ocrQuality: meta.ocr_quality,
              coherence: meta.coherence,
              pageNumber: meta.page_number,
              promptTokens:
                typeof meta.prompt_tokens === 'number' ? meta.prompt_tokens : null,
              outputTokens:
                typeof meta.output_tokens === 'number' ? meta.output_tokens : null,
              totalTokens: typeof meta.total_tokens === 'number' ? meta.total_tokens : null,
            }
          : null;
      await withBookMetaLock(() =>
        updatePageAi(bookId, job.page_local_id, {
          aiText: job.ai_text ?? '',
          aiStatus: 'done',
          aiError: null,
          aiAnalysis: analysis,
          printedPageNumber:
            job.printed_page_number !== undefined && job.printed_page_number !== null
              ? job.printed_page_number
              : undefined,
        })
      );
    } else if (job.status === 'failed') {
      appliedDone.add(job.id);
      await withBookMetaLock(() =>
        updatePageAi(bookId, job.page_local_id, {
          aiStatus: 'error',
          aiError: job.error ?? 'Analiza i Korekta AI nie powiodła się.',
        })
      );
    }
  }
}

/** Strony lokalnie „pending”, których nie ma w żadnym znanym batchu sesji. */
async function clearStalePendingPages(
  bookId: string,
  knownPageIds: Iterable<string>
): Promise<void> {
  const known = new Set(knownPageIds);
  const book = await getBook(bookId);
  for (const page of book.pages) {
    if (page.aiStatus !== 'pending') continue;
    if (known.has(page.id)) continue;
    await withBookMetaLock(() =>
      updatePageAi(bookId, page.id, { aiStatus: 'idle', aiError: null })
    );
  }
}

async function pollUntilDone(
  bookId: string,
  batchId: number,
  completedOffset = 0,
  failedOffset = 0
): Promise<{ pageIds: string[]; failed: number; total: number }> {
  while (running) {
    const batch = await api.fetchAiBatch(batchId);
    completed = completedOffset + batch.completed + batch.failed;
    failed = failedOffset + batch.failed;
    queuePosition = batch.queue_position;
    currentPageIds = batch.jobs
      .filter((j) => j.status === 'queued' || j.status === 'processing')
      .map((j) => j.page_local_id);

    if (queuePosition != null && queuePosition > 3) {
      phase = 'queued';
      phaseDetail = `W kolejce — pozycja ${queuePosition}`;
    } else if (batch.status === 'queued' || (queuePosition != null && queuePosition > 1)) {
      phase = 'queued';
      phaseDetail =
        queuePosition != null
          ? `W kolejce — pozycja ${queuePosition}`
          : 'Oczekiwanie w kolejce…';
    } else {
      phase = 'processing';
      phaseDetail = 'Analiza AI w toku…';
    }

    await applyJobResults(bookId, batch.jobs);
    publish();

    const done =
      batch.status === 'done' ||
      batch.status === 'failed' ||
      batch.status === 'partial' ||
      batch.completed + batch.failed >= batch.total;

    if (done) {
      if (batch.failed > 0 && batch.completed === 0) {
        lastError = batch.jobs.find((j) => j.error)?.error ?? 'Analiza AI nie powiodła się.';
      }
      return {
        pageIds: batch.jobs.map((j) => j.page_local_id).filter(Boolean),
        failed: batch.failed,
        total: batch.total,
      };
    }

    await sleep(AI_POLL_INTERVAL_MS);
  }

  return { pageIds: [], failed: 0, total: 0 };
}

async function resolveChunkTotals(
  batchIds: number[],
  chunkTotals: number[]
): Promise<number[]> {
  if (chunkTotals.length === batchIds.length) return chunkTotals;
  const totals: number[] = [];
  for (const batchId of batchIds) {
    const batch = await api.fetchAiBatch(batchId);
    totals.push(batch.total);
  }
  return totals;
}

function beginFinish(
  bookId: string,
  batchIds: number[],
  waitUntilDone: boolean,
  chunkTotals: number[]
): Promise<void> | void {
  const finish = async () => {
    const knownPageIds = new Set<string>();
    try {
      const totals = await resolveChunkTotals(batchIds, chunkTotals);
      await persistActiveBatches(bookId, batchIds, totals);

      total = Math.max(
        total,
        totals.reduce((sum, n) => sum + n, 0)
      );

      let offset = 0;
      let failedAccum = 0;
      for (let i = 0; i < batchIds.length; i++) {
        if (!running) break;
        const batchId = batchIds[i]!;
        cloudBatchId = batchId;
        await persistActiveBatches(bookId, batchIds, totals);
        const result = await pollUntilDone(bookId, batchId, offset, failedAccum);
        for (const pageId of result.pageIds) knownPageIds.add(pageId);
        failedAccum += result.failed;
        offset += totals[i] ?? result.total;
        completed = offset;
        failed = failedAccum;
        publish();
      }

      await clearStalePendingPages(bookId, knownPageIds);
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Błąd odczytu statusu kolejki.';
      publish();
      throw error;
    } finally {
      await clearPersistedActiveBatch();
      stopTicker();
      running = false;
      phase = 'idle';
      phaseDetail = '';
      queuePosition = null;
      publish();
      setTimeout(() => {
        if (!running) {
          resetCounters();
          publish();
        }
      }, 2500);
    }
  };

  if (waitUntilDone) {
    return finish();
  }
  void finish().catch(() => undefined);
}

async function resumeCloudAnalysis(
  bookId: string,
  batchIds: number[],
  chunkTotals: number[] = []
): Promise<void> {
  if (running || batchIds.length === 0) return;

  running = true;
  cloudBatchId = batchIds[0] ?? null;
  lastError = null;
  appliedDone = new Set();
  phase = 'waiting';
  phaseDetail = 'Wznawiam analizę AI…';

  try {
    const book = await getBook(bookId);
    const pendingCount = book.pages.filter((page) => page.aiStatus === 'pending').length;
    total = Math.max(pendingCount, 1);
    completed = 0;
    prepared = 0;
    failed = 0;
    currentPageIds = book.pages.filter((page) => page.aiStatus === 'pending').map((p) => p.id);
  } catch {
    total = 1;
    completed = 0;
    prepared = 0;
    failed = 0;
    currentPageIds = [];
  }

  startTicker();
  publish();

  try {
    const totals = await resolveChunkTotals(batchIds, chunkTotals);
    total = Math.max(
      totals.reduce((sum, n) => sum + n, 0),
      1
    );
    prepared = total;
    await persistActiveBatches(bookId, batchIds, totals);
    beginFinish(bookId, batchIds, false, totals);
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Nie udało się wznowić analizy AI.';
    running = false;
    phase = 'idle';
    stopTicker();
    await clearPersistedActiveBatch();
    publish();
    setTimeout(() => {
      if (!running) {
        resetCounters();
        publish();
      }
    }, 2500);
  }
}

async function findBatchesForPendingBook(
  bookId: string
): Promise<{ batchIds: number[]; chunkTotals: number[] } | null> {
  const usage = await api.fetchAiUsage();
  const forBook = usage.data
    .filter((item) => item.book_local_id === bookId)
    .sort((a, b) => a.id - b.id);
  if (forBook.length === 0) return null;

  const active = forBook.filter(
    (item) => item.status === 'queued' || item.status === 'processing'
  );

  // Aktywne chunki + wszystkie późniejsze z tej samej wysyłki.
  // Bez aktywnych: najnowsza „fala” (okno 30 min od najnowszego batcha),
  // żeby dociągnąć wyniki niesynchonizowane lokalnie.
  let selected = forBook;
  if (active.length > 0) {
    const firstActiveId = Math.min(...active.map((item) => item.id));
    selected = forBook.filter((item) => item.id >= firstActiveId);
  } else {
    const latest = forBook[forBook.length - 1]!;
    const latestAt = latest.created_at ? Date.parse(latest.created_at) : NaN;
    if (Number.isFinite(latestAt)) {
      const windowMs = 30 * 60 * 1000;
      selected = forBook.filter((item) => {
        const at = item.created_at ? Date.parse(item.created_at) : NaN;
        return Number.isFinite(at) && latestAt - at <= windowMs;
      });
    } else {
      selected = [latest];
    }
  }

  if (selected.length === 0) return null;
  return {
    batchIds: selected.map((item) => item.id),
    chunkTotals: selected.map((item) => item.total),
  };
}

async function resetOrphanPendingPages(bookId: string): Promise<void> {
  const book = await getBook(bookId);
  for (const page of book.pages) {
    if (page.aiStatus !== 'pending') continue;
    await withBookMetaLock(() =>
      updatePageAi(bookId, page.id, { aiStatus: 'idle', aiError: null })
    );
  }
}

/**
 * Po starcie aplikacji / wejściu na książkę: jeśli lokalnie są strony
 * `aiStatus: pending` albo zapisany batch — wznów polling z backendu.
 */
export async function resumePendingCloudAi(preferredBookId?: string): Promise<void> {
  if (running || !isApiConfigured()) return;
  const token = await getAuthToken();
  if (!token) return;

  const persisted = await loadPersistedActiveBatch();
  if (persisted) {
    if (!preferredBookId || preferredBookId === persisted.bookId) {
      await resumeCloudAnalysis(persisted.bookId, persisted.batchIds, persisted.chunkTotals);
      return;
    }
  }

  const books = preferredBookId
    ? [{ id: preferredBookId }]
    : await listBooks();

  for (const summary of books) {
    let book;
    try {
      book = await getBook(summary.id);
    } catch {
      continue;
    }
    const pending = book.pages.filter((page) => page.aiStatus === 'pending');
    if (pending.length === 0) continue;

    try {
      const match = await findBatchesForPendingBook(book.id);
      if (match) {
        await resumeCloudAnalysis(book.id, match.batchIds, match.chunkTotals);
        return;
      }
      await resetOrphanPendingPages(book.id);
    } catch {
      // Brak sieci / usage — zostaw pending; kolejna próba przy wejściu na książkę.
      return;
    }
  }
}

function isAiQuotaExceeded(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 402 || error.status === 429) return true;
  return isAiQuotaErrorMessage(error.message);
}

function isAiQuotaErrorMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const msg = message.toLowerCase();
  return (
    msg.includes('limit') ||
    msg.includes('quota') ||
    msg.includes('przekrocz')
  );
}

async function clearAiQuotaErrors(
  bookId: string,
  pages: Array<{ id: string; aiStatus: string; aiError: string | null }>
): Promise<void> {
  for (const page of pages) {
    if (page.aiStatus !== 'error' || !isAiQuotaErrorMessage(page.aiError)) continue;
    await withBookMetaLock(() =>
      updatePageAi(bookId, page.id, { aiStatus: 'idle', aiError: null })
    );
  }
}

async function resetPagesToIdle(bookId: string, pageIds: string[]): Promise<void> {
  for (const pageId of pageIds) {
    const fresh = (await getBook(bookId)).pages.find((p) => p.id === pageId);
    if (!fresh || fresh.aiStatus === 'done') continue;
    await withBookMetaLock(() =>
      updatePageAi(bookId, pageId, { aiStatus: 'idle', aiError: null })
    );
  }
}

async function startCloudAnalysis(
  bookId: string,
  pageIds?: string[],
  waitUntilDone = false
): Promise<number> {
  if (!isApiConfigured()) {
    throw new Error('Brak EXPO_PUBLIC_API_BASE_URL.');
  }
  const token = await getAuthToken();
  if (!token) {
    throw new ApiError('Zaloguj się, aby uruchomić analizę AI.', 401);
  }
  if (running) {
    throw new Error('Analiza AI już trwa.');
  }

  const book = await getBook(bookId);
  let pages = book.pages
    .filter((page) => (pageIds ? pageIds.includes(page.id) : needsAiRewrite(page)))
    .filter((page) => Boolean(page.imageUri?.trim()))
    .sort((a, b) => a.index - b.index);

  if (pages.length === 0) {
    return 0;
  }

  // Tylko tyle stron, ile mieści się w limicie — reszta zostaje bez błędu.
  try {
    const quota = await api.fetchQuota();
    const remaining = Math.max(0, quota.remaining);
    if (remaining <= 0) {
      await clearAiQuotaErrors(bookId, pages);
      return 0;
    }
    if (pages.length > remaining) {
      const skipped = pages.slice(remaining);
      pages = pages.slice(0, remaining);
      await clearAiQuotaErrors(bookId, skipped);
    }
  } catch {
    // Brak sieci / quota — spróbuj wysłać; backend i tak odrzuci przy limicie.
  }

  if (pages.length === 0) {
    return 0;
  }

  running = true;
  total = pages.length;
  completed = 0;
  prepared = 0;
  failed = 0;
  lastError = null;
  currentPageIds = pages.map((p) => p.id);
  appliedDone = new Set();
  phase = 'preparing';
  phaseDetail = `Przygotowuję zdjęcia… 0/${pages.length}`;
  startTicker();
  publish();

  await withBookMetaLock(() =>
    updatePagesAi(
      bookId,
      pages.map((page) => ({
        pageId: page.id,
        aiStatus: 'pending' as const,
        aiError: null,
        aiAnalysis: null,
      }))
    )
  );

  const batchIds: number[] = [];
  const chunkTotals: number[] = [];

  try {
    for (let offset = 0; offset < pages.length; offset += AI_UPLOAD_CHUNK_SIZE) {
      const chunk = pages.slice(offset, offset + AI_UPLOAD_CHUNK_SIZE);
      phase = 'preparing';
      phaseDetail = `Przygotowuję zdjęcia… ${prepared}/${total}`;
      publish();

      const batch = await api.analyzeBook(
        {
          local_id: book.id,
          title: book.title,
          pages: chunk.map((page) => ({
            local_id: page.id,
            index: page.index,
            imageUri: page.imageUri,
            printed_page_number: page.printedPageNumber,
          })),
        },
        (doneInChunk) => {
          prepared = offset + doneInChunk;
          phase = doneInChunk < chunk.length ? 'preparing' : 'sending';
          phaseDetail =
            doneInChunk < chunk.length
              ? `Przygotowuję zdjęcia… ${prepared}/${total}`
              : `Wysyłam strony do chmury… ${prepared}/${total}`;
          publishProgress();
        }
      );

      prepared = offset + chunk.length;
      batchIds.push(batch.id);
      chunkTotals.push(chunk.length);
      cloudBatchId = batch.id;
      queuePosition = batch.queue_position;
      await persistActiveBatches(bookId, batchIds, chunkTotals);
      phase = 'sending';
      phaseDetail = `Wysłano ${prepared}/${total}…`;
      publish();
    }

    completed = 0;
    prepared = total;
    phase = 'queued';
    phaseDetail =
      queuePosition != null
        ? `W kolejce — pozycja ${queuePosition}`
        : 'Dodano do kolejki AI…';
    publish();

    const maybePromise = beginFinish(bookId, batchIds, waitUntilDone, chunkTotals);
    if (waitUntilDone && maybePromise) {
      await maybePromise;
    }

    return pages.length;
  } catch (error) {
    // Limit wyczerpany — cicho wycofaj pending, bez błędu na stronach / w karcie kolejki.
    if (isAiQuotaExceeded(error)) {
      await resetPagesToIdle(
        bookId,
        pages.map((p) => p.id)
      );
      resetCounters();
      await clearPersistedActiveBatch();
      publish();
      return 0;
    }

    const message = error instanceof Error ? error.message : 'Błąd analizy AI.';
    const bookNow = await getBook(bookId);
    const doneIds = new Set(
      bookNow.pages.filter((p) => p.aiStatus === 'done').map((p) => p.id)
    );
    await withBookMetaLock(() =>
      updatePagesAi(
        bookId,
        pages
          .filter((page) => !doneIds.has(page.id))
          .map((page) => ({
            pageId: page.id,
            aiStatus: 'error' as const,
            aiError: message,
          }))
      )
    );
    lastError = message;
    running = false;
    phase = 'idle';
    stopTicker();
    await clearPersistedActiveBatch();
    publish();
    throw error;
  }
}

export function enqueueAiRewrite(job: AiQueueJob): boolean {
  if (!isApiConfigured() || running) return false;
  void startCloudAnalysis(job.bookId, [job.pageId], false).catch(() => undefined);
  return true;
}

export function enqueueAiRewriteJobs(jobs: AiQueueJob[]): number {
  if (jobs.length === 0 || running) return 0;
  const bookId = jobs[0]?.bookId;
  if (!bookId) return 0;
  void startCloudAnalysis(
    bookId,
    jobs.map((j) => j.pageId),
    false
  ).catch(() => undefined);
  return jobs.length;
}

export function enqueueAiRewriteForce(job: AiQueueJob): boolean {
  return enqueueAiRewrite(job);
}

export function cancelAiForPage(_pageId: string): void {
  // v1: brak anulowania jobów w chmurze
}

export function cancelAiForBook(_bookId: string): void {
  // v1: brak anulowania jobów w chmurze
}

export async function enqueuePendingAiForBook(bookId: string): Promise<number> {
  if (!isApiConfigured()) return 0;
  return startCloudAnalysis(bookId, undefined, false);
}

/** Korekta AI wszystkich stron z gotowym OCR — także tych już oznaczonych jako done. */
export async function enqueueAllAiForBook(bookId: string): Promise<number> {
  if (!isApiConfigured()) return 0;
  const book = await getBook(bookId);
  const pageIds = book.pages.filter(canRunAiRewrite).map((page) => page.id);
  if (pageIds.length === 0) return 0;
  return startCloudAnalysis(bookId, pageIds, false);
}

/** Usuwa stare błędy limitu AI (np. „Przekroczono limit”) — strony wracają do idle. */
export async function clearAiQuotaErrorsForBook(bookId: string): Promise<boolean> {
  const book = await getBook(bookId);
  const dirty = book.pages.filter(
    (page) => page.aiStatus === 'error' && isAiQuotaErrorMessage(page.aiError)
  );
  if (dirty.length === 0) return false;
  await clearAiQuotaErrors(bookId, dirty);
  return true;
}

export async function runPageAiExclusive(bookId: string, pageId: string): Promise<string> {
  await startCloudAnalysis(bookId, [pageId], true);
  const book = await getBook(bookId);
  const page = book.pages.find((p) => p.id === pageId);
  if (!page || page.aiStatus !== 'done' || !page.aiText.trim()) {
    throw new Error(page?.aiError ?? 'Analiza i Korekta AI nie powiodła się.');
  }
  return page.aiText;
}

export function getAiQueueState(): AiQueueState {
  return snapshot;
}

export function subscribeAiQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAiQueue(): AiQueueState {
  return useSyncExternalStore(subscribeAiQueue, getAiQueueState, getAiQueueState);
}
