<?php

namespace App\Http\Controllers\Api;

use App\Support\Settings\SupportSettings;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SettingsController extends BaseApiController
{
    public function show(Request $request, SupportSettings $settings)
    {
        abort_unless($request->user()?->role === 'admin', 403);

        return $this->ok([
            'settings' => $settings->publicSettings(),
        ]);
    }

    public function update(Request $request, SupportSettings $settings)
    {
        abort_unless($request->user()?->role === 'admin', 403);

        $validated = $request->validate([
            'alert_level' => ['required', 'string', Rule::in(['Normal', 'Elevated', 'Critical'])],
            'sitrep_cadence' => ['required', 'integer', 'min:1', 'max:1440'],
            'relay_url' => ['required', 'url', 'max:255'],
            'relay_token' => ['nullable', 'string', 'max:4096'],
            'sitrep_relay_token' => ['nullable', 'string', 'max:4096'],
            'support_request_relay_token' => ['nullable', 'string', 'max:4096'],
            'realtime_url' => ['required', 'url', 'max:255'],
            'realtime_client_code' => ['nullable', 'string', 'max:4096'],
            'server_project_code' => ['nullable', 'string', 'max:4096'],
            'admin_project_code' => ['nullable', 'string', 'max:4096'],
            'realtime_backend_ingress_secret' => ['nullable', 'string', 'max:4096'],
            'realtime_token_signing_secret' => ['nullable', 'string', 'max:4096'],
            'source_heartbeat_webhook_token' => ['nullable', 'string', 'max:4096'],
            'account_sso_enabled' => ['sometimes', 'boolean'],
            'account_base_url' => ['nullable', 'url', 'max:255'],
            'account_client_id' => ['nullable', 'string', 'max:255'],
            'account_client_secret' => ['nullable', 'string', 'max:4096'],
            'account_redirect_uri' => ['nullable', 'url', 'max:255'],
            'account_post_logout_redirect_uri' => ['nullable', 'url', 'max:255'],
            'account_scopes' => ['nullable', 'string', 'max:255'],
            'account_timeout_seconds' => ['nullable', 'integer', 'min:1', 'max:120'],
            'account_ca_bundle' => ['nullable', 'string', 'max:1024'],
            'account_admin_api_enabled' => ['sometimes', 'boolean'],
            'account_admin_api_client' => ['nullable', 'string', 'max:255'],
            'account_admin_api_token' => ['nullable', 'string', 'max:4096'],
        ]);
        $current = $settings->all();

        $updates = [
            'alertLevel' => $validated['alert_level'],
            'consolidationCadenceMinutes' => (int) $validated['sitrep_cadence'],
            'relayUrl' => $validated['relay_url'],
            'relayToken' => $validated['relay_token'] ?? '',
            'sitrepRelayToken' => $validated['sitrep_relay_token'] ?? $validated['relay_token'] ?? '',
            'supportRequestRelayToken' => $validated['support_request_relay_token'] ?? '',
            'realtimeUrl' => $validated['realtime_url'],
            'realtimeClientCode' => $validated['realtime_client_code'] ?? '',
            'serverProjectCode' => $validated['server_project_code'] ?? '',
            'adminProjectCode' => $validated['admin_project_code'] ?? '',
            'accountSsoEnabled' => (bool) ($validated['account_sso_enabled'] ?? $current['accountSsoEnabled'] ?? false),
            'accountBaseUrl' => $validated['account_base_url'] ?? $current['accountBaseUrl'] ?? 'https://account.pbb.ph',
            'accountClientId' => $validated['account_client_id'] ?? $current['accountClientId'] ?? 'pbb-support',
            'accountRedirectUri' => $validated['account_redirect_uri'] ?? $current['accountRedirectUri'] ?? 'https://support.pbb.ph/auth/account/callback',
            'accountPostLogoutRedirectUri' => $validated['account_post_logout_redirect_uri'] ?? $current['accountPostLogoutRedirectUri'] ?? 'https://support.pbb.ph',
            'accountScopes' => $validated['account_scopes'] ?? $current['accountScopes'] ?? 'openid profile',
            'accountTimeoutSeconds' => (int) ($validated['account_timeout_seconds'] ?? $current['accountTimeoutSeconds'] ?? 10),
            'accountCaBundle' => $validated['account_ca_bundle'] ?? $current['accountCaBundle'] ?? '',
            'accountAdminApiEnabled' => (bool) ($validated['account_admin_api_enabled'] ?? $current['accountAdminApiEnabled'] ?? false),
            'accountAdminApiClient' => $validated['account_admin_api_client'] ?? $current['accountAdminApiClient'] ?? 'pbb-account',
        ];

        if (trim((string) ($validated['account_client_secret'] ?? '')) !== '') {
            $updates['accountClientSecret'] = $validated['account_client_secret'];
        }

        if (trim((string) ($validated['account_admin_api_token'] ?? '')) !== '') {
            $updates['accountAdminApiToken'] = $validated['account_admin_api_token'];
        }

        if (array_key_exists('realtime_backend_ingress_secret', $validated)) {
            $updates['realtimeBackendIngressSecret'] = $validated['realtime_backend_ingress_secret'] ?? '';
        }

        if (array_key_exists('realtime_token_signing_secret', $validated)) {
            $updates['realtimeTokenSigningSecret'] = $validated['realtime_token_signing_secret'] ?? '';
        }

        if (array_key_exists('source_heartbeat_webhook_token', $validated)) {
            $updates['sourceHeartbeatWebhookToken'] = $validated['source_heartbeat_webhook_token'] ?? '';
        }

        $settings->update($updates);

        return $this->ok([
            'settings' => $settings->publicSettings(),
            'touched_at' => now()->toIso8601String(),
        ]);
    }
}
