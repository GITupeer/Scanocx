<?php

namespace App\Services;

use App\Models\AiQuotaUsage;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class AiQuotaService
{
    public const TIMEZONE = 'Europe/Warsaw';

    public const FREE_DAILY_LIMIT = 3;

    public const PRO_MONTHLY_LIMIT = 500;

    /**
     * @return array{plan: string, period_type: string, period_key: string, limit: int, used: int, reserved: int, remaining: int}
     */
    public function snapshot(User $user): array
    {
        [$periodType, $periodKey, $limit] = $this->periodFor($user);
        $usage = $this->usageRow($user, $periodType, $periodKey);

        $used = (int) $usage->used;
        $reserved = (int) $usage->reserved;

        return [
            'plan' => $user->plan,
            'period_type' => $periodType,
            'period_key' => $periodKey,
            'limit' => $limit,
            'used' => $used,
            'reserved' => $reserved,
            'remaining' => max(0, $limit - $used - $reserved),
        ];
    }

    public function assertCanReserve(User $user, int $pages): void
    {
        if ($pages < 1) {
            throw new RuntimeException('Brak stron do analizy.');
        }

        $snap = $this->snapshot($user);
        if ($snap['remaining'] < $pages) {
            $label = $snap['period_type'] === 'day' ? 'dzienny' : 'miesięczny';
            throw new RuntimeException(
                "Przekroczono limit AI ({$label}: {$snap['limit']}). Pozostało: {$snap['remaining']}."
            );
        }
    }

    public function reserve(User $user, int $pages): void
    {
        $this->assertCanReserve($user, $pages);

        [$periodType, $periodKey] = array_slice($this->periodFor($user), 0, 2);

        DB::transaction(function () use ($user, $periodType, $periodKey, $pages) {
            $usage = $this->usageRow($user, $periodType, $periodKey, lock: true);
            $limit = $user->isPro() ? self::PRO_MONTHLY_LIMIT : self::FREE_DAILY_LIMIT;
            $remaining = $limit - (int) $usage->used - (int) $usage->reserved;
            if ($remaining < $pages) {
                throw new RuntimeException('Przekroczono limit AI.');
            }
            $usage->reserved = (int) $usage->reserved + $pages;
            $usage->save();
        });
    }

    public function consumeOne(User $user): void
    {
        [$periodType, $periodKey] = array_slice($this->periodFor($user), 0, 2);

        DB::transaction(function () use ($user, $periodType, $periodKey) {
            $usage = $this->usageRow($user, $periodType, $periodKey, lock: true);
            $usage->reserved = max(0, (int) $usage->reserved - 1);
            $usage->used = (int) $usage->used + 1;
            $usage->save();
        });
    }

    public function releaseOne(User $user): void
    {
        [$periodType, $periodKey] = array_slice($this->periodFor($user), 0, 2);

        DB::transaction(function () use ($user, $periodType, $periodKey) {
            $usage = $this->usageRow($user, $periodType, $periodKey, lock: true);
            $usage->reserved = max(0, (int) $usage->reserved - 1);
            $usage->save();
        });
    }

    /**
     * @return array{0: string, 1: string, 2: int}
     */
    private function periodFor(User $user): array
    {
        $now = Carbon::now(self::TIMEZONE);

        if ($user->isPro()) {
            return ['month', $now->format('Y-m'), self::PRO_MONTHLY_LIMIT];
        }

        return ['day', $now->format('Y-m-d'), self::FREE_DAILY_LIMIT];
    }

    private function usageRow(User $user, string $periodType, string $periodKey, bool $lock = false): AiQuotaUsage
    {
        $query = AiQuotaUsage::query()->where([
            'user_id' => $user->id,
            'period_type' => $periodType,
            'period_key' => $periodKey,
        ]);

        if ($lock) {
            $existing = (clone $query)->lockForUpdate()->first();
            if ($existing) {
                return $existing;
            }

            return AiQuotaUsage::create([
                'user_id' => $user->id,
                'period_type' => $periodType,
                'period_key' => $periodKey,
                'used' => 0,
                'reserved' => 0,
            ]);
        }

        return AiQuotaUsage::firstOrCreate(
            [
                'user_id' => $user->id,
                'period_type' => $periodType,
                'period_key' => $periodKey,
            ],
            [
                'used' => 0,
                'reserved' => 0,
            ]
        );
    }
}
