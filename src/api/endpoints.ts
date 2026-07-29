import { apiFormRequest, apiRequest } from '@/src/api/client';
import type { AiBatch, AiQuota, AiUsageItem, ApiUser, AuthResponse, OcrQuota } from '@/src/api/types';

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

export function analyzeBook(input: {
  local_id: string;
  title: string;
  pages: Array<{
    local_id: string;
    index: number;
    imageUri: string;
    ocr_text?: string;
    printed_page_number?: string | null;
  }>;
}): Promise<AiBatch> {
  const formData = new FormData();
  formData.append('local_id', input.local_id);
  formData.append('title', input.title);

  input.pages.forEach((page, i) => {
    formData.append(`pages[${i}][local_id]`, page.local_id);
    formData.append(`pages[${i}][index]`, String(page.index));
    if (page.printed_page_number != null && page.printed_page_number !== '') {
      formData.append(`pages[${i}][printed_page_number]`, page.printed_page_number);
    }
    if (page.ocr_text != null && page.ocr_text !== '') {
      formData.append(`pages[${i}][ocr_text]`, page.ocr_text);
    }
    formData.append(`pages[${i}][image]`, {
      uri: page.imageUri,
      name: `${page.local_id}.jpg`,
      type: 'image/jpeg',
    } as unknown as Blob);
  });

  return apiFormRequest<AiBatch>('/api/ai/analyze', formData);
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
