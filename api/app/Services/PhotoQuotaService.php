<?php

namespace App\Services;

use App\Models\Page;
use App\Models\User;
use Carbon\Carbon;
use RuntimeException;

/**
 * Limit zdjęć stron (nowe page rekordy) w miesiącu.
 * Free: 100 / miesiąc. Pro: bez limitu.
 */
class PhotoQuotaService
{
    public const TIMEZONE = 'Europe/Warsaw';

    public const FREE_MONTHLY_LIMIT = 100;

    /**
     * @return array{plan: string, period_type: string, period_key: string, limit: int|null, used: int, remaining: int|null, unlimited: bool}
     */
    public function snapshot(User $user): array
    {
        $now = Carbon::now(self::TIMEZONE);
        $periodKey = $now->format('Y-m');
        $used = $this->usedThisMonth($user, $now);

        if ($user->isPro()) {
            return [
                'plan' => $user->plan,
                'period_type' => 'month',
                'period_key' => $periodKey,
                'limit' => null,
                'used' => $used,
                'remaining' => null,
                'unlimited' => true,
            ];
        }

        $limit = self::FREE_MONTHLY_LIMIT;

        return [
            'plan' => $user->plan,
            'period_type' => 'month',
            'period_key' => $periodKey,
            'limit' => $limit,
            'used' => $used,
            'remaining' => max(0, $limit - $used),
            'unlimited' => false,
        ];
    }

    public function assertCanAdd(User $user, int $pages = 1): void
    {
        if ($pages < 1 || $user->isPro()) {
            return;
        }

        $snap = $this->snapshot($user);
        if (($snap['remaining'] ?? 0) < $pages) {
            throw new RuntimeException(
                'Przekroczono limit zdjęć (miesięczny: '.$snap['limit'].'). Pozostało: '.$snap['remaining'].'.'
            );
        }
    }

    private function usedThisMonth(User $user, ?Carbon $now = null): int
    {
        $now ??= Carbon::now(self::TIMEZONE);
        $start = $now->copy()->startOfMonth()->utc();
        $end = $now->copy()->endOfMonth()->utc();

        return (int) Page::query()
            ->whereHas('book', fn ($q) => $q->where('user_id', $user->id))
            ->whereBetween('created_at', [$start, $end])
            ->count();
    }
}
