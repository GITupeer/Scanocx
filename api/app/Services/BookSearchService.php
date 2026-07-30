<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Wyszukiwanie treści stron użytkownika.
 *
 * Produkcja: PostgreSQL — full-text (ranking + headline), nie exact 1:1.
 * MySQL: FULLTEXT NATURAL LANGUAGE (jeśli dostępny) albo LIKE.
 * SQLite (testy): LIKE.
 *
 * Uwaga: to nadal wyszukiwanie leksykalne (słowa / frazy / ranking),
 * nie semantyczne embeddingi. Prawdziwy „kontekst znaczeniowy” wymagałby
 * modelu wektorowego (np. pgvector).
 */
class BookSearchService
{
    /**
     * @return list<array{
     *   page_local_id: string,
     *   book_local_id: string,
     *   book_title: string,
     *   page_index: int,
     *   printed_page_number: string|null,
     *   source: 'ai'|'ocr',
     *   snippet: string,
     *   rank: float
     * }>
     */
    public function search(User $user, string $rawQuery, int $limit = 40): array
    {
        $query = $this->normalizeQuery($rawQuery);
        if ($query === '') {
            return [];
        }

        $limit = max(1, min(100, $limit));
        $driver = DB::connection()->getDriverName();

        return match ($driver) {
            'pgsql' => $this->searchPostgres($user->id, $query, $limit),
            'mysql', 'mariadb' => $this->searchMysql($user->id, $query, $limit),
            default => $this->searchLike($user->id, $query, $limit),
        };
    }

