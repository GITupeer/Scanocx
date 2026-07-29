/**
 * Boost kontrastu skanu strony (kolorowy JPEG).
 * Szybka ścieżka: natywny downscale → LUT → jeden pass po pikselach.
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
  /** Wzmocnienie kontrastu (1 = neutralnie). Domyślnie 1.58. */
  contrast?: number;
  /** Nasycenie (1 = neutralnie). Domyślnie 1.06. */
  saturation?: number;
  /** Rozjaśnienie papieru (−30…40). Domyślnie 12. */
  brightness?: number;
};

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

async function downscaleIfNeeded(uri: string): Promise<string> {
  const { width, height } = await getImageSize(uri);
  const longEdge = Math.max(width, height);
  if (longEdge <= CLARITY_MAX_EDGE) return uri;

  const scale = CLARITY_MAX_EDGE / longEdge;
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: Math.round(width * scale), height: Math.round(height * scale) } }],
    { compress: 0.92, format: SaveFormat.JPEG }
  );
  return result.uri;
}

/**
 * Histogram z co N-tego piksela (wystarczy do percentyli),
 * potem LUT tonów + jeden pass RGB.
 */
function enhanceRgbaInPlace(
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

  const lowTarget = Math.max(1, Math.floor(samples * 0.02));
  const highTarget = Math.max(1, Math.floor(samples * 0.98));
  let low = 0;
  let high = 255;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v]!;
    if (seen >= lowTarget) {
      low = v;
      break;
    }
  }
  seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v]!;
    if (seen >= highTarget) {
      high = v;
      break;
    }
  }
  if (high <= low + 8) {
    low = Math.max(0, low - 16);
    high = Math.min(255, high + 16);
  }

  const range = Math.max(1, high - low);
  const { contrast, saturation, brightness } = options;
  const mid = 128;

  // LUT: stara luma → współczynnik skali RGB (newY / oldY).
  const scaleLut = new Float32Array(256);
  for (let y = 0; y < 256; y++) {
    const stretched = ((y - low) * 255) / range;
    // S-krzywa — mocniejszy kontrast w środku (tekst vs papier).
    const n = Math.max(0, Math.min(1, stretched / 255));
    const s = n < 0.5 ? 2 * n * n : 1 - 2 * (1 - n) * (1 - n);
    let v = (s * 255 - mid) * contrast + mid + brightness;

    // Przyciśnij atrament.
    if (v < 60) v *= 0.82;
    // Wybiel papier.
    if (v > 175) {
      const t = Math.min(1, (v - 175) / 80);
      v += (255 - v) * t * 0.62;
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
 * Zwraca nowy JPEG z mocniejszym kontrastem (styl skanera dokumentów).
 * Przy awarii zwraca oryginalne URI.
 */
export async function enhanceScanClarity(
  uri: string,
  options: EnhanceScanClarityOptions = {}
): Promise<string> {
  const contrast = options.contrast ?? 1.58;
  const saturation = options.saturation ?? 1.06;
  const brightness = options.brightness ?? 12;

  try {
    const workUri = await downscaleIfNeeded(uri);
    const base64 = await FileSystem.readAsStringAsync(workUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const raw = decodeJpeg(base64ToBytes(base64), { useTArray: true });
    const data = raw.data as Uint8Array;

    enhanceRgbaInPlace(data, raw.width * raw.height, {
      contrast,
      saturation,
      brightness,
    });

    const encoded = encodeJpeg(
      { width: raw.width, height: raw.height, data },
      88
    );
    const outBytes =
      encoded.data instanceof Uint8Array
        ? encoded.data
        : new Uint8Array(encoded.data as ArrayBuffer);

    const outPath = `${FileSystem.cacheDirectory}scan-clarity-${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(outPath, bytesToBase64(outBytes), {
      encoding: FileSystem.EncodingType.Base64,
    });
    return outPath;
  } catch {
    return uri;
  }
}
