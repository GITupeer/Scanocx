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

        // Laravel Cloud managed queues używają connection "cloud".
        if ((string) env('QUEUE_CONNECTION', '') === 'cloud') {
            $this->onConnection('cloud');
        }
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
            $raw = (string) ($page->image_data ?? '');
            if ($raw === '') {
                throw new \RuntimeException('Brak zdjęcia strony do analizy AI.');
            }

            $bytes = base64_decode($raw, true);
            if ($bytes === false || $bytes === '') {
                throw new \RuntimeException('Niepoprawne zdjęcie strony do analizy AI.');
            }

            $mimeType = (string) ($page->image_mime ?: 'image/jpeg');
            $result = $gemini->proofreadImageBytes($bytes, $mimeType);

            DB::transaction(function () use ($aiJob, $page, $result, $quota) {
                $page->ai_text = $result['text'];
                $page->ai_status = 'done';
                $page->ai_meta = [
                    'title' => $result['title'],
                    'subtitle' => $result['subtitle'],
                    'ocr_quality' => $result['ocr_quality'],
                    'coherence' => $result['coherence'],
                    'page_number' => $result['page_number'],
                ];
                if ($result['page_number'] !== null && $result['page_number'] !== '') {
                    $page->printed_page_number = $result['page_number'];
                }
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
        } finally {
            $page->refresh();
            $page->clearStoredImage();
        }
    }

    public function failed(?Throwable $exception): void
    {
        $aiJob = AiJob::query()->with(['page', 'batch.user'])->find($this->aiJobId);
        if (! $aiJob || in_array($aiJob->status, ['done', 'failed'], true)) {
            $aiJob?->page?->clearStoredImage();

            return;
        }

        $this->failJob(
            $aiJob,
            $exception?->getMessage() ?? 'Analiza i Korekta AI nie powiodła się.',
            app(AiQuotaService::class)
        );

        $aiJob->page?->clearStoredImage();
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
            $page->ai_meta = null;
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
