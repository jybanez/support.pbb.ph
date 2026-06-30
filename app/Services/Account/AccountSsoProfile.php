<?php

namespace App\Services\Account;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class AccountSsoProfile
{
    public function __construct(
        private readonly AccountClientFactory $accounts,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function publicPayload(Request $request): array
    {
        $enabled = (bool) config('account.enabled', false);

        return [
            'enabled' => $enabled,
            'ready' => $enabled && $this->configured() && $this->ready($request),
            'loginUrl' => url('/auth/account/redirect'),
            'logoutUrl' => url('/auth/logout'),
            'baseUrl' => config('account.base_url'),
        ];
    }

    private function configured(): bool
    {
        return trim((string) config('account.base_url')) !== ''
            && trim((string) config('account.client_id')) !== ''
            && trim((string) config('account.client_secret')) !== ''
            && trim((string) config('account.redirect_uri')) !== '';
    }

    private function ready(Request $request): bool
    {
        if (! $this->configured()) {
            return false;
        }

        return Cache::remember('pbb_account_ready', now()->addSeconds(30), function () use ($request): bool {
            try {
                return $this->accounts->make($request)->isReady();
            } catch (\Throwable) {
                return false;
            }
        });
    }
}
