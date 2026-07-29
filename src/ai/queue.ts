/**
 * Globalna kolejka korekty AI przez backend (kolejka Laravel + polling).
 * Stan aktywnego batcha jest zapisywany lokalnie, żeby po restarcie aplikacji
 * wznowić polling i pokazać box statusu.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { useSyncExternalStore } from 'react';

import { AI_POLL_INTERVAL_MS, isApiConfigured } from '@/src/ai/config';
import { needsAiRewrite } from '@/src/ai/displayText';
import * as api from '@/src/api/endpoints';
import { ApiError } from '@/src/api/types';
import { getAuthToken } from '@/src/api/token';
import { getBook, listBooks, updatePageAi } from '@/src/storage/books';
import { withBookMetaLock } from '@/src/storage/lock';

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
  batchId: number;
};

const EMPTY_STATE: AiQueueState = {
  total: 0,
  completed: 0,
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

async function persistActiveBatch(bookId: string, batchId: number): Promise<void> {
  const payload: PersistedAiBatch = { bookId, batchId };
  await FileSystem.writeAsStringAsync(activeBatchPath(), JSON.stringify(payload));
}

async function loadPersistedActiveBatch(): Promise<PersistedAiBatch | null> {
  try {
    const info = await FileSystem.getInfoAsync(activeBatchPath());
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(activeBatchPath());
    const parsed = JSON.parse(raw) as PersistedAiBatch;
    if (
      typeof parsed?.bookId !== 'string' ||
      typeof parsed?.batchId !== 'number' ||
      !Number.isFinite(parsed.batchId)
    ) {
      return null;
    }
    return parsed;
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
  snapshot = {
    total,
    completed,
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
          aiError: job.error ?? 'Korekta AI nie powiodła się.',
        })
      );
    }
  }
}

/** Strony lokalnie „pending”, których nie ma już w batchu (np. usunięte z kolejki). */
async function clearStalePendingPages(
  bookId: string,
  jobs: Awaited<ReturnType<typeof api.fetchAiBatch>>['jobs']
): Promise<void> {
  const known = new Set(jobs.map((job) => job.page_local_id));
  const book = await getBook(bookId);
  for (const page of book.pages) {
    if (page.aiStatus !== 'pending') continue;
    if (known.has(page.id)) continue;
    await withBookMetaLock(() =>
      updatePageAi(bookId, page.id, { aiStatus: 'idle', aiError: null })
    );
  }
}

async function pollUntilDone(bookId: string, batchId: number): Promise<void> {
  while (running) {
    const batch = await api.fetchAiBatch(batchId);
    completed = batch.completed + batch.failed;
    failed = batch.failed;
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
      await clearStalePendingPages(bookId, batch.jobs);
      if (batch.failed > 0 && batch.completed === 0) {
        lastError = batch.jobs.find((j) => j.error)?.error ?? 'Analiza AI nie powiodła się.';
      }
      return;
    }

    await sleep(AI_POLL_INTERVAL_MS);
  }
}

function beginFinish(bookId: string, batchId: number, waitUntilDone: boolean): Promise<void> | void {
  const finish = async () => {
    try {
      await pollUntilDone(bookId, batchId);
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

async function resumeCloudAnalysis(bookId: string, batchId: number): Promise<void> {
  if (running) return;

  running = true;
  cloudBatchId = batchId;
  lastError = null;
  appliedDone = new Set();
  phase = 'waiting';
  phaseDetail = 'Wznawiam analizę AI…';

  try {
    const book = await getBook(bookId);
    const pendingCount = book.pages.filter((page) => page.aiStatus === 'pending').length;
    total = Math.max(pendingCount, 1);
    completed = 0;
    failed = 0;
    currentPageIds = book.pages.filter((page) => page.aiStatus === 'pending').map((p) => p.id);
  } catch {
    total = 1;
    completed = 0;
    failed = 0;
    currentPageIds = [];
  }

  startTicker();
  publish();

  try {
    await persistActiveBatch(bookId, batchId);
    const batch = await api.fetchAiBatch(batchId);
    total = Math.max(batch.total, 1);
    completed = batch.completed + batch.failed;
    failed = batch.failed;
    queuePosition = batch.queue_position;
    currentPageIds = batch.jobs
      .filter((j) => j.status === 'queued' || j.status === 'processing')
      .map((j) => j.page_local_id);
    phase =
      batch.status === 'queued' || (queuePosition != null && queuePosition > 1)
        ? 'queued'
        : 'processing';
    phaseDetail =
      queuePosition != null && queuePosition > 1
        ? `W kolejce — pozycja ${queuePosition}`
        : 'Analiza AI w toku…';
    publish();

    const alreadyDone =
      batch.status === 'done' ||
      batch.status === 'failed' ||
      batch.status === 'partial' ||
      batch.completed + batch.failed >= batch.total;

    if (alreadyDone) {
      await applyJobResults(bookId, batch.jobs);
      await clearStalePendingPages(bookId, batch.jobs);
      if (batch.failed > 0 && batch.completed === 0) {
        lastError = batch.jobs.find((j) => j.error)?.error ?? 'Analiza AI nie powiodła się.';
      }
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
      return;
    }

    beginFinish(bookId, batchId, false);
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

async function findBatchForPendingBook(
  bookId: string
): Promise<{ batchId: number } | null> {
  const usage = await api.fetchAiUsage();
  const forBook = usage.data.filter((item) => item.book_local_id === bookId);
  const active = forBook.find(
    (item) => item.status === 'queued' || item.status === 'processing'
  );
  if (active) return { batchId: active.id };
  const latest = forBook[0];
  if (latest) return { batchId: latest.id };
  return null;
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
      await resumeCloudAnalysis(persisted.bookId, persisted.batchId);
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
      const match = await findBatchForPendingBook(book.id);
      if (match) {
        await resumeCloudAnalysis(book.id, match.batchId);
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
    .filter((page) => page.ocrText.trim().length > 0)
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
  failed = 0;
  lastError = null;
  currentPageIds = pages.map((p) => p.id);
  appliedDone = new Set();
  phase = 'preparing';
  phaseDetail = 'Wysyłam strony do chmury…';
  startTicker();
  publish();

  for (const page of pages) {
    await withBookMetaLock(() =>
      updatePageAi(bookId, page.id, { aiStatus: 'pending', aiError: null, aiAnalysis: null })
    );
  }

  try {
    const batch = await api.analyzeBook({
      local_id: book.id,
      title: book.title,
      pages: pages.map((page) => ({
        local_id: page.id,
        index: page.index,
        ocr_text: page.ocrText,
        printed_page_number: page.printedPageNumber,
      })),
    });

    cloudBatchId = batch.id;
    queuePosition = batch.queue_position;
    phase = 'queued';
    phaseDetail =
      queuePosition != null
        ? `W kolejce — pozycja ${queuePosition}`
        : 'Dodano do kolejki AI…';
    await persistActiveBatch(bookId, batch.id);
    publish();

    const maybePromise = beginFinish(bookId, batch.id, waitUntilDone);
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
    for (const page of pages) {
      const fresh = (await getBook(bookId)).pages.find((p) => p.id === page.id);
      if (fresh?.aiStatus === 'done') continue;
      await withBookMetaLock(() =>
        updatePageAi(bookId, page.id, {
          aiStatus: 'error',
          aiError: message,
        })
      );
    }
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
    throw new Error(page?.aiError ?? 'Korekta AI nie powiodła się.');
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
