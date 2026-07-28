<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ai_batch_id')->constrained('ai_batches')->cascadeOnDelete();
            $table->foreignId('page_id')->constrained()->cascadeOnDelete();
            $table->string('status', 32)->default('queued');
            $table->text('error')->nullable();
            $table->boolean('reserved_quota')->default(true);
            $table->timestamps();

            $table->index(['status', 'id']);
            $table->index(['ai_batch_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_jobs');
    }
};
