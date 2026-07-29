import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { getImageSize } from '@/src/images/ensurePortrait';

/** Długi bok wystarczy Gemini do odczytu tekstu; mniejszy upload i tańsze requesty. */
const AI_MAX_EDGE = 1600;
/** Jakość JPEG pod AI — czytelność tekstu bez megabajtowych plików. */
const AI_JPEG_QUALITY = 0.72;

/**
 * Skaluje i kompresuje zdjęcie przed wysyłką do backendu / Google.
 * Nie nadpisuje oryginału — zwraca URI tymczasowego JPEG.
 */
export async function prepareImageForAiUpload(uri: string): Promise<string> {
  const { width, height } = await getImageSize(uri);
  const longEdge = Math.max(width, height);

  if (longEdge <= AI_MAX_EDGE) {
    const result = await manipulateAsync(uri, [], {
      compress: AI_JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });
    return result.uri;
  }

  const scale = AI_MAX_EDGE / longEdge;
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: Math.round(width * scale), height: Math.round(height * scale) } }],
    { compress: AI_JPEG_QUALITY, format: SaveFormat.JPEG }
  );
  return result.uri;
}
