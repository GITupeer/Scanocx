<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Indeks FTS pod wyszukiwanie treści stron.
 * Produkcja = MySQL 8. PostgreSQL: GIN (dev/alternatywa).
 */
return new class extends Migration
{
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'pgsql') {
            // GIN na wektorze treści (AI ma pierwszeństwo w wyrażeniu przy query;
            // w indeksie łączymy oba pola + tytuł nie jest tu — tytuł w JOIN).
            DB::statement(<<<'SQL'
                CREATE INDEX IF NOT EXISTS pages_body_fts_gin
                ON pages
                USING GIN (
                    to_tsvector(
                        'simple',
                        COALESCE(NULLIF(BTRIM(ai_text), ''), '') || ' ' || COALESCE(ocr_text, '')
                    )
                )
            SQL);

            return;
        }

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            // FULLTEXT wymaga InnoDB + odpowiedniego typu kolumn (już longText).
            try {
                DB::statement('ALTER TABLE pages ADD FULLTEXT INDEX pages_ocr_ai_fulltext (ocr_text, ai_text)');
            } catch (\Throwable) {
                // indeks mógł już istnieć / silnik bez FULLTEXT — search spadnie na LIKE
            }
        }
    }

    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS pages_body_fts_gin');

            return;
        }

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            try {
                DB::statement('ALTER TABLE pages DROP INDEX pages_ocr_ai_fulltext');
            } catch (\Throwable) {
                // ignore
            }
        }
    }
};
