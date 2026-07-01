<?php

namespace App\Services\Account;

use App\Support\Settings\SupportSettings;
use Illuminate\Http\Request;
use Pbb\AccountSdk\AccountClient;
use Pbb\AccountSdk\AccountConfig;

class AccountClientFactory
{
    public function __construct(
        private readonly SupportSettings $settings,
    ) {}

    public function make(Request $request): AccountClient
    {
        $settings = $this->settings->all();

        return new AccountClient(
            new AccountConfig([
                'base_url' => $settings['accountBaseUrl'] ?? 'https://account.pbb.ph',
                'client_id' => $settings['accountClientId'] ?? 'pbb-support',
                'client_secret' => $settings['accountClientSecret'] ?? '',
                'redirect_uri' => $settings['accountRedirectUri'] ?? 'https://support.pbb.ph/auth/account/callback',
                'scopes' => preg_split('/\s+/', trim((string) ($settings['accountScopes'] ?? 'openid profile'))) ?: ['openid', 'profile'],
                'timeout_seconds' => (int) ($settings['accountTimeoutSeconds'] ?? 10),
                'ca_bundle' => $settings['accountCaBundle'] ?? null,
            ]),
            new LaravelAccountStateStore($request->session()),
        );
    }
}
