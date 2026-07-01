<?php

namespace App\Http\Controllers\Api;

use App\Models\AccountAdminAuditEvent;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Validator;

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
                'removeUser' => true,
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
        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'mobile' => ['nullable', 'string', 'max:40'],
            'defaultRole' => ['nullable', 'string'],
        ]);
        if ($validator->fails()) {
            return $this->validationFail($validator->errors()->toArray());
        }

        $data = $validator->validated();
        if (isset($data['defaultRole']) && ! in_array($data['defaultRole'], self::ROLES, true)) {
            return $this->accountFail('invalid_default_role', 'The requested default role is not allowed.', 422, [
                'allowed' => self::ROLES,
            ]);
        }

        $email = strtolower($data['email']);
        $role = $data['defaultRole'] ?? 'operator';

        $linked = $this->findLinkedUser($pbbUserId);
        if ($linked) {
            if ($this->emailBelongsToAnotherUser($email, $linked)) {
                return $this->accountFail('identity_conflict', 'A different local user already uses this email.', 409, [
                    'email' => $email,
                ]);
            }

            $linked->forceFill([
                'name' => $data['name'],
                'email' => $email,
            ])->save();

            return $this->ok([
                'user' => $this->accountUserPayload($linked),
            ]);
        }

        $emailUser = User::query()
            ->where('email', $email)
            ->first();

        if ($emailUser && $emailUser->pbb_user_id && $emailUser->pbb_user_id !== $pbbUserId) {
            return $this->accountFail('identity_conflict', 'A user with this email is linked to a different Account identity.', 409, [
                'email' => $email,
            ]);
        }

        if ($emailUser) {
            $emailUser->forceFill([
                'pbb_user_id' => $pbbUserId,
                'name' => $data['name'],
                'email' => $email,
            ])->save();

            return $this->ok([
                'user' => $this->accountUserPayload($emailUser),
            ]);
        }

        $user = User::query()->create([
            'pbb_user_id' => $pbbUserId,
            'name' => $data['name'],
            'email' => $email,
            'role' => $role,
            'password' => Hash::make(Str::random(48)),
        ]);

        return $this->ok([
            'user' => $this->accountUserPayload($user),
        ], null, 201);
    }

    public function updateRole(Request $request, string $pbbUserId): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'role' => ['required', 'string'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);
        if ($validator->fails()) {
            return $this->validationFail($validator->errors()->toArray());
        }

        $data = $validator->validated();
        if (! in_array($data['role'], self::ROLES, true)) {
            return $this->accountFail('invalid_role', 'The requested role is not allowed.', 422, [
                'allowed' => self::ROLES,
            ]);
        }

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
        $validator = Validator::make($request->all(), [
            'status' => ['required', 'string'],
            'durationMinutes' => ['nullable', 'integer', 'min:1', 'max:5256000'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);
        if ($validator->fails()) {
            return $this->validationFail($validator->errors()->toArray());
        }

        $data = $validator->validated();
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

    public function removeAccess(Request $request, string $pbbUserId): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'reason' => ['nullable', 'string', 'max:500'],
        ]);
        if ($validator->fails()) {
            return $this->validationFail($validator->errors()->toArray());
        }

        $reason = $validator->validated()['reason'] ?? null;
        $user = $this->findLinkedUser($pbbUserId);

        if (! $user) {
            $this->auditAccountAdminAction($request, 'remove_access_missing', $pbbUserId, null, $reason, [
                'status' => 'not_linked',
            ]);

            return $this->ok([
                'removed' => false,
                'status' => 'not_linked',
                'pbbUserId' => $pbbUserId,
            ]);
        }

        $previous = $this->accountUserPayload($user);

        $user->forceFill([
            'pbb_user_id' => null,
        ])->save();

        $this->auditAccountAdminAction($request, 'remove_access', $pbbUserId, $user, $reason, [
            'status' => 'unlinked',
            'previous_user' => $previous,
        ]);

        return $this->ok([
            'removed' => true,
            'status' => 'unlinked',
            'pbbUserId' => $pbbUserId,
            'localUserId' => (string) $user->id,
            'user' => [
                'localUserId' => (string) $user->id,
                'pbbUserId' => null,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'status' => 'active',
                'updatedAt' => $user->updated_at?->toIso8601String(),
            ],
        ]);
    }

    private function findLinkedUser(string $pbbUserId): ?User
    {
        return User::query()
            ->where('pbb_user_id', $pbbUserId)
            ->first();
    }

    private function emailBelongsToAnotherUser(string $email, User $user): bool
    {
        return User::query()
            ->where('email', $email)
            ->whereKeyNot($user->id)
            ->exists();
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
     * @param array<string, mixed> $payload
     */
    private function auditAccountAdminAction(
        Request $request,
        string $action,
        string $pbbUserId,
        ?User $user,
        ?string $reason,
        array $payload = [],
    ): void {
        AccountAdminAuditEvent::query()->create([
            'action' => $action,
            'pbb_user_id' => $pbbUserId,
            'local_user_id' => $user?->id,
            'account_client' => trim((string) $request->header('X-PBB-Account-Client')) ?: null,
            'reason' => $reason,
            'payload' => $payload,
        ]);
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

    /**
     * @param array<string, mixed> $errors
     */
    private function validationFail(array $errors): JsonResponse
    {
        return $this->accountFail('validation_failed', 'The request payload is invalid.', 422, [
            'errors' => $errors,
        ]);
    }
}
