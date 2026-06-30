<?php

namespace App\Services\Account;

use App\Support\Settings\SupportSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class AccountSsoProfile
{
    public function __construct(
        private readonly AccountClientFactory $accounts,
        private readonly SupportSettings $settings,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function publicPayload(Request $request): array
    {
        $account = $this->accountSettings();
        $enabled = filter_var($account['accountSsoEnabled'] ?? false, FILTER_VALIDATE_BOOLEAN);

        return [
            'enabled' => $enabled,
            'ready' => $enabled && $this->configured() && $this->ready($request),
            'loginUrl' => url('/auth/account/redirect'),
            'logoutUrl' => url('/auth/logout'),
            'baseUrl' => $account['accountBaseUrl'],
        ];
    }

    private function configured(): bool
    {
        $account = $this->accountSettings();

        return trim((string) $account['accountBaseUrl']) !== ''
            && trim((string) $account['accountClientId']) !== ''
            && trim((string) $account['accountClientSecret']) !== ''
            && trim((string) $account['accountRedirectUri']) !== '';
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

    /**
     * @return array<string, mixed>
     */
    private function accountSettings(): array
    {
        return $this->settings->all();
    }
}
