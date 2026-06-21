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
        ]);

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
            'realtimeBackendIngressSecret' => $validated['realtime_backend_ingress_secret'] ?? '',
        ];

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
