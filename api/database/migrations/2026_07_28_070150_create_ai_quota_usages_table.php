<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_quota_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('period_type', 16);
            $table->string('period_key', 16);
            $table->decimal('used', 12, 2)->default(0);
            $table->decimal('reserved', 12, 2)->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'period_type', 'period_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_quota_usages');
    }
};
