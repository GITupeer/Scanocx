<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Book extends Model
{
    protected $fillable = [
        'user_id',
        'local_id',
        'title',
        'share_token',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function pages(): HasMany
    {
        return $this->hasMany(Page::class);
    }

    public function aiBatches(): HasMany
    {
        return $this->hasMany(AiBatch::class);
    }

    public function ensureShareToken(): string
    {
        if (filled($this->share_token)) {
            return (string) $this->share_token;
        }

        do {
            $token = bin2hex(random_bytes(16));
        } while (static::query()->where('share_token', $token)->exists());

        $this->share_token = $token;
        $this->save();

        return $token;
    }

    public function shareUrl(): ?string
    {
        if (! filled($this->share_token)) {
            return null;
        }

        return rtrim((string) config('app.url'), '/').'/b/'.$this->share_token;
    }
}
