/**
 * Limit OCR trzymany na backendzie (tylko zalogowany użytkownik).
 * Free: 50 / miesiąc. Pro: 10 000 / miesiąc.
 * Gość — bez OCR (tylko lokalne zdjęcia, też z limitem free).
 */
import { useSyncExternalStore } from 'react';

import { isApiConfigured } from '@/src/ai/config';
import * as api from '@/src/api/endpoints';
import { ApiError, type OcrQuota } from '@/src/api/types';
import { getAuthToken } from '@/src/api/token';
import {
  FREE_OCR_MONTHLY_LIMIT as FREE_LIMIT,
  PRO_OCR_MONTHLY_LIMIT as PRO_LIMIT,
} from '@/src/plans/features';

export const FREE_OCR_MONTHLY_LIMIT = FREE_LIMIT;
export const PRO_OCR_MONTHLY_LIMIT = PRO_LIMIT;

export type OcrQuotaSnapshot = {
  loggedIn: boolean;
  plan: string;
  periodKey: string;
  limit: number | null;
  used: number;
  reserved: number;
  remaining: number | null;
  unlimited: boolean;
};

export class OcrAuthRequiredError extends Error {
  constructor() {
    super('Odczyt tekstu wymaga zalogowania. Bez konta możesz tylko robić zdjęcia.');
    this.name = 'OcrAuthRequiredError';
  }
}

export class OcrQuotaExceededError extends Error {
  constructor(message?: string) {
    super(
      message ??
        `Darmowy plan: limit ${FREE_OCR_MONTHLY_LIMIT} odczytów OCR na miesiąc. Przejdź na Pro, aby mieć ${PRO_OCR_MONTHLY_LIMIT.toLocaleString('pl-PL')} OCR miesięcznie.`
    );
    this.name = 'OcrQuotaExceededError';
  }
}

const GUEST_SNAPSHOT: OcrQuotaSnapshot = {
  loggedIn: false,
  plan: 'guest',
  periodKey: '',
  limit: 0,
  used: 0,
  reserved: 0,
  remaining: 0,
  unlimited: false,
};

let snapshot: OcrQuotaSnapshot = GUEST_SNAPSHOT;
const listeners = new Set<() => void>();

let chain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function fromApi(q: OcrQuota): OcrQuotaSnapshot {
  return {
    loggedIn: true,
    plan: q.plan,
    periodKey: q.period_key,
    limit: q.limit,
    used: q.used,
    reserved: q.reserved,
    remaining: q.remaining,
    unlimited: q.unlimited || q.limit == null,
  };
}

function publish(next: OcrQuotaSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function applyOcrQuotaFromUser(ocrQuota: OcrQuota | null | undefined): void {
  if (!ocrQuota) {
    publish(GUEST_SNAPSHOT);
    return;
  }
  publish(fromApi(ocrQuota));
}

export function clearOcrQuota(): void {
  publish(GUEST_SNAPSHOT);
}

export function getOcrQuotaSnapshot(): OcrQuotaSnapshot {
  return snapshot;
}

export function subscribeOcrQuota(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function refreshOcrQuota(): Promise<OcrQuotaSnapshot> {
  return withLock(async () => {
    if (!isApiConfigured()) {
      publish(GUEST_SNAPSHOT);
      return snapshot;
    }
    const token = await getAuthToken();
    if (!token) {
      publish(GUEST_SNAPSHOT);
      return snapshot;
    }
    try {
      const q = await api.fetchOcrQuota();
      publish(fromApi(q));
    } catch {
      // zostaw ostatni znany stan (np. offline)
    }
    return snapshot;
  });
}

export async function getOcrRemaining(): Promise<number | null> {
  const snap = await refreshOcrQuota();
  if (!snap.loggedIn) return 0;
  if (snap.unlimited) return null;
  return snap.remaining ?? 0;
}

/** `true` gdy zalogowany i (Pro albo jest zapas). */
export async function canRunOcr(): Promise<boolean> {
  if (!isApiConfigured()) return false;
  const token = await getAuthToken();
  if (!token) return false;
  const snap = getOcrQuotaSnapshot().loggedIn
    ? getOcrQuotaSnapshot()
    : await refreshOcrQuota();
  if (!snap.loggedIn) return false;
  if (snap.unlimited) return true;
  return (snap.remaining ?? 0) > 0;
}

/**
 * Rezerwuje 1 odczyt OCR na backendzie przed lokalną analizą.
 * Przy błędzie wywołaj `releaseOcrSlot`. Po sukcesie — `commitOcrSlot`.
 */
export async function reserveOcrSlot(): Promise<boolean> {
  return withLock(async () => {
    if (!isApiConfigured()) {
      throw new OcrAuthRequiredError();
    }
    const token = await getAuthToken();
    if (!token) {
      throw new OcrAuthRequiredError();
    }

    try {
      const q = await api.reserveOcrQuota(1);
      publish(fromApi(q));
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw new OcrAuthRequiredError();
      }
      if (error instanceof ApiError && error.status === 422) {
        throw new OcrQuotaExceededError(error.message);
      }
      throw error;
    }
  });
}

export async function commitOcrSlot(): Promise<void> {
  return withLock(async () => {
    try {
      const q = await api.consumeOcrQuota(1);
      publish(fromApi(q));
    } catch {
      // offline po sukcesie lokalnym — rezerwacja i tak trzyma slot
    }
  });
}

export async function releaseOcrSlot(): Promise<void> {
  return withLock(async () => {
    try {
      const q = await api.releaseOcrQuota(1);
      publish(fromApi(q));
    } catch {
      // ignore
    }
  });
}

export async function assertOcrAllowed(): Promise<void> {
  await reserveOcrSlot();
}

export function useOcrQuota(): OcrQuotaSnapshot {
  return useSyncExternalStore(subscribeOcrQuota, getOcrQuotaSnapshot, getOcrQuotaSnapshot);
}
