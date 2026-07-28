import { Buffer } from 'buffer';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js';

import { getImageSize } from '@/src/images/ensurePortrait';

// jpeg-js encode wymaga Buffer (brak w Hermesie bez polyfilla).
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
}

/** Długi bok pod OCR — wystarczy ML Kit, a JS nie dusi pamięci. */
const OCR_MAX_EDGE = 1600;

export type EnhanceForOcrOptions = {
  /** Wzmocnienie kontrastu po stretchu (1 = neutralnie). Domyślnie 1.35. */
  contrast?: number;
  /** Przesunięcie jasności w zakresie ok. -60…60. */
  brightness?: number;
};

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk) as unknown as number[]);
  }
  return globalThis.btoa(binary);
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value | 0;
}

/**
 * Grayscale + rozciągnięcie kontrastu (percentyle) + boost + jasność.
 */
function enhanceRgbaInPlace(
  data: Uint8Array,
  pixelCount: number,
  options: { contrast: number; brightness: number }
): void {
  const hist = new Uint32Array(256);

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const y = clampByte(0.299 * data[o]! + 0.587 * data[o + 1]! + 0.114 * data[o + 2]!);
    data[o] = y;
    data[o + 1] = y;
    data[o + 2] = y;
    hist[y]! += 1;
  }

  const lowCount = Math.max(1, Math.floor(pixelCount * 0.02));
  const highCount = Math.max(1, Math.floor(pixelCount * 0.98));

  let low = 0;
  let high = 255;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v]!;
    if (seen >= lowCount) {
      low = v;
      break;
    }
  }
  seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v]!;
    if (seen >= highCount) {
      high = v;
      break;
    }
  }

  if (high <= low + 8) {
    low = Math.max(0, low - 10);
    high = Math.min(255, high + 10);
  }

  const range = Math.max(1, high - low);
  const contrast = options.contrast;
  const brightness = options.brightness;
  const mid = 128;

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const stretched = ((data[o]! - low) * 255) / range;
    const boosted = (stretched - mid) * contrast + mid + brightness;
    const y = clampByte(boosted);
    data[o] = y;
    data[o + 1] = y;
    data[o + 2] = y;
  }
}

async function downscaleForOcr(uri: string): Promise<string> {
  const { width, height } = await getImageSize(uri);
  const longEdge = Math.max(width, height);
  if (longEdge <= OCR_MAX_EDGE) {
    return uri;
  }

  const scale = OCR_MAX_EDGE / longEdge;
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: Math.round(width * scale), height: Math.round(height * scale) } }],
    { compress: 0.95, format: SaveFormat.JPEG }
  );
  return result.uri;
}

/**
 * Tworzy tymczasowy JPEG pod OCR (kontrast / grayscale).
 * Nie nadpisuje oryginału — podgląd i PDF zostają kolorowe.
 */
export async function enhanceForOcr(
  uri: string,
  options: EnhanceForOcrOptions = {}
): Promise<string> {
  const contrast = options.contrast ?? 1.35;
  const brightness = options.brightness ?? 0;

  try {
    const scaledUri = await downscaleForOcr(uri);
    const base64 = await FileSystem.readAsStringAsync(scaledUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const raw = decodeJpeg(base64ToBytes(base64), { useTArray: true });
    enhanceRgbaInPlace(raw.data as Uint8Array, raw.width * raw.height, {
      contrast,
      brightness,
    });

    const encoded = encodeJpeg(
      {
        width: raw.width,
        height: raw.height,
        data: raw.data,
      },
      88
    );

    const outBytes =
      encoded.data instanceof Uint8Array
        ? encoded.data
        : new Uint8Array(encoded.data as ArrayBuffer);

    const outPath = `${FileSystem.cacheDirectory}ocr-enhance-${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(outPath, bytesToBase64(outBytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
    return outPath;
  } catch {
    // Awaria preprocessingu nie blokuje OCR — wracamy do oryginału.
    return uri;
  }
}
