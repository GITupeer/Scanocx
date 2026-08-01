<?php

namespace App\Services;

class AiPricingService
{
    /** USD za 1M tokenów wejściowych — Gemini 3.1 Flash-Lite (paid tier). */
    public const GEMINI_INPUT_USD_PER_1M = 0.25;

    /** USD za 1M tokenów wyjściowych — Gemini 3.1 Flash-Lite (paid tier). */
    public const GEMINI_OUTPUT_USD_PER_1M = 1.5;

    /** USD za 1M tokenów wejściowych — DeepSeek V4 Flash (szacunek). */
    public const DEEPSEEK_INPUT_USD_PER_1M = 0.27;

    /** USD za 1M tokenów wyjściowych — DeepSeek V4 Flash (szacunek). */
    public const DEEPSEEK_OUTPUT_USD_PER_1M = 1.1;

    /**
     * @return array{provider: string, model: string, input_usd_per_1m: float, output_usd_per_1m: float}
     */
    public function activeModel(): array
    {
        $provider = strtolower(trim((string) config('services.ai.provider', 'gemini')));

        if ($provider === 'deepseek') {
            $model = trim((string) config('services.deepseek.model', DeepSeekService::MODEL)) ?: DeepSeekService::MODEL;

            return [
                'provider' => 'deepseek',
                'model' => $model,
                'input_usd_per_1m' => self::DEEPSEEK_INPUT_USD_PER_1M,
                'output_usd_per_1m' => self::DEEPSEEK_OUTPUT_USD_PER_1M,
            ];
        }

        return [
            'provider' => 'gemini',
            'model' => GeminiService::MODEL,
            'input_usd_per_1m' => self::GEMINI_INPUT_USD_PER_1M,
            'output_usd_per_1m' => self::GEMINI_OUTPUT_USD_PER_1M,
        ];
    }

    /**
     * @return array{input_tokens: int, output_tokens: int, input_usd: float, output_usd: float, total_usd: float}|null
     */
    public function estimateCost(?int $promptTokens, ?int $outputTokens, ?int $totalTokens, ?string $provider = null): ?array
    {
        $hasPrompt = is_int($promptTokens) && $promptTokens >= 0;
        $hasOutput = is_int($outputTokens) && $outputTokens >= 0;
        $hasTotal = is_int($totalTokens) && $totalTokens >= 0;

        if (! $hasPrompt && ! $hasOutput && ! $hasTotal) {
            return null;
        }

        $inputTokens = $hasPrompt ? $promptTokens : 0;
        $computedOutput = $hasPrompt && $hasTotal
            ? max(0, $totalTokens - $promptTokens)
            : ($hasOutput ? $outputTokens : 0);

        $rates = $this->ratesForProvider($provider);

        $inputUsd = ($inputTokens / 1_000_000) * $rates['input_usd_per_1m'];
        $outputUsd = ($computedOutput / 1_000_000) * $rates['output_usd_per_1m'];

        return [
            'input_tokens' => $inputTokens,
            'output_tokens' => $computedOutput,
            'input_usd' => round($inputUsd, 8),
            'output_usd' => round($outputUsd, 8),
            'total_usd' => round($inputUsd + $outputUsd, 8),
        ];
    }

    /**
     * @return array{input_usd_per_1m: float, output_usd_per_1m: float}
     */
    private function ratesForProvider(?string $provider): array
    {
        $resolved = strtolower(trim((string) ($provider ?? config('services.ai.provider', 'gemini'))));

        if ($resolved === 'deepseek') {
            return [
                'input_usd_per_1m' => self::DEEPSEEK_INPUT_USD_PER_1M,
                'output_usd_per_1m' => self::DEEPSEEK_OUTPUT_USD_PER_1M,
            ];
        }

        return [
            'input_usd_per_1m' => self::GEMINI_INPUT_USD_PER_1M,
            'output_usd_per_1m' => self::GEMINI_OUTPUT_USD_PER_1M,
        ];
    }
}
