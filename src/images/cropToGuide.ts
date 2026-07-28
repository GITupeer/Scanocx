import { Action, manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { getImageSize } from '@/src/images/ensurePortrait';

/** Prostokąt ramki w zakresie 0–1 względem podglądu / kadru. */
export type GuideRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CropToGuideOptions = {
  /**
   * EXIF Orientation (1–8) ze zdjęcia z kamery. Kamera wpisuje ten tag na podstawie
   * fizycznego przechyłu telefonu, więc przy zdjęciach „z góry” bywa losowy —
   * służy tu tylko do policzenia, ile stopni dekoder już obrócił piksele.
   */
  exifOrientation?: number | null;
};

const JPEG = { compress: 0.85, format: SaveFormat.JPEG } as const;

/** Ile stopni dekoder obraca piksele przy wpiekaniu danego EXIF Orientation. */
const EXIF_DECODE_ROTATION: Record<number, 0 | 90 | 180 | 270> = {
  1: 0,
  2: 0,
  3: 180,
  4: 180,
  5: 90,
  6: 90,
  7: 270,
  8: 270,
};

/**
 * Obrót poziomej klatki sensora do pionowego kadru podglądu. Ekran jest zablokowany
 * w PORTRAIT_UP, więc ta wartość jest stała — dzięki temu wynik nie zależy od tego,
 * jak telefon był przechylony w chwili spustu.
 */
const SENSOR_TO_PORTRAIT = 90;

/**
 * Normalizacja orientacji + crop ramki w max 2 przejściach JPEG
 * (EXIF flatten, potem rotate/crop razem).
 */
export async function cropToGuide(
  uri: string,
  guide: GuideRect,
  options: CropToGuideOptions = {}
): Promise<string> {
  // Spłaszcz EXIF do pikseli (jeden encode).
  let current = await manipulateAsync(uri, [], JPEG);
  let { width, height } = await getImageSize(current.uri);

  const actions: Action[] = [];

  const rotate = (degrees: number) => {
    if (degrees % 360 === 0) return;
    actions.push({ rotate: degrees });
    if (degrees % 180 !== 0) {
      const nextW = height;
      const nextH = width;
      width = nextW;
      height = nextH;
    }
  };

  const exifOrientation = options.exifOrientation;
  const decodeRotation =
    exifOrientation != null ? EXIF_DECODE_ROTATION[exifOrientation] : undefined;

  if (decodeRotation === undefined) {
    // Galeria / brak EXIF — wiemy tylko tyle, że ramka jest w układzie pionowym.
    while (height < width) {
      rotate(90);
    }
  } else {
    // Cofnij obrót wynikający z EXIF i ustaw stały obrót sensor → portret.
    const sensorWasLandscape =
      decodeRotation % 180 === 0 ? width > height : height > width;
    const target = sensorWasLandscape ? SENSOR_TO_PORTRAIT : 0;
    rotate((target - decodeRotation + 360) % 360);
  }

  const originX = Math.max(0, Math.round(guide.x * width));
  const originY = Math.max(0, Math.round(guide.y * height));
  const cropWidth = Math.min(width - originX, Math.round(guide.width * width));
  const cropHeight = Math.min(height - originY, Math.round(guide.height * height));

  if (cropWidth >= 8 && cropHeight >= 8) {
    actions.push({
      crop: { originX, originY, width: cropWidth, height: cropHeight },
    });
  }

  if (actions.length === 0) {
    return current.uri;
  }

  current = await manipulateAsync(current.uri, actions, JPEG);
  return current.uri;
}
