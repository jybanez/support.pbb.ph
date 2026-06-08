<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminUsersController extends BaseApiController
{
    public function index(Request $request)
    {
        $this->authorizeAdmin($request);

        return $this->ok([
            'users' => User::query()
                ->orderBy('name')
                ->orderBy('email')
                ->get()
                ->map(fn (User $user): array => $this->userPayload($user))
                ->values()
                ->all(),
        ]);
    }

    public function store(Request $request)
    {
        $this->authorizeAdmin($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'role' => ['required', 'string', Rule::in(['admin', 'operator'])],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $user = User::query()->create($data);

        return $this->ok([
            'user' => $this->userPayload($user),
        ], null, 201);
    }

    public function update(Request $request, User $user)
    {
        $this->authorizeAdmin($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'role' => ['required', 'string', Rule::in(['admin', 'operator'])],
            'password' => ['nullable', 'string', 'min:8'],
        ]);

        if ($request->user()?->id === $user->id && $user->role !== $data['role']) {
            throw ValidationException::withMessages([
                'role' => ['You cannot change your own role.'],
            ]);
        }

        if ($user->role === 'admin' && $data['role'] !== 'admin' && $this->adminCount() <= 1) {
            throw ValidationException::withMessages([
                'role' => ['At least one admin user is required.'],
            ]);
        }

        $user->fill([
            'name' => $data['name'],
            'email' => $data['email'],
            'role' => $data['role'],
        ]);

        if (! empty($data['password'])) {
            $user->password = $data['password'];
        }

        $user->save();

        return $this->ok([
            'user' => $this->userPayload($user),
        ]);
    }

    public function destroy(Request $request, User $user)
    {
        $this->authorizeAdmin($request);

        if ($request->user()?->id === $user->id) {
            throw ValidationException::withMessages([
                'user' => ['You cannot delete your own account.'],
            ]);
        }

        if ($user->role === 'admin' && $this->adminCount() <= 1) {
            throw ValidationException::withMessages([
                'user' => ['At least one admin user is required.'],
            ]);
        }

        $user->delete();

        return $this->ok();
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->role === 'admin', 403);
    }

    private function adminCount(): int
    {
        return User::query()->where('role', 'admin')->count();
    }

    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'created_at' => $user->created_at?->toIso8601String(),
            'updated_at' => $user->updated_at?->toIso8601String(),
        ];
    }
}
