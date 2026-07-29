<?php

namespace App\Services;

use App\Models\ExportQuotaUsage;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Limity eksportu:
 * - TXT  — bez limitu (Free + Pro)
 * - PDF  — 20 / miesiąc (Free), bez limitu (Pro)
 * - eBook — niedostępny (Free), bez limitu (Pro)
 */
class ExportQuotaService
{
    public const TIMEZONE = 'Europe/Warsaw';

    public const FREE_PDF_MONTHLY_LIMIT = 20;

    public const FORMAT_TXT = 'txt';

    public const FORMAT_PDF = 'pdf';

    public const FORMAT_EPUB = 'epub';

    public const FORMATS = [
        self::FORMAT_TXT,
        self::FORMAT_PDF,
        self::FORMAT_EPUB,
    ];

    /**
     * @return array{
     *   plan: string,
     *   period_type: string,
     *   period_key: string,
     *   formats: array<string, array{limit: int|null, used: int, remaining: int|null, unlimited: bool, allowed: bool}>
     * }
     */
    public function snapshot(User $user): array
    {
        [$periodType, $periodKey] = $this->period();

        return [
            'plan' => $user->plan,
            'period_type' => $periodType,
            'period_key' => $periodKey,
            'formats' => [
                self::FORMAT_TXT => $this->formatSnapshot($user, self::FORMAT_TXT, $periodType, $periodKey),
                self::FORMAT_PDF => $this->formatSnapshot($user, self::FORMAT_PDF, $periodType, $periodKey),
                self::FORMAT_EPUB => $this->formatSnapshot($user, self::FORMAT_EPUB, $periodType, $periodKey),
            ],
        ];
    }

    public function assertCanExport(User $user, string $format): void
    {
        $format = $this->normalizeFormat($format);
        $snap = $this->formatSnapshot($user, $format, ...$this->period());

        if (! $snap['allowed']) {
            if ($format === self::FORMAT_EPUB) {
                throw new RuntimeException(
                    'Eksport eBook jest dostępny w planie Pro. TXT i PDF (z limitem) zostają w darmowym planie.'
                );
            }
            throw new RuntimeException(
                'Darmowy plan: limit '.self::FREE_PDF_MONTHLY_LIMIT.' eksportów PDF na miesiąc. Pozostało: 0.'
            );
        }
    }

    /**
     * Po udanym eksporcie — zlicza PDF na Free. TXT/eBook (Pro) = no-op.
     */
    public function consume(User $user, string $format): void
    {
        $format = $this->normalizeFormat($format);
        $this->assertCanExport($user, $format);

        if ($format === self::FORMAT_TXT) {
            return;
        }

        if ($format === self::FORMAT_EPUB) {
            return;
        }

        // pdf
        if ($user->isPro()) {
            return;
        }

        [$periodType, $periodKey] = $this->period();

        DB::transaction(function () use ($user, $periodType, $periodKey) {
            $usage = $this->usageRow($user, $periodType, $periodKey, self::FORMAT_PDF, lock: true);
            $used = (int) $usage->used;
            if ($used >= self::FREE_PDF_MONTHLY_LIMIT) {
                throw new RuntimeException(
                    'Darmowy plan: limit '.self::FREE_PDF_MONTHLY_LIMIT.' eksportów PDF na miesiąc. Pozostało: 0.'
                );
            }
            $usage->used = $used + 1;
            $usage->save();
        });
    }

    /**
     * @return array{limit: int|null, used: int, remaining: int|null, unlimited: bool, allowed: bool}
     */
    private function formatSnapshot(User $user, string $format, string $periodType, string $periodKey): array
    {
        if ($format === self::FORMAT_TXT) {
            return [
                'limit' => null,
                'used' => 0,
                'remaining' => null,
                'unlimited' => true,
                'allowed' => true,
            ];
        }

        if ($format === self::FORMAT_EPUB) {
            if ($user->isPro()) {
                return [
                    'limit' => null,
                    'used' => 0,
                    'remaining' => null,
                    'unlimited' => true,
                    'allowed' => true,
                ];
            }

            return [
                'limit' => 0,
                'used' => 0,
                'remaining' => 0,
                'unlimited' => false,
                'allowed' => false,
            ];
        }

        // pdf
        $usage = $this->usageRow($user, $periodType, $periodKey, self::FORMAT_PDF);
        $used = (int) $usage->used;

        if ($user->isPro()) {
            return [
                'limit' => null,
                'used' => $used,
                'remaining' => null,
                'unlimited' => true,
                'allowed' => true,
            ];
        }

        $limit = self::FREE_PDF_MONTHLY_LIMIT;
        $remaining = max(0, $limit - $used);

        return [
            'limit' => $limit,
            'used' => $used,
            'remaining' => $remaining,
            'unlimited' => false,
            'allowed' => $remaining > 0,
        ];
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function period(): array
    {
        $now = Carbon::now(self::TIMEZONE);

        return ['month', $now->format('Y-m')];
    }

    private function normalizeFormat(string $format): string
    {
        $format = strtolower(trim($format));
        if (! in_array($format, self::FORMATS, true)) {
            throw new RuntimeException('Nieznany format eksportu.');
        }

        return $format;
    }

    private function usageRow(
        User $user,
        string $periodType,
        string $periodKey,
        string $format,
        bool $lock = false
    ): ExportQuotaUsage {
        $query = ExportQuotaUsage::query()->where([
            'user_id' => $user->id,
            'period_type' => $periodType,
            'period_key' => $periodKey,
            'format' => $format,
        ]);

        if ($lock) {
            $existing = (clone $query)->lockForUpdate()->first();
            if ($existing) {
                return $existing;
            }

            return ExportQuotaUsage::create([
                'user_id' => $user->id,
                'period_type' => $periodType,
                'period_key' => $periodKey,
                'format' => $format,
                'used' => 0,
            ]);
        }

        return ExportQuotaUsage::firstOrCreate(
            [
                'user_id' => $user->id,
                'period_type' => $periodType,
                'period_key' => $periodKey,
                'format' => $format,
            ],
            [
                'used' => 0,
            ]
        );
    }
}
