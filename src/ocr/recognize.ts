import { isSupported, recognizeText } from 'expo-mlkit-ocr';
import type { RecognitionResult } from 'expo-mlkit-ocr';

import { enhanceForOcr, type EnhanceForOcrOptions } from '@/src/images/enhanceForOcr';
import { ensurePortraitUri, rotateUri } from '@/src/images/ensurePortrait';
import { cleanupOcrText } from '@/src/ocr/cleanup';
import { extractPrintedPageNumber } from '@/src/ocr/extractPageNumber';
import { assessOcrQuality } from '@/src/ocr/quality';
import {
  assertOcrAllowed,
  commitOcrSlot,
  releaseOcrSlot,
} from '@/src/ocr/quota';
import { countReadableChars, pickUprightWithOcr, scoreUpright } from '@/src/ocr/upright';
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
  /**
   * Gdy true (domyślnie), przy słabym wyniku próbuje dodatkowych presetów enhance
   * i bierze najlepszy. Wyłącz przy ręcznym tuningu `enhance`.
   */
  multiPass?: boolean;
};

type ScoredResult = {
  result: RecognitionResult;
  score: number;
};

function averageConfidence(result: RecognitionResult): number {
  const scores: number[] = [];
  for (const block of result.blocks ?? []) {
    for (const line of block.lines ?? []) {
      for (const element of line.elements ?? []) {
        const c = element.confidence;
        if (typeof c === 'number' && Number.isFinite(c)) {
          scores.push(c < 0 ? 0 : c > 1 ? 1 : c);
        }
      }
    }
  }
  if (scores.length === 0) return 0.45;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** Łączny score: czytelność + pewność ML Kit. */
function rankOcrResult(result: RecognitionResult): number {
  const upright = scoreUpright(result);
  const chars = countReadableChars(result);
  const conf = averageConfidence(result);
  return upright + chars * 0.35 + conf * 120;
}

function isWeakResult(result: RecognitionResult): boolean {
  const chars = countReadableChars(result);
  const conf = averageConfidence(result);
  const quality = assessOcrQuality(result).confidence;
  if (chars < 40) return true;
  if (conf < 0.62) return true;
  if (quality.weak) return true;
  return false;
}

async function recognizeBest(
  visualUri: string,
  enhancedUri: string,
  precomputedEnhanced?: RecognitionResult
): Promise<RecognitionResult> {
  const enhancedResult = precomputedEnhanced ?? (await recognizeText(enhancedUri));
  const enhancedScore = rankOcrResult(enhancedResult);

  // Jeśli enhancement słabo działa (ciemna / nietypowa strona), porównaj z oryginałem.
  if (enhancedScore >= 70 && !isWeakResult(enhancedResult)) {
    return enhancedResult;
  }

  const originalResult = await recognizeText(visualUri);
  return rankOcrResult(originalResult) > enhancedScore + 10 ? originalResult : enhancedResult;
}

async function recognizeWithFallbackPresets(
  visualUri: string,
  primaryResult: RecognitionResult,
  baseEnhance?: EnhanceForOcrOptions
): Promise<RecognitionResult> {
  let best: ScoredResult = {
    result: primaryResult,
    score: rankOcrResult(primaryResult),
  };

  if (!isWeakResult(primaryResult) && best.score >= 90) {
    return best.result;
  }

  const presets: Array<EnhanceForOcrOptions['preset']> = ['dark', 'bright'];
  for (const preset of presets) {
    try {
      const uri = await enhanceForOcr(visualUri, { ...baseEnhance, preset });
      const result = await recognizeText(uri);
      const score = rankOcrResult(result);
      if (score > best.score + 8) {
        best = { result, score };
      }
    } catch {
      // pojedynczy preset nie może wywalić całego OCR
    }
  }

  // Ostatnia szansa: surowy kadr (bez enhance) — czasem lepszy przy nietypowym oświetleniu.
  if (isWeakResult(best.result)) {
    try {
      const raw = await recognizeText(visualUri);
      const score = rankOcrResult(raw);
      if (score > best.score + 8) {
        best = { result: raw, score };
      }
    } catch {
      // ignore
    }
  }

  return best.result;
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
  const multiPass = options.multiPass !== false && options.enhance?.preset == null;

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

    if (multiPass) {
      result = await recognizeWithFallbackPresets(visualUri, result, options.enhance);
    }

    await persistPageImageFile(bookId, pageId, visualUri);

    const { printedPageNumber, cleanedText } = extractPrintedPageNumber(result);
    const ocrText = cleanupOcrText(cleanedText);
    const ocrQuality = assessOcrQuality(result);

    await updatePageOcr(bookId, pageId, {
      ocrText,
      printedPageNumber,
      ocrQuality,
      ocrStatus: 'done',
      resetAi: true,
    });

    await commitOcrSlot();
    reserved = false;
    return ocrText;
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
