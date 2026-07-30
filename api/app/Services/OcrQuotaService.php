<?php

namespace App\Services;

use App\Models\OcrQuotaUsage;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class OcrQuotaService
{
    public const TIMEZONE = 'Europe/Warsaw';

    /** Darmowy plan: 50 odczytów OCR / miesiąc. Pro = bez limitu. */
    public const FREE_MONTHLY_LIMIT = 50;

    /**
     * @return array{plan: string, period_type: string, period_key: string, limit: int|null, used: int, reserved: int, remaining: int|null, unlimited: bool}
     */
    public function snapshot(User $user): array
    {
        [$periodType, $periodKey, $limit] = $this->periodFor($user);
        $usage = $this->usageRow($user, $periodType, $periodKey);

        $used = (int) $usage->used;
        $reserved = (int) $usage->reserved;

        if ($limit === null) {
            return [
                'plan' => $user->plan,
                'period_type' => $periodType,
                'period_key' => $periodKey,
                'limit' => null,
                'used' => $used,
                'reserved' => $reserved,
                'remaining' => null,
                'unlimited' => true,
            ];
        }

        return [
            'plan' => $user->plan,
            'period_type' => $periodType,
            'period_key' => $periodKey,
            'limit' => $limit,
            'used' => $used,
            'reserved' => $reserved,
            'remaining' => max(0, $limit - $used - $reserved),
            'unlimited' => false,
        ];
    }

    public function assertCanReserve(User $user, int $pages = 1): void
    {
        if ($pages < 1) {
            throw new RuntimeException('Brak odczytów do zarezerwowania.');
        }

        if ($user->isPro()) {
            return;
        }

        $snap = $this->snapshot($user);
        if (($snap['remaining'] ?? 0) < $pages) {
            throw new RuntimeException(
                'Przekroczono limit OCR (miesięczny: '.$snap['limit'].'). Pozostało: '.$snap['remaining'].'.'
            );
        }
    }

    /**
     * Rezerwuje sloty przed lokalnym OCR. Pro — no-op.
     */
    public function reserve(User $user, int $pages = 1): void
    {
        $this->assertCanReserve($user, $pages);

        if ($user->isPro()) {
            return;
        }

        [$periodType, $periodKey] = array_slice($this->periodFor($user), 0, 2);

        DB::transaction(function () use ($user, $periodType, $periodKey, $pages) {
            $usage = $this->usageRow($user, $periodType, $periodKey, lock: true);
            $limit = self::FREE_MONTHLY_LIMIT;
            $remaining = $limit - (int) $usage->used - (int) $usage->reserved;
            if ($remaining < $pages) {
                throw new RuntimeException('Przekroczono limit OCR.');
            }
            $usage->reserved = (int) $usage->reserved + $pages;
            $usage->save();
        });
    }

    /** Po udanym OCR: reserved → used. Pro — no-op. */
    public function consumeOne(User $user): void
    {
        if ($user->isPro()) {
            return;
        }

        [$periodType, $periodKey] = array_slice($this->periodFor($user), 0, 2);

        DB::transaction(function () use ($user, $periodType, $periodKey) {
            $usage = $this->usageRow($user, $periodType, $periodKey, lock: true);
            $usage->reserved = max(0, (int) $usage->reserved - 1);
            $usage->used = (int) $usage->used + 1;
            $usage->save();
        });
    }

    /** Po nieudanym OCR: zwalnia rezerwację. Pro — no-op. */
    public function releaseOne(User $user): void
    {
        if ($user->isPro()) {
            return;
        }

        [$periodType, $periodKey] = array_slice($this->periodFor($user), 0, 2);

        DB::transaction(function () use ($user, $periodType, $periodKey) {
            $usage = $this->usageRow($user, $periodType, $periodKey, lock: true);
            $usage->reserved = max(0, (int) $usage->reserved - 1);
            $usage->save();
        });
    }

    /**
     * @return array{0: string, 1: string, 2: int|null}
     */
    private function periodFor(User $user): array
    {
        $now = Carbon::now(self::TIMEZONE);
        $monthKey = $now->format('Y-m');

        if ($user->isPro()) {
            return ['month', $monthKey, null];
        }

        return ['month', $monthKey, self::FREE_MONTHLY_LIMIT];
    }

    private function usageRow(User $user, string $periodType, string $periodKey, bool $lock = false): OcrQuotaUsage
    {
        $query = OcrQuotaUsage::query()->where([
            'user_id' => $user->id,
            'period_type' => $periodType,
            'period_key' => $periodKey,
        ]);

        if ($lock) {
            $existing = (clone $query)->lockForUpdate()->first();
            if ($existing) {
                return $existing;
            }

            return OcrQuotaUsage::create([
                'user_id' => $user->id,
                'period_type' => $periodType,
                'period_key' => $periodKey,
                'used' => 0,
                'reserved' => 0,
            ]);
        }

        return OcrQuotaUsage::firstOrCreate(
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
