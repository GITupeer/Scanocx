import { isSupported, recognizeText } from 'expo-mlkit-ocr';
import type { RecognitionResult } from 'expo-mlkit-ocr';

import { enhanceForOcr, type EnhanceForOcrOptions } from '@/src/images/enhanceForOcr';
import { ensurePortraitUri, rotateUri } from '@/src/images/ensurePortrait';
import { extractPrintedPageNumber } from '@/src/ocr/extractPageNumber';
import { assessOcrQuality } from '@/src/ocr/quality';
import {
  assertOcrAllowed,
  commitOcrSlot,
  releaseOcrSlot,
} from '@/src/ocr/quota';
import { pickUprightWithOcr, scoreUpright } from '@/src/ocr/upright';
import { persistPageImageFile, updatePageOcr } from '@/src/storage/books';

export function isOcrAvailable(): boolean {
  try {
    return isSupported();
  } catch {
    return false;
  }
}

export type RunPageOcrOptions = {
  /** Porównaj 0° vs 180° (domyślnie tak). Wyłącz po ręcznym obrocie. */
  detectUpright?: boolean;
  /** Parametry preprocessingu pod OCR (kontrast / jasność). */
  enhance?: EnhanceForOcrOptions;
};

async function recognizeBest(
  visualUri: string,
  enhancedUri: string,
  precomputedEnhanced?: RecognitionResult
): Promise<RecognitionResult> {
  const enhancedResult = precomputedEnhanced ?? (await recognizeText(enhancedUri));
  const enhancedScore = scoreUpright(enhancedResult);

  // Jeśli enhancement słabo działa (ciemna / nietypowa strona), porównaj z oryginałem.
  if (enhancedScore >= 48) {
    return enhancedResult;
  }

  const originalResult = await recognizeText(visualUri);
  return scoreUpright(originalResult) > enhancedScore + 8 ? originalResult : enhancedResult;
}

/**
 * Pion + opcjonalne wykrycie „do góry nogami” (OCR 0° vs 180°) + zapis tekstu.
 * Podgląd zostaje kolorowy; pod OCR idzie wersja z podbitym kontrastem.
 */
export async function runPageOcr(
  bookId: string,
  pageId: string,
  imageUri: string,
  options: RunPageOcrOptions = {}
): Promise<string> {
  const detectUpright = options.detectUpright !== false;

  // Limit free: rezerwacja przed startem — przy błędzie OCR zwalniamy slot.
  await assertOcrAllowed();
  let reserved = true;

  try {
    await updatePageOcr(bookId, pageId, { ocrStatus: 'pending', ocrQuality: null, resetAi: true });

    if (!isOcrAvailable()) {
      throw new Error(
        'Odczytywanie tekstu nie jest dostępne na tym urządzeniu. Wymagany jest development build z ML Kit.',
      );
    }

    const portraitUri = await ensurePortraitUri(imageUri);
    const enhancedPortrait = await enhanceForOcr(portraitUri, options.enhance);

    let visualUri = portraitUri;
    let result: RecognitionResult;

    if (detectUpright) {
      const upright = await pickUprightWithOcr(enhancedPortrait);
      if (upright.rotated) {
        visualUri = await rotateUri(portraitUri, 180);
      }
      result = await recognizeBest(visualUri, upright.uri, upright.result);
    } else {
      result = await recognizeBest(visualUri, enhancedPortrait);
    }

    await persistPageImageFile(bookId, pageId, visualUri);

    const { printedPageNumber, cleanedText } = extractPrintedPageNumber(result);
    const ocrQuality = assessOcrQuality(result);

    await updatePageOcr(bookId, pageId, {
      ocrText: cleanedText,
      printedPageNumber,
      ocrQuality,
      ocrStatus: 'done',
      resetAi: true,
    });

    await commitOcrSlot();
    reserved = false;
    return cleanedText;
  } catch (error) {
    if (reserved) {
      await releaseOcrSlot().catch(() => undefined);
    }
    await updatePageOcr(bookId, pageId, { ocrStatus: 'error', ocrQuality: null, resetAi: false });
    throw error;
  }
}

export type BatchPortraitOcrProgress = {
  current: number;
  total: number;
  pageIndex: number;
};

/**
 * Dla każdej strony: wymusza pion, wykrywa dół kadru i ponownie uruchamia OCR.
 */
export async function fixPortraitAndRerunOcrForBook(
  bookId: string,
  pages: { id: string; index: number; imageUri: string }[],
  onProgress?: (progress: BatchPortraitOcrProgress) => void
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  const total = pages.length;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    onProgress?.({ current: i + 1, total, pageIndex: page.index });
    try {
      await runPageOcr(bookId, page.id, page.imageUri);
      ok += 1;
    } catch {
      failed += 1;
    }
  }

  return { ok, failed };
}
