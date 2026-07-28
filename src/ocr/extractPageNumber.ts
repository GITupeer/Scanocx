import type { RecognitionResult, TextLine } from 'expo-mlkit-ocr';

export type PageNumberExtraction = {
  printedPageNumber: string | null;
  cleanedText: string;
};

type Candidate = {
  value: string;
  lineText: string;
  score: number;
  lineKey: string;
};

const ARABIC = /^(?:[-–—•·.]?\s*)(\d{1,4})(?:\s*[-–—•·.]?)$/;
const ROMAN = /^(?:[-–—•·.]?\s*)([ivxlcdm]{1,8})(?:\s*[-–—•·.]?)$/i;
const LABELED =
  /^(?:str(?:ona|\.)?|s\.|page|p\.|nr\.?|n°)\s*[:.]?\s*(\d{1,4}|[ivxlcdm]{1,8})\s*$/i;
const WRAPPED = /^[-–—]\s*(\d{1,4}|[ivxlcdm]{1,8})\s*[-–—]$/i;

function normalizePageValue(raw: string): string {
  return raw.trim().replace(/^0+(?=\d)/, '') || raw.trim();
}

function parsePageNumber(text: string): string | null {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed || trimmed.length > 24) return null;

  for (const pattern of [LABELED, WRAPPED, ARABIC, ROMAN]) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return normalizePageValue(match[1]);
    }
  }

  return null;
}

function estimatePageHeight(result: RecognitionResult): number {
  let maxBottom = 0;
  for (const block of result.blocks ?? []) {
    const bottom = block.boundingBox.y + block.boundingBox.height;
    if (bottom > maxBottom) maxBottom = bottom;
    for (const line of block.lines ?? []) {
      const lineBottom = line.boundingBox.y + line.boundingBox.height;
      if (lineBottom > maxBottom) maxBottom = lineBottom;
    }
  }
  return maxBottom || 1;
}

function lineKey(line: TextLine): string {
  const b = line.boundingBox;
  return `${b.x.toFixed(1)}:${b.y.toFixed(1)}:${b.width.toFixed(1)}:${line.text}`;
}

function scoreCandidate(line: TextLine, value: string, pageHeight: number): number {
  const box = line.boundingBox;
  const centerY = box.y + box.height / 2;
  const topZone = pageHeight * 0.18;
  const bottomZone = pageHeight * 0.82;
  const inTop = centerY <= topZone;
  const inBottom = centerY >= bottomZone;
  if (!inTop && !inBottom) return -1;

  let score = 0;
  // im bliżej krawędzi, tym lepiej
  if (inTop) score += 40 + (1 - centerY / topZone) * 20;
  if (inBottom) score += 40 + ((centerY - bottomZone) / (pageHeight - bottomZone || 1)) * 20;

  // krótkie, izolowane linie wyglądają jak numer
  const textLen = line.text.trim().length;
  score += Math.max(0, 18 - textLen);

  // czyste cyfry / rzymskie > etykiety
  if (/^\d{1,4}$/.test(value)) score += 12;
  if (/^[ivxlcdm]+$/i.test(value)) score += 8;

  // linie z wieloma elementami / długie bloki są mniej wiarygodne
  if ((line.elements?.length ?? 0) > 3) score -= 10;

  return score;
}

function collectCandidates(result: RecognitionResult): Candidate[] {
  const pageHeight = estimatePageHeight(result);
  const candidates: Candidate[] = [];

  for (const block of result.blocks ?? []) {
    for (const line of block.lines ?? []) {
      const value = parsePageNumber(line.text);
      if (!value) continue;
      const score = scoreCandidate(line, value, pageHeight);
      if (score < 0) continue;
      candidates.push({
        value,
        lineText: line.text.trim(),
        score,
        lineKey: lineKey(line),
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function rebuildTextWithoutLine(result: RecognitionResult, excludeKey: string | null): string {
  const parts: string[] = [];

  for (const block of result.blocks ?? []) {
    const lines = (block.lines ?? [])
      .filter((line) => (excludeKey ? lineKey(line) !== excludeKey : true))
      .map((line) => line.text.trim())
      .filter(Boolean);

    if (lines.length > 0) {
      parts.push(lines.join('\n'));
    }
  }

  if (parts.length > 0) {
    return parts.join('\n\n').trim();
  }

  // fallback gdy brak blocks
  return (result.text ?? '').trim();
}

function stripPageNumberFromPlainText(text: string, pageNumber: string): string {
  const escaped = pageNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`^\\s*(?:str(?:ona|\\.)?|s\\.|page|p\\.|nr\\.?|n°)\\s*[:.]?\\s*${escaped}\\s*$`, 'gim'),
    new RegExp(`^\\s*[-–—]\\s*${escaped}\\s*[-–—]\\s*$`, 'gim'),
    new RegExp(`^\\s*[-–—•·.]?\\s*${escaped}\\s*[-–—•·.]?\\s*$`, 'gim'),
  ];

  let cleaned = text;
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Wykrywa numer strony na marginesie (góra/dół), usuwa go z tekstu OCR
 * i zwraca osobną wartość — albo null, gdy numeru nie znaleziono.
 */
export function extractPrintedPageNumber(result: RecognitionResult): PageNumberExtraction {
  const candidates = collectCandidates(result);
  const best = candidates[0] ?? null;

  if (!best || best.score < 35) {
    return {
      printedPageNumber: null,
      cleanedText: (result.text ?? '').trim(),
    };
  }

  let cleanedText = rebuildTextWithoutLine(result, best.lineKey);
  cleanedText = stripPageNumberFromPlainText(cleanedText, best.value);

  // jeśli rebuild nic nie dał, czyść pełny tekst
  if (!cleanedText && result.text) {
    cleanedText = stripPageNumberFromPlainText(result.text, best.value);
  }

  return {
    printedPageNumber: best.value,
    cleanedText,
  };
}
