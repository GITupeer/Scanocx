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
Jesteś profesjonalnym korektorem i transkrybentem tekstu polskiego. Dostajesz ZDJĘCIE strony książki (skan / fotografia). Masz odczytać tekst ze zdjęcia i zwrócić czystą, poprawną wersję.

TWOJE ZADANIE — ODCZYT I KOREKTA:
1. Odczytaj starannie CAŁY tekst widoczny na stronie (treść główna, nagłówki). Nie pomijaj fragmentów.
2. Popraw oczywiste błędy wynikające z nieostrości / skanu: literówki, brakujące polskie znaki (ąęćłńóśźż), rozbite lub sklejone słowa, błędną interpunkcję, złą kapitalizację.
3. BEZWZGLĘDNIE NIE SKRACAJ, NIE STRESZCZAJ ANI NIE POMIJAJ ŻADNEGO ZDANIA, AKAPITU ANI FRAGMENTU.
4. Nie dodawaj treści, której nie ma na stronie. Nie „ulepszaj” stylu literackiego.
5. Zachowaj oryginalne znaczenie, styl i rejestr językowy.
6. PODZIAŁ WIERSZY / AKAPITÓW — stosuj nowe linie (\n) tam, gdzie to wynika ze struktury tekstu na stronie:
   - Nowa kwestia dialogu (myślnik / pauza dialogowa, cudzysłów otwierający wypowiedź) → zawsze nowa linia.
   - Zmiana mówcy / kolejna replika → nowa linia.
   - Nowy akapit w prozie → pusty wiersz (\n\n) lub co najmniej nowa linia, zgodnie z układem na stronie.
   - Nagłówek / tytuł / podtytuł → osobna linia (nie sklejaj z treścią).
   - Wiersze wiersza / poematu → zachowaj podział na linie.
   - NIE wstawiaj nowej linii w środku zwykłego zdania tylko dlatego, że w druku złamano wiersz z braku miejsca (łamanie techniczne).
7. Scalaj wyrazy ucięte / przeniesione do nowej linii (łamanie wyrazów w druku):
   - Usuń dywiz na końcu wiersza i sklej obie części w jedno słowo.
   - Przykłady: „rozcią- / gnięte” → „rozciągnięte”; „książ-ka” → „książka”.
   - Prawdziwe łączniki (np. „biało-czerwony”) zostaw bez zmian.
8. Jeśli fragment jest nieczytelny, zostaw najbliższą sensowną rekonstrukcję — nie wymyślaj zdań od zera.
9. Ignoruj elementy poza treścią (np. brud, cienie, palce, krawędź stołu) — nie opisuj ich.
10. WIĘCEJ NIŻ JEDNA STRONA NA ZDJĘCIU: jeśli widać więcej niż jedną stronę książki (np. cała lewa + pół prawej, albo fragment sąsiedniej strony przy krawędzi), zwróć dane WYŁĄCZNIE dla tej jednej pełnej / najbardziej kompletnej strony. Całkowicie zignoruj tekst z niepełnych / uciętych stron obok — nie mieszaj ich treści, tytułów ani numerów stron.

TWOJE ZADANIE — ANALIZA (do pól JSON):
11. Wykryj tytuł strony / rozdziału (title) oraz podtytuł (subtitle), jeśli występują jako nagłówki — nie myl z pierwszym zdaniem akapitu.
12. Oceń jakość skanu / czytelność zdjęcia (ocr_quality) oraz spójność tekstu po korekcie (coherence) w skali 0.00–1.00 (dwa miejsca po przecinku).
    ocr_quality — ocena CZYTELNOŚCI SKANU (nie jakości Twojej korekty):
    - 0.85–1.00: cały tekst ostry, dobrze naświetlony, bez istotnych przeszkód.
    - 0.50–0.84: drobne problemy (lekka nieostrość, cień, skos), ale treść da się odczytać w całości.
    - PONIŻEJ 0.50 (obowiązkowo): gdy JAKAKOLWIEK istotna część strony jest nieczytelna lub mocno wątpliwa — rozmycie, prześwietlenie/niedoświetlenie, palec/zasłonięcie, ucięta krawędź z tekstem, mocny cień, odbicie, zbyt mała rozdzielczość.
      Skala poniżej 0.50 zależnie od skali problemu, np.:
      - ~0.40–0.49: niewielki fragment (kilka słów / róg) nieczytelny,
      - ~0.25–0.39: zauważalna część akapitu / kolumny nieczytelna,
      - ~0.10–0.24: duża część strony nieczytelna,
      - ~0.00–0.09: niemal cała strona nieczytelna.
    Jeśli rekonstrukcja fragmentu jest zgadywaniem — obniż ocr_quality poniżej 0.50.
    coherence — osobno: spójność i czytelność tekstu W corrected_text po Twojej korekcie.
13. Wykryj numer strony wydrukowany na marginesie (page_number). Jeśli go wykryjesz:
    - wpisz go w pole page_number,
    - USUŃ go z corrected_text (nie zostawiaj samotnego numeru na początku/końcu).
    Jeśli nie wykryjesz — page_number = null.

