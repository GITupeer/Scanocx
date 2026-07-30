<?php

namespace App\Services;

use App\Models\Book;
use App\Models\User;
use RuntimeException;

/**
 * Limit liczby książek (łącznie, nie miesięcznie).
 * Free: 3. Pro: bez limitu.
 */
class BookQuotaService
{
    public const FREE_LIMIT = 3;

    /**
     * @return array{plan: string, period_type: string, period_key: string, limit: int|null, used: int, remaining: int|null, unlimited: bool}
     */
    public function snapshot(User $user): array
    {
        $used = $this->used($user);

        if ($user->isPro()) {
            return [
                'plan' => $user->plan,
                'period_type' => 'lifetime',
                'period_key' => 'all',
                'limit' => null,
                'used' => $used,
                'remaining' => null,
                'unlimited' => true,
            ];
        }

        $limit = self::FREE_LIMIT;

        return [
            'plan' => $user->plan,
            'period_type' => 'lifetime',
            'period_key' => 'all',
            'limit' => $limit,
            'used' => $used,
            'remaining' => max(0, $limit - $used),
            'unlimited' => false,
        ];
    }

    public function assertCanCreate(User $user): void
    {
        if ($user->isPro()) {
            return;
        }

        $snap = $this->snapshot($user);
        if (($snap['remaining'] ?? 0) < 1) {
            throw new RuntimeException(
                'Przekroczono limit książek (darmowy plan: '.$snap['limit'].'). Usuń książkę albo przejdź na Pro.'
            );
        }
    }

    private function used(User $user): int
    {
        return (int) Book::query()->where('user_id', $user->id)->count();
    }
}
