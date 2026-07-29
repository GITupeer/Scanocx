<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('pages', 'image_path')) {
            Schema::table('pages', function (Blueprint $table) {
                $table->string('image_path')->nullable()->after('ocr_text');
            });
        }

        if (! Schema::hasColumn('pages', 'image_data')) {
            Schema::table('pages', function (Blueprint $table) {
                $table->longText('image_data')->nullable();
            });
        }

        if (! Schema::hasColumn('pages', 'image_mime')) {
            Schema::table('pages', function (Blueprint $table) {
                $table->string('image_mime', 64)->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::table('pages', function (Blueprint $table) {
            $cols = array_values(array_filter([
                Schema::hasColumn('pages', 'image_data') ? 'image_data' : null,
                Schema::hasColumn('pages', 'image_mime') ? 'image_mime' : null,
            ]));
            if ($cols !== []) {
                $table->dropColumn($cols);
            }
        });
    }
};
