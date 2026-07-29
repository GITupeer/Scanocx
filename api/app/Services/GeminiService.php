<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class GeminiService
{
    public const MODEL = 'gemini-2.5-flash-lite';
    // public const MODEL = 'gemini-3.1-flash-lite';

    public const TIMEOUT_SECONDS = 120;

    public const SYSTEM_PROMPT = <<<'PROMPT'
Jesteś profesjonalnym korektorem tekstu polskiego. Poniższy tekst pochodzi ze skanu OCR (zdjęcie strony książki) i zawiera błędy typowe dla OCR: literówki, brak polskich znaków (ąęćłńóśźż), rozbite lub sklejone słowa, błędną interpunkcję, przypadkowe znaki, złą kapitalizację, a także wyrazy przeniesione do nowej linii z dywizem (łamanie wyrazów w książce).

TWOJE ZADANIE:
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
8. Zwróć WYŁĄCZNIE poprawiony tekst strony, bez komentarzy, wstępów, tytułów, cudzysłowów ani znaczników markdown.
PROMPT;

    public function proofread(string $ocrText): string
    {
        $apiKey = trim((string) config('services.gemini.key'));
        if ($apiKey === '') {
            throw new RuntimeException('Brak klucza GEMINI_API_KEY na serwerze.');
        }

        $trimmed = trim($ocrText);
        if ($trimmed === '') {
            throw new RuntimeException('Brak tekstu OCR do korekty.');
        }

        $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key='.$apiKey;

        $response = Http::timeout(self::TIMEOUT_SECONDS)
            ->withHeaders([
                'Content-Type' => 'application/json',
            ])
            ->post($url, [
                'system_instruction' => [
                    'parts' => [['text' => self::SYSTEM_PROMPT]],
                ],
                'contents' => [
                    [
                        'role' => 'user',
                        'parts' => [['text' => "Tekst OCR do korekty:\n\n{$trimmed}"]],
                    ],
                ],
                'generationConfig' => [
                    'temperature' => 0.2,
                    'maxOutputTokens' => 8192,
                ],
            ]);

        $payload = $response->json() ?? [];

        if (! $response->successful()) {
            $message = data_get($payload, 'error.message') ?? 'Gemini HTTP '.$response->status();
            throw new RuntimeException($message);
        }

        $finishReason = data_get($payload, 'candidates.0.finishReason');
        if ($finishReason === 'MAX_TOKENS') {
            throw new RuntimeException('Odpowiedź ucięta (MAX_TOKENS).');
        }

        $parts = data_get($payload, 'candidates.0.content.parts', []);
        $text = '';
        foreach ($parts as $part) {
            $text .= (string) ($part['text'] ?? '');
        }
        $text = $this->stripWrappers(trim($text));

        if ($text === '') {
            throw new RuntimeException('Gemini zwróciło pustą odpowiedź.');
        }

        return $text;
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
