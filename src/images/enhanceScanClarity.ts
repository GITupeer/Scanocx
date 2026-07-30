/**
 * Boost skanu strony — styl „Dokument” (jak Google Drive / Lens).
 * Wybiela papier, przyciska atrament, ścina żółty cast od światła.
 */
import { Buffer } from 'buffer';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js';

import { getImageSize } from '@/src/images/ensurePortrait';

if (typeof (globalThis as { Buffer?: typeof Buffer }).Buffer === 'undefined') {
  (globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
}

/** Długi bok — czytelne na ekranie/PDF, JS nie muli kilka sekund. */
const CLARITY_MAX_EDGE = 1500;

export type EnhanceScanClarityOptions = {
  /**
   * `document` = biały papier jak skaner (domyślnie).
   * `photo` = łagodniejszy boost bez twardego wybielania.
   */
  mode?: 'document' | 'photo';
  /** Wzmocnienie kontrastu (1 = neutralnie). */
  contrast?: number;
  /** Nasycenie (1 = pełny kolor, 0 = szarość). */
  saturation?: number;
  /** Rozjaśnienie (−40…40). */
  brightness?: number;
  /** Max. długi bok przed przetwarzaniem (domyślnie 1500). */
  maxEdge?: number;
};

const DOCUMENT_DEFAULTS = {
  contrast: 1.72,
  saturation: 0.42,
  brightness: 10,
} as const;

const PHOTO_DEFAULTS = {
  contrast: 1.35,
  saturation: 1.0,
  brightness: 6,
} as const;

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value | 0;
}

/** Szybka luma (BT.601, stałe całkowite). */
function lumaByte(r: number, g: number, b: number): number {
  return (77 * r + 150 * g + 29 * b) >> 8;
}

function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function toDisplayUri(path: string): string {
  if (!path) return path;
  if (
    path.startsWith('file://') ||
    path.startsWith('content://') ||
    path.startsWith('data:') ||
    path.startsWith('http')
  ) {
    return path;
  }
  return `file://${path}`;
}

async function ensureJpegWorkUri(uri: string, maxEdge: number): Promise<string> {
  const { width, height } = await getImageSize(uri);
  const longEdge = Math.max(width, height);
  const actions =
    longEdge > maxEdge
      ? [
          {
            resize: {
              width: Math.round((width * maxEdge) / longEdge),
              height: Math.round((height * maxEdge) / longEdge),
            },
          },
        ]
      : [];

  const result = await manipulateAsync(uri, actions, {
    compress: 0.9,
    format: SaveFormat.JPEG,
  });
  return result.uri;
}

function percentileFromHist(hist: Uint32Array, samples: number, p: number): number {
  const target = Math.max(1, Math.floor(samples * p));
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v]!;
    if (seen >= target) return v;
  }
  return 255;
}

/**
 * Tryb Dokument: rozciągnij histogram, twarda S-krzywa,
 * wybiel papier → ~255, przyciśnij atrament, zdejmij cast.
 */
function enhanceDocumentInPlace(
  data: Uint8Array,
  pixelCount: number,
  options: { contrast: number; saturation: number; brightness: number }
): void {
  const hist = new Uint32Array(256);
  const sampleStride = pixelCount > 400_000 ? 8 : 4;
  let samples = 0;
  for (let i = 0; i < pixelCount; i += sampleStride) {
    const o = i << 2;
    hist[lumaByte(data[o]!, data[o + 1]!, data[o + 2]!)]! += 1;
    samples += 1;
  }

  // Agresywniejsze percentyle — typowa strona książki.
  let low = percentileFromHist(hist, samples, 0.015);
  let high = percentileFromHist(hist, samples, 0.92);
  if (high <= low + 12) {
    low = Math.max(0, low - 20);
    high = Math.min(255, high + 20);
  }

  const range = Math.max(1, high - low);
  const { contrast, saturation, brightness } = options;
  const mid = 128;

  // LUT luma → nowa luma (nie skala RGB — czystszy biały).
  const toneLut = new Uint8Array(256);
  for (let y = 0; y < 256; y++) {
    const stretched = ((y - low) * 255) / range;
    const n = Math.max(0, Math.min(1, stretched / 255));

    // Mocniejsza S-krzywa (tekst vs papier).
    const s = n < 0.5 ? 4 * n * n * n : 1 - 4 * (1 - n) * (1 - n) * (1 - n);
    let v = (s * 255 - mid) * contrast + mid + brightness;

    // Atrament → czarniejszy.
    if (v < 95) {
      const t = 1 - v / 95;
      v *= 1 - 0.38 * t;
    }

    // Papier → czysta biel (klucz efektu „skan z kartki”).
    if (v > 155) {
      const t = Math.min(1, (v - 155) / 55);
      // Ease-in: im jaśniej, tym mocniej do 255.
      const w = t * t;
      v += (255 - v) * (0.55 + 0.45 * w);
    }
    if (v > 210) v = 255;

    toneLut[y] = clampByte(v);
  }

  const sat = Math.max(0, Math.min(1.5, saturation));

  for (let i = 0; i < pixelCount; i++) {
    const o = i << 2;
    let r = data[o]!;
    let g = data[o + 1]!;
    let b = data[o + 2]!;
    const y0 = lumaByte(r, g, b);
    const y1 = toneLut[y0]!;

    // Mapuj przez nową luminancję (zachowaj odcień względem starej y).
    if (y0 > 2) {
      const scale = y1 / y0;
      r *= scale;
      g *= scale;
      b *= scale;
    } else {
      r = g = b = y1;
    }

    // Desaturacja + lekki cool white (mniej żółtego od lampy).
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * sat;
    g = gray + (g - gray) * sat;
    b = gray + (b - gray) * sat;

    // Gdy prawie papier — dopchnij do neutralnej bieli.
    if (y1 >= 230) {
      const t = Math.min(1, (y1 - 230) / 25);
      r += (255 - r) * t;
      g += (255 - g) * t;
      b += (255 - b) * t;
    } else if (y1 > 190) {
      // Lekko schłodź ciepły cast na jasnym papierze.
      const t = (y1 - 190) / 40;
      b = Math.min(255, b + 6 * t);
      r = Math.max(0, r - 4 * t);
    }

    data[o] = clampByte(r);
    data[o + 1] = clampByte(g);
    data[o + 2] = clampByte(b);
  }
}

