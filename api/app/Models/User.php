<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

#[Fillable(['name', 'email', 'password', 'plan'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasRoles, Notifiable;

    public const PLAN_FREE = 'free';

    public const PLAN_PRO = 'pro';

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function isPro(): bool
    {
        return $this->plan === self::PLAN_PRO;
    }

    public function books(): HasMany
    {
        return $this->hasMany(Book::class);
    }

    public function aiBatches(): HasMany
    {
        return $this->hasMany(AiBatch::class);
    }

    public function aiQuotaUsages(): HasMany
    {
        return $this->hasMany(AiQuotaUsage::class);
    }

    public function ocrQuotaUsages(): HasMany
    {
        return $this->hasMany(OcrQuotaUsage::class);
    }

    public function exportQuotaUsages(): HasMany
    {
        return $this->hasMany(ExportQuotaUsage::class);
    }
}
