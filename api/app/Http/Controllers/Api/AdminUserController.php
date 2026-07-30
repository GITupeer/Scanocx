<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
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
    public function index(Request $request, AiQuotaService $quota, OcrQuotaService $ocrQuota, ExportQuotaService $exportQuota, PhotoQuotaService $photoQuota, BookQuotaService $bookQuota): JsonResponse
    {
        $users = User::query()
            ->with('roles')
            ->orderBy('id')
            ->get()
            ->map(fn (User $user) => (new UserResource(
                $user,
                $quota->snapshot($user),
                $ocrQuota->snapshot($user),
                $exportQuota->snapshot($user),
                $photoQuota->snapshot($user),
                $bookQuota->snapshot($user)
            ))->resolve($request));

        return response()->json(['data' => $users]);
    }

    public function update(Request $request, User $user, AiQuotaService $quota, OcrQuotaService $ocrQuota, ExportQuotaService $exportQuota, PhotoQuotaService $photoQuota, BookQuotaService $bookQuota): UserResource
    {
        $data = $request->validate([
            'plan' => ['required', Rule::in([User::PLAN_FREE, User::PLAN_PRO])],
        ]);

        $user->plan = $data['plan'];
        $user->save();

        return new UserResource(
            $user->fresh('roles'),
            $quota->snapshot($user),
            $ocrQuota->snapshot($user),
            $exportQuota->snapshot($user),
            $photoQuota->snapshot($user),
            $bookQuota->snapshot($user)
        );
    }
}
