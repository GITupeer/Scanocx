/**
 * Limity eksportu:
 * - Gość — brak eksportu (wymagane logowanie)
 * - TXT  — bez limitu (Free + Pro)
 * - PDF  — 20 / miesiąc (Free), bez limitu (Pro)
 * - eBook — niedostępny (Free), bez limitu (Pro)
 *
 * Zalogowany: źródło prawdy = backend (/api/export/*).
 */
import { useSyncExternalStore } from 'react';

import { isApiConfigured } from '@/src/ai/config';
import * as api from '@/src/api/endpoints';
import { getAuthToken } from '@/src/api/token';
import { ApiError, type ExportQuota } from '@/src/api/types';

export type ExportFormat = 'txt' | 'pdf' | 'epub';
export type ExportPlan = 'free' | 'pro' | 'guest';

export const FREE_PDF_MONTHLY_LIMIT = 20;
export const FREE_EPUB_MONTHLY_LIMIT = 0;
/** @deprecated Użyj FREE_PDF_MONTHLY_LIMIT */
export const FREE_EXPORT_MONTHLY_LIMIT = FREE_PDF_MONTHLY_LIMIT;

export type FormatQuota = {
  format: ExportFormat;
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  allowed: boolean;
};

export type ExportQuotaSnapshot = {
  loggedIn: boolean;
  plan: ExportPlan;
  userId: number | null;
  periodKey: string;
  byFormat: Record<ExportFormat, FormatQuota>;
  formats: readonly ExportFormat[];
  unlimited: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
};

const ALL_FORMATS = ['txt', 'pdf', 'epub'] as const satisfies readonly ExportFormat[];

function periodKeyNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function lockedFormat(format: ExportFormat): FormatQuota {
  return {
    format,
    limit: 0,
    used: 0,
    remaining: 0,
    unlimited: false,
    allowed: false,
  };
}

function formatFromApi(
  format: ExportFormat,
  q: { limit: number | null; used: number; remaining: number | null; unlimited: boolean; allowed: boolean }
): FormatQuota {
  return {
    format,
    limit: q.limit,
    used: q.used,
    remaining: q.remaining,
    unlimited: q.unlimited,
    allowed: q.allowed,
  };
}

function buildSnapshotFromParts(input: {
  loggedIn: boolean;
  plan: ExportPlan;
  userId: number | null;
  periodKey: string;
  byFormat: Record<ExportFormat, FormatQuota>;
}): ExportQuotaSnapshot {
  const formats = ALL_FORMATS.filter((f) => {
    const q = input.byFormat[f];
    if (!q.allowed) return false;
    if (q.unlimited) return true;
    return (q.remaining ?? 0) > 0;
  });
  const pdf = input.byFormat.pdf;

  return {
    loggedIn: input.loggedIn,
    plan: input.plan,
    userId: input.userId,
    periodKey: input.periodKey,
    byFormat: input.byFormat,
    formats,
    unlimited: pdf.unlimited,
    limit: pdf.limit,
    used: pdf.used,
    remaining: pdf.remaining,
  };
}

function fromApi(q: ExportQuota, userId: number | null): ExportQuotaSnapshot {
  const plan: ExportPlan = q.plan === 'pro' ? 'pro' : 'free';
  const byFormat = {
    txt: formatFromApi('txt', q.formats.txt),
    pdf: formatFromApi('pdf', q.formats.pdf),
    epub: formatFromApi('epub', q.formats.epub),
  };

  return buildSnapshotFromParts({
    loggedIn: true,
    plan,
    userId,
    periodKey: q.period_key,
    byFormat,
  });
}

/** Gość — żaden format nie jest dozwolony. */
function guestSnapshot(): ExportQuotaSnapshot {
  return buildSnapshotFromParts({
    loggedIn: false,
    plan: 'guest',
    userId: null,
    periodKey: periodKeyNow(),
    byFormat: {
      txt: lockedFormat('txt'),
      pdf: lockedFormat('pdf'),
      epub: lockedFormat('epub'),
    },
  });
}

let snapshot: ExportQuotaSnapshot = guestSnapshot();
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

function emit() {
  for (const listener of listeners) listener();
}

function publish(next: ExportQuotaSnapshot): void {
  snapshot = next;
  emit();
}

export function getExportQuota(): ExportQuotaSnapshot {
  return snapshot;
}

export function getFormatQuota(format: ExportFormat): FormatQuota {
  return snapshot.byFormat[format];
}

