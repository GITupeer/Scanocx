/** API base URL — EXPO_PUBLIC_API_BASE_URL (bez trailing slash). */
export function getApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? '';
  return raw.replace(/\/$/, '');
}

export function isApiConfigured(): boolean {
  return getApiBaseUrl().length > 0;
}

export const AI_POLL_INTERVAL_MS = 2500;
