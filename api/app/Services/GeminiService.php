<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class GeminiService
{
    // public const MODEL = 'gemini-2.5-flash-lite';
    public const MODEL = 'gemini-3.1-flash-lite';

    public const TIMEOUT_SECONDS = 120;

    public const SYSTEM_PROMPT = <<<'PROMPT'
Jesteś profesjonalnym korektorem tekstu polskiego. Poniższy tekst pochodzi ze skanu OCR (zdjęcie strony książki) i zawiera błędy typowe dla OCR: literówki, brak polskich znaków (ąęćłńóśźż), rozbite lub sklejone słowa, błędną interpunkcję, przypadkowe znaki, złą kapitalizację, a także wyrazy przeniesione do nowej linii z dywizem (łamanie wyrazów w książce).

TWOJE ZADANIE — KOREKTA:
1. Popraw wyłącznie błędy OCR, literówki, interpunkcję, ortografię i oczywistą gramatykę.
2. BEZWZGLĘDNIE NIE SKRACAJ, NIE STRESZCZAJ ANI NIE POMIJAJ ŻADNEGO ZDANIA, AKAPITU ANI FRAGMENTU.
3. Nie dodawaj treści, której nie ma w oryginale. Nie „ulepszaj” stylu literackiego.
4. Zachowaj oryginalne znaczenie, styl, rejestr językowy i podział na akapity.
5. OBOWIĄZKOWO scalaj wyrazy ucięte / przeniesione do nowej linii (łamanie wyrazów w druku):
   - Usuń dywiz na końcu wiersza i sklej obie części w jedno słowo.
   - Przykłady: „rozcią-\ngnięte” → „rozciągnięte”; „książ-\nka” → „książka”; „nie-\nzależnie” → „niezależnie”; „po-\nwtórnie” → „powtórnie”.
   - Dotyczy też wariantów ze spacją po dywizie (np. „rozcią- gnięte”).
   - Nie zostawiaj dywizu przeniesienia w środku słowa. Prawdziwe łączniki (np. „biało-czerwony”) zostaw bez zmian, gdy to nie jest łamanie wiersza.
6. Zachowaj sensowny podział akapitów; scalaj tylko słowa rozbite przez OCR / łamanie wiersza.
7. Jeśli fragment jest nieczytelny, zostaw najbliższą sensowną rekonstrukcję — nie wymyślaj zdań od zera.

TWOJE ZADANIE — ANALIZA (do pól JSON):
8. Wykryj tytuł strony / rozdziału (title) oraz podtytuł (subtitle), jeśli występują jako nagłówki — nie myl z pierwszym zdaniem akapitu.
9. Oceń jakość OCR przed korektą (ocr_quality) oraz spójność / czytelność tekstu po Twojej korekcie (coherence) w skali 0.00–1.00 (dwa miejsca po przecinku).
10. Wykryj numer strony wydrukowany na marginesie (page_number). Jeśli go wykryjesz:
    - wpisz go w pole page_number,
    - USUŃ go z corrected_text (nie zostawiaj samotnego numeru na początku/końcu).
    Jeśli nie wykryjesz — page_number = null.

FORMAT ODPOWIEDZI:
Zwróć WYŁĄCZNIE jeden obiekt JSON zgodny ze schematem — bez markdown, komentarzy ani tekstu poza JSON.
PROMPT;

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
    public function proofread(string $ocrText): array
    {
        $apiKey = trim((string) config('services.gemini.key'));
        if ($apiKey === '') {
            throw new RuntimeException('Brak klucza GEMINI_API_KEY na serwerze.');
        }

        $trimmed = trim($ocrText);
        if ($trimmed === '') {
            throw new RuntimeException('Brak tekstu OCR do korekty.');
        }

        $endpoint = sprintf('https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent', self::MODEL);

        $response = Http::timeout(self::TIMEOUT_SECONDS)
            ->withQueryParameters(['key' => $apiKey])
            ->post($endpoint, [
                'system_instruction' => [
                    'parts' => [['text' => self::SYSTEM_PROMPT]],
                ],
                'contents' => [
                    [
                        'role' => 'user',
                        'parts' => [['text' => "Tekst OCR do korekty i analizy:\n\n{$trimmed}"]],
                    ],
                ],
                'generationConfig' => [
                    'temperature' => 0.2,
                    'maxOutputTokens' => 65536,
                    'responseMimeType' => 'application/json',
                    'responseSchema' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'corrected_text' => [
                                'type' => 'STRING',
                                'description' => 'Pełny poprawiony tekst strony bez numeru strony.',
                            ],
                            'has_title' => [
                                'type' => 'BOOLEAN',
                                'description' => 'Czy wykryto tytuł / nagłówek strony lub rozdziału.',
                            ],
                            'title' => [
                                'type' => 'STRING',
                                'nullable' => true,
                                'description' => 'Wykryty tytuł lub null.',
                            ],
                            'has_subtitle' => [
                                'type' => 'BOOLEAN',
                                'description' => 'Czy wykryto podtytuł.',
                            ],
                            'subtitle' => [
                                'type' => 'STRING',
                                'nullable' => true,
                                'description' => 'Wykryty podtytuł lub null.',
                            ],
                            'ocr_quality' => [
                                'type' => 'NUMBER',
                                'description' => 'Ocena jakości OCR przed korektą, 0.00–1.00.',
                            ],
                            'coherence' => [
                                'type' => 'NUMBER',
                                'description' => 'Spójność tekstu po korekcie AI, 0.00–1.00.',
                            ],
                            'page_number_detected' => [
                                'type' => 'BOOLEAN',
                                'description' => 'Czy wykryto numer strony na marginesie.',
                            ],
                            'page_number' => [
                                'type' => 'STRING',
                                'nullable' => true,
                                'description' => 'Numer strony lub null; usunięty z corrected_text gdy wykryty.',
                            ],
                        ],
                        'required' => [
                            'corrected_text',
                            'has_title',
                            'title',
                            'has_subtitle',
                            'subtitle',
                            'ocr_quality',
                            'coherence',
                            'page_number_detected',
                            'page_number',
                        ],
                    ],
                ],
            ]);

        $payload = $response->json() ?? [];

        if (! $response->successful()) {
            $message = data_get($payload, 'error.message') ?? 'Gemini HTTP '.$response->status();
            throw new RuntimeException($message);
        }

        $finishReason = data_get($payload, 'candidates.0.finishReason');
        if ($finishReason === 'MAX_TOKENS') {
            throw new RuntimeException('Odpowiedź ucięta (osiągnięto limit MAX_TOKENS).');
        }

        if ($finishReason && ! in_array($finishReason, ['STOP', 'UNSPECIFIED'], true)) {
            throw new RuntimeException("Generowanie tekstu przerwane (Reason: {$finishReason}).");
        }

        $parts = data_get($payload, 'candidates.0.content.parts', []);
        $raw = '';
        foreach ($parts as $part) {
            $raw .= (string) ($part['text'] ?? '');
        }
        $raw = $this->stripWrappers(trim($raw));

        if ($raw === '') {
            throw new RuntimeException('Gemini zwróciło pustą odpowiedź.');
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
    private function parseResult(string $raw): array
    {
        $decoded = json_decode($raw, true);
        if (! is_array($decoded)) {
            throw new RuntimeException('Gemini zwróciło niepoprawny JSON.');
        }

        $text = trim((string) ($decoded['corrected_text'] ?? ''));
        if ($text === '') {
            throw new RuntimeException('Gemini zwróciło pusty corrected_text.');
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
