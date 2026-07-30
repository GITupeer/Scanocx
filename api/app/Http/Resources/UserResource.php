<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin User */
class UserResource extends JsonResource
{
    /**
     * @param  array<string, mixed>|null  $quota
     * @param  array<string, mixed>|null  $ocrQuota
     * @param  array<string, mixed>|null  $exportQuota
     * @param  array<string, mixed>|null  $photoQuota
     */
    public function __construct(
        $resource,
        private ?array $quota = null,
        private ?array $ocrQuota = null,
        private ?array $exportQuota = null,
        private ?array $photoQuota = null,
    ) {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var User $user */
        $user = $this->resource;

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'plan' => $user->plan,
            'roles' => $user->getRoleNames()->values()->all(),
            'quota' => $this->quota,
            'ocr_quota' => $this->ocrQuota,
            'export_quota' => $this->exportQuota,
            'photo_quota' => $this->photoQuota,
            'created_at' => $user->created_at?->toIso8601String(),
        ];
    }
}
