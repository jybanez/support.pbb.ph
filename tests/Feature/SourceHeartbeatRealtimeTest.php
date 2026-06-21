<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\Settings\SupportSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SourceHeartbeatRealtimeTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_request_source_heartbeat_realtime_admission(): void
    {
        app(SupportSettings::class)->update([
            'realtimeUrl' => 'https://realtime.pbb.ph',
            'realtimeClientCode' => 'clt_support',
            'serverProjectCode' => 'prj_support_server',
            'realtimeBackendIngressSecret' => 'backend-ingress-secret',
            'realtimeTokenSigningSecret' => 'token-signing-secret',
        ]);

        $response = $this->actingAs(User::factory()->create([
            'name' => 'Support Operator',
            'role' => 'operator',
        ]))->postJson('/api/realtime/source-heartbeats/admission');

        $response
            ->assertOk()
            ->assertJsonPath('data.admission.websocket_url', 'wss://realtime.pbb.ph/realtime')
            ->assertJsonPath('data.admission.app_code', 'clt_support')
            ->assertJsonPath('data.admission.project_code', 'prj_support_server')
            ->assertJsonPath('data.admission.room', 'support.sources.heartbeats')
            ->assertJsonPath('data.admission.event_type', 'support.source_heartbeats.updated')
            ->assertJsonMissing(['backend-ingress-secret', 'token-signing-secret']);

        $this->assertNotEmpty($response->json('data.admission.token'));
    }

    public function test_source_heartbeat_realtime_admission_requires_auth_and_config(): void
    {
        $this->postJson('/api/realtime/source-heartbeats/admission')
            ->assertUnauthorized();

        $this->actingAs(User::factory()->create())
            ->postJson('/api/realtime/source-heartbeats/admission')
            ->assertStatus(422)
            ->assertJsonPath('status', false);
    }

    public function test_source_heartbeat_proxy_remains_read_only_fallback(): void
    {
        Cache::forget('support.source_heartbeats.last_publish_hash');
        app(SupportSettings::class)->update([
            'relayUrl' => 'https://relay.pbb.ph',
            'sitrepRelayToken' => 'sitrep-relay-secret',
            'realtimeUrl' => 'https://realtime.pbb.ph',
            'realtimeClientCode' => 'clt_support',
            'serverProjectCode' => 'prj_support_server',
            'realtimeBackendIngressSecret' => 'backend-ingress-secret',
        ]);

        Http::fake([
            'relay.pbb.ph/api/v1/source-heartbeats*' => Http::response([
                'data' => [
                    'sources' => [[
                        'source_hub_id' => 13,
                        'source_relay_hub_id' => '072217029',
                        'status' => 'online',
                        'last_seen_at' => '2026-06-08T08:00:00+08:00',
                    ]],
                ],
            ]),
        ]);

        $this->actingAs(User::factory()->create())
            ->getJson('/api/source-heartbeats?hours=48')
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.sources.0.source_relay_hub_id', '072217029');

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/api/v1/events/publish'));
    }

    public function test_source_heartbeat_webhook_requires_dedicated_token(): void
    {
        app(SupportSettings::class)->update([
            'sourceHeartbeatWebhookToken' => 'webhook-secret',
        ]);

        $this->postJson('/api/relay/source-heartbeats', $this->heartbeatWebhookPayload())
            ->assertUnauthorized();

        $this->withHeader('X-Relay-Webhook-Key', 'wrong-secret')
            ->postJson('/api/relay/source-heartbeats', $this->heartbeatWebhookPayload())
            ->assertUnauthorized();
    }

    public function test_source_heartbeat_webhook_rejects_invalid_event_type(): void
    {
        app(SupportSettings::class)->update([
            'sourceHeartbeatWebhookToken' => 'webhook-secret',
        ]);

        $payload = $this->heartbeatWebhookPayload([
            'event_type' => 'source.heartbeat.deleted',
        ]);

        $this->withHeader('Authorization', 'Bearer webhook-secret')
            ->postJson('/api/relay/source-heartbeats', $payload)
            ->assertStatus(422)
            ->assertJsonPath('status', false);
    }

    public function test_source_heartbeat_webhook_publishes_snapshot_to_realtime(): void
    {
        Cache::flush();
        app(SupportSettings::class)->update([
            'sourceHeartbeatWebhookToken' => 'webhook-secret',
            'realtimeUrl' => 'https://realtime.pbb.ph',
            'realtimeClientCode' => 'clt_support',
            'serverProjectCode' => 'prj_support_server',
            'realtimeBackendIngressSecret' => 'backend-ingress-secret',
        ]);

        Http::fake([
            'realtime.pbb.ph/api/v1/events/publish' => Http::response([
                'status' => 'accepted',
                'data' => ['published' => true],
            ], 202),
        ]);

        $this->withHeader('X-Relay-Webhook-Key', 'webhook-secret')
            ->postJson('/api/relay/source-heartbeats', $this->heartbeatWebhookPayload())
            ->assertAccepted()
            ->assertJsonPath('data.validation_status', 'accepted')
            ->assertJsonPath('data.published', true);

        Http::assertSent(fn ($request): bool => $request->hasHeader('X-Realtime-Backend-Secret', 'backend-ingress-secret')
            && $request->url() === 'https://realtime.pbb.ph/api/v1/events/publish'
            && $request['client_code'] === 'clt_support'
            && $request['project_code'] === 'prj_support_server'
            && $request['room'] === 'support.sources.heartbeats'
            && $request['event_type'] === 'support.source_heartbeats.updated'
            && $request['payload']['available'] === true
            && $request['payload']['sources'][0]['source_hub_id'] === '13'
            && $request['payload']['sources'][0]['source_relay_hub_id'] === '072217003'
            && $request['payload']['sources'][0]['status'] === 'online'
            && $request['payload']['sources'][0]['history'][0]['expected_count'] === 12);
    }

    public function test_source_heartbeat_webhook_normalizes_source_identity_aliases(): void
    {
        Cache::flush();
        app(SupportSettings::class)->update([
            'sourceHeartbeatWebhookToken' => 'webhook-secret',
            'realtimeUrl' => 'https://realtime.pbb.ph',
            'realtimeClientCode' => 'clt_support',
            'serverProjectCode' => 'prj_support_server',
            'realtimeBackendIngressSecret' => 'backend-ingress-secret',
        ]);

        Http::fake([
            'realtime.pbb.ph/api/v1/events/publish' => Http::response([
                'status' => 'accepted',
                'data' => ['published' => true],
            ], 202),
        ]);

        $payload = $this->heartbeatWebhookPayload([
            'event_id' => 'source-heartbeat:alias-test:2026-06-22T10:29:55+08:00',
            'source' => [
                'source_hub_id' => 'hub-alias-13',
                'source_relay_hub_id' => 'relay-alias-072217003',
                'hub_name' => 'Apas, CEBU CITY, CEBU',
            ],
        ]);

        $this->withHeader('Authorization', 'Bearer webhook-secret')
            ->postJson('/api/relay/source-heartbeats', $payload)
            ->assertAccepted();

        Http::assertSent(fn ($request): bool => $request['payload']['sources'][0]['source_hub_id'] === 'hub-alias-13'
            && $request['payload']['sources'][0]['hub_id'] === 'hub-alias-13'
            && $request['payload']['sources'][0]['source_relay_hub_id'] === 'relay-alias-072217003'
            && $request['payload']['sources'][0]['relay_hub_id'] === 'relay-alias-072217003');
    }

    public function test_source_heartbeat_webhook_is_idempotent_by_event_id(): void
    {
        Cache::flush();
        app(SupportSettings::class)->update([
            'sourceHeartbeatWebhookToken' => 'webhook-secret',
            'realtimeUrl' => 'https://realtime.pbb.ph',
            'realtimeClientCode' => 'clt_support',
            'serverProjectCode' => 'prj_support_server',
            'realtimeBackendIngressSecret' => 'backend-ingress-secret',
        ]);

        Http::fake([
            'realtime.pbb.ph/api/v1/events/publish' => Http::response([
                'status' => 'accepted',
                'data' => ['published' => true],
            ], 202),
        ]);

        $payload = $this->heartbeatWebhookPayload();

        $this->withHeader('Authorization', 'Bearer webhook-secret')
            ->postJson('/api/relay/source-heartbeats', $payload)
            ->assertAccepted()
            ->assertJsonPath('data.validation_status', 'accepted');

        $this->withHeader('Authorization', 'Bearer webhook-secret')
            ->postJson('/api/relay/source-heartbeats', $payload)
            ->assertOk()
            ->assertJsonPath('data.validation_status', 'duplicate');

        Http::assertSentCount(1);
    }

    public function test_source_heartbeat_webhook_publish_failure_is_reported_without_rejecting_receipt(): void
    {
        Cache::flush();
        app(SupportSettings::class)->update([
            'sourceHeartbeatWebhookToken' => 'webhook-secret',
            'realtimeUrl' => 'https://realtime.pbb.ph',
            'realtimeClientCode' => 'clt_support',
            'serverProjectCode' => 'prj_support_server',
            'realtimeBackendIngressSecret' => 'backend-ingress-secret',
        ]);

        Http::fake([
            'realtime.pbb.ph/api/v1/events/publish' => Http::response([
                'status' => 'rejected',
                'reason' => 'room-not-allowed',
            ], 403),
        ]);

        $this->withHeader('Authorization', 'Bearer webhook-secret')
            ->postJson('/api/relay/source-heartbeats', $this->heartbeatWebhookPayload())
            ->assertAccepted()
            ->assertJsonPath('data.validation_status', 'accepted')
            ->assertJsonPath('data.published', false);
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function heartbeatWebhookPayload(array $overrides = []): array
    {
        return [
            'event_id' => $overrides['event_id'] ?? 'source-heartbeat:072217003:2026-06-22T10:29:55+08:00',
            'event_type' => $overrides['event_type'] ?? 'source.heartbeat.updated',
            'schema_version' => 1,
            'occurred_at' => '2026-06-22T10:30:00+08:00',
            'source' => [
                'hub_id' => '13',
                'relay_hub_id' => '072217003',
                'name' => 'Apas, CEBU CITY, CEBU',
                'domain' => 'apas-cebu-cebu-relay.pbb.ph',
                'deployment' => 'barangay',
            ],
            'heartbeat' => [
                'status' => 'online',
                'last_seen_at' => '2026-06-22T10:29:55+08:00',
                'age_seconds' => 5,
                'received_count' => 123,
                'last_version' => '1.1.0',
                'last_credential_version' => '1',
            ],
            'rollup' => [
                'bucket_started_at' => '2026-06-22T10:00:00+08:00',
                'bucket_minutes' => 60,
                'expected_count' => 12,
                'received_count' => 11,
                'first_seen_at' => '2026-06-22T10:00:10+08:00',
                'last_seen_at' => '2026-06-22T10:29:55+08:00',
            ],
            ...$overrides,
        ];
    }
}
