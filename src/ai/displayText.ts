import type { BookPage } from '@/src/domain/types';

/** Preferuj tekst AI, gdy korekta się udała; w przeciwnym razie surowy OCR. */
export function getDisplayText(page: BookPage): string {
  if (page.aiStatus === 'done' && page.aiText.trim()) {
    return page.aiText;
  }
  return page.ocrText;
}

/** Strona nadaje się do korekty AI (ma zdjęcie i zakończony OCR). */
export function canRunAiRewrite(page: BookPage): boolean {
  return Boolean(page.imageUri?.trim()) && page.ocrStatus === 'done';
}

/** Strona jeszcze nie ma udanej korekty AI. */
export function needsAiRewrite(page: BookPage): boolean {
  return canRunAiRewrite(page) && page.aiStatus !== 'done';
}

/** Progi: poniżej → ręczna weryfikacja. */
export const MANUAL_REVIEW_OCR_QUALITY_MAX = 0.5;
export const MANUAL_REVIEW_COHERENCE_MAX = 0.6;

/** Słaba jakość OCR lub niska spójność po AI — wymaga ręcznego przejrzenia. */
export function needsManualReview(page: BookPage): boolean {
  if (page.aiStatus !== 'done' || !page.aiAnalysis) return false;
  const { ocrQuality, coherence } = page.aiAnalysis;
  return (
    ocrQuality < MANUAL_REVIEW_OCR_QUALITY_MAX ||
    coherence < MANUAL_REVIEW_COHERENCE_MAX
  );
}
