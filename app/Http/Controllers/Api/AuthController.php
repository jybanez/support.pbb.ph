<?php

namespace App\Http\Controllers\Api;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthController extends BaseApiController
{
    public function csrfToken(Request $request)
    {
        $request->session()->regenerateToken();

        return $this->ok([
            'csrf_token' => $request->session()->token(),
        ]);
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($credentials, false)) {
            throw ValidationException::withMessages([
                'email' => ['Invalid email or password.'],
            ]);
        }

        $request->session()->regenerate();

        return $this->ok([
            'account' => $this->toAccount($request->user()),
            'csrf_token' => $request->session()->token(),
            'touched_at' => now()->toIso8601String(),
        ]);
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return $this->ok([
            'csrf_token' => $request->session()->token(),
        ]);
    }

    public function user(Request $request)
    {
        return $this->ok([
            'account' => $this->toAccount($request->user()),
            'csrf_token' => $request->session()->token(),
            'touched_at' => now()->toIso8601String(),
        ]);
    }

    public function ping(Request $request)
    {
        return $this->ok([
            'account' => $this->toAccount($request->user()),
            'csrf_token' => $request->session()->token(),
            'touched_at' => now()->toIso8601String(),
        ]);
    }

    private function toAccount(?User $user): ?array
    {
        if (! $user) {
            return null;
        }

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
        ];
    }
}