FORMAT ODPOWIEDZI:
Zwróć WYŁĄCZNIE jeden obiekt JSON zgodny ze schematem — bez markdown, komentarzy ani tekstu poza JSON.
PROMPT;

    /** Długi bok JPEG wysyłanego do Google — wystarczy do OCR tekstu. */
    private const AI_MAX_EDGE = 1280;

    /** Jakość JPEG (0–100) przed wysyłką do Gemini. */
    private const AI_JPEG_QUALITY = 60;

    /**
     * @return array{
     *   text: string,
     *   title: string|null,
     *   subtitle: string|null,
     *   ocr_quality: float,
     *   coherence: float,
     *   page_number: string|null,
     *   prompt_tokens: int|null,
     *   output_tokens: int|null,
     *   total_tokens: int|null
     * }
     */
    public function proofreadImageBytes(string $bytes, string $mimeType = 'image/jpeg'): array
    {
        $apiKey = trim((string) config('services.gemini.key'));
        if ($apiKey === '') {
            throw new RuntimeException('Brak klucza GEMINI_API_KEY na serwerze.');
        }

        if ($bytes === '') {
            throw new RuntimeException('Brak zdjęcia strony do analizy AI.');
        }

        [$bytes, $mimeType] = $this->downscaleForGemini($bytes, $mimeType);

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
                        'parts' => [
                            ['text' => 'Odczytaj i popraw tekst ze zdjęcia strony książki. Zwróć JSON zgodnie ze schematem.'],
                            [
                                'inline_data' => [
                                    'mime_type' => $mimeType,
                                    'data' => base64_encode($bytes),
                                ],
                            ],
                        ],
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
                                'description' => 'Pełny poprawiony tekst strony bez numeru strony; z \\n przy dialogach, akapitach i nagłówkach.',
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
                                'description' => 'Czytelność skanu 0.00–1.00; poniżej 0.50 gdy część strony jest nieczytelna (im gorzej, tym niżej).',
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

        $result = $this->parseResult($raw);
        $usage = $this->parseUsage($payload);

        return array_merge($result, $usage);
    }

    /**
     * @return array{
     *   text: string,
     *   title: string|null,
     *   subtitle: string|null,
     *   ocr_quality: float,
     *   coherence: float,
     *   page_number: string|null,
     *   prompt_tokens: int|null,
     *   output_tokens: int|null,
     *   total_tokens: int|null
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

    /**
     * @param  array<string, mixed>  $payload
     * @return array{
     *   prompt_tokens: int|null,
     *   output_tokens: int|null,
     *   total_tokens: int|null
     * }
     */
    private function parseUsage(array $payload): array
    {
        $prompt = data_get($payload, 'usageMetadata.promptTokenCount');
        $candidates = data_get($payload, 'usageMetadata.candidatesTokenCount');
        $total = data_get($payload, 'usageMetadata.totalTokenCount');

        // thoughtsTokenCount bywa w total, ale nie w candidates — output = candidates.
        return [
            'prompt_tokens' => is_numeric($prompt) ? (int) $prompt : null,
            'output_tokens' => is_numeric($candidates) ? (int) $candidates : null,
            'total_tokens' => is_numeric($total) ? (int) $total : null,
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

    /**
     * Skaluje i kompresuje zdjęcie przed wysyłką do Gemini (mniejszy payload).
     *
     * @return array{0: string, 1: string} [bytes, mimeType]
     */
    private function downscaleForGemini(string $bytes, string $mimeType): array
    {
        if (! function_exists('imagecreatefromstring') || ! function_exists('imagejpeg')) {
            return [$bytes, $mimeType];
        }

        $image = @imagecreatefromstring($bytes);
        if ($image === false) {
            return [$bytes, $mimeType];
        }

        $width = imagesx($image);
        $height = imagesy($image);
        if ($width < 1 || $height < 1) {
            imagedestroy($image);

            return [$bytes, $mimeType];
        }

        $longEdge = max($width, $height);
        if ($longEdge > self::AI_MAX_EDGE) {
            $scale = self::AI_MAX_EDGE / $longEdge;
            $newWidth = max(1, (int) round($width * $scale));
            $newHeight = max(1, (int) round($height * $scale));
            $scaled = imagescale($image, $newWidth, $newHeight);
            imagedestroy($image);
            if ($scaled === false) {
                return [$bytes, $mimeType];
            }
            $image = $scaled;
        }

        ob_start();
        $ok = imagejpeg($image, null, self::AI_JPEG_QUALITY);
        $compressed = ob_get_clean();
        imagedestroy($image);

        if (! $ok || ! is_string($compressed) || $compressed === '') {
            return [$bytes, $mimeType];
        }

        // Nie powiększaj przypadkiem (np. już mocno skompresowany PNG → większy JPEG).
        if (strlen($compressed) >= strlen($bytes) && str_starts_with($mimeType, 'image/jpeg')) {
            return [$bytes, $mimeType];
        }

        return [$compressed, 'image/jpeg'];
    }
}
