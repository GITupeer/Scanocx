<?php

namespace App\Http\Controllers;

use App\Models\Book;
use App\Services\BookShareTextService;
use Illuminate\View\View;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class BookTextController extends Controller
{
    public function show(string $token, BookShareTextService $texts): View
    {
        $book = Book::query()
            ->where('share_token', $token)
            ->with(['pages' => fn ($q) => $q->orderBy('index')])
            ->first();

        if (! $book) {
            throw new NotFoundHttpException('Nie znaleziono udostępnionej książki.');
        }

        $sections = $texts->buildSections($book);
        $withText = collect($sections)->filter(fn (array $s) => $s['source'] !== 'empty')->count();

        return view('book-text', [
            'book' => $book,
            'sections' => $sections,
            'pageCount' => $book->pages->count(),
            'sectionCount' => count($sections),
            'withTextCount' => $withText,
        ]);
    }
}
