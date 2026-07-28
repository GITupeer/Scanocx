<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessPageAiJob;
use App\Models\AiBatch;
use App\Models\AiJob;
use App\Models\Book;
use App\Models\Page;
use App\Models\User;
use App\Services\AiQuotaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class AiController extends Controller
{
    public function quota(Request $request, AiQuotaService $quota): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json($quota->snapshot($user));
    }

    public function analyze(Request $request, AiQuotaService $quota): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'local_id' => ['required', 'string', 'max:64'],
            'title' => ['required', 'string', 'max:255'],
            'pages' => ['required', 'array', 'min:1'],
            'pages.*.local_id' => ['required', 'string', 'max:64'],
            'pages.*.index' => ['required', 'integer', 'min:1'],
            'pages.*.ocr_text' => ['required', 'string'],
            'pages.*.printed_page_number' => ['nullable', 'string', 'max:64'],
        ]);

        $pageCount = count($data['pages']);

        try {
            $quota->assertCanReserve($user, $pageCount);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        try {
            [$batch, $jobIds] = DB::transaction(function () use ($user, $data, $quota, $pageCount) {
                $quota->reserve($user, $pageCount);

                $book = Book::updateOrCreate(
                    [
                        'user_id' => $user->id,
                        'local_id' => $data['local_id'],
                    ],
                    [
                        'title' => $data['title'],
                    ]
                );

                $batch = AiBatch::create([
                    'user_id' => $user->id,
                    'book_id' => $book->id,
                    'status' => 'queued',
                    'total_jobs' => $pageCount,
                    'completed_jobs' => 0,
                    'failed_jobs' => 0,
                ]);

                $jobIds = [];

                foreach ($data['pages'] as $pageData) {
                    $page = Page::updateOrCreate(
                        [
                            'book_id' => $book->id,
                            'local_id' => $pageData['local_id'],
                        ],
                        [
                            'index' => $pageData['index'],
                            'ocr_text' => $pageData['ocr_text'],
                            'printed_page_number' => $pageData['printed_page_number'] ?? null,
                            'ai_status' => 'pending',
                            'ai_text' => null,
                        ]
                    );

                    $aiJob = AiJob::create([
                        'ai_batch_id' => $batch->id,
                        'page_id' => $page->id,
                        'status' => 'queued',
                        'reserved_quota' => true,
                    ]);

                    $jobIds[] = $aiJob->id;
                }

                return [$batch, $jobIds];
            });
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        foreach ($jobIds as $jobId) {
            ProcessPageAiJob::dispatch((int) $jobId);
        }

        $batch->load(['jobs.page', 'book']);

        return response()->json($this->serializeBatch($batch), 201);
    }

    public function batch(Request $request, int $id): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $batch = AiBatch::query()
            ->with(['jobs.page', 'book'])
            ->where('user_id', $user->id)
            ->findOrFail($id);

        return response()->json($this->serializeBatch($batch));
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeBatch(AiBatch $batch): array
    {
        $jobs = $batch->jobs->sortBy('id')->values();

        $queuePositions = $jobs
            ->filter(fn (AiJob $job) => in_array($job->status, ['queued', 'processing'], true))
            ->map(fn (AiJob $job) => $job->queuePosition());

        $bestPosition = $queuePositions->isEmpty() ? null : $queuePositions->min();

        return [
            'id' => $batch->id,
            'status' => $batch->status,
            'book_local_id' => $batch->book?->local_id,
            'total' => $batch->total_jobs,
            'completed' => $batch->completed_jobs,
            'failed' => $batch->failed_jobs,
            'queue_position' => $bestPosition,
            'jobs' => $jobs->map(function (AiJob $job) {
                return [
                    'id' => $job->id,
                    'page_local_id' => $job->page?->local_id,
                    'page_index' => $job->page?->index,
                    'status' => $job->status,
                    'queue_position' => in_array($job->status, ['queued', 'processing'], true)
                        ? $job->queuePosition()
                        : null,
                    'error' => $job->error,
                    'ai_text' => $job->status === 'done' ? $job->page?->ai_text : null,
                ];
            })->all(),
        ];
    }
}
