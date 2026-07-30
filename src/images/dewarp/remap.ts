import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';
import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js';

import { UVDOC_GRID_H, UVDOC_GRID_W } from './uvdoc';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
}

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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Upsample siatki 45×31×2 → outH×outW×2 (bilinear).
 */
export function upsampleGrid(
  grid: Float32Array,
  outH: number,
  outW: number
): Float32Array {
  const srcH = UVDOC_GRID_H;
  const srcW = UVDOC_GRID_W;
  const out = new Float32Array(outH * outW * 2);

  for (let y = 0; y < outH; y++) {
    const gy = srcH === 1 ? 0 : (y / (outH - 1)) * (srcH - 1);
    const y0 = Math.floor(gy);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const fy = gy - y0;

    for (let x = 0; x < outW; x++) {
      const gx = srcW === 1 ? 0 : (x / (outW - 1)) * (srcW - 1);
      const x0 = Math.floor(gx);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const fx = gx - x0;

      const i00 = (y0 * srcW + x0) * 2;
      const i01 = (y0 * srcW + x1) * 2;
      const i10 = (y1 * srcW + x0) * 2;
      const i11 = (y1 * srcW + x1) * 2;
      const dst = (y * outW + x) * 2;

      for (let c = 0; c < 2; c++) {
        const v00 = grid[i00 + c]!;
        const v01 = grid[i01 + c]!;
        const v10 = grid[i10 + c]!;
        const v11 = grid[i11 + c]!;
        const v0 = v00 * (1 - fx) + v01 * fx;
        const v1 = v10 * (1 - fx) + v11 * fx;
        out[dst + c] = v0 * (1 - fy) + v1 * fy;
      }
    }
  }

  return out;
}

function sampleBilinear(
  data: Uint8Array,
  width: number,
  height: number,
  sx: number,
  sy: number,
  out: Uint8Array,
  outOffset: number
): void {
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = sx - x0;
  const fy = sy - y0;

  const i00 = (y0 * width + x0) * 4;
  const i01 = (y0 * width + x1) * 4;
  const i10 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  for (let c = 0; c < 3; c++) {
    const v00 = data[i00 + c]!;
    const v01 = data[i01 + c]!;
    const v10 = data[i10 + c]!;
    const v11 = data[i11 + c]!;
    const v0 = v00 * (1 - fx) + v01 * fx;
    const v1 = v10 * (1 - fx) + v11 * fx;
    out[outOffset + c] = Math.round(v0 * (1 - fy) + v1 * fy);
  }
  out[outOffset + 3] = 255;
}

/**
 * Remap JPEG według siatki UVDoc (współrzędne [-1,1] → piksele źródła).
 */
export async function remapImageUri(
  sourceUri: string,
  grid: Float32Array,
  options?: { maxEdge?: number; quality?: number }
): Promise<string> {
  const maxEdge = options?.maxEdge ?? 2048;
  const quality = options?.quality ?? 92;

  const base64 = await FileSystem.readAsStringAsync(sourceUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const raw = decodeJpeg(base64ToBytes(base64), { useTArray: true });
  let { width, height } = raw;
  let srcData = raw.data as Uint8Array;

  const longEdge = Math.max(width, height);
  if (longEdge > maxEdge) {
    const scale = maxEdge / longEdge;
    const nw = Math.max(1, Math.round(width * scale));
    const nh = Math.max(1, Math.round(height * scale));
    const scaled = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const sx = ((x + 0.5) / nw) * width - 0.5;
        const sy = ((y + 0.5) / nh) * height - 0.5;
        sampleBilinear(
          srcData,
          width,
          height,
          clamp(sx, 0, width - 1),
          clamp(sy, 0, height - 1),
          scaled,
          (y * nw + x) * 4
        );
      }
    }
    srcData = scaled;
    width = nw;
    height = nh;
  }

  const dense = upsampleGrid(grid, height, width);
  const out = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gi = (y * width + x) * 2;
      const nx = dense[gi]!;
      const ny = dense[gi + 1]!;
      const sx = clamp(((nx + 1) / 2) * (width - 1), 0, width - 1);
      const sy = clamp(((ny + 1) / 2) * (height - 1), 0, height - 1);
      sampleBilinear(srcData, width, height, sx, sy, out, (y * width + x) * 4);
    }
  }

  const encoded = encodeJpeg({ width, height, data: out }, quality);
  const outBytes =
    encoded.data instanceof Uint8Array
      ? encoded.data
      : new Uint8Array(encoded.data as ArrayBuffer);

  const outPath = `${FileSystem.cacheDirectory}dewarp-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}.jpg`;
  await FileSystem.writeAsStringAsync(outPath, bytesToBase64(outBytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return outPath;
}
