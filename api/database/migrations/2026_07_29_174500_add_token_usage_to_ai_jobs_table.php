<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_jobs', function (Blueprint $table) {
            $table->unsignedInteger('prompt_tokens')->nullable()->after('error');
            $table->unsignedInteger('output_tokens')->nullable()->after('prompt_tokens');
            $table->unsignedInteger('total_tokens')->nullable()->after('output_tokens');
        });
    }

    public function down(): void
    {
        Schema::table('ai_jobs', function (Blueprint $table) {
            $table->dropColumn(['prompt_tokens', 'output_tokens', 'total_tokens']);
        });
    }
};
