import { Buffer } from 'buffer';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode as decodeJpeg } from 'jpeg-js';

import { remapImageUri } from './remap';
import {
  isUvdocNativeAvailable,
  loadUvdocModel,
  runUvdocGrid,
  UVDOC_INPUT_H,
  UVDOC_INPUT_W,
} from './uvdoc';

export {
  isUvdocNativeAvailable,
  loadUvdocModel,
  runUvdocGrid,
  UVDOC_GRID_H,
  UVDOC_GRID_W,
  UVDOC_INPUT_H,
  UVDOC_INPUT_W,
} from './uvdoc';
export { remapImageUri, upsampleGrid } from './remap';

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

export type DewarpResult = {
  outputUri: string;
  msInference: number;
  msRemap: number;
  msTotal: number;
};

/**
 * Buduje tensor wejściowy NHWC float32 [0,1] z JPEG (już 496×720).
 */
async function jpegUriToInputTensor(uri: string): Promise<Float32Array> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const raw = decodeJpeg(base64ToBytes(base64), { useTArray: true });
  const { width, height, data } = raw;
  if (width !== UVDOC_INPUT_W || height !== UVDOC_INPUT_H) {
    throw new Error(
      `UVDoc: oczekiwano ${UVDOC_INPUT_W}×${UVDOC_INPUT_H}, jest ${width}×${height}.`
    );
  }

  const tensor = new Float32Array(1 * UVDOC_INPUT_H * UVDOC_INPUT_W * 3);
  const src = data as Uint8Array;
  let o = 0;
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    tensor[o++] = src[p]! / 255;
    tensor[o++] = src[p + 1]! / 255;
    tensor[o++] = src[p + 2]! / 255;
  }
  return tensor;
}

/**
 * Pełny pipeline: resize → UVDoc → remap JPEG według mapy UV.
 * Model: https://huggingface.co/fredcallagan/uvdoc-grid-onnx
 */
export async function dewarpImageUri(
  sourceUri: string,
  options?: { maxRemapEdge?: number }
): Promise<DewarpResult> {
  if (!isUvdocNativeAvailable()) {
    throw new Error(
      'Brak natywnego modułu TFLite. Zbuduj nowy development client (expo-dev-client).'
    );
  }

  const t0 = Date.now();

  const resized = await manipulateAsync(
    sourceUri,
    [{ resize: { width: UVDOC_INPUT_W, height: UVDOC_INPUT_H } }],
    { compress: 0.95, format: SaveFormat.JPEG }
  );

  const input = await jpegUriToInputTensor(resized.uri);
  const model = await loadUvdocModel([]);

  const tInf0 = Date.now();
  const grid = await runUvdocGrid(input, model);
  const msInference = Date.now() - tInf0;

  const tRemap0 = Date.now();
  const outputUri = await remapImageUri(sourceUri, grid, {
    maxEdge: options?.maxRemapEdge ?? 2048,
  });
  const msRemap = Date.now() - tRemap0;

  return {
    outputUri,
    msInference,
    msRemap,
    msTotal: Date.now() - t0,
  };
}