export function subscribeExportQuota(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useExportQuota(): ExportQuotaSnapshot {
  return useSyncExternalStore(subscribeExportQuota, getExportQuota, getExportQuota);
}

export class ExportQuotaExceededError extends Error {
  constructor(format: ExportFormat = 'pdf', message?: string) {
    super(
      message ??
        (format === 'pdf'
          ? `Darmowy plan: limit ${FREE_PDF_MONTHLY_LIMIT} eksportów PDF na miesiąc. Przejdź na Pro, aby mieć PDF bez limitu.`
          : `Przekroczono limit eksportu ${format.toUpperCase()}. Przejdź na Pro.`)
    );
    this.name = 'ExportQuotaExceededError';
  }
}

export class ExportFormatLockedError extends Error {
  constructor(format: ExportFormat, message?: string) {
    super(
      message ??
        (format === 'epub'
          ? 'Eksport eBook jest dostępny w planie Pro. TXT i PDF (z limitem) zostają w darmowym planie.'
          : `Eksport ${format.toUpperCase()} jest dostępny w planie Pro.`)
    );
    this.name = 'ExportFormatLockedError';
  }
}

export class ExportAuthRequiredError extends Error {
  constructor() {
    super('Eksport wymaga zalogowania. Zaloguj się, aby zapisać TXT, PDF lub eBook.');
    this.name = 'ExportAuthRequiredError';
  }
}

/** Z /me lub logowania — od razu ustawia stan z backendu. */
export function applyExportQuotaFromUser(
  exportQuota: ExportQuota | null | undefined,
  userId?: number | null
): void {
  if (!exportQuota) {
    publish(guestSnapshot());
    return;
  }
  publish(fromApi(exportQuota, userId ?? snapshot.userId));
}

export async function clearExportQuota(): Promise<void> {
  publish(guestSnapshot());
}

/** Odśwież z API (zalogowany) albo stan gościa. */
export async function refreshExportQuota(userId?: number | null): Promise<ExportQuotaSnapshot> {
  return withLock(async () => {
    if (!isApiConfigured()) {
      publish(guestSnapshot());
      return snapshot;
    }
    const token = await getAuthToken();
    if (!token) {
      publish(guestSnapshot());
      return snapshot;
    }
    try {
      const q = await api.fetchExportQuota();
      publish(fromApi(q, userId ?? snapshot.userId));
    } catch {
      // zostaw ostatni znany stan (offline)
    }
    return snapshot;
  });
}

export async function syncExportQuota(input: {
  userId?: number | null;
  plan?: string | null;
  exportQuota?: ExportQuota | null;
}): Promise<ExportQuotaSnapshot> {
  const userId = input.userId ?? null;
  if (userId == null) {
    await clearExportQuota();
    return snapshot;
  }

  if (input.exportQuota) {
    applyExportQuotaFromUser(input.exportQuota, userId);
    return snapshot;
  }

  return refreshExportQuota(userId);
}

/** Wywołaj przed generowaniem pliku. */
export function assertExportAllowed(format: ExportFormat): void {
  if (!snapshot.loggedIn) {
    throw new ExportAuthRequiredError();
  }

  const q = snapshot.byFormat[format];
  if (!q.allowed && q.limit === 0 && !q.unlimited) {
    throw new ExportFormatLockedError(format);
  }
  if (!q.allowed || (!q.unlimited && (q.remaining ?? 0) <= 0)) {
    if (format === 'epub') throw new ExportFormatLockedError(format);
    throw new ExportQuotaExceededError(format);
  }
}

/** Po udanym eksporcie — tylko zalogowany (backend). */
export async function commitExportUsage(format: ExportFormat): Promise<void> {
  return withLock(async () => {
    if (!snapshot.loggedIn || !isApiConfigured()) {
      throw new ExportAuthRequiredError();
    }

    const token = await getAuthToken();
    if (!token) throw new ExportAuthRequiredError();

    try {
      const q = await api.consumeExportQuota(format);
      publish(fromApi(q, snapshot.userId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw new ExportAuthRequiredError();
      }
      if (error instanceof ApiError && error.status === 422) {
        if (format === 'epub') throw new ExportFormatLockedError(format, error.message);
        throw new ExportQuotaExceededError(format, error.message);
      }
      throw error;
    }
  });
}

export function applyExportQuotaSnapshot(next: ExportQuotaSnapshot): void {
  publish(next);
}
