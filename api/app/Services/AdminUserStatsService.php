<?php

namespace App\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class AdminUserStatsService
{
    public function __construct(private AiPricingService $pricing) {}

    /**
     * @param  list<int>  $userIds
     * @return array<int, array{
     *   jobs_done: int,
     *   prompt_tokens: int,
     *   output_tokens: int,
     *   total_tokens: int,
     *   user_tokens: float,
     *   cost_usd: float,
     *   cost_input_usd: float,
     *   cost_output_usd: float
     * }>
     */
    public function tokenStatsForUsers(array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }

        $realPerToken = AiQuotaService::REAL_TOKENS_PER_USER_TOKEN;

        $rows = DB::table('ai_jobs')
            ->join('ai_batches', 'ai_batches.id', '=', 'ai_jobs.ai_batch_id')
            ->where('ai_jobs.status', 'done')
            ->whereIn('ai_batches.user_id', $userIds)
            ->groupBy('ai_batches.user_id')
            ->select([
                'ai_batches.user_id',
                DB::raw('COUNT(*) as jobs_done'),
                DB::raw('SUM(COALESCE(ai_jobs.prompt_tokens, 0)) as prompt_tokens'),
                DB::raw(
                    'SUM(CASE '
                    .'WHEN ai_jobs.total_tokens > 0 AND ai_jobs.prompt_tokens > 0 '
                    .'THEN GREATEST(0, ai_jobs.total_tokens - ai_jobs.prompt_tokens) '
                    .'ELSE COALESCE(ai_jobs.output_tokens, 0) '
                    .'END) as output_tokens'
                ),
                DB::raw('SUM(COALESCE(ai_jobs.total_tokens, 0)) as total_tokens'),
                DB::raw(
                    "SUM(CASE "
                    ."WHEN COALESCE(ai_jobs.total_tokens, 0) > 0 THEN GREATEST(0.01, ROUND(ai_jobs.total_tokens / {$realPerToken}, 2)) "
                    ."WHEN COALESCE(ai_jobs.prompt_tokens, 0) + COALESCE(ai_jobs.output_tokens, 0) > 0 "
                    ."THEN GREATEST(0.01, ROUND((COALESCE(ai_jobs.prompt_tokens, 0) + COALESCE(ai_jobs.output_tokens, 0)) / {$realPerToken}, 2)) "
                    .'ELSE 0 END) as user_tokens'
                ),
            ])
            ->get();

        $model = $this->pricing->activeModel();
        $stats = [];

        foreach ($rows as $row) {
            $prompt = (int) $row->prompt_tokens;
            $output = (int) $row->output_tokens;
            $total = (int) $row->total_tokens;
            $effectiveTotal = $total > 0 ? $total : $prompt + $output;

            $cost = $this->pricing->estimateCost($prompt, $output, $effectiveTotal, $model['provider']);

            $stats[(int) $row->user_id] = [
                'jobs_done' => (int) $row->jobs_done,
                'prompt_tokens' => $prompt,
                'output_tokens' => $output,
                'total_tokens' => $effectiveTotal,
                'user_tokens' => round((float) $row->user_tokens, 2),
                'cost_usd' => round($cost['total_usd'] ?? 0, 6),
                'cost_input_usd' => round($cost['input_usd'] ?? 0, 6),
                'cost_output_usd' => round($cost['output_usd'] ?? 0, 6),
            ];
        }

        return $stats;
    }

    /**
     * @return array{
     *   jobs_done: int,
     *   prompt_tokens: int,
     *   output_tokens: int,
     *   total_tokens: int,
     *   user_tokens: float,
     *   cost_usd: float,
     *   cost_input_usd: float,
     *   cost_output_usd: float
     * }
     */
    public function emptyStats(): array
    {
        return [
            'jobs_done' => 0,
            'prompt_tokens' => 0,
            'output_tokens' => 0,
            'total_tokens' => 0,
            'user_tokens' => 0,
            'cost_usd' => 0,
            'cost_input_usd' => 0,
            'cost_output_usd' => 0,
        ];
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $userStats
     * @return array{
     *   jobs_done: int,
     *   prompt_tokens: int,
     *   output_tokens: int,
     *   total_tokens: int,
     *   user_tokens: float,
     *   cost_usd: float,
     *   cost_input_usd: float,
     *   cost_output_usd: float
     * }
     */
    public function summarize(Collection $userStats): array
    {
        $summary = $this->emptyStats();

        foreach ($userStats as $row) {
            $summary['jobs_done'] += (int) ($row['jobs_done'] ?? 0);
            $summary['prompt_tokens'] += (int) ($row['prompt_tokens'] ?? 0);
            $summary['output_tokens'] += (int) ($row['output_tokens'] ?? 0);
            $summary['total_tokens'] += (int) ($row['total_tokens'] ?? 0);
            $summary['user_tokens'] = round($summary['user_tokens'] + (float) ($row['user_tokens'] ?? 0), 2);
            $summary['cost_usd'] = round($summary['cost_usd'] + (float) ($row['cost_usd'] ?? 0), 6);
            $summary['cost_input_usd'] = round($summary['cost_input_usd'] + (float) ($row['cost_input_usd'] ?? 0), 6);
            $summary['cost_output_usd'] = round($summary['cost_output_usd'] + (float) ($row['cost_output_usd'] ?? 0), 6);
        }

        return $summary;
    }
}
