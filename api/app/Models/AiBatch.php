<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AiBatch extends Model
{
    protected $fillable = [
        'user_id',
        'book_id',
        'status',
        'total_jobs',
        'completed_jobs',
        'failed_jobs',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(Book::class);
    }

    public function jobs(): HasMany
    {
        return $this->hasMany(AiJob::class);
    }

    public function refreshStatus(): void
    {
        $pending = $this->jobs()->whereIn('status', ['queued', 'processing'])->exists();

        if ($pending) {
            $this->status = 'processing';
        } elseif ($this->failed_jobs > 0 && $this->completed_jobs + $this->failed_jobs >= $this->total_jobs) {
            $this->status = $this->completed_jobs > 0 ? 'partial' : 'failed';
        } else {
            $this->status = 'done';
        }

        $this->save();
    }
}
