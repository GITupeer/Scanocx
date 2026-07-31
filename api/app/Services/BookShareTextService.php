<?php

namespace App\Services;

use App\Models\Book;
use App\Models\Page;

class BookShareTextService
{
    /**
     * Buduje sekcje tekstu książki do publicznego widoku.
     * Preferuje AI (gdy done), w przeciwnym razie OCR.
     *
     * @return list<array{label: string, source: 'ai'|'ocr'|'empty', paragraphs: list<string>}>
     */
    public function buildSections(Book $book): array
    {
        $pages = $book->relationLoaded('pages')
            ? $book->pages
            : $book->pages()->orderBy('index')->get();

        $sections = [];

        foreach ($pages as $page) {
            foreach ($this->sectionsForPage($page) as $section) {
                $sections[] = $section;
            }
        }

        return $sections;
    }

    /**
     * @return list<array{label: string, source: 'ai'|'ocr'|'empty', paragraphs: list<string>}>
     */
    private function sectionsForPage(Page $page): array
    {
        $scanLabel = 'Strona '.$page->index;

        if ((string) ($page->ai_status ?? '') === 'done') {
            $metaPages = $page->ai_meta['pages'] ?? null;
            if (is_array($metaPages) && $metaPages !== []) {
                $out = [];
                foreach ($metaPages as $i => $metaPage) {
                    if (! is_array($metaPage)) {
                        continue;
                    }
                    $text = trim((string) ($metaPage['text'] ?? ''));
                    $printed = trim((string) ($metaPage['page_number'] ?? ''));
                    $label = $printed !== ''
                        ? 'Strona '.$printed
                        : ($scanLabel.(count($metaPages) > 1 ? ' · część '.($i + 1) : ''));
                    $out[] = [
                        'label' => $label,
                        'source' => $text !== '' ? 'ai' : 'empty',
                        'paragraphs' => $this->splitParagraphs($text),
                    ];
                }
                if ($out !== []) {
                    return $out;
                }
            }

            $aiText = trim((string) ($page->ai_text ?? ''));
            if ($aiText !== '') {
                $printed = trim((string) ($page->printed_page_number ?? ''));

                return [[
                    'label' => $printed !== '' ? 'Strona '.$printed : $scanLabel,
                    'source' => 'ai',
                    'paragraphs' => $this->splitParagraphs($aiText),
                ]];
            }
        }

        $ocrText = trim((string) ($page->ocr_text ?? ''));
        $printed = trim((string) ($page->printed_page_number ?? ''));

        return [[
            'label' => $printed !== '' ? 'Strona '.$printed : $scanLabel,
            'source' => $ocrText !== '' ? 'ocr' : 'empty',
            'paragraphs' => $this->splitParagraphs($ocrText),
        ]];
    }

    /**
     * @return list<string>
     */
    private function splitParagraphs(string $text): array
    {
        $trimmed = trim($text);
        if ($trimmed === '') {
            return [];
        }

        $blocks = preg_split("/\n\s*\n/", $trimmed) ?: [];
        $paragraphs = [];

        foreach ($blocks as $block) {
            $joined = preg_replace('/\s*\n\s*/', ' ', trim($block)) ?? '';
            $joined = trim($joined);
            if ($joined !== '') {
                $paragraphs[] = $joined;
            }
        }

        if ($paragraphs !== []) {
            return $paragraphs;
        }

        $fallback = preg_replace('/\s*\n\s*/', ' ', $trimmed) ?? $trimmed;

        return [trim($fallback)];
    }
}
