<?php

namespace App\Support\Settings;

use App\Models\SupportSetting;
use Illuminate\Support\Facades\Crypt;

class SupportSettings
{
    private const KEY = 'support.settings';

    /**
     * @return array<string, mixed>
     */
    public function all(): array
    {
        $row = SupportSetting::query()->where('key', self::KEY)->first();

        if (! $row || ! is_string($row->value) || $row->value === '') {
            return $this->defaults();
        }

        try {
            $payload = json_decode(Crypt::decryptString($row->value), true, flags: JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            return $this->defaults();
        }

        return $this->withoutLegacySecrets([
            ...$this->defaults(),
            ...(is_array($payload) ? $payload : []),
        ]);
    }

    /**
     * @param array<string, mixed> $settings
     * @return array<string, mixed>
     */
    public function update(array $settings): array
    {
        $next = [
            ...$this->all(),
            ...$settings,
        ];
        $next = $this->withoutLegacySecrets($next);

        SupportSetting::query()->updateOrCreate(
            ['key' => self::KEY],
            ['value' => Crypt::encryptString(json_encode($next, JSON_THROW_ON_ERROR))],
        );

        return $next;
    }

    /**
     * @return array<string, mixed>
     */
    public function publicSettings(): array
    {
        $settings = $this->all();
        unset($settings['realtimeBackendIngressSecret']);
        unset($settings['realtimeTokenSigningSecret']);
        unset($settings['sourceHeartbeatWebhookToken']);
        $settings['accountClientSecretConfigured'] = trim((string) ($settings['accountClientSecret'] ?? '')) !== '';
        $settings['accountAdminApiTokenConfigured'] = trim((string) ($settings['accountAdminApiToken'] ?? '')) !== '';
        unset($settings['accountClientSecret']);
        unset($settings['accountAdminApiToken']);

        return $settings;
    }

    /**
     * @return array<string, mixed>
     */
    private function defaults(): array
    {
        return [
            'relayTargetSystem' => 'sitrep.ingestor',
            'alertLevel' => 'Normal',
            'consolidationCadenceMinutes' => 15,
            'relayUrl' => 'https://relay.pbb.ph',
            'relayToken' => '',
            'sitrepRelayToken' => '',
            'supportRequestRelayToken' => '',
            'relayHandlerToken' => '',
            'relayCaBundle' => '',
            'supportRequestSourceSystem' => 'hotline.command',
            'supportRequestTargetSystem' => 'support.dispatch',
            'supportRequestUpdateSourceSystem' => 'support.dispatch',
            'supportRequestUpdateTargetSystem' => 'hotline.command',
            'realtimeUrl' => 'https://realtime.pbb.ph',
            'realtimeClientCode' => '',
            'serverProjectCode' => '',
            'adminProjectCode' => '',
            'realtimeBackendIngressSecret' => '',
            'realtimeTokenSigningSecret' => '',
            'sourceHeartbeatWebhookToken' => '',
            'accountSsoEnabled' => (bool) config('account.enabled', false),
            'accountBaseUrl' => (string) config('account.base_url', 'https://account.pbb.ph'),
            'accountClientId' => (string) config('account.client_id', 'pbb-support'),
            'accountClientSecret' => (string) config('account.client_secret', ''),
            'accountRedirectUri' => (string) config('account.redirect_uri', 'https://support.pbb.ph/auth/account/callback'),
            'accountPostLogoutRedirectUri' => (string) config('account.post_logout_redirect_uri', 'https://support.pbb.ph'),
            'accountScopes' => implode(' ', (array) config('account.scopes', ['openid', 'profile'])),
            'accountTimeoutSeconds' => (int) config('account.timeout_seconds', 10),
            'accountCaBundle' => (string) config('account.ca_bundle', ''),
            'accountAdminApiEnabled' => false,
            'accountAdminApiToken' => '',
            'accountAdminApiClient' => 'pbb-account',
        ];
    }

    /**
     * @param array<string, mixed> $settings
     * @return array<string, mixed>
     */
    private function withoutLegacySecrets(array $settings): array
    {
        unset($settings['hotlineMediaAccessToken']);

        return $settings;
    }
}
