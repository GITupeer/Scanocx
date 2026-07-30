<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiQuotaUsage extends Model
{
    protected $fillable = [
        'user_id',
        'period_type',
        'period_key',
        'used',
        'reserved',
    ];

    protected function casts(): array
    {
        return [
            'used' => 'decimal:2',
            'reserved' => 'decimal:2',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
