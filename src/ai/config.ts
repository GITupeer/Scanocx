/** API base URL — EXPO_PUBLIC_API_BASE_URL (bez trailing slash). */
export function getApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? '';
  return raw.replace(/\/$/, '');
}

export function isApiConfigured(): boolean {
  return getApiBaseUrl().length > 0;
}

/** @deprecated AI działa przez backend — zostawione tylko dla kompatybilności typów. */
export const GEMINI_MODEL = 'gemini-3.1-flash-lite';
export const AI_BATCH_SIZE = 1;
export const AI_REQUEST_TIMEOUT_MS = 2 * 60 * 1000;
export const AI_POLL_INTERVAL_MS = 2500;
