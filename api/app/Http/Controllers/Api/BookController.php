<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\Page;
use App\Models\User;
use App\Services\BookSearchService;
use App\Services\PhotoQuotaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class BookController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $books = Book::query()
            ->where('user_id', $user->id)
            ->withCount('pages')
            ->orderByDesc('updated_at')
            ->get();

        return response()->json([
            'data' => $books->map(fn (Book $book) => $this->serializeBookSummary($book))->all(),
        ]);
    }

    public function search(Request $request, BookSearchService $search): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'q' => ['required', 'string', 'max:200'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $hits = $search->search($user, $data['q'], (int) ($data['limit'] ?? 40));

        return response()->json(['data' => $hits]);
    }

    public function show(Request $request, string $localId): JsonResponse
    {
        $book = $this->findBookOrFail($request, $localId);
        $book->load(['pages' => fn ($q) => $q->orderBy('index')]);

        return response()->json($this->serializeBook($book));
    }

    public function store(Request $request, PhotoQuotaService $photoQuota): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'local_id' => ['required', 'string', 'max:64'],
            'title' => ['required', 'string', 'max:255'],
            'pages' => ['sometimes', 'array'],
            'pages.*.local_id' => ['required_with:pages', 'string', 'max:64'],
            'pages.*.index' => ['required_with:pages', 'integer', 'min:1'],
            'pages.*.ocr_text' => ['nullable', 'string'],
            'pages.*.printed_page_number' => ['nullable', 'string', 'max:64'],
            'pages.*.ai_text' => ['nullable', 'string'],
            'pages.*.ai_status' => ['nullable', 'string', 'max:32'],
            'pages.*.ai_meta' => ['nullable', 'array'],
        ]);

        $book = Book::updateOrCreate(
            [
                'user_id' => $user->id,
                'local_id' => $data['local_id'],
            ],
            [
                'title' => $data['title'],
            ]
        );

        if (! empty($data['pages'])) {
            $newCount = 0;
            foreach ($data['pages'] as $pageData) {
                $exists = Page::query()
                    ->where('book_id', $book->id)
                    ->where('local_id', $pageData['local_id'])
                    ->exists();
                if (! $exists) {
                    $newCount++;
                }
            }
            try {
                $photoQuota->assertCanAdd($user, $newCount);
            } catch (RuntimeException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
            foreach ($data['pages'] as $pageData) {
                $this->upsertPageFromData($book, $pageData);
            }
        }

        $book->load(['pages' => fn ($q) => $q->orderBy('index')]);
        $book->loadCount('pages');

        return response()->json($this->serializeBook($book), 201);
    }

    public function update(Request $request, string $localId): JsonResponse
    {
        $book = $this->findBookOrFail($request, $localId);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
        ]);

        $book->title = $data['title'];
        $book->save();
        $book->loadCount('pages');

        return response()->json($this->serializeBookSummary($book));
    }

    public function destroy(Request $request, string $localId): JsonResponse
    {
        $book = $this->findBookOrFail($request, $localId);
        $book->delete();

        return response()->json(['ok' => true]);
    }

    public function storePage(Request $request, string $localId, PhotoQuotaService $photoQuota): JsonResponse
    {
        $book = $this->findBookOrFail($request, $localId);

        $data = $request->validate([
            'local_id' => ['required', 'string', 'max:64'],
            'index' => ['required', 'integer', 'min:1'],
            'ocr_text' => ['nullable', 'string'],
            'printed_page_number' => ['nullable', 'string', 'max:64'],
            'ai_text' => ['nullable', 'string'],
            'ai_status' => ['nullable', 'string', 'max:32'],
            'ai_meta' => ['nullable', 'array'],
        ]);

        $exists = Page::query()
            ->where('book_id', $book->id)
            ->where('local_id', $data['local_id'])
            ->exists();

        if (! $exists) {
            /** @var User $user */
            $user = $request->user();
            try {
                $photoQuota->assertCanAdd($user, 1);
            } catch (RuntimeException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
        }

        $page = $this->upsertPageFromData($book, $data);
        $book->touch();

        return response()->json($this->serializePage($page), 201);
    }

    public function updatePage(Request $request, string $localId, string $pageLocalId): JsonResponse
    {
        $book = $this->findBookOrFail($request, $localId);
        $page = Page::query()
            ->where('book_id', $book->id)
            ->where('local_id', $pageLocalId)
            ->firstOrFail();

        $data = $request->validate([
            'index' => ['sometimes', 'integer', 'min:1'],
            'ocr_text' => ['sometimes', 'nullable', 'string'],
            'printed_page_number' => ['sometimes', 'nullable', 'string', 'max:64'],
            'ai_text' => ['sometimes', 'nullable', 'string'],
            'ai_status' => ['sometimes', 'nullable', 'string', 'max:32'],
            'ai_meta' => ['sometimes', 'nullable', 'array'],
        ]);

        if (array_key_exists('index', $data)) {
            $page->index = $data['index'];
        }
        if (array_key_exists('ocr_text', $data)) {
            $page->ocr_text = (string) ($data['ocr_text'] ?? '');
        }
        if (array_key_exists('printed_page_number', $data)) {
            $page->printed_page_number = $data['printed_page_number'];
        }
        if (array_key_exists('ai_text', $data)) {
            $page->ai_text = $data['ai_text'];
        }
        if (array_key_exists('ai_status', $data)) {
            $page->ai_status = (string) ($data['ai_status'] ?? 'idle');
        }
        if (array_key_exists('ai_meta', $data)) {
            $page->ai_meta = $data['ai_meta'];
        }

        $page->save();
        $book->touch();

        return response()->json($this->serializePage($page));
    }

    public function destroyPage(Request $request, string $localId, string $pageLocalId): JsonResponse
    {
        $book = $this->findBookOrFail($request, $localId);
        $page = Page::query()
            ->where('book_id', $book->id)
            ->where('local_id', $pageLocalId)
            ->firstOrFail();

        $page->delete();

        // Renumber remaining pages to keep contiguous indexes.
        $remaining = Page::query()
            ->where('book_id', $book->id)
            ->orderBy('index')
            ->get();
        foreach ($remaining as $idx => $remainingPage) {
            $newIndex = $idx + 1;
            if ((int) $remainingPage->index !== $newIndex) {
                $remainingPage->index = $newIndex;
                $remainingPage->save();
            }
        }

        $book->touch();

        return response()->json(['ok' => true]);
    }

    private function findBookOrFail(Request $request, string $localId): Book
    {
        /** @var User $user */
        $user = $request->user();

        return Book::query()
            ->where('user_id', $user->id)
            ->where('local_id', $localId)
            ->firstOrFail();
    }

    /**
     * @param  array<string, mixed>  $pageData
     */
    private function upsertPageFromData(Book $book, array $pageData): Page
    {
        return Page::updateOrCreate(
            [
                'book_id' => $book->id,
                'local_id' => $pageData['local_id'],
            ],
            [
                'index' => (int) $pageData['index'],
                'ocr_text' => (string) ($pageData['ocr_text'] ?? ''),
                'printed_page_number' => $pageData['printed_page_number'] ?? null,
                'ai_text' => $pageData['ai_text'] ?? null,
                'ai_status' => (string) ($pageData['ai_status'] ?? 'idle'),
                'ai_meta' => $pageData['ai_meta'] ?? null,
            ]
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeBookSummary(Book $book): array
    {
        return [
            'id' => $book->id,
            'local_id' => $book->local_id,
            'title' => $book->title,
            'page_count' => (int) ($book->pages_count ?? $book->pages()->count()),
            'created_at' => optional($book->created_at)?->toIso8601String(),
            'updated_at' => optional($book->updated_at)?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeBook(Book $book): array
    {
        $pages = $book->relationLoaded('pages')
            ? $book->pages
            : $book->pages()->orderBy('index')->get();

        return [
            'id' => $book->id,
            'local_id' => $book->local_id,
            'title' => $book->title,
            'page_count' => $pages->count(),
            'created_at' => optional($book->created_at)?->toIso8601String(),
            'updated_at' => optional($book->updated_at)?->toIso8601String(),
            'pages' => $pages->map(fn (Page $page) => $this->serializePage($page))->all(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serializePage(Page $page): array
    {
        return [
            'id' => $page->id,
            'local_id' => $page->local_id,
            'index' => (int) $page->index,
            'ocr_text' => (string) ($page->ocr_text ?? ''),
            'ai_text' => $page->ai_text,
            'ai_status' => (string) ($page->ai_status ?? 'idle'),
            'ai_meta' => $page->ai_meta,
            'printed_page_number' => $page->printed_page_number,
            'created_at' => optional($page->created_at)?->toIso8601String(),
            'updated_at' => optional($page->updated_at)?->toIso8601String(),
        ];
    }
}
