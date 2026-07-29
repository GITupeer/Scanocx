import { apiRequest } from '@/src/api/client';
import type { AiBatch, AiQuota, AiUsageItem, ApiUser, AuthResponse, OcrQuota } from '@/src/api/types';
import * as FileSystem from 'expo-file-system/legacy';

export function register(input: {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
}): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/api/register', {
    method: 'POST',
    body: input,
    auth: false,
  });
}

export function login(input: { email: string; password: string }): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/api/login', {
    method: 'POST',
    body: input,
    auth: false,
  });
}

export function logout(): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/logout', { method: 'POST' });
}

export function fetchMe(): Promise<ApiUser> {
  return apiRequest<ApiUser>('/api/me');
}

export function updateProfile(input: { name: string }): Promise<ApiUser> {
  return apiRequest<ApiUser>('/api/me', {
    method: 'PATCH',
    body: input,
  });
}

export function changePassword(input: {
  current_password: string;
  password: string;
  password_confirmation: string;
}): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/api/change-password', {
    method: 'POST',
    body: input,
  });
}

export function forgotPassword(email: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/api/forgot-password', {
    method: 'POST',
    body: { email },
    auth: false,
  });
}

export function resetPassword(input: {
  email: string;
  token: string;
  password: string;
  password_confirmation: string;
}): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/api/reset-password', {
    method: 'POST',
    body: input,
    auth: false,
  });
}

export function fetchQuota(): Promise<AiQuota> {
  return apiRequest<AiQuota>('/api/ai/quota');
}

export function fetchAiUsage(): Promise<{ data: AiUsageItem[] }> {
  return apiRequest<{ data: AiUsageItem[] }>('/api/ai/usage');
}

export function fetchOcrQuota(): Promise<OcrQuota> {
  return apiRequest<OcrQuota>('/api/ocr/quota');
}

export function reserveOcrQuota(count = 1): Promise<OcrQuota> {
  return apiRequest<OcrQuota>('/api/ocr/reserve', {
    method: 'POST',
    body: { count },
  });
}

export function consumeOcrQuota(count = 1): Promise<OcrQuota> {
  return apiRequest<OcrQuota>('/api/ocr/consume', {
    method: 'POST',
    body: { count },
  });
}

export function releaseOcrQuota(count = 1): Promise<OcrQuota> {
  return apiRequest<OcrQuota>('/api/ocr/release', {
    method: 'POST',
    body: { count },
  });
}

export async function analyzeBook(
  input: {
    local_id: string;
    title: string;
    pages: Array<{
      local_id: string;
      index: number;
      imageUri: string;
      ocr_text?: string;
      printed_page_number?: string | null;
    }>;
  },
  onProgress?: (done: number, total: number) => void
): Promise<AiBatch> {
  const total = input.pages.length;
  const pages: Array<{
    local_id: string;
    index: number;
    image_base64: string;
    mime_type: 'image/jpeg';
    printed_page_number: string | null;
    ocr_text?: string;
  }> = [];

  // Sekwencyjnie — mniej peaków pamięci i przewidywalny postęp X/Y.
  for (let i = 0; i < input.pages.length; i++) {
    const page = input.pages[i]!;
    const image_base64 = await FileSystem.readAsStringAsync(page.imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    pages.push({
      local_id: page.local_id,
      index: page.index,
      image_base64,
      mime_type: 'image/jpeg',
      printed_page_number: page.printed_page_number ?? null,
      ocr_text: page.ocr_text,
    });
    onProgress?.(i + 1, total);
  }

  return apiRequest<AiBatch>('/api/ai/analyze', {
    method: 'POST',
    body: {
      local_id: input.local_id,
      title: input.title,
      pages,
    },
  });
}

export function fetchAiBatch(id: number): Promise<AiBatch> {
  return apiRequest<AiBatch>(`/api/ai/batches/${id}`);
}

export function fetchAdminUsers(): Promise<{ data: ApiUser[] }> {
  return apiRequest<{ data: ApiUser[] }>('/api/admin/users');
}

export function updateAdminUserPlan(
  userId: number,
  plan: 'free' | 'pro'
): Promise<ApiUser> {
  return apiRequest<ApiUser>(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: { plan },
  });
}
