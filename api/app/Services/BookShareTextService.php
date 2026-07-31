<?php

namespace App\Services;

use App\Models\Book;
use App\Models\Page;
use Illuminate\Support\Collection;

class BookShareTextService
{
    /**
     * Buduje sekcje tekstu książki do publicznego widoku.
     * Preferuje AI (gdy done), w przeciwnym razie OCR.
     *
     * @return list<array{id: string, label: string, page_index: int, source: 'ai'|'ocr'|'empty', paragraphs: list<string>}>
     */
    public function buildSections(Book $book): array
    {
        $pages = $this->orderedPages($book);
        $sections = [];
        $seq = 0;

        foreach ($pages as $page) {
            foreach ($this->sectionsForPage($page) as $section) {
                $seq++;
                $sections[] = [
                    'id' => 'p-'.$seq,
                    'label' => $section['label'],
                    'page_index' => (int) $page->index,
                    'source' => $section['source'],
                    'paragraphs' => $section['paragraphs'],
                ];
            }
        }

        return $sections;
    }

    /**
     * Spis treści z tytułów / podtytułów AI (jak w aplikacji).
     *
     * @param  list<array{id: string, label: string, page_index: int, source: string, paragraphs: list<string>}>  $sections
     * @return list<array{level: 0|1, text: string, page_label: string, target: string}>
     */
    public function buildTableOfContents(Book $book, array $sections): array
    {
        $firstSectionByPage = [];
        foreach ($sections as $section) {
            $idx = (int) $section['page_index'];
            if (! isset($firstSectionByPage[$idx])) {
                $firstSectionByPage[$idx] = $section['id'];
            }
        }

        $entries = [];
        $lastTitle = null;
        $lastSubtitle = null;

        foreach ($this->orderedPages($book) as $page) {
            if ((string) ($page->ai_status ?? '') !== 'done') {
                continue;
            }

            $meta = is_array($page->ai_meta) ? $page->ai_meta : [];
            $title = trim((string) ($meta['title'] ?? ''));
            $subtitle = trim((string) ($meta['subtitle'] ?? ''));
            if ($title === '' && $subtitle === '') {
                continue;
            }

            if ($title === $lastTitle && $subtitle === $lastSubtitle) {
                continue;
            }
            $lastTitle = $title !== '' ? $title : null;
            $lastSubtitle = $subtitle !== '' ? $subtitle : null;

            $target = $firstSectionByPage[(int) $page->index] ?? null;
            if ($target === null) {
                continue;
            }

            $pageLabel = (string) $page->index;

            if ($title !== '') {
                $prevTitle = null;
                for ($i = count($entries) - 1; $i >= 0; $i--) {
                    if ($entries[$i]['level'] === 0) {
                        $prevTitle = $entries[$i]['text'];
                        break;
                    }
                }
                if ($prevTitle !== $title) {
                    $entries[] = [
                        'level' => 0,
                        'text' => $title,
                        'page_label' => $pageLabel,
                        'target' => $target,
                    ];
                }
            }

            if ($subtitle !== '') {
                $prev = $entries[count($entries) - 1] ?? null;
                if (! $prev || $prev['level'] !== 1 || $prev['text'] !== $subtitle) {
                    $entries[] = [
                        'level' => 1,
                        'text' => $subtitle,
                        'page_label' => $pageLabel,
                        'target' => $target,
                    ];
                }
            }
        }

        return $entries;
    }

    /**
     * @return Collection<int, Page>
     */
    private function orderedPages(Book $book): Collection
    {
        return $book->relationLoaded('pages')
            ? $book->pages->sortBy('index')->values()
            : $book->pages()->orderBy('index')->get();
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
