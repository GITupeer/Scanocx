<?php

namespace App\Jobs;

use App\Models\AiJob;
use App\Services\AiQuotaService;
use App\Services\GeminiService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Throwable;

class ProcessPageAiJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 150;

    public function __construct(public int $aiJobId)
    {
        $this->onQueue('ai');
    }

    public function handle(GeminiService $gemini, AiQuotaService $quota): void
    {
        $aiJob = AiJob::query()->with(['page', 'batch.user'])->find($this->aiJobId);
        if (! $aiJob || ! in_array($aiJob->status, ['queued', 'processing'], true)) {
            return;
        }

        $aiJob->status = 'processing';
        $aiJob->save();

        $page = $aiJob->page;
        $page->ai_status = 'pending';
        $page->save();

        try {
            $aiText = $gemini->proofread($page->ocr_text);

            DB::transaction(function () use ($aiJob, $page, $aiText, $quota) {
                $page->ai_text = $aiText;
                $page->ai_status = 'done';
                $page->save();

                $aiJob->status = 'done';
                $aiJob->error = null;
                $aiJob->save();

                if ($aiJob->reserved_quota) {
                    $quota->consumeOne($aiJob->batch->user);
                    $aiJob->reserved_quota = false;
                    $aiJob->save();
                }

                $batch = $aiJob->batch()->lockForUpdate()->first();
                $batch->completed_jobs = (int) $batch->completed_jobs + 1;
                $batch->save();
                $batch->refreshStatus();
            });
        } catch (Throwable $e) {
            $this->failJob($aiJob, $e->getMessage(), $quota);
            throw $e;
        }
    }

    public function failed(?Throwable $exception): void
    {
        $aiJob = AiJob::query()->with(['page', 'batch.user'])->find($this->aiJobId);
        if (! $aiJob || in_array($aiJob->status, ['done', 'failed'], true)) {
            return;
        }

        $this->failJob(
            $aiJob,
            $exception?->getMessage() ?? 'Korekta AI nie powiodła się.',
            app(AiQuotaService::class)
        );
    }

    private function failJob(AiJob $aiJob, string $message, AiQuotaService $quota): void
    {
        DB::transaction(function () use ($aiJob, $message, $quota) {
            $aiJob->refresh();
            if (in_array($aiJob->status, ['done', 'failed'], true)) {
                return;
            }

            $page = $aiJob->page;
            $page->ai_status = 'error';
            $page->save();

            $aiJob->status = 'failed';
            $aiJob->error = $message;
            $aiJob->save();

            if ($aiJob->reserved_quota) {
                $quota->releaseOne($aiJob->batch->user);
                $aiJob->reserved_quota = false;
                $aiJob->save();
            }

            $batch = $aiJob->batch()->lockForUpdate()->first();
            $batch->failed_jobs = (int) $batch->failed_jobs + 1;
            $batch->save();
            $batch->refreshStatus();
        });
    }
}
