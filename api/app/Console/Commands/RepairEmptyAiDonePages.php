<?php

namespace App\Console\Commands;

use App\Models\Page;
use Illuminate\Console\Command;

/**
 * Resetuje strony oznaczone jako AI done bez treści (skutek wyścigu sync klienta).
 * Tekstu nie da się odzyskać — trzeba ponowić korektę AI.
 */
class RepairEmptyAiDonePages extends Command
{
    protected $signature = 'ai:repair-empty-done
                            {--book= : local_id książki (opcjonalnie)}
                            {--dry-run : tylko pokaż liczbę, bez zapisu}';

    protected $description = 'Ustaw idle na stronach ai_status=done bez ai_text/ai_meta';

    public function handle(): int
    {
        $query = Page::query()->where('ai_status', 'done');

        $bookLocalId = $this->option('book');
        if (is_string($bookLocalId) && $bookLocalId !== '') {
            $query->whereHas('book', fn ($q) => $q->where('local_id', $bookLocalId));
        }

        $pages = $query->get()->filter(function (Page $page) {
            $text = trim((string) ($page->ai_text ?? ''));
            if ($text !== '') {
                return false;
            }

            $meta = $page->ai_meta;
            if (! is_array($meta) || $meta === []) {
                return true;
            }

            $pagesMeta = $meta['pages'] ?? null;
            if (! is_array($pagesMeta) || $pagesMeta === []) {
                return true;
            }

            foreach ($pagesMeta as $item) {
                if (is_array($item) && trim((string) ($item['text'] ?? '')) !== '') {
                    return false;
                }
            }

            return true;
        });

        $count = $pages->count();
        $this->info("Znaleziono stron done bez treści: {$count}");

        if ($count === 0) {
            return self::SUCCESS;
        }

        if ($this->option('dry-run')) {
            $this->warn('Dry-run — nic nie zapisano.');

            return self::SUCCESS;
        }

        foreach ($pages as $page) {
            $page->ai_status = 'idle';
            $page->ai_text = null;
            $page->ai_meta = null;
            $page->save();
        }

        $this->info("Zresetowano do idle: {$count}. Uruchom ponownie korektę AI w aplikacji.");

        return self::SUCCESS;
    }
}
