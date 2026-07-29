import type { RecognitionResult, TextLine } from 'expo-mlkit-ocr';

import type { OcrConfidenceQuality, OcrQuality } from '@/src/domain/types';

export type { OcrConfidenceQuality, OcrQuality };

/** Próg pewności elementu — poniżej = „słaby”. */
export const OCR_CONFIDENCE_LOW = 0.6;
/** Udział elementów poniżej OCR_CONFIDENCE_LOW → słaba pewność. */
const LOW_CONFIDENCE_RATIO_WEAK = 0.4;

function collectLines(result: RecognitionResult): TextLine[] {
  const lines: TextLine[] = [];
  for (const block of result.blocks ?? []) {
    for (const line of block.lines ?? []) {
      lines.push(line);
    }
  }
  return lines;
}

function readElementConfidence(element: { confidence?: unknown }): number | null {
  const value = element.confidence;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function assessConfidenceQuality(result: RecognitionResult): OcrConfidenceQuality {
  const scores: number[] = [];
  for (const line of collectLines(result)) {
    for (const element of line.elements ?? []) {
      const confidence = readElementConfidence(element);
      if (confidence !== null) scores.push(confidence);
    }
  }

  if (scores.length === 0) {
    return {
      available: false,
      elementCount: 0,
      average: null,
      lowRatio: null,
      weak: false,
    };
  }

  const sum = scores.reduce((acc, value) => acc + value, 0);
  const average = sum / scores.length;
  const lowCount = scores.filter((value) => value < OCR_CONFIDENCE_LOW).length;
  const lowRatio = lowCount / scores.length;
  const weak = average < OCR_CONFIDENCE_LOW || lowRatio >= LOW_CONFIDENCE_RATIO_WEAK;

  return {
    available: true,
    elementCount: scores.length,
    average,
    lowRatio,
    weak,
  };
}

export function assessOcrQuality(result: RecognitionResult): OcrQuality {
  return {
    confidence: assessConfidenceQuality(result),
  };
}

export function formatConfidenceQualityLabel(
  confidence: OcrConfidenceQuality | null | undefined
): string {
  if (!confidence) return 'Pewność: —';
  if (!confidence.available || confidence.average === null) return 'Pewność: brak danych';
  const pct = Math.round(confidence.average * 100);
  return confidence.weak ? `Pewność: słaba ${pct}%` : `Pewność: ${pct}%`;
}