/** Łagodniejszy boost (zdjęcie / kolorowe ilustracje). */
function enhancePhotoInPlace(
  data: Uint8Array,
  pixelCount: number,
  options: { contrast: number; saturation: number; brightness: number }
): void {
  const hist = new Uint32Array(256);
  const sampleStride = pixelCount > 400_000 ? 8 : 4;
  let samples = 0;
  for (let i = 0; i < pixelCount; i += sampleStride) {
    const o = i << 2;
    hist[lumaByte(data[o]!, data[o + 1]!, data[o + 2]!)]! += 1;
    samples += 1;
  }

  let low = percentileFromHist(hist, samples, 0.02);
  let high = percentileFromHist(hist, samples, 0.98);
  if (high <= low + 8) {
    low = Math.max(0, low - 16);
    high = Math.min(255, high + 16);
  }

  const range = Math.max(1, high - low);
  const { contrast, saturation, brightness } = options;
  const mid = 128;
  const scaleLut = new Float32Array(256);

  for (let y = 0; y < 256; y++) {
    const stretched = ((y - low) * 255) / range;
    const n = Math.max(0, Math.min(1, stretched / 255));
    const s = n < 0.5 ? 2 * n * n : 1 - 2 * (1 - n) * (1 - n);
    let v = (s * 255 - mid) * contrast + mid + brightness;
    if (v < 60) v *= 0.88;
    if (v > 180) {
      const t = Math.min(1, (v - 180) / 75);
      v += (255 - v) * t * 0.4;
    }
    const y1 = clampByte(v);
    scaleLut[y] = y > 2 ? y1 / y : y1 / 255;
  }

  const sat = saturation;
  const boostSat = sat !== 1;

  for (let i = 0; i < pixelCount; i++) {
    const o = i << 2;
    const r0 = data[o]!;
    const g0 = data[o + 1]!;
    const b0 = data[o + 2]!;
    const scale = scaleLut[lumaByte(r0, g0, b0)]!;

    let r = r0 * scale;
    let g = g0 * scale;
    let b = b0 * scale;

    if (boostSat) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * sat;
      g = gray + (g - gray) * sat;
      b = gray + (b - gray) * sat;
    }

    data[o] = clampByte(r);
    data[o + 1] = clampByte(g);
    data[o + 2] = clampByte(b);
  }
}

/**
 * Zwraca JPEG w stylu skanera dokumentów (biały papier).
 * Przy awarii zwraca oryginalne URI.
 */
export async function enhanceScanClarity(
  uri: string,
  options: EnhanceScanClarityOptions = {}
): Promise<string> {
  const mode = options.mode ?? 'document';
  const defaults = mode === 'photo' ? PHOTO_DEFAULTS : DOCUMENT_DEFAULTS;
  const contrast = options.contrast ?? defaults.contrast;
  const saturation = options.saturation ?? defaults.saturation;
  const brightness = options.brightness ?? defaults.brightness;
  const maxEdge = options.maxEdge ?? CLARITY_MAX_EDGE;

  try {
    const workUri = await ensureJpegWorkUri(uri, maxEdge);
    const base64 = await FileSystem.readAsStringAsync(workUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const raw = decodeJpeg(base64ToBytes(base64), { useTArray: true });
    const data = raw.data as Uint8Array;
    const opts = { contrast, saturation, brightness };

    if (mode === 'photo') {
      enhancePhotoInPlace(data, raw.width * raw.height, opts);
    } else {
      enhanceDocumentInPlace(data, raw.width * raw.height, opts);
    }

    const encoded = encodeJpeg(
      { width: raw.width, height: raw.height, data },
      90
    );
    const outBytes =
      encoded.data instanceof Uint8Array
        ? encoded.data
        : new Uint8Array(encoded.data as ArrayBuffer);

    const outPath = `${FileSystem.cacheDirectory}scan-clarity-${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(outPath, bytesToBase64(outBytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
    return toDisplayUri(outPath);
  } catch {
    return toDisplayUri(uri);
  }
}
