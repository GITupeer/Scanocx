/**
 * Lokalny limit OCR w planie darmowym: 30 odczytów / miesiąc kalendarzowy.
 * Plan Pro — bez limitu. Same zdjęcia (bez OCR) nie zużywają limitu.
 */
import { useSyncExternalStore } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

export const FREE_OCR_MONTHLY_LIMIT = 30;

export type OcrPlan = 'free' | 'pro';

export type OcrQuotaSnapshot = {
  plan: OcrPlan;
  periodKey: string;
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
};

export class OcrQuotaExceededError extends Error {
  constructor() {
    super(
      `Darmowy plan: limit ${FREE_OCR_MONTHLY_LIMIT} odczytów OCR na miesiąc. Zdjęcia możesz dalej robić bez limitu — przejdź na Pro, aby mieć nielimitowane OCR.`
    );
    this.name = 'OcrQuotaExceededError';
  }
}

type StoredQuota = {
  periodKey: string;
  used: number;
};

let plan: OcrPlan = 'free';
let cached: StoredQuota | null = null;
let snapshot: OcrQuotaSnapshot = buildSnapshot('free', currentPeriodKey(), 0);
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

function quotaPath(): string {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error('documentDirectory is unavailable on this platform.');
  }
  return `${root}ocr-quota.json`;
}

export function currentPeriodKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function buildSnapshot(p: OcrPlan, periodKey: string, used: number): OcrQuotaSnapshot {
  if (p === 'pro') {
    return {
      plan: p,
      periodKey,
      limit: null,
      used,
      remaining: null,
      unlimited: true,
    };
  }
  const clamped = Math.max(0, used);
  return {
    plan: p,
    periodKey,
    limit: FREE_OCR_MONTHLY_LIMIT,
    used: clamped,
    remaining: Math.max(0, FREE_OCR_MONTHLY_LIMIT - clamped),
    unlimited: false,
  };
}

function publish(periodKey: string, used: number): void {
  cached = { periodKey, used };
  snapshot = buildSnapshot(plan, periodKey, used);
  listeners.forEach((listener) => listener());
}

async function readStored(): Promise<StoredQuota> {
  const periodKey = currentPeriodKey();
  if (cached && cached.periodKey === periodKey) {
    return cached;
  }

  try {
    const path = quotaPath();
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      const fresh = { periodKey, used: 0 };
      cached = fresh;
      return fresh;
    }
    const raw = JSON.parse(await FileSystem.readAsStringAsync(path)) as Partial<StoredQuota>;
    if (raw.periodKey === periodKey && typeof raw.used === 'number') {
      const stored = { periodKey, used: Math.max(0, Math.floor(raw.used)) };
      cached = stored;
      return stored;
    }
  } catch {
    // uszkodzony plik → nowy okres
  }

  const fresh = { periodKey, used: 0 };
  cached = fresh;
  return fresh;
}

async function writeStored(state: StoredQuota): Promise<void> {
  cached = state;
  await FileSystem.writeAsStringAsync(quotaPath(), JSON.stringify(state));
  publish(state.periodKey, state.used);
}

/** Ustawiane z AuthProvider — gość i free = limit, pro = bez limitu. */
export function setOcrPlan(next: OcrPlan): void {
  if (plan === next) return;
  plan = next;
  const periodKey = cached?.periodKey ?? currentPeriodKey();
  const used = cached?.used ?? 0;
  publish(periodKey, used);
}

export function getOcrPlan(): OcrPlan {
  return plan;
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
    const state = await readStored();
    publish(state.periodKey, state.used);
    return snapshot;
  });
}

export async function getOcrRemaining(): Promise<number | null> {
  if (plan === 'pro') return null;
  const state = await withLock(() => readStored());
  return Math.max(0, FREE_OCR_MONTHLY_LIMIT - state.used);
}

/** `true` gdy wolno uruchomić OCR (Pro albo jest zapas w limicie). */
export async function canRunOcr(): Promise<boolean> {
  if (plan === 'pro') return true;
  const remaining = await getOcrRemaining();
  return (remaining ?? 0) > 0;
}

/**
 * Rezerwuje 1 odczyt OCR. Przy błędzie wywołaj `releaseOcrSlot`.
 * Pro nie rezerwuje nic.
 */
export async function reserveOcrSlot(): Promise<boolean> {
  return withLock(async () => {
    if (plan === 'pro') return true;
    const state = await readStored();
    if (state.used >= FREE_OCR_MONTHLY_LIMIT) {
      publish(state.periodKey, state.used);
      return false;
    }
    const next = { periodKey: state.periodKey, used: state.used + 1 };
    await writeStored(next);
    return true;
  });
}

export async function releaseOcrSlot(): Promise<void> {
  return withLock(async () => {
    if (plan === 'pro') return;
    const state = await readStored();
    const next = {
      periodKey: state.periodKey,
      used: Math.max(0, state.used - 1),
    };
    await writeStored(next);
  });
}

export async function assertOcrAllowed(): Promise<void> {
  const ok = await reserveOcrSlot();
  if (!ok) {
    throw new OcrQuotaExceededError();
  }
}

export function useOcrQuota(): OcrQuotaSnapshot {
  return useSyncExternalStore(subscribeOcrQuota, getOcrQuotaSnapshot, getOcrQuotaSnapshot);
}
