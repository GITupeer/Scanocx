import type { IconName } from '@/src/ui';

/** Wspólne limity planów — UI porównania Free vs Pro. */
export const FREE_OCR_MONTHLY_LIMIT = 50;
export const PRO_OCR_MONTHLY_LIMIT = 10_000;

/**
 * Limit AI w tokenach użytkownika (nie stronach).
 * 1 token użytkownika = 300 realnych tokenów API (input+output).
 * Pro: 5 000 ≈ 1 500 000 realnych / miesiąc (~1000 stron po ~1500 realnych).
 */
export const AI_REAL_TOKENS_PER_USER_TOKEN = 300;
/** Szacunek rezerwacji przed analizą strony (~1 500 realnych). */
export const AI_RESERVE_TOKENS_PER_PAGE = 5;

export const FREE_AI_MONTHLY_LIMIT = 25;
export const PRO_AI_MONTHLY_LIMIT = 5_000;

export const FREE_PHOTO_MONTHLY_LIMIT = 100;
export const FREE_PDF_MONTHLY_LIMIT = 20;

/** Limit książek (łącznie, nie miesięcznie). Free: 3. Pro: bez limitu. */
export const FREE_BOOK_LIMIT = 3;

export type PlanFeature = {
  icon: IconName;
  title: string;
  free: string;
  pro: string;
};

export const PLAN_FEATURES: PlanFeature[] = [
  {
    icon: 'book',
    title: 'Tworzenie książek',
    free: `${FREE_BOOK_LIMIT}`,
    pro: 'Bez limitu',
  },
  {
    icon: 'ai',
    title: 'Analiza i Korekta AI',
    free: `${FREE_AI_MONTHLY_LIMIT.toLocaleString('pl-PL')} tokenów (~5 stron)`,
    pro: `${PRO_AI_MONTHLY_LIMIT.toLocaleString('pl-PL')} tokenów (~1000 stron)`,
  },
  {
    icon: 'bolt',
    title: 'Priorytet kolejki AI',
    free: 'Standardowa',
    pro: 'Priorytetowa',
  },
  {
    icon: 'scan',
    title: 'OCR',
    free: `${FREE_OCR_MONTHLY_LIMIT} odczytów`,
    pro: `${PRO_OCR_MONTHLY_LIMIT.toLocaleString('pl-PL')} odczytów`,
  },
  {
    icon: 'camera',
    title: 'Zdjęcia stron',
    free: `${FREE_PHOTO_MONTHLY_LIMIT}`,
    pro: 'Bez limitu',
  },
  {
    icon: 'text',
    title: 'Export TXT',
    free: 'Bez limitu',
    pro: 'Bez limitu',
  },
  {
    icon: 'pdf',
    title: 'Export PDF',
    free: `${FREE_PDF_MONTHLY_LIMIT}`,
    pro: 'Bez limitu',
  },
  {
    icon: 'ebook',
    title: 'Export eBook',
    free: 'Niedostępne',
    pro: 'Bez limitu',
  },
];
