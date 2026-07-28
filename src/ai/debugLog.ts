/**
 * Ostatnia wymiana z Gemini — do podglądu w UI (nie znika po zakończeniu kolejki).
 */
import { useSyncExternalStore } from 'react';

export type GeminiDebugEntry = {
  at: string;
  model: string;
  pageCount: number;
  httpStatus: number | null;
  finishReason: string | null;
  /** Pełna surowa odpowiedź API (candidates / error). */
  rawApiJson: string;
  /** Wyodrębniony tekst modelu (zwykle JSON pages[]). */
  modelText: string | null;
  error: string | null;
  elapsedMs: number | null;
};

let entry: GeminiDebugEntry | null = null;
const listeners = new Set<() => void>();

function publish(): void {
  listeners.forEach((listener) => listener());
}

export function setGeminiDebugEntry(next: GeminiDebugEntry): void {
  entry = next;
  publish();
}

export function getGeminiDebugEntry(): GeminiDebugEntry | null {
  return entry;
}

export function clearGeminiDebugEntry(): void {
  entry = null;
  publish();
}

export function subscribeGeminiDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useGeminiDebug(): GeminiDebugEntry | null {
  return useSyncExternalStore(subscribeGeminiDebug, getGeminiDebugEntry, getGeminiDebugEntry);
}
