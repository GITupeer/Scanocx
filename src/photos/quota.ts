/**
 * Limit zdjęć stron (lokalnie, wg createdAt).
 * Free / gość: 100 / miesiąc. Pro: nielimitowane.
 */
import { useSyncExternalStore } from 'react';

import { listBooks, getBook } from '@/src/storage/books';

export const FREE_PHOTO_MONTHLY_LIMIT = 100;

export type PhotoQuotaSnapshot = {
  periodKey: string;
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
};

export class PhotoQuotaExceededError extends Error {
  constructor(message?: string) {
    super(
      message ??
        `Darmowy plan: limit ${FREE_PHOTO_MONTHLY_LIMIT} zdjęć na miesiąc. Przejdź na Pro, aby skanować bez limitu.`
    );
    this.name = 'PhotoQuotaExceededError';
  }
}

const TZ = 'Europe/Warsaw';

let snapshot: PhotoQuotaSnapshot = {
  periodKey: '',
  limit: FREE_PHOTO_MONTHLY_LIMIT,
  used: 0,
  remaining: FREE_PHOTO_MONTHLY_LIMIT,
  unlimited: false,
};
const listeners = new Set<() => void>();

function publish(next: PhotoQuotaSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function periodKeyNow(): string {
  // en-CA → YYYY-MM-DD; bierzemy YYYY-MM w Europe/Warsaw
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
}

function periodKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  return year && month ? `${year}-${month}` : '';
}

export function getPhotoQuotaSnapshot(): PhotoQuotaSnapshot {
  return snapshot;
}

export function subscribePhotoQuota(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function refreshPhotoQuota(isPro: boolean): Promise<PhotoQuotaSnapshot> {
  const periodKey = periodKeyNow();
  if (isPro) {
    const next: PhotoQuotaSnapshot = {
      periodKey,
      limit: null,
      used: 0,
      remaining: null,
      unlimited: true,
    };
    publish(next);
    return next;
  }

  let used = 0;
  try {
    const books = await listBooks();
    for (const summary of books) {
      const book = await getBook(summary.id);
      for (const page of book.pages) {
        if (page.createdAt && periodKeyFromIso(page.createdAt) === periodKey) {
          used += 1;
        }
      }
    }
  } catch {
    // zostaw poprzedni stan
    return snapshot;
  }

  const next: PhotoQuotaSnapshot = {
    periodKey,
    limit: FREE_PHOTO_MONTHLY_LIMIT,
    used,
    remaining: Math.max(0, FREE_PHOTO_MONTHLY_LIMIT - used),
    unlimited: false,
  };
  publish(next);
  return next;
}

export async function assertCanAddPhoto(isPro: boolean): Promise<void> {
  const snap = await refreshPhotoQuota(isPro);
  if (snap.unlimited) return;
  if ((snap.remaining ?? 0) <= 0) {
    throw new PhotoQuotaExceededError();
  }
}

export function usePhotoQuota(): PhotoQuotaSnapshot {
  return useSyncExternalStore(subscribePhotoQuota, getPhotoQuotaSnapshot, getPhotoQuotaSnapshot);
}
