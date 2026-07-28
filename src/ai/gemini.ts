/**
 * @deprecated Lokalne wywołania Gemini usunięte — AI idzie przez backend.
 * Zostawione jako stub, żeby nie psuć ewentualnych importów debug.
 */
export type GeminiProgress = {
  phase: 'sending' | 'waiting' | 'parsing';
  detail: string;
};

export async function proofreadOcrText(
  _ocrText: string,
  _onProgress?: (progress: GeminiProgress) => void
): Promise<string> {
  throw new Error('Lokalne Gemini wyłączone. Użyj kolejki AI (backend).');
}
