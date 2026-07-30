<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE ai_quota_usages ALTER COLUMN used TYPE numeric(12, 2) USING used::numeric(12, 2)');
            DB::statement('ALTER TABLE ai_quota_usages ALTER COLUMN reserved TYPE numeric(12, 2) USING reserved::numeric(12, 2)');
            DB::statement('ALTER TABLE ai_quota_usages ALTER COLUMN used SET DEFAULT 0');
            DB::statement('ALTER TABLE ai_quota_usages ALTER COLUMN reserved SET DEFAULT 0');

            return;
        }

        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE ai_quota_usages MODIFY used DECIMAL(12, 2) NOT NULL DEFAULT 0');
            DB::statement('ALTER TABLE ai_quota_usages MODIFY reserved DECIMAL(12, 2) NOT NULL DEFAULT 0');

            return;
        }

        // sqlite / inne — recreate kolumn przez tabelę tymczasową nie jest potrzebne lokalnie;
        // produkcja to pgsql.
        DB::statement('ALTER TABLE ai_quota_usages RENAME TO ai_quota_usages_old');
        Schema::create('ai_quota_usages', function ($table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('period_type', 16);
            $table->string('period_key', 16);
            $table->decimal('used', 12, 2)->default(0);
            $table->decimal('reserved', 12, 2)->default(0);
            $table->timestamps();
            $table->unique(['user_id', 'period_type', 'period_key']);
        });
        DB::statement('INSERT INTO ai_quota_usages (id, user_id, period_type, period_key, used, reserved, created_at, updated_at)
            SELECT id, user_id, period_type, period_key, used, reserved, created_at, updated_at FROM ai_quota_usages_old');
        Schema::drop('ai_quota_usages_old');
    }

    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'pgsql') {
            DB::statement('ALTER TABLE ai_quota_usages ALTER COLUMN used TYPE integer USING round(used)::integer');
            DB::statement('ALTER TABLE ai_quota_usages ALTER COLUMN reserved TYPE integer USING round(reserved)::integer');
            DB::statement('ALTER TABLE ai_quota_usages ALTER COLUMN used SET DEFAULT 0');
            DB::statement('ALTER TABLE ai_quota_usages ALTER COLUMN reserved SET DEFAULT 0');

            return;
        }

        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE ai_quota_usages MODIFY used INT UNSIGNED NOT NULL DEFAULT 0');
            DB::statement('ALTER TABLE ai_quota_usages MODIFY reserved INT UNSIGNED NOT NULL DEFAULT 0');
        }
    }
};
