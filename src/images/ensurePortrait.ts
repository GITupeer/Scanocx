import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';

export function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
}

export async function isLandscapeUri(uri: string): Promise<boolean> {
  const { width, height } = await getImageSize(uri);
  return width > height;
}

export type EnsurePortraitOptions = {
  /** Dodatkowy obrót po wymuszeniu pionu (np. korekta grawitacji 180°). */
  extraRotate?: 0 | 90 | 180 | 270;
};

/**
 * Zawsze zwraca JPEG w pionie (height >= width).
 * Wpieka orientację EXIF w piksele — żeby Image i OCR widziały to samo.
 */
export async function ensurePortraitUri(
  uri: string,
  options: EnsurePortraitOptions = {}
): Promise<string> {
  const { extraRotate = 0 } = options;

  // Pusty pipeline spłaszcza EXIF do pikseli (ważne dla ML Kit).
  let current = await manipulateAsync(uri, [], {
    compress: 0.92,
    format: SaveFormat.JPEG,
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const { width, height } = await getImageSize(current.uri);
    if (height >= width) {
      break;
    }
    current = await manipulateAsync(current.uri, [{ rotate: 90 }], {
      compress: 0.92,
      format: SaveFormat.JPEG,
    });
  }

  if (extraRotate) {
    current = await manipulateAsync(current.uri, [{ rotate: extraRotate }], {
      compress: 0.92,
      format: SaveFormat.JPEG,
    });

    // Po 90/270 upewnij się, że nadal jest pion.
    for (let attempt = 0; attempt < 2; attempt++) {
      const { width, height } = await getImageSize(current.uri);
      if (height >= width) break;
      current = await manipulateAsync(current.uri, [{ rotate: 90 }], {
        compress: 0.92,
        format: SaveFormat.JPEG,
      });
    }
  }

  return current.uri;
}

/**
 * Zawsze zwraca JPEG w poziomie (width >= height).
 * Spłaszcza EXIF do pikseli — ważne przy skanie rozkładówki w landscape.
 */
export async function ensureLandscapeUri(uri: string): Promise<string> {
  // Pusty pipeline spłaszcza EXIF do pikseli.
  let current = await manipulateAsync(uri, [], {
    compress: 0.92,
    format: SaveFormat.JPEG,
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const { width, height } = await getImageSize(current.uri);
    if (width >= height) {
      break;
    }
    current = await manipulateAsync(current.uri, [{ rotate: 90 }], {
      compress: 0.92,
      format: SaveFormat.JPEG,
    });
  }

  return current.uri;
}

export async function rotateUri(uri: string, degrees: 90 | 180 | 270): Promise<string> {
  const result = await manipulateAsync(uri, [{ rotate: degrees }], {
    compress: 0.92,
    format: SaveFormat.JPEG,
  });
  return result.uri;
}
