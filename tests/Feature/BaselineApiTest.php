<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use App\Support\Settings\SupportSettings;
use Tests\TestCase;

class BaselineApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_bootstrap_returns_session_baseline_payload(): void
    {
        Cache::forget('relay.hub_identity');
        Http::fake([
            'relay.pbb.ph/hub.json' => Http::response([
                'base_url' => 'https://hub.pbb.ph',
                'hub_id' => 12,
                'relay_hub_id' => '072217029',
                'name' => 'Guadalupe, CEBU CITY, CEBU',
                'deployment' => 'barangay',
                'domain' => 'guadalupe-cebu-cebu.pbb.ph',
                'status' => 'active',
                'uplinks' => [
                    [
                        'id' => 29,
                        'uplink_domain' => 'cebu-cebu.pbb.ph',
                        'is_primary' => true,
                    ],
                ],
                'sources' => [],
            ], 200),
        ]);

        $response = $this->getJson('/api/bootstrap');

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.app.name', 'PBB Support System')
            ->assertJsonPath('data.auth.authenticated', false)
            ->assertJsonPath('data.hub.available', true)
            ->assertJsonPath('data.hub.data.relay_hub_id', '072217029')
            ->assertJsonPath('data.hub.data.uplinks.0.uplink_domain', 'cebu-cebu.pbb.ph')
            ->assertJsonPath('data.settings.relayTargetSystem', 'sitrep.ingestor')
            ->assertJsonPath('data.settings.consolidationCadenceMinutes', 15)
            ->assertJsonStructure([
                'data' => [
                    'security' => ['csrfToken', 'sessionLifetimeMinutes', 'touched_at'],
                ],
            ]);
    }

    public function test_admin_can_login_fetch_user_update_account_and_logout(): void
    {
        User::factory()->create([
            'name' => 'Support Admin',
            'email' => 'admin@support.pbb.ph',
            'role' => 'admin',
            'password' => 'password',
        ]);

        $this->postJson('/api/login', [
            'email' => 'admin@support.pbb.ph',
            'password' => 'password',
        ])
            ->assertOk()
            ->assertJsonPath('data.account.email', 'admin@support.pbb.ph')
            ->assertJsonPath('data.account.role', 'admin');

        $this->getJson('/api/user')
            ->assertOk()
            ->assertJsonPath('data.account.name', 'Support Admin');

        $this->postJson('/api/user', [
            'name' => 'Support Lead',
            'email' => 'lead@support.pbb.ph',
        ])
            ->assertOk()
            ->assertJsonPath('data.account.name', 'Support Lead')
            ->assertJsonPath('data.account.email', 'lead@support.pbb.ph');

        $this->postJson('/api/logout')->assertOk();
        $this->getJson('/api/user')->assertUnauthorized();
    }

    public function test_authenticated_session_ping_returns_csrf_and_touch_timestamp(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/session/ping')
            ->assertOk()
            ->assertJsonPath('data.account.email', $user->email)
            ->assertJsonStructure([
                'data' => ['account', 'csrf_token', 'touched_at'],
            ]);
    }

    public function test_source_heartbeat_proxy_uses_configured_relay_credentials(): void
    {
        app(SupportSettings::class)->update([
            'relayUrl' => 'https://relay.pbb.ph',
            'sitrepRelayToken' => 'sitrep-relay-secret',
            'supportRequestRelayToken' => 'support-request-relay-secret',
        ]);

        Http::fake([
            'relay.pbb.ph/api/v1/source-heartbeats*' => Http::response([
                'data' => [
                    'sources' => [
                        [
                            'source_hub_id' => 13,
                            'source_relay_hub_id' => '072217029',
                            'status' => 'online',
                            'last_seen_at' => '2026-06-08T08:00:00+08:00',
                            'age_seconds' => 45,
                            'history' => [
                                [
                                    'bucket_started_at' => '2026-06-08T07:00:00+08:00',
                                    'expected_count' => 12,
                                    'received_count' => 12,
                                    'status' => 'ok',
                                ],
                            ],
                        ],
                    ],
                ],
            ]),
        ]);

        $this->actingAs(User::factory()->create())
            ->getJson('/api/source-heartbeats?hours=48')
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.sources.0.source_relay_hub_id', '072217029')
            ->assertJsonMissing(['sitrep-relay-secret']);

        Http::assertSent(fn ($request): bool => $request->hasHeader('X-Relay-Key', 'sitrep-relay-secret')
            && str_contains($request->url(), '/api/v1/source-heartbeats')
            && str_contains($request->url(), 'hours=48'));
    }

    public function test_authenticated_user_can_change_password(): void
    {
        $user = User::factory()->create([
            'password' => 'old-password',
        ]);

        $this->actingAs($user)
            ->postJson('/api/user/password', [
                'current_password' => 'old-password',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])
            ->assertOk();

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'new-password',
        ])->assertOk();
    }

    public function test_admin_can_persist_support_settings(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
        ]);

        $this->actingAs($admin)
            ->postJson('/api/settings', [
                'alert_level' => 'Critical',
                'sitrep_cadence' => 30,
                'relay_url' => 'https://relay.pbb.ph',
                'sitrep_relay_token' => 'sitrep-relay-secret',
                'support_request_relay_token' => 'support-request-relay-secret',
                'realtime_url' => 'https://realtime.pbb.ph',
                'realtime_client_code' => 'client-code',
                'server_project_code' => 'server-code',
                'admin_project_code' => 'admin-code',
                'realtime_backend_ingress_secret' => 'ingress-secret',
                'realtime_token_signing_secret' => 'token-signing-secret',
                'source_heartbeat_webhook_token' => 'heartbeat-webhook-secret',
            ])
            ->assertOk()
            ->assertJsonPath('data.settings.alertLevel', 'Critical')
            ->assertJsonPath('data.settings.consolidationCadenceMinutes', 30)
            ->assertJsonPath('data.settings.sitrepRelayToken', 'sitrep-relay-secret')
            ->assertJsonPath('data.settings.supportRequestRelayToken', 'support-request-relay-secret')
            ->assertJsonPath('data.settings.realtimeBackendIngressSecret', 'ingress-secret')
            ->assertJsonMissing(['token-signing-secret', 'heartbeat-webhook-secret']);

        $this->assertSame('token-signing-secret', app(SupportSettings::class)->all()['realtimeTokenSigningSecret']);
        $this->assertSame('heartbeat-webhook-secret', app(SupportSettings::class)->all()['sourceHeartbeatWebhookToken']);

        $this->actingAs($admin)
            ->getJson('/api/bootstrap')
            ->assertOk()
            ->assertJsonPath('data.settings.alertLevel', 'Critical')
            ->assertJsonPath('data.settings.consolidationCadenceMinutes', 30)
            ->assertJsonPath('data.settings.realtimeClientCode', 'client-code')
            ->assertJsonMissing(['token-signing-secret', 'heartbeat-webhook-secret']);
    }

    public function test_non_admin_cannot_update_support_settings(): void
    {
        $user = User::factory()->create([
            'role' => 'operator',
        ]);

        $this->actingAs($user)
            ->postJson('/api/settings', [
                'alert_level' => 'Elevated',
                'sitrep_cadence' => 15,
                'relay_url' => 'https://relay.pbb.ph',
                'realtime_url' => 'https://realtime.pbb.ph',
            ])
            ->assertForbidden();
    }

    public function test_admin_can_manage_users(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
        ]);

        $this->actingAs($admin)
            ->postJson('/api/admin/users', [
                'name' => 'Support Operator',
                'email' => 'operator@support.pbb.ph',
                'role' => 'operator',
                'password' => 'operator-password',
            ])
            ->assertCreated()
            ->assertJsonPath('data.user.email', 'operator@support.pbb.ph')
            ->assertJsonPath('data.user.role', 'operator');

        $operator = User::query()->where('email', 'operator@support.pbb.ph')->firstOrFail();

        $this->actingAs($admin)
            ->getJson('/api/admin/users')
            ->assertOk()
            ->assertJsonFragment([
                'email' => 'operator@support.pbb.ph',
                'role' => 'operator',
            ]);

        $this->actingAs($admin)
            ->postJson('/api/admin/users/'.$operator->id, [
                'name' => 'Support Duty Officer',
                'email' => 'duty@support.pbb.ph',
                'role' => 'admin',
                'password' => '',
            ])
            ->assertOk()
            ->assertJsonPath('data.user.email', 'duty@support.pbb.ph')
            ->assertJsonPath('data.user.role', 'admin');

        $this->actingAs($admin)
            ->deleteJson('/api/admin/users/'.$operator->id)
            ->assertOk();

        $this->assertDatabaseMissing('users', [
            'id' => $operator->id,
        ]);
    }

    public function test_non_admin_cannot_manage_users(): void
    {
        $operator = User::factory()->create([
            'role' => 'operator',
        ]);

        $this->actingAs($operator)
            ->getJson('/api/admin/users')
            ->assertForbidden();

        $this->actingAs($operator)
            ->postJson('/api/admin/users', [
                'name' => 'Blocked User',
                'email' => 'blocked@support.pbb.ph',
                'role' => 'operator',
                'password' => 'blocked-password',
            ])
            ->assertForbidden();
    }

    public function test_admin_user_management_protects_self_and_last_admin(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
        ]);

        $this->actingAs($admin)
            ->deleteJson('/api/admin/users/'.$admin->id)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('user');

        $this->actingAs($admin)
            ->postJson('/api/admin/users/'.$admin->id, [
                'name' => $admin->name,
                'email' => $admin->email,
                'role' => 'operator',
                'password' => '',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');
    }
}
