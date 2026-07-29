/** Cennik Gemini 3.1 Flash-Lite (paid tier) — USD za 1M tokenów. */
export const GEMINI_INPUT_USD_PER_1M = 0.25;
export const GEMINI_OUTPUT_USD_PER_1M = 1.5;

export type AiTokenUsage = {
  promptTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type AiRequestCost = {
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
};

/**
 * Szacunkowy koszt requestu.
 * Wyjście liczone z (total − prompt), bo thinking tokens są w total
 * i Google bilansuje je jak output.
 */
export function estimateGeminiRequestCost(usage: AiTokenUsage): AiRequestCost | null {
  const prompt = usage.promptTokens;
  const hasPrompt = typeof prompt === 'number' && Number.isFinite(prompt) && prompt >= 0;
  const hasOutput =
    typeof usage.outputTokens === 'number' &&
    Number.isFinite(usage.outputTokens) &&
    usage.outputTokens >= 0;
  const hasTotal =
    typeof usage.totalTokens === 'number' &&
    Number.isFinite(usage.totalTokens) &&
    usage.totalTokens >= 0;

  if (!hasPrompt && !hasOutput && !hasTotal) return null;

  const inputTokens = hasPrompt ? prompt : 0;
  const outputTokens =
    hasPrompt && hasTotal
      ? Math.max(0, usage.totalTokens! - prompt!)
      : hasOutput
        ? usage.outputTokens!
        : 0;

  const inputUsd = (inputTokens / 1_000_000) * GEMINI_INPUT_USD_PER_1M;
  const outputUsd = (outputTokens / 1_000_000) * GEMINI_OUTPUT_USD_PER_1M;

  return {
    inputUsd,
    outputUsd,
    totalUsd: inputUsd + outputUsd,
  };
}

/** Format USD dla mikro-kosztów (np. $0.001662). */
export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '$0';
  if (amount < 0.000001) return '<$0.000001';
  if (amount < 0.01) {
    return `$${amount.toFixed(6).replace(/\.?0+$/, '')}`;
  }
  return `$${amount.toFixed(4).replace(/\.?0+$/, '')}`;
}
