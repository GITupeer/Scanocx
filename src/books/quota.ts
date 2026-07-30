/**
 * Limit liczby książek (łącznie).
 * Free: 3. Pro: nielimitowane.
 */
import { useSyncExternalStore } from 'react';

import { listBooks } from '@/src/storage/books';
import { FREE_BOOK_LIMIT } from '@/src/plans/features';

export { FREE_BOOK_LIMIT };

export type BookQuotaSnapshot = {
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
};

export class BookQuotaExceededError extends Error {
  constructor(message?: string) {
    super(
      message ??
        `Darmowy plan: limit ${FREE_BOOK_LIMIT} książek. Usuń książkę albo przejdź na Pro.`
    );
    this.name = 'BookQuotaExceededError';
  }
}

let snapshot: BookQuotaSnapshot = {
  limit: FREE_BOOK_LIMIT,
  used: 0,
  remaining: FREE_BOOK_LIMIT,
  unlimited: false,
};
const listeners = new Set<() => void>();

function publish(next: BookQuotaSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function getBookQuotaSnapshot(): BookQuotaSnapshot {
  return snapshot;
}

export function subscribeBookQuota(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function refreshBookQuota(isPro: boolean): Promise<BookQuotaSnapshot> {
  let used = 0;
  try {
    const books = await listBooks();
    used = books.length;
  } catch {
    return snapshot;
  }

  if (isPro) {
    const next: BookQuotaSnapshot = {
      limit: null,
      used,
      remaining: null,
      unlimited: true,
    };
    publish(next);
    return next;
  }

  const next: BookQuotaSnapshot = {
    limit: FREE_BOOK_LIMIT,
    used,
    remaining: Math.max(0, FREE_BOOK_LIMIT - used),
    unlimited: false,
  };
  publish(next);
  return next;
}

export async function assertCanCreateBook(isPro: boolean): Promise<void> {
  const snap = await refreshBookQuota(isPro);
  if (snap.unlimited) return;
  if ((snap.remaining ?? 0) <= 0) {
    throw new BookQuotaExceededError();
  }
}

export function useBookQuota(): BookQuotaSnapshot {
  return useSyncExternalStore(subscribeBookQuota, getBookQuotaSnapshot, getBookQuotaSnapshot);
}
