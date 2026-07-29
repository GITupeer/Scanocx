<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ExportQuotaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use RuntimeException;

/**
 * Eksport działa lokalnie — backend pilnuje limitów (PDF / eBook).
 */
class ExportController extends Controller
{
    public function quota(Request $request, ExportQuotaService $quota): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json($quota->snapshot($user));
    }

    /**
     * Potwierdza udany lokalny eksport.
     * Body: { "format": "txt"|"pdf"|"epub" }
     */
    public function consume(Request $request, ExportQuotaService $quota): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $data = $request->validate([
            'format' => ['required', 'string', Rule::in(ExportQuotaService::FORMATS)],
        ]);

        try {
            $quota->consume($user, $data['format']);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($quota->snapshot($user));
    }
}
