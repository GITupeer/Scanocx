<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AdminUserStatsService;
use App\Services\AiPricingService;
use App\Services\AiQuotaService;
use App\Services\BookQuotaService;
use App\Services\ExportQuotaService;
use App\Services\OcrQuotaService;
use App\Services\PhotoQuotaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminUserController extends Controller
{
    public function index(
        Request $request,
        AiQuotaService $quota,
        OcrQuotaService $ocrQuota,
        ExportQuotaService $exportQuota,
        PhotoQuotaService $photoQuota,
        BookQuotaService $bookQuota,
        AdminUserStatsService $stats,
        AiPricingService $pricing,
    ): JsonResponse {
        $users = User::query()
            ->with('roles')
            ->orderBy('id')
            ->get();

        $tokenStats = $stats->tokenStatsForUsers($users->pluck('id')->all());
        $model = $pricing->activeModel();

        $mapped = $users->map(function (User $user) use (
            $request,
            $quota,
            $ocrQuota,
            $exportQuota,
            $photoQuota,
            $bookQuota,
            $stats,
            $tokenStats,
        ) {
            return (new UserResource(
                $user,
                $quota->snapshot($user),
                $ocrQuota->snapshot($user),
                $exportQuota->snapshot($user),
                $photoQuota->snapshot($user),
                $bookQuota->snapshot($user),
                $tokenStats[$user->id] ?? $stats->emptyStats(),
            ))->resolve($request);
        });

        $allStats = collect($tokenStats)->values();

        return response()->json([
            'data' => $mapped,
            'meta' => [
                'ai_provider' => $model['provider'],
                'ai_model' => $model['model'],
                'pricing' => [
                    'input_usd_per_1m' => $model['input_usd_per_1m'],
                    'output_usd_per_1m' => $model['output_usd_per_1m'],
                ],
                'totals' => $stats->summarize($allStats),
            ],
        ]);
    }

    public function update(
        Request $request,
        User $user,
        AiQuotaService $quota,
        OcrQuotaService $ocrQuota,
        ExportQuotaService $exportQuota,
        PhotoQuotaService $photoQuota,
        BookQuotaService $bookQuota,
        AdminUserStatsService $stats,
    ): UserResource {
        $data = $request->validate([
            'plan' => ['required', Rule::in([User::PLAN_FREE, User::PLAN_PRO])],
        ]);

        $user->plan = $data['plan'];
        $user->save();

        $tokenStats = $stats->tokenStatsForUsers([$user->id]);

        return new UserResource(
            $user->fresh('roles'),
            $quota->snapshot($user),
            $ocrQuota->snapshot($user),
            $exportQuota->snapshot($user),
            $photoQuota->snapshot($user),
            $bookQuota->snapshot($user),
            $tokenStats[$user->id] ?? $stats->emptyStats(),
        );
    }
}
