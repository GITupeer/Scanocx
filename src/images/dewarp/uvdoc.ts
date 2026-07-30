import {
  loadTensorflowModel,
  type TensorflowModel,
  type TensorflowModelDelegate,
} from 'react-native-fast-tflite';

/** Wejście modelu UVDoc (NHWC po konwersji TFLite). */
export const UVDOC_INPUT_H = 720;
export const UVDOC_INPUT_W = 496;
/** Siatka wyjściowa (H×W×2: x,y w [-1, 1]). */
export const UVDOC_GRID_H = 45;
export const UVDOC_GRID_W = 31;

const MODEL_ASSET = require('../../../assets/models/uvdoc_grid.tflite') as number;

let modelPromise: Promise<TensorflowModel> | null = null;

export function isUvdocNativeAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NitroModules } = require('react-native-nitro-modules') as {
      NitroModules: { createHybridObject: (name: string) => unknown };
    };
    NitroModules.createHybridObject('TfliteModule');
    return true;
  } catch {
    return false;
  }
}

/**
 * Ładuje UVDoc (singleton). Wymaga nowego dev clienta z react-native-fast-tflite.
 */
export async function loadUvdocModel(
  delegates: TensorflowModelDelegate[] = []
): Promise<TensorflowModel> {
  if (!modelPromise) {
    modelPromise = loadTensorflowModel(MODEL_ASSET, delegates).catch((error) => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

/**
 * Inferencja: Float32 NHWC [0,1] → Float32Array siatki (45×31×2), layout [y][x][xy].
 */
export async function runUvdocGrid(
  inputNhWC: Float32Array,
  model?: TensorflowModel
): Promise<Float32Array> {
  const expected = 1 * UVDOC_INPUT_H * UVDOC_INPUT_W * 3;
  if (inputNhWC.length !== expected) {
    throw new Error(
      `UVDoc: oczekiwano tensora ${expected} floatów, otrzymano ${inputNhWC.length}.`
    );
  }

  const m = model ?? (await loadUvdocModel());
  // Hermes bywa alokować za duży ArrayBuffer — zawsze dokładna kopia.
  const exact = new ArrayBuffer(inputNhWC.byteLength);
  new Float32Array(exact).set(inputNhWC);

  let outputs: ArrayBuffer[];
  try {
    outputs = m.runSync([exact]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`UVDoc invoke: ${msg}`);
  }
  if (!outputs[0]) {
    throw new Error('UVDoc: brak tensora wyjściowego.');
  }

  const raw = new Float32Array(outputs[0]);
  const gridLen = UVDOC_GRID_H * UVDOC_GRID_W * 2;
  if (raw.length < gridLen) {
    throw new Error(`UVDoc: nieoczekiwany rozmiar siatki (${raw.length} < ${gridLen}).`);
  }

  // TFLite: (1, 45, 31, 2) — już HWC. Jeśli kiedyś wróci NCHW (1,2,45,31), wykryj po shape.
  const outShape = m.outputs[0]?.shape ?? [];
  if (outShape.length === 4 && outShape[1] === 2 && outShape[2] === UVDOC_GRID_H) {
    // NCHW → HWC
    const hwc = new Float32Array(gridLen);
    for (let y = 0; y < UVDOC_GRID_H; y++) {
      for (let x = 0; x < UVDOC_GRID_W; x++) {
        const dst = (y * UVDOC_GRID_W + x) * 2;
        hwc[dst] = raw[0 * UVDOC_GRID_H * UVDOC_GRID_W + y * UVDOC_GRID_W + x]!;
        hwc[dst + 1] = raw[1 * UVDOC_GRID_H * UVDOC_GRID_W + y * UVDOC_GRID_W + x]!;
      }
    }
    return hwc;
  }

  return raw.length === gridLen ? raw : raw.subarray(0, gridLen);
}
