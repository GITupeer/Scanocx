/** Polska odmiana rzeczownika po liczbie. */
export function plural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count);
  if (abs === 1) return one;
  const last = abs % 10;
  const lastTwo = abs % 100;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

export function pages(count: number): string {
  return `${count} ${plural(count, 'strona', 'strony', 'stron')}`;
}

/** Tokeny AI użytkownika — w UI zawsze pełna liczba (bez ułamków). */
export function formatAiTokens(value: number): string {
  return Math.round(value).toLocaleString('pl-PL');
}

/** Tokeny platformy z dokładnością do 2 miejsc (historia zużycia). */
export function formatAiTokensPrecise(value: number): string {
  return value.toLocaleString('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const TIME = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' });
const DAY_YEAR = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });

/** „dziś 14:32”, „wczoraj”, „12 lip”, „12 lip 2024”. */
export function relativeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfDate) / 86_400_000);

  if (dayDiff === 0) return `dziś ${TIME.format(date)}`;
  if (dayDiff === 1) return `wczoraj ${TIME.format(date)}`;
  if (dayDiff < 7) return `${dayDiff} dni temu`;
  if (date.getFullYear() === now.getFullYear()) return DAY.format(date);
  return DAY_YEAR.format(date);
}
