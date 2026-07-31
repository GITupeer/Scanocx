<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class GeminiService
{
    // public const MODEL = 'gemini-2.5-flash-lite';
    public const MODEL = 'gemini-3.1-flash-lite';

    public const TIMEOUT_SECONDS = 120;

    /** Najdłuższy bok obrazu wysyłanego do Gemini (px). */
    public const MAX_IMAGE_EDGE_PX = 1024;

    public const SYSTEM_PROMPT = <<<'PROMPT'
Jesteś profesjonalnym korektorem i transkrybentem tekstu. Dostajesz zdjęcie książki — odczytaj CAŁY tekst i zwróć czystą, poprawną wersję jako JSON (tylko JSON, bez markdown).

ODCZYT:
- Odczytaj całą treść i nagłówki; nic nie pomijaj, nie skracaj, nie streszczaj, nie dodawaj.
- Popraw błędy skanu: literówki, polskie znaki (ąęćłńóśźż), sklejone/rozbite słowa, interpunkcję, kapitalizację.
- Zachowaj sens, styl i rejestr; nie „ulepszaj” literacko.
- \n przy dialogach / zmianie mówcy, nagłówkach, wierszach poematu; \n\n przy nowym akapicie. Nie łam linii w środku zdania przez łamanie techniczne druku.
- Scalaj wyrazy z dywizem na końcu wiersza („rozcią- / gnięte” → „rozciągnięte”); prawdziwe łączniki zostaw.
- Nieczytelny fragment → najbliższa sensowna rekonstrukcja, nie wymyślaj zdań. Ignoruj brud/cień/palce.
- WIELE STRON: sprawdź, czy na zdjęciu jest więcej niż jedna pełna strona (np. rozkładówka). Jeśli tak — odczytaj KAŻDĄ stronę osobno w kolejności od lewej do prawej (naturalna kolejność książki) i zwróć je jako elementy tablicy pages. Jedna strona na zdjęciu → pages z jednym elementem. Nie pomijaj żadnej pełnej strony.

ANALIZA JSON (dla każdej pozycji w pages):
- title / subtitle: tylko prawdziwe nagłówki (nie pierwsze zdanie). has_title / has_subtitle = false → title/subtitle = null.
- page_number: numer z marginesu lub null; jeśli wykryty — USUŃ go z corrected_text.
- ocr_quality (0.00–1.00): czytelność SKANU tej strony. ≥0.85 ostry; 0.50–0.84 drobne problemy; <0.50 gdy jakakolwiek istotna część nieczytelna (im gorzej, tym niżej; zgadywanie → <0.50).
- coherence (0.00–1.00): spójność corrected_text po korekcie.
- corners: cztery rogi papieru tej strony na zdjęciu (top_left, top_right, bottom_right, bottom_left). Współrzędne znormalizowane 0.0–1.0 względem całego obrazu (x: lewo→prawo, y: góra→dół). Dla rozkładówki każda strona ma własny czworokąt; dla jednej strony — rogi tej kartki.
PROMPT;

    /**
     * @return array{
     *   text: string,
     *   pages: list<array{
     *     text: string,
     *     title: string|null,
     *     subtitle: string|null,
     *     page_number: string|null,
     *     ocr_quality: float,
     *     coherence: float
     *   }>,
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
                            ['text' => 'Odczytaj i popraw tekst ze zdjęcia książki. Jeśli widać wiele stron, zwróć je wszystkie w pages (kolejność lewa→prawa). Dla każdej strony podaj corners (rogi papieru, współrzędne 0–1). Zwróć JSON zgodnie ze schematem.'],
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
                    'mediaResolution' => 'MEDIA_RESOLUTION_LOW',
                    'responseMimeType' => 'application/json',
                    'responseSchema' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'pages' => [
                                'type' => 'ARRAY',
                                'description' => 'Jedna lub więcej stron wykrytych na zdjęciu, w kolejności od lewej do prawej.',
                                'items' => [
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
                                        'corners' => [
                                            'type' => 'OBJECT',
                                            'description' => 'Rogi papieru tej strony na zdjęciu; x/y w zakresie 0–1 względem całego obrazu.',
                                            'properties' => [
                                                'top_left' => self::cornerPointSchema('Lewy górny róg strony.'),
                                                'top_right' => self::cornerPointSchema('Prawy górny róg strony.'),
                                                'bottom_right' => self::cornerPointSchema('Prawy dolny róg strony.'),
                                                'bottom_left' => self::cornerPointSchema('Lewy dolny róg strony.'),
                                            ],
                                            'required' => [
                                                'top_left',
                                                'top_right',
                                                'bottom_right',
                                                'bottom_left',
                                            ],
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
                                        'corners',
                                    ],
                                ],
                            ],
                        ],
                        'required' => [
                            'pages',
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
     *   pages: list<array{
     *     text: string,
     *     title: string|null,
     *     subtitle: string|null,
     *     page_number: string|null,
     *     ocr_quality: float,
     *     coherence: float
     *   }>,
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

        $pages = $decoded['pages'] ?? null;

        // Kompatybilność wsteczna: stary format z pojedynczym corrected_text.
        if (! is_array($pages)) {
            $legacyText = trim((string) ($decoded['corrected_text'] ?? ''));
            if ($legacyText === '') {
                throw new RuntimeException('Gemini zwróciło pustą tablicę pages.');
            }
            $pages = [$decoded];
        }

        if ($pages === []) {
            throw new RuntimeException('Gemini zwróciło pustą tablicę pages.');
        }

        $pageItems = [];
        $title = null;
        $subtitle = null;
        $pageNumber = null;
        $minQuality = 1.0;
        $minCoherence = 1.0;
        $sawQuality = false;
        $sawCoherence = false;

        foreach ($pages as $page) {
            if (! is_array($page)) {
                continue;
            }

            $text = trim((string) ($page['corrected_text'] ?? ''));
            if ($text === '') {
                continue;
            }

            $hasTitle = (bool) ($page['has_title'] ?? false);
            $itemTitle = $hasTitle ? $this->nullableString($page['title'] ?? null) : null;
            $hasSubtitle = (bool) ($page['has_subtitle'] ?? false);
            $itemSubtitle = $hasSubtitle ? $this->nullableString($page['subtitle'] ?? null) : null;
            $pageDetected = (bool) ($page['page_number_detected'] ?? false);
            $itemPageNumber = $pageDetected ? $this->nullableString($page['page_number'] ?? null) : null;
            $quality = $this->clampScore($page['ocr_quality'] ?? 0);
            $coherence = $this->clampScore($page['coherence'] ?? 0);

            $item = [
                'text' => $text,
                'title' => $itemTitle,
                'subtitle' => $itemSubtitle,
                'page_number' => $itemPageNumber,
                'ocr_quality' => $quality,
                'coherence' => $coherence,
            ];
            $corners = $this->parseCorners($page['corners'] ?? null);
            if ($corners !== null) {
                $item['corners'] = $corners;
            }
            $pageItems[] = $item;

            if ($title === null && $itemTitle !== null) {
                $title = $itemTitle;
            }
            if ($subtitle === null && $itemSubtitle !== null) {
                $subtitle = $itemSubtitle;
            }
            if ($pageNumber === null && $itemPageNumber !== null) {
                $pageNumber = $itemPageNumber;
            }

            $sawQuality = true;
            $sawCoherence = true;
            if ($quality < $minQuality) {
                $minQuality = $quality;
            }
            if ($coherence < $minCoherence) {
                $minCoherence = $coherence;
            }
        }

        if ($pageItems === []) {
            throw new RuntimeException('Gemini zwróciło pusty corrected_text.');
        }

        $texts = array_column($pageItems, 'text');

        return [
            'text' => implode("\n\n\n", $texts),
            'pages' => $pageItems,
            'title' => $title,
            'subtitle' => $subtitle,
            'ocr_quality' => $sawQuality ? $minQuality : 0.0,
            'coherence' => $sawCoherence ? $minCoherence : 0.0,
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

    /**
     * Skaluje obraz tak, by najdłuższy bok miał co najwyżej MAX_IMAGE_EDGE_PX.
     * Mniejsze obrazy zostawia bez zmian.
     *
     * @return array{0: string, 1: string} [bytes, mimeType]
     */
    private function downscaleForGemini(string $bytes, string $mimeType): array
    {
        if (! function_exists('imagecreatefromstring') || ! function_exists('imagescale')) {
            return [$bytes, $mimeType];
        }

        $src = @imagecreatefromstring($bytes);
        if ($src === false) {
            return [$bytes, $mimeType];
        }

        $width = imagesx($src);
        $height = imagesy($src);
        $longEdge = max($width, $height);

        if ($longEdge <= self::MAX_IMAGE_EDGE_PX) {
            imagedestroy($src);

            return [$bytes, $mimeType];
        }

        $scale = self::MAX_IMAGE_EDGE_PX / $longEdge;
        $newWidth = max(1, (int) round($width * $scale));
        $newHeight = max(1, (int) round($height * $scale));

        $scaled = imagescale($src, $newWidth, $newHeight);
        imagedestroy($src);

        if ($scaled === false) {
            return [$bytes, $mimeType];
        }

        ob_start();
        $ok = imagejpeg($scaled, null, 85);
        imagedestroy($scaled);
        $out = ob_get_clean();

        if (! $ok || $out === false || $out === '') {
            return [$bytes, $mimeType];
        }

        return [$out, 'image/jpeg'];
    }

    /**
     * @return array{type: string, description: string, properties: array<string, mixed>, required: list<string>}
     */
    private static function cornerPointSchema(string $description): array
    {
        return [
            'type' => 'OBJECT',
            'description' => $description,
            'properties' => [
                'x' => [
                    'type' => 'NUMBER',
                    'description' => 'Współrzędna X 0.0–1.0 (0 = lewa krawędź obrazu).',
                ],
                'y' => [
                    'type' => 'NUMBER',
                    'description' => 'Współrzędna Y 0.0–1.0 (0 = górna krawędź obrazu).',
                ],
            ],
            'required' => ['x', 'y'],
        ];
    }

    /**
     * @return array{
     *   top_left: array{x: float, y: float},
     *   top_right: array{x: float, y: float},
     *   bottom_right: array{x: float, y: float},
     *   bottom_left: array{x: float, y: float}
     * }|null
     */
    private function parseCorners(mixed $raw): ?array
    {
        if (! is_array($raw)) {
            return null;
        }

        $keys = ['top_left', 'top_right', 'bottom_right', 'bottom_left'];
        $out = [];
        foreach ($keys as $key) {
            $point = $this->parseCornerPoint($raw[$key] ?? null);
            if ($point === null) {
                return null;
            }
            $out[$key] = $point;
        }

        return $out;
    }

    /**
     * @return array{x: float, y: float}|null
     */
    private function parseCornerPoint(mixed $raw): ?array
    {
        if (! is_array($raw)) {
            return null;
        }
        if (! is_numeric($raw['x'] ?? null) || ! is_numeric($raw['y'] ?? null)) {
            return null;
        }

        return [
            'x' => $this->clampUnit((float) $raw['x']),
            'y' => $this->clampUnit((float) $raw['y']),
        ];
    }

    private function clampUnit(float $n): float
    {
        if ($n < 0) {
            $n = 0.0;
        }
        if ($n > 1) {
            $n = 1.0;
        }

        return round($n, 4);
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
