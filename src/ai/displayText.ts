import type { BookPage } from '@/src/domain/types';

/** Preferuj tekst AI, gdy korekta się udała; w przeciwnym razie surowy OCR. */
export function getDisplayText(page: BookPage): string {
  if (page.aiStatus === 'done' && page.aiText.trim()) {
    return page.aiText;
  }
  return page.ocrText;
}

/** Strona nadaje się do korekty AI (ma tekst OCR). */
export function canRunAiRewrite(page: BookPage): boolean {
  return page.ocrStatus === 'done' && page.ocrText.trim().length > 0;
}

/** Strona jeszcze nie ma udanej korekty AI. */
export function needsAiRewrite(page: BookPage): boolean {
  return canRunAiRewrite(page) && page.aiStatus !== 'done';
}
