<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\OcrQuotaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * OCR działa lokalnie na urządzeniu — backend tylko pilnuje limitu.
 * Klient zgłasza rezerwację / zużycie bez przesyłania tekstu stron.
 */
class OcrController extends Controller
{
    public function quota(Request $request, OcrQuotaService $quota): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json($quota->snapshot($user));
    }

    /**
     * Rezerwuje N odczytów OCR przed lokalną analizą.
     * Body: { "count": 1 }
     */
    public function reserve(Request $request, OcrQuotaService $quota): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'count' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $count = (int) ($data['count'] ?? 1);

        try {
            $quota->reserve($user, $count);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($quota->snapshot($user));
    }

    /**
     * Potwierdza udany lokalny OCR (reserved → used).
     * Body: { "count": 1 }
     */
    public function consume(Request $request, OcrQuotaService $quota): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'count' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $count = (int) ($data['count'] ?? 1);

        for ($i = 0; $i < $count; $i++) {
            $quota->consumeOne($user);
        }

        return response()->json($quota->snapshot($user));
    }

    /**
     * Zwalnia rezerwację po nieudanym OCR.
     * Body: { "count": 1 }
     */
    public function release(Request $request, OcrQuotaService $quota): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'count' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $count = (int) ($data['count'] ?? 1);

        for ($i = 0; $i < $count; $i++) {
            $quota->releaseOne($user);
        }

        return response()->json($quota->snapshot($user));
    }
}
