import { apiRequest } from '@/src/api/client';
import type { AiBatch, AiQuota, ApiUser, AuthResponse } from '@/src/api/types';

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

export function analyzeBook(input: {
  local_id: string;
  title: string;
  pages: Array<{
    local_id: string;
    index: number;
    ocr_text: string;
    printed_page_number?: string | null;
  }>;
}): Promise<AiBatch> {
  return apiRequest<AiBatch>('/api/ai/analyze', {
    method: 'POST',
    body: input,
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
