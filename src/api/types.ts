export type AiQuota = {
  plan: string;
  period_type: 'day' | 'month' | string;
  period_key: string;
  limit: number;
  used: number;
  reserved: number;
  remaining: number;
};

export type ApiUser = {
  id: number;
  name: string;
  email: string;
  plan: 'free' | 'pro' | string;
  roles: string[];
  quota: AiQuota | null;
  created_at?: string | null;
};

export type AuthResponse = {
  token: string;
  user: ApiUser;
};

export type AiBatchJob = {
  id: number;
  page_local_id: string;
  page_index: number;
  status: 'queued' | 'processing' | 'done' | 'failed' | string;
  queue_position: number | null;
  error: string | null;
  ai_text: string | null;
};

export type AiBatch = {
  id: number;
  status: string;
  book_local_id: string;
  total: number;
  completed: number;
  failed: number;
  queue_position: number | null;
  jobs: AiBatchJob[];
};

export type AiUsagePage = {
  page_index: number | null;
  status: string;
};

export type AiUsageItem = {
  id: number;
  status: string;
  book_title: string | null;
  book_local_id: string | null;
  total: number;
  completed: number;
  failed: number;
  created_at: string | null;
  updated_at: string | null;
  pages: AiUsagePage[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown = null
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
