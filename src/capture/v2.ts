/**
 * Capture v2 — szybka ścieżka kamery.
 *
 * Zasady:
 * - spust czeka TYLKO na takePictureAsync
 * - skipProcessing: true (bez rotacji/skalowania w natywie)
 * - mały pictureSize (~2–3 MP)
 * - crop do ramki + zapis; OCR odpala ekran skanowania zaraz po zdjęciu
 */

import type { CameraView } from 'expo-camera';

import type { GuideRect } from '@/src/images/cropToGuide';

/** Cel ok. 2.5 MP — szybki odczyt sensora, wystarczający do OCR. */
export const CAPTURE_V2_TARGET_MP = 2_500_000;

/** Ramka względem podglądu 4:3 (wyśrodkowana) — OCR dostaje tylko ten wycinek. */
export const CAPTURE_V2_GUIDE: GuideRect = {
  x: (1 - 0.72) / 2,
  y: (1 - 0.78) / 2,
  width: 0.72,
  height: 0.78,
};

export type CaptureV2PictureSize = string;

export function pickFastPictureSize(sizes: string[]): CaptureV2PictureSize | undefined {
  type Scored = { size: string; ratioScore: number; mpScore: number };

  const scored: Scored[] = [];

  for (const size of sizes) {
    const match = size.match(/^(\d+)x(\d+)$/i);
    if (!match) continue;
    const w = Number(match[1]);
    const h = Number(match[2]);
    const short = Math.min(w, h);
    const long = Math.max(w, h);
    if (short < 720) continue;

    const ratio = long / short;
    const mp = w * h;
    scored.push({
      size,
      ratioScore: Math.abs(ratio - 4 / 3),
      mpScore: Math.abs(mp - CAPTURE_V2_TARGET_MP),
    });
  }

  scored.sort((a, b) => a.ratioScore - b.ratioScore || a.mpScore - b.mpScore);
  return scored[0]?.size;
}

export type CaptureV2Shot = {
  uri: string;
  /** EXIF Orientation (1–8) z pliku kamery — null, gdy urządzenie go nie zapisało. */
  exifOrientation: number | null;
};

/**
 * Jedyny ciężki krok na ścieżce spustu.
 * Zwraca URI albo null.
 */
export async function snapCameraV2(camera: CameraView): Promise<CaptureV2Shot | null> {
  const photo = await camera.takePictureAsync({
    skipProcessing: true,
    shutterSound: false,
    exif: true,
  });

  if (!photo?.uri) return null;

  const orientation = (photo.exif as Record<string, unknown> | undefined)?.Orientation;
  return {
    uri: photo.uri,
    exifOrientation: typeof orientation === 'number' ? orientation : null,
  };
}
