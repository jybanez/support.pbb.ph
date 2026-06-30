<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AccountAdminController extends BaseApiController
{
    private const ROLES = ['admin', 'command', 'operator'];
    private const STATUSES = ['active'];

    public function meta(): JsonResponse
    {
        return $this->ok([
            'app' => [
                'id' => 'pbb-support',
                'name' => 'PBB Support System',
            ],
            'roles' => [
                ['value' => 'admin', 'label' => 'Admin'],
                ['value' => 'command', 'label' => 'Command'],
                ['value' => 'operator', 'label' => 'Operator'],
            ],
            'statuses' => [
                ['value' => 'active', 'label' => 'Active'],
            ],
            'capabilities' => [
                'provisionUser' => true,
                'updateRole' => true,
                'blockLogin' => false,
                'suspendLogin' => false,
            ],
        ]);
    }

    public function show(string $pbbUserId): JsonResponse
    {
        $user = $this->findLinkedUser($pbbUserId);
        if (! $user) {
            return $this->accountFail('linked_user_not_found', 'Linked user not found.', 404);
        }

        return $this->ok([
            'user' => $this->accountUserPayload($user),
        ]);
    }

    public function provision(Request $request, string $pbbUserId): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'mobile' => ['nullable', 'string', 'max:40'],
            'defaultRole' => ['nullable', 'string', Rule::in(self::ROLES)],
        ]);

        $role = $data['defaultRole'] ?? 'operator';

        $linked = $this->findLinkedUser($pbbUserId);
        if ($linked) {
            $linked->forceFill([
                'name' => $data['name'],
                'email' => strtolower($data['email']),
            ])->save();

            return $this->ok([
                'user' => $this->accountUserPayload($linked),
            ]);
        }

        $emailUser = User::query()
            ->where('email', strtolower($data['email']))
            ->first();

        if ($emailUser && $emailUser->pbb_user_id && $emailUser->pbb_user_id !== $pbbUserId) {
            return $this->accountFail('identity_conflict', 'A user with this email is linked to a different Account identity.', 409, [
                'email' => strtolower($data['email']),
            ]);
        }

        if ($emailUser) {
            $emailUser->forceFill([
                'pbb_user_id' => $pbbUserId,
                'name' => $data['name'],
                'email' => strtolower($data['email']),
            ])->save();

            return $this->ok([
                'user' => $this->accountUserPayload($emailUser),
            ]);
        }

        $user = User::query()->create([
            'pbb_user_id' => $pbbUserId,
            'name' => $data['name'],
            'email' => strtolower($data['email']),
            'role' => $role,
            'password' => Hash::make(Str::random(48)),
        ]);

        return $this->ok([
            'user' => $this->accountUserPayload($user),
        ], null, 201);
    }

    public function updateRole(Request $request, string $pbbUserId): JsonResponse
    {
        $data = $request->validate([
            'role' => ['required', 'string', Rule::in(self::ROLES)],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $user = $this->findLinkedUser($pbbUserId);
        if (! $user) {
            return $this->accountFail('linked_user_not_found', 'Linked user not found.', 404);
        }

        $user->forceFill([
            'role' => $data['role'],
        ])->save();

        return $this->ok([
            'user' => $this->accountUserPayload($user),
        ]);
    }

    public function updateStatus(Request $request, string $pbbUserId): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'string'],
            'durationMinutes' => ['nullable', 'integer', 'min:1', 'max:5256000'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $user = $this->findLinkedUser($pbbUserId);
        if (! $user) {
            return $this->accountFail('linked_user_not_found', 'Linked user not found.', 404);
        }

        if ($data['status'] !== 'active') {
            return $this->accountFail('unsupported_status', 'Support v1 only supports active app-admin status.', 422, [
                'allowed' => self::STATUSES,
            ]);
        }

        return $this->ok([
            'user' => $this->accountUserPayload($user),
        ]);
    }

    private function findLinkedUser(string $pbbUserId): ?User
    {
        return User::query()
            ->where('pbb_user_id', $pbbUserId)
            ->first();
    }

    /**
     * @return array<string, mixed>
     */
    private function accountUserPayload(User $user): array
    {
        return [
            'pbbUserId' => $user->pbb_user_id,
            'localUserId' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'status' => 'active',
            'updatedAt' => $user->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @param array<string, mixed> $details
     */
    private function accountFail(string $code, string $message, int $status, array $details = []): JsonResponse
    {
        return response()->json([
            'message' => $message,
            'error' => [
                'code' => $code,
                'details' => $details,
            ],
        ], $status, [
            'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma' => 'no-cache',
        ]);
    }
}
