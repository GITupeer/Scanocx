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

    /**
     * 1 token użytkownika = 150 realnych tokenów (input+output).
     * 1 500 000 realnych ≈ 10 000 tokenów Pro (~1000 stron po ~1500 realnych).
     */
    public const REAL_TOKENS_PER_USER_TOKEN = 150;

    /** Szacunek rezerwacji na stronę (~1 500 realnych tokenów). */
    public const RESERVE_TOKENS_PER_PAGE = 10;

    /** Free: ~5 stron przy szacunku 10 tokenów/strona. */
    public const FREE_MONTHLY_LIMIT = 50;

    /** Pro: 10 000 tokenów / miesiąc. */
    public const PRO_MONTHLY_LIMIT = 10000;

    /**
     * Przelicza realne tokeny API na tokeny użytkownika (nasze).
     */
    public static function toUserTokens(?int $promptTokens, ?int $outputTokens, ?int $totalTokens): int
    {
        $real = 0;
        if (is_int($totalTokens) && $totalTokens > 0) {
            $real = $totalTokens;
        } else {
            $real = max(0, (int) $promptTokens) + max(0, (int) $outputTokens);
        }

        if ($real <= 0) {
            return 1;
        }

        return max(1, (int) ceil($real / self::REAL_TOKENS_PER_USER_TOKEN));
    }

    /**
     * Ile stron można uruchomić przy danym remaining (rezerwacja szacunkowa).
     * Przy pozostałości < RESERVE_TOKENS_PER_PAGE nadal pozwala na 1 stronę.
     */
    public static function maxPagesForRemaining(int $remaining): int
    {
        if ($remaining <= 0) {
            return 0;
        }

        return max(1, intdiv($remaining, self::RESERVE_TOKENS_PER_PAGE));
    }

    /**
     * @return array{plan: string, period_type: string, period_key: string, limit: int, used: int, reserved: int, remaining: int, unit: string, real_tokens_per_user_token: int, reserve_tokens_per_page: int}
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
            'unit' => 'tokens',
            'real_tokens_per_user_token' => self::REAL_TOKENS_PER_USER_TOKEN,
            'reserve_tokens_per_page' => self::RESERVE_TOKENS_PER_PAGE,
        ];
    }

    public function assertCanReserve(User $user, int $pages): void
    {
        if ($pages < 1) {
            throw new RuntimeException('Brak stron do analizy.');
        }

        $snap = $this->snapshot($user);
        if ($snap['remaining'] <= 0) {
            $label = $snap['period_type'] === 'day' ? 'dzienny' : 'miesięczny';
            throw new RuntimeException(
                "Przekroczono limit AI ({$label}: {$snap['limit']} tokenów). Pozostało: 0 tokenów."
            );
        }

        $maxPages = self::maxPagesForRemaining($snap['remaining']);
        if ($pages > $maxPages) {
            $label = $snap['period_type'] === 'day' ? 'dzienny' : 'miesięczny';
            throw new RuntimeException(
                "Przekroczono limit AI ({$label}: {$snap['limit']} tokenów). Pozostało: {$snap['remaining']} tokenów"
                .(
                    $maxPages > 0
                        ? " (ok. {$maxPages} stron)."
                        : '.'
                )
            );
        }
    }

    public function reserve(User $user, int $pages): void
    {
        $this->assertCanReserve($user, $pages);

        $tokens = $pages * self::RESERVE_TOKENS_PER_PAGE;
        [$periodType, $periodKey] = array_slice($this->periodFor($user), 0, 2);

        DB::transaction(function () use ($user, $periodType, $periodKey, $tokens) {
            $usage = $this->usageRow($user, $periodType, $periodKey, lock: true);
            // Przy ostatnich tokenach (< szacunek/strona) i tak rezerwujemy pełny szacunek —
            // settle po analizie doliczy faktyczne zużycie.
            $usage->reserved = (int) $usage->reserved + $tokens;
            $usage->save();
        });
    }

    /**
     * Po udanej analizie: zwalnia rezerwację szacunkową i dolicza faktyczne tokeny użytkownika.
     */
    public function consume(User $user, int $billableTokens): void
    {
        $billable = max(1, $billableTokens);
        [$periodType, $periodKey] = array_slice($this->periodFor($user), 0, 2);

        DB::transaction(function () use ($user, $periodType, $periodKey, $billable) {
            $usage = $this->usageRow($user, $periodType, $periodKey, lock: true);
            $usage->reserved = max(0, (int) $usage->reserved - self::RESERVE_TOKENS_PER_PAGE);
            $usage->used = (int) $usage->used + $billable;
            $usage->save();
        });
    }

    /** @deprecated Użyj consume() z rzeczywistymi tokenami. */
    public function consumeOne(User $user): void
    {
        $this->consume($user, self::RESERVE_TOKENS_PER_PAGE);
    }

    public function releaseOne(User $user): void
    {
        [$periodType, $periodKey] = array_slice($this->periodFor($user), 0, 2);

        DB::transaction(function () use ($user, $periodType, $periodKey) {
            $usage = $this->usageRow($user, $periodType, $periodKey, lock: true);
            $usage->reserved = max(0, (int) $usage->reserved - self::RESERVE_TOKENS_PER_PAGE);
            $usage->save();
        });
    }

    /**
     * @return array{0: string, 1: string, 2: int}
     */
    private function periodFor(User $user): array
    {
        $now = Carbon::now(self::TIMEZONE);
        $periodKey = $now->format('Y-m');

        if ($user->isPro()) {
            return ['month', $periodKey, self::PRO_MONTHLY_LIMIT];
        }

        return ['month', $periodKey, self::FREE_MONTHLY_LIMIT];
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
