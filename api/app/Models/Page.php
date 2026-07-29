<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class Page extends Model
{
    protected $fillable = [
        'book_id',
        'local_id',
        'index',
        'ocr_text',
        'image_path',
        'printed_page_number',
        'ai_text',
        'ai_status',
        'ai_meta',
    ];

    protected function casts(): array
    {
        return [
            'ai_meta' => 'array',
        ];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }

    public function aiJobs(): HasMany
    {
        return $this->hasMany(AiJob::class);
    }

    /** Usuwa tymczasowe zdjęcie strony z dysku i czyści ścieżkę w bazie. */
    public function clearStoredImage(): void
    {
        if ($this->image_path) {
            Storage::disk('local')->delete($this->image_path);
            $this->image_path = null;
            $this->save();
        }
    }
}
