<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ExportQuotaUsage extends Model
{
    protected $fillable = [
        'user_id',
        'period_type',
        'period_key',
        'format',
        'used',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
