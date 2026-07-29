<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class DeepSeekService
{
    public const MODEL = 'deepseek-v4-flash';

    public const TIMEOUT_SECONDS = 120;

    public const JSON_SCHEMA_HINT = <<<'HINT'
Zwróć WYŁĄCZNIE jeden obiekt JSON (bez markdown) o polach:
{
  "corrected_text": "string — pełny poprawiony tekst strony bez numeru strony; z \\n przy dialogach, akapitach i nagłówkach",
  "has_title": true|false,
  "title": "string|null",
  "has_subtitle": true|false,
  "subtitle": "string|null",
  "ocr_quality": 0.00,
  "coherence": 0.00,
  "page_number_detected": true|false,
  "page_number": "string|null"
}
HINT;

    /**
     * @return array{
     *   text: string,
     *   title: string|null,
     *   subtitle: string|null,
     *   ocr_quality: float,
     *   coherence: float,
     *   page_number: string|null
     * }
     */
    public function proofreadImageBytes(string $bytes, string $mimeType = 'image/jpeg'): array
    {
        $apiKey = trim((string) config('services.deepseek.key'));
        if ($apiKey === '') {
            throw new RuntimeException('Brak klucza DEEPSEEK_API_KEY na serwerze.');
        }

        if ($bytes === '') {
            throw new RuntimeException('Brak zdjęcia strony do analizy AI.');
        }

        $model = trim((string) config('services.deepseek.model', self::MODEL)) ?: self::MODEL;
        $baseUrl = rtrim((string) config('services.deepseek.base_url', 'https://api.deepseek.com'), '/');
        $endpoint = $baseUrl.'/chat/completions';
        $dataUri = 'data:'.$mimeType.';base64,'.base64_encode($bytes);

        $response = Http::timeout(self::TIMEOUT_SECONDS)
            ->withToken($apiKey)
            ->acceptJson()
            ->post($endpoint, [
                'model' => $model,
                'temperature' => 0.2,
                'max_tokens' => 8192,
                'response_format' => ['type' => 'json_object'],
                'thinking' => ['type' => 'disabled'],
                'messages' => [
                    [
                        'role' => 'system',
                        'content' => GeminiService::SYSTEM_PROMPT."\n\n".self::JSON_SCHEMA_HINT,
                    ],
                    [
                        'role' => 'user',
                        'content' => [
                            [
                                'type' => 'text',
                                'text' => 'Odczytaj i popraw tekst ze zdjęcia strony książki. Zwróć JSON zgodnie ze schematem.',
                            ],
                            [
                                'type' => 'image_url',
                                'image_url' => [
                                    'url' => $dataUri,
                                ],
                            ],
                        ],
                    ],
                ],
            ]);

        $payload = $response->json() ?? [];

        if (! $response->successful()) {
            $message = data_get($payload, 'error.message')
                ?? data_get($payload, 'error')
                ?? 'DeepSeek HTTP '.$response->status();
            if (is_array($message)) {
                $message = json_encode($message, JSON_UNESCAPED_UNICODE) ?: 'DeepSeek HTTP '.$response->status();
            }
            throw new RuntimeException((string) $message);
        }

        $finishReason = data_get($payload, 'choices.0.finish_reason');
        if ($finishReason === 'length') {
            throw new RuntimeException('Odpowiedź ucięta (osiągnięto limit max_tokens).');
        }

        $raw = trim((string) data_get($payload, 'choices.0.message.content', ''));
        $raw = $this->stripWrappers($raw);

        if ($raw === '') {
            throw new RuntimeException('DeepSeek zwróciło pustą odpowiedź.');
        }

        return $this->parseResult($raw);
    }

    /**
     * @return array{
     *   text: string,
     *   title: string|null,
     *   subtitle: string|null,
     *   ocr_quality: float,
     *   coherence: float,
     *   page_number: string|null
     * }
     */
    public function proofreadImage(string $absolutePath, string $mimeType = 'image/jpeg'): array
    {
        if (! is_readable($absolutePath)) {
            throw new RuntimeException('Brak zdjęcia strony do analizy AI.');
        }

        $bytes = file_get_contents($absolutePath);
        if ($bytes === false || $bytes === '') {
            throw new RuntimeException('Nie udało się odczytać zdjęcia strony.');
        }

        return $this->proofreadImageBytes($bytes, $mimeType);
    }

    /**
     * @return array{
     *   text: string,
     *   title: string|null,
     *   subtitle: string|null,
     *   ocr_quality: float,
     *   coherence: float,
     *   page_number: string|null
     * }
     */
    private function parseResult(string $raw): array
    {
        $decoded = json_decode($raw, true);
        if (! is_array($decoded)) {
            throw new RuntimeException('DeepSeek zwróciło niepoprawny JSON.');
        }

        $text = trim((string) ($decoded['corrected_text'] ?? ''));
        if ($text === '') {
            throw new RuntimeException('DeepSeek zwróciło pusty corrected_text.');
        }

        $hasTitle = (bool) ($decoded['has_title'] ?? false);
        $title = $hasTitle ? $this->nullableString($decoded['title'] ?? null) : null;

        $hasSubtitle = (bool) ($decoded['has_subtitle'] ?? false);
        $subtitle = $hasSubtitle ? $this->nullableString($decoded['subtitle'] ?? null) : null;

        $pageDetected = (bool) ($decoded['page_number_detected'] ?? false);
        $pageNumber = $pageDetected ? $this->nullableString($decoded['page_number'] ?? null) : null;

        return [
            'text' => $text,
            'title' => $title,
            'subtitle' => $subtitle,
            'ocr_quality' => $this->clampScore($decoded['ocr_quality'] ?? 0),
            'coherence' => $this->clampScore($decoded['coherence'] ?? 0),
            'page_number' => $pageNumber,
        ];
    }

    private function nullableString(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $trimmed = trim((string) $value);
        if ($trimmed === '' || strcasecmp($trimmed, 'null') === 0) {
            return null;
        }

        return $trimmed;
    }

    private function clampScore(mixed $value): float
    {
        $n = is_numeric($value) ? (float) $value : 0.0;
        if ($n < 0) {
            $n = 0.0;
        }
        if ($n > 1) {
            $n = 1.0;
        }

        return round($n, 2);
    }

    private function stripWrappers(string $text): string
    {
        $cleaned = trim($text);
        if (str_starts_with($cleaned, '```')) {
            $cleaned = preg_replace('/^```(?:\w+)?\s*/u', '', $cleaned) ?? $cleaned;
            $cleaned = preg_replace('/\s*```$/u', '', $cleaned) ?? $cleaned;
        }

        return trim($cleaned);
    }
}