    private function normalizeQuery(string $raw): string
    {
        $folded = Str::of($raw)
            ->ascii()
            ->lower()
            ->replaceMatches('/[^\pL\pN\s\"]+/u', ' ')
            ->replaceMatches('/\s+/u', ' ')
            ->trim()
            ->toString();

        // Zachowaj oryginał z cudzysłowami do websearch, ale bez śmieci.
        $cleaned = preg_replace('/[^\p{L}\p{N}\s\"\-]+/u', ' ', $raw) ?? '';
        $cleaned = preg_replace('/\s+/u', ' ', $cleaned) ?? '';
        $cleaned = trim($cleaned);

        return $cleaned !== '' ? $cleaned : $folded;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function searchPostgres(int $userId, string $query, int $limit): array
    {
        // websearch_to_tsquery: frazy w cudzysłowach, OR, -wykluczenia — bliżej „kontekstu”
        // niż sztywne 1:1. Config 'simple' = bez angielskiego stemmera (PL-friendly tokens).
        try {
            $rows = DB::select(
                <<<'SQL'
                SELECT
                    pages.local_id AS page_local_id,
                    books.local_id AS book_local_id,
                    books.title AS book_title,
                    pages.index AS page_index,
                    pages.printed_page_number,
                    CASE
                        WHEN pages.ai_text IS NOT NULL AND BTRIM(pages.ai_text) <> '' THEN 'ai'
                        ELSE 'ocr'
                    END AS source,
                    ts_headline(
                        'simple',
                        COALESCE(NULLIF(BTRIM(pages.ai_text), ''), pages.ocr_text, ''),
                        websearch_to_tsquery('simple', :query),
                        'MaxWords=22, MinWords=8, StartSel=, StopSel=, MaxFragments=1, FragmentDelimiter= … '
                    ) AS snippet,
                    ts_rank_cd(
                        to_tsvector(
                            'simple',
                            COALESCE(NULLIF(BTRIM(pages.ai_text), ''), pages.ocr_text, '')
                            || ' ' || COALESCE(books.title, '')
                        ),
                        websearch_to_tsquery('simple', :query)
                    ) AS rank
                FROM pages
                INNER JOIN books ON books.id = pages.book_id
                WHERE books.user_id = :user_id
                  AND to_tsvector(
                        'simple',
                        COALESCE(NULLIF(BTRIM(pages.ai_text), ''), pages.ocr_text, '')
                        || ' ' || COALESCE(books.title, '')
                      ) @@ websearch_to_tsquery('simple', :query)
                ORDER BY rank DESC, pages.updated_at DESC
                LIMIT :limit
                SQL,
                [
                    'user_id' => $userId,
                    'query' => $query,
                    'limit' => $limit,
                ]
            );

            if (count($rows) > 0) {
                return $this->mapRows($rows);
            }
        } catch (\Throwable) {
            // niepoprawna składnia websearch / brak FTS — LIKE
        }

        // Soft fallback: wszystkie tokeny jako podciągi (końcówki PL, częściowe słowa).
        return $this->searchLike($userId, $query, $limit);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function searchMysql(int $userId, string $query, int $limit): array
    {
        // NATURAL LANGUAGE MODE: ranking trafności, nie wymaga dokładnej frazy 1:1.
        // Boolean MODE (+słowo) jest bardziej „exact”. Semantyki nadal brak.
        try {
            $rows = DB::select(
                <<<'SQL'
                SELECT
                    pages.local_id AS page_local_id,
                    books.local_id AS book_local_id,
                    books.title AS book_title,
                    pages.index AS page_index,
                    pages.printed_page_number,
                    CASE
                        WHEN pages.ai_text IS NOT NULL AND TRIM(pages.ai_text) <> '' THEN 'ai'
                        ELSE 'ocr'
                    END AS source,
                    SUBSTRING(
                        COALESCE(NULLIF(TRIM(pages.ai_text), ''), pages.ocr_text, ''),
                        1,
                        180
                    ) AS snippet,
                    MATCH(
                        pages.ocr_text,
                        pages.ai_text
                    ) AGAINST (:query IN NATURAL LANGUAGE MODE) AS rank
                FROM pages
                INNER JOIN books ON books.id = pages.book_id
                WHERE books.user_id = :user_id
                  AND MATCH(pages.ocr_text, pages.ai_text) AGAINST (:query IN NATURAL LANGUAGE MODE)
                ORDER BY rank DESC, pages.updated_at DESC
                LIMIT :limit
                SQL,
                [
                    'user_id' => $userId,
                    'query' => $query,
                    'limit' => $limit,
                ]
            );

            if (count($rows) > 0) {
                return $this->mapRows($rows);
            }
        } catch (\Throwable) {
            // Brak FULLTEXT indexu — spadamy na LIKE.
        }

        return $this->searchLike($userId, $query, $limit);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function searchLike(int $userId, string $query, int $limit): array
    {
        $tokens = preg_split('/\s+/u', Str::lower($query), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $tokens = array_values(array_filter(
            $tokens,
            fn (string $token) => mb_strlen($token) >= 2 && ! str_starts_with($token, '"')
        ));

        if ($tokens === []) {
            $tokens = [Str::lower($query)];
        }

        $builder = DB::table('pages')
            ->join('books', 'books.id', '=', 'pages.book_id')
            ->where('books.user_id', $userId)
            ->select([
                'pages.local_id as page_local_id',
                'books.local_id as book_local_id',
                'books.title as book_title',
                'pages.index as page_index',
                'pages.printed_page_number',
                'pages.ai_text',
                'pages.ocr_text',
                'pages.updated_at',
            ]);

        foreach ($tokens as $token) {
            $like = '%'.$this->escapeLike($token).'%';
            $builder->where(function ($q) use ($like) {
                $q->where('pages.ocr_text', 'like', $like)
                    ->orWhere('pages.ai_text', 'like', $like)
                    ->orWhere('books.title', 'like', $like);
            });
        }

        $rows = $builder
            ->orderByDesc('pages.updated_at')
            ->limit($limit)
            ->get();

        return $rows->map(function ($row) use ($tokens) {
            $body = trim((string) (($row->ai_text !== null && trim((string) $row->ai_text) !== '')
                ? $row->ai_text
                : ($row->ocr_text ?? '')));
            $source = ($row->ai_text !== null && trim((string) $row->ai_text) !== '') ? 'ai' : 'ocr';

            return [
                'page_local_id' => (string) $row->page_local_id,
                'book_local_id' => (string) $row->book_local_id,
                'book_title' => (string) $row->book_title,
                'page_index' => (int) $row->page_index,
                'printed_page_number' => $row->printed_page_number,
                'source' => $source,
                'snippet' => $this->snippetAround($body, $tokens[0] ?? ''),
                'rank' => 0.0,
            ];
        })->all();
    }

    /**
     * @param  list<object>  $rows
     * @return list<array<string, mixed>>
     */
    private function mapRows(array $rows): array
    {
        return array_map(function ($row) {
            $arr = (array) $row;

            return [
                'page_local_id' => (string) $arr['page_local_id'],
                'book_local_id' => (string) $arr['book_local_id'],
                'book_title' => (string) $arr['book_title'],
                'page_index' => (int) $arr['page_index'],
                'printed_page_number' => $arr['printed_page_number'] ?? null,
                'source' => (($arr['source'] ?? 'ocr') === 'ai') ? 'ai' : 'ocr',
                'snippet' => $this->cleanSnippet((string) ($arr['snippet'] ?? '')),
                'rank' => (float) ($arr['rank'] ?? 0),
            ];
        }, $rows);
    }

    private function cleanSnippet(string $raw): string
    {
        return trim(preg_replace('/\s+/u', ' ', $raw) ?? $raw);
    }

    private function snippetAround(string $body, string $needle): string
    {
        $body = $this->cleanSnippet($body);
        if ($body === '') {
            return '';
        }
        if ($needle === '') {
            return Str::limit($body, 160, '…');
        }

        $pos = mb_stripos($body, $needle);
        if ($pos === false) {
            return Str::limit($body, 160, '…');
        }

        $start = max(0, $pos - 60);
        $chunk = mb_substr($body, $start, 160);
        $prefix = $start > 0 ? '…' : '';
        $suffix = mb_strlen($body) > $start + 160 ? '…' : '';

        return $prefix.$chunk.$suffix;
    }

    private function escapeLike(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }
}
