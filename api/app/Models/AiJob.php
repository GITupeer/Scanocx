<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiJob extends Model
{
    protected $fillable = [
        'ai_batch_id',
        'page_id',
        'status',
        'error',
        'prompt_tokens',
        'output_tokens',
        'total_tokens',
        'reserved_quota',
    ];

    protected function casts(): array
    {
        return [
            'reserved_quota' => 'boolean',
            'prompt_tokens' => 'integer',
            'output_tokens' => 'integer',
            'total_tokens' => 'integer',
        ];
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(AiBatch::class, 'ai_batch_id');
    }

    public function page(): BelongsTo
    {
        return $this->belongsTo(Page::class);
    }

    /**
     * Global queue position among queued/processing jobs (1 = next / currently processing earliest).
     */
    public function queuePosition(): int
    {
        if (! in_array($this->status, ['queued', 'processing'], true)) {
            return 0;
        }

        return (int) self::query()
            ->whereIn('status', ['queued', 'processing'])
            ->where(function ($query) {
                $query->where('created_at', '<', $this->created_at)
                    ->orWhere(function ($q) {
                        $q->where('created_at', $this->created_at)
                            ->where('id', '<=', $this->id);
                    });
            })
            ->count();
    }
}
