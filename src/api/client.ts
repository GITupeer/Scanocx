import { getApiBaseUrl, isApiConfigured } from '@/src/ai/config';
import { ApiError } from '@/src/api/types';
import { clearAuthToken, getAuthToken } from '@/src/api/token';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
};

type FormRequestOptions = {
  method?: 'POST' | 'PATCH' | 'PUT';
  auth?: boolean;
  signal?: AbortSignal;
};

function extractMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const record = body as Record<string, unknown>;
  if (typeof record.message === 'string' && record.message.trim()) return record.message;
  if (record.errors && typeof record.errors === 'object') {
    const first = Object.values(record.errors as Record<string, unknown>)[0];
    if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
  }
  return fallback;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!isApiConfigured()) {
    throw new ApiError('Brak adresu API. Ustaw EXPO_PUBLIC_API_BASE_URL.', 0);
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (options.auth !== false) {
    const token = await getAuthToken();
    if (!token) {
      throw new ApiError('Wymagane logowanie.', 401);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body != null ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  if (response.status === 401 && options.auth !== false) {
    await clearAuthToken();
  }

  if (!response.ok) {
    throw new ApiError(
      extractMessage(payload, `Błąd API HTTP ${response.status}`),
      response.status,
      payload
    );
  }

  return payload as T;
}

/** Multipart (FormData) — bez Content-Type, żeby fetch ustawił boundary. */
export async function apiFormRequest<T>(
  path: string,
  formData: FormData,
  options: FormRequestOptions = {}
): Promise<T> {
  if (!isApiConfigured()) {
    throw new ApiError('Brak adresu API. Ustaw EXPO_PUBLIC_API_BASE_URL.', 0);
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.auth !== false) {
    const token = await getAuthToken();
    if (!token) {
      throw new ApiError('Wymagane logowanie.', 401);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? 'POST',
    headers,
    body: formData,
    signal: options.signal,
  });

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  if (response.status === 401 && options.auth !== false) {
    await clearAuthToken();
  }

  if (!response.ok) {
    throw new ApiError(
      extractMessage(payload, `Błąd API HTTP ${response.status}`),
      response.status,
      payload
    );
  }

  return payload as T;
}
