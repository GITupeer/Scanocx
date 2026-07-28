import type { RecognitionResult } from 'expo-mlkit-ocr';
import { recognizeText } from 'expo-mlkit-ocr';

import { rotateUri } from '@/src/images/ensurePortrait';

const READABLE_CHARS = /[A-Za-zÀ-žąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9]/g;

export function countReadableChars(result: RecognitionResult): number {
  return ((result.text ?? '').match(READABLE_CHARS) ?? []).length;
}

export function scoreUpright(result: RecognitionResult): number {
  // Więcej czytelnych znaków = zwykle lepsza orientacja.
  let score = countReadableChars(result);

  const lines = [];
  for (const block of result.blocks ?? []) {
    for (const line of block.lines ?? []) {
      lines.push(line);
    }
  }

  lines.sort((a, b) => a.boundingBox.y - b.boundingBox.y);

  for (const line of lines) {
    const { width, height } = line.boundingBox;
    // Linie tekstu są zwykle szersze niż wyższe.
    if (width >= height * 1.2) score += 14;
    else if (height > width * 1.15) score -= 22;
  }

  // Naturalny układ: kolejne linie idą w dół strony.
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].boundingBox.y >= lines[i - 1].boundingBox.y) {
      score += 2;
    }
  }

  return score;
}

export type UprightOcrPick = {
  uri: string;
  result: RecognitionResult;
  rotated: boolean;
};

/** Poniżej tylu znaków porównanie 0° vs 180° to szum — nie obracamy. */
const MIN_CHARS_TO_JUDGE = 24;
/** Wersja 180° musi wygrać wyraźnie, inaczej zostawiamy kadr z podglądu. */
const MIN_SCORE_ADVANTAGE = 40;
const MIN_SCORE_RATIO = 1.2;

/**
 * Porównuje OCR w 0° i 180° — obraca tylko wtedy, gdy odwrócona wersja jest
 * czytelna i wyraźnie lepsza. Kadr z kamery jest już ustawiony pionowo,
 * więc przy słabym sygnale lepiej go nie ruszać.
 */
export async function pickUprightWithOcr(portraitUri: string): Promise<UprightOcrPick> {
  const result0 = await recognizeText(portraitUri);
  const score0 = scoreUpright(result0);

  const rotatedUri = await rotateUri(portraitUri, 180);
  const result180 = await recognizeText(rotatedUri);
  const score180 = scoreUpright(result180);

  const chars = Math.max(countReadableChars(result0), countReadableChars(result180));
  const clearlyBetter =
    score180 > score0 + MIN_SCORE_ADVANTAGE &&
    score180 > Math.max(score0, 0) * MIN_SCORE_RATIO;

  if (chars >= MIN_CHARS_TO_JUDGE && clearlyBetter) {
    return { uri: rotatedUri, result: result180, rotated: true };
  }

  return { uri: portraitUri, result: result0, rotated: false };
}
