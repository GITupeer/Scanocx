<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->string('local_id');
            $table->unsignedInteger('index');
            $table->longText('ocr_text');
            $table->string('printed_page_number')->nullable();
            $table->longText('ai_text')->nullable();
            $table->string('ai_status', 32)->default('idle');
            $table->timestamps();

            $table->unique(['book_id', 'local_id']);
            $table->index(['book_id', 'index']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pages');
    }
};
