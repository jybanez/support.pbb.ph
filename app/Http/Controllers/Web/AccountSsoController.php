<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Account\AccountClientFactory;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Pbb\AccountSdk\AccountProtocolException;

class AccountSsoController extends Controller
{
    public function redirect(Request $request, AccountClientFactory $accounts): RedirectResponse
    {
        abort_unless((bool) config('account.enabled', false), 404);

        $request->session()->put(
            'pbb_account.return_to',
            $this->safeReturnPath($request->query('return', '/')),
        );

        return redirect()->away($accounts->make($request)->authorizationUrl());
    }

    public function callback(Request $request, AccountClientFactory $accounts): RedirectResponse
    {
        abort_unless((bool) config('account.enabled', false), 404);

        try {
            $identity = $accounts->make($request)->handleCallback($request->query())->toArray();
            $user = $this->resolveLocalUser($identity);

            Auth::guard('web')->login($user, true);
            $request->session()->regenerate();

            return redirect($this->safeReturnPath($request->session()->pull('pbb_account.return_to', '/')));
        } catch (\Throwable $exception) {
            report($exception);

            return redirect('/')->with('account_login_error', 'Unable to complete Account sign in.');
        }
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        if (! (bool) config('account.enabled', false)) {
            return redirect('/');
        }

        return redirect()->away($this->accountLogoutUrl());
    }

    /**
     * @param array<string, mixed> $identity
     */
    private function resolveLocalUser(array $identity): User
    {
        $pbbUserId = trim((string) ($identity['pbb_user_id'] ?? ''));
        if ($pbbUserId === '') {
            throw new AccountProtocolException('Account identity is missing pbb_user_id.');
        }

        $status = trim((string) ($identity['status'] ?? ''));
        if ($status !== '' && strcasecmp($status, 'active') !== 0) {
            throw ValidationException::withMessages([
                'account' => ['Your PBB Account is not active.'],
            ]);
        }

        $email = $this->normalizedEmail($identity['email'] ?? null, $pbbUserId);
        $name = $this->displayName($identity, $email);

        $user = User::query()->where('pbb_user_id', $pbbUserId)->first();
        if ($user) {
            $this->refreshLocalProfile($user, $name, $email);

            return $user;
        }

        $emailUser = User::query()->where('email', $email)->first();
        if ($emailUser) {
            if ($emailUser->pbb_user_id !== null && $emailUser->pbb_user_id !== $pbbUserId) {
                throw ValidationException::withMessages([
                    'email' => ['This Support user is already linked to another PBB Account.'],
                ]);
            }

            $emailUser->forceFill([
                'pbb_user_id' => $pbbUserId,
                'name' => $name,
            ])->save();

            return $emailUser;
        }

        return User::query()->create([
            'pbb_user_id' => $pbbUserId,
            'name' => $name,
            'email' => $email,
            'role' => 'operator',
            'password' => Str::password(40),
        ]);
    }

    private function refreshLocalProfile(User $user, string $name, string $email): void
    {
        $updates = ['name' => $name];

        $emailOwner = User::query()
            ->where('email', $email)
            ->whereKeyNot($user->id)
            ->exists();

        if (! $emailOwner) {
            $updates['email'] = $email;
        }

        $user->forceFill($updates)->save();
    }

    private function normalizedEmail(mixed $email, string $pbbUserId): string
    {
        $normalized = trim(strtolower((string) $email));

        if ($normalized !== '') {
            return $normalized;
        }

        return strtolower($pbbUserId).'@account.pbb.local';
    }

    /**
     * @param array<string, mixed> $identity
     */
    private function displayName(array $identity, string $email): string
    {
        $name = trim((string) ($identity['name'] ?? ''));

        return $name !== '' ? $name : $email;
    }

    private function safeReturnPath(mixed $value): string
    {
        $path = trim((string) $value);

        if ($path === '' || ! str_starts_with($path, '/') || str_starts_with($path, '//')) {
            return '/';
        }

        return $path;
    }

    private function accountLogoutUrl(): string
    {
        $baseUrl = rtrim((string) config('account.base_url', 'https://account.pbb.ph'), '/');

        return $baseUrl.'/oauth/logout?'.http_build_query([
            'client_id' => config('account.client_id', 'pbb-support'),
            'post_logout_redirect_uri' => config('account.post_logout_redirect_uri', url('/')),
        ]);
    }
}
