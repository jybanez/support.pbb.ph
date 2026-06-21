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

    public function test_source_heartbeat_proxy_publishes_snapshot_to_realtime(): void
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
            'realtime.pbb.ph/api/v1/events/publish' => Http::response([
                'status' => 'accepted',
                'data' => ['published' => true],
            ], 202),
        ]);

        $this->actingAs(User::factory()->create())
            ->getJson('/api/source-heartbeats?hours=48')
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.sources.0.source_relay_hub_id', '072217029');

        Http::assertSent(fn ($request): bool => $request->hasHeader('X-Realtime-Backend-Secret', 'backend-ingress-secret')
            && $request->url() === 'https://realtime.pbb.ph/api/v1/events/publish'
            && $request['client_code'] === 'clt_support'
            && $request['project_code'] === 'prj_support_server'
            && $request['room'] === 'support.sources.heartbeats'
            && $request['event_type'] === 'support.source_heartbeats.updated'
            && $request['payload']['available'] === true
            && $request['payload']['sources'][0]['source_relay_hub_id'] === '072217029');
    }

    public function test_source_heartbeat_realtime_publish_failure_does_not_break_proxy_response(): void
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
                    ]],
                ],
            ]),
            'realtime.pbb.ph/api/v1/events/publish' => Http::response([
                'status' => 'rejected',
                'reason' => 'room-not-allowed',
            ], 403),
        ]);

        $this->actingAs(User::factory()->create())
            ->getJson('/api/source-heartbeats?hours=48')
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.sources.0.status', 'online');
    }
}
