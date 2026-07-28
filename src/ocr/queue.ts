/**
 * Globalna kolejka OCR.
 *
 * Rozpoznawanie jednej strony blokuje wątek JS na 1–3 s. Ekran skanowania
 * czeka na OCR bieżącego zdjęcia (runPageOcrExclusive) zanim pozwoli na
 * kolejne. Ta kolejka obsługuje batchowe / ręczne zlecenia z innych ekranów.
 *
 * Kolejka jest jednowątkowa — dzięki temu równoległe zapisy do meta.json
 * nie nadpisują się wzajemnie.
 */
import { useSyncExternalStore } from 'react';

import { canRunOcr } from '@/src/ocr/quota';
import { runPageOcr, type RunPageOcrOptions } from '@/src/ocr/recognize';
import { withBookMetaLock } from '@/src/storage/lock';

export type OcrQueueJob = {
  bookId: string;
  pageId: string;
  pageIndex: number;
  imageUri: string;
  options?: RunPageOcrOptions;
};

export type OcrQueueState = {
  /** Zlecenia w bieżącej serii: zakończone + oczekujące. */
  total: number;
  /** Zakończone w bieżącej serii, łącznie z błędami. */
  completed: number;
  failed: number;
  /** Oczekujące + aktualnie analizowane. */
  remaining: number;
  /** Numer strony aktualnie analizowanej. */
  currentPageIndex: number | null;
  currentPageId: string | null;
  running: boolean;
  paused: boolean;
};

const EMPTY_STATE: OcrQueueState = {
  total: 0,
  completed: 0,
  failed: 0,
  remaining: 0,
  currentPageIndex: null,
  currentPageId: null,
  running: false,
  paused: false,
};

let waiting: OcrQueueJob[] = [];
let current: OcrQueueJob | null = null;
let total = 0;
let completed = 0;
let failed = 0;
let paused = false;
let pumping = false;

let snapshot: OcrQueueState = EMPTY_STATE;
const listeners = new Set<() => void>();

function publish(): void {
  snapshot = {
    total,
    completed,
    failed,
    remaining: waiting.length + (current ? 1 : 0),
    currentPageIndex: current?.pageIndex ?? null,
    currentPageId: current?.pageId ?? null,
    running: current != null,
    paused,
  };
  listeners.forEach((listener) => listener());
}

function resetCounters(): void {
  total = 0;
  completed = 0;
  failed = 0;
}

const IDLE_TIMEOUT_MS = 400;

/**
 * Oddaje wątek JS, dopóki się nie uspokoi — inaczej OCR startowałby w środku
 * animacji przejścia z kamery i ucinał ją. Timeout pilnuje, żeby kolejka
 * nie stanęła, gdy bezczynność nigdy nie nadejdzie.
 */
function whenIdle(): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    setTimeout(done, IDLE_TIMEOUT_MS);
    requestIdleCallback(done);
  });
}

/**
 * OCR poza kolejką, ale wciąż w tej samej sekwencji meta — dla akcji ręcznych
 * (ponowny OCR, obrót), gdzie ekran czeka na wynik. Zlecenie tej samej strony
 * czekające w kolejce jest odrzucane, żeby nie liczyć jej dwa razy.
 */
export function runPageOcrExclusive(
  bookId: string,
  pageId: string,
  imageUri: string,
  options?: RunPageOcrOptions
): Promise<string> {
  cancelOcrForPage(pageId);
  return withBookMetaLock(() => runPageOcr(bookId, pageId, imageUri, options));
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;

  try {
    while (!paused && waiting.length > 0) {
      await whenIdle();
      if (paused) break;

      const job = waiting.shift();
      if (!job) break;

      // Brak limitu OCR — zostaw zlecenie w kolejce, wznów gdy pojawi się zapas / Pro.
      if (!(await canRunOcr())) {
        waiting.unshift(job);
        break;
      }

      current = job;
      publish();

      try {
        await withBookMetaLock(() =>
          runPageOcr(job.bookId, job.pageId, job.imageUri, job.options)
        );
      } catch {
        failed += 1;
      }

      current = null;
      completed += 1;
      publish();
    }
  } finally {
    pumping = false;
    current = null;
    if (waiting.length === 0) {
      resetCounters();
    }
    publish();
  }
}

function isTracked(pageId: string): boolean {
  return current?.pageId === pageId || waiting.some((job) => job.pageId === pageId);
}

/**
 * Dodaje stronę do kolejki. Zwraca `false`, jeśli już w niej jest.
 * Analiza startuje od razu, chyba że kolejka jest wstrzymana.
 */
export function enqueueOcr(job: OcrQueueJob): boolean {
  if (isTracked(job.pageId)) return false;

  waiting.push(job);
  total += 1;
  publish();
  if (!paused) void pump();
  return true;
}

export function enqueueOcrJobs(jobs: OcrQueueJob[]): number {
  return jobs.filter((job) => enqueueOcr(job)).length;
}

/** Wstrzymuje kolejkę po zakończeniu bieżącej strony. */
export function holdOcrQueue(): void {
  if (paused) return;
  paused = true;
  publish();
}

/** Zwalnia kolejkę i uruchamia analizę zaległych stron. */
export function releaseOcrQueue(): void {
  paused = false;
  publish();
  void pump();
}

/** Wznawia pump, gdy w kolejce są zlecenia i wrócił zapas limitu OCR. */
export async function tryResumeOcrQueue(): Promise<void> {
  if (paused || pumping || waiting.length === 0) return;
  if (!(await canRunOcr())) return;
  void pump();
}

/** Usuwa stronę z kolejki (np. po jej skasowaniu). Nie przerywa trwającej analizy. */
export function cancelOcrForPage(pageId: string): void {
  const before = waiting.length;
  waiting = waiting.filter((job) => job.pageId !== pageId);
  const removed = before - waiting.length;
  if (removed === 0) return;

  total = Math.max(completed, total - removed);
  publish();
}

/** Usuwa z kolejki wszystkie strony danej książki. */
export function cancelOcrForBook(bookId: string): void {
  const before = waiting.length;
  waiting = waiting.filter((job) => job.bookId !== bookId);
  const removed = before - waiting.length;
  if (removed === 0) return;

  total = Math.max(completed, total - removed);
  publish();
}

export function getOcrQueueState(): OcrQueueState {
  return snapshot;
}

export function subscribeOcrQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOcrQueue(): OcrQueueState {
  return useSyncExternalStore(subscribeOcrQueue, getOcrQueueState, getOcrQueueState);
}
