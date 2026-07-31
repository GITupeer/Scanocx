export type AiQuota = {
  plan: string;
  period_type: 'day' | 'month' | string;
  period_key: string;
  limit: number;
  used: number;
  reserved: number;
  remaining: number;
  /** Zawsze „tokens” — limit AI liczony w tokenach użytkownika. */
  unit?: 'tokens' | string;
  real_tokens_per_user_token?: number;
  reserve_tokens_per_page?: number;
};

/** Limit OCR z backendu. Free/Pro: limit liczbowy, unlimited=false. */
export type OcrQuota = {
  plan: string;
  period_type: 'day' | 'month' | string;
  period_key: string;
  limit: number | null;
  used: number;
  reserved: number;
  remaining: number | null;
  unlimited: boolean;
};

/** Limit zdjęć stron z backendu. Pro: unlimited. */
export type PhotoQuota = {
  plan: string;
  period_type: 'day' | 'month' | string;
  period_key: string;
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
};

/** Limit książek z backendu. Free: 3 łącznie. Pro: unlimited. */
export type BookQuota = {
  plan: string;
  period_type: 'lifetime' | string;
  period_key: string;
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
};

/** Limit eksportu z backendu — per format. */
export type ExportFormatQuota = {
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  allowed: boolean;
};

export type ExportQuota = {
  plan: string;
  period_type: 'day' | 'month' | string;
  period_key: string;
  formats: {
    txt: ExportFormatQuota;
    pdf: ExportFormatQuota;
    epub: ExportFormatQuota;
  };
};

export type ApiUser = {
  id: number;
  name: string;
  email: string;
  plan: 'free' | 'pro' | string;
  roles: string[];
  quota: AiQuota | null;
  ocr_quota: OcrQuota | null;
  export_quota: ExportQuota | null;
  photo_quota: PhotoQuota | null;
  book_quota: BookQuota | null;
  created_at?: string | null;
};

export type AuthResponse = {
  token: string;
  user: ApiUser;
};

export type AiBatchJobMeta = {
  title: string | null;
  subtitle: string | null;
  ocr_quality: number;
  coherence: number;
  page_number: string | null;
  prompt_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  pages?: Array<{
    text: string;
    title: string | null;
    subtitle: string | null;
    page_number: string | null;
    ocr_quality: number;
    coherence: number;
    corners?: {
      top_left: { x: number; y: number };
      top_right: { x: number; y: number };
      bottom_right: { x: number; y: number };
      bottom_left: { x: number; y: number };
    } | null;
  }> | null;
};

export type AiBatchJob = {
  id: number;
  page_local_id: string;
  page_index: number;
  status: 'queued' | 'processing' | 'done' | 'failed' | string;
  queue_position: number | null;
  error: string | null;
  ai_text: string | null;
  ai_meta: AiBatchJobMeta | null;
  printed_page_number: string | null;
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
  prompt_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  /** Tokeny platformy (nasze), dokładność 0.01. */
  user_tokens?: number | null;
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
  prompt_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  /** Suma tokenów platformy (nasze), dokładność 0.01. */
  user_tokens?: number;
};

/** Metadane strony z backendu (bez obrazu — zdjęcia lokalne). */
export type ApiBookPage = {
  id: number;
  local_id: string;
  index: number;
  ocr_text: string;
  ai_text: string | null;
  ai_status: string;
  ai_meta: AiBatchJobMeta | Record<string, unknown> | null;
  printed_page_number: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ApiBookSummary = {
  id: number;
  local_id: string;
  title: string;
  page_count: number;
  created_at: string | null;
  updated_at: string | null;
};

export type ApiBook = ApiBookSummary & {
  pages: ApiBookPage[];
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
