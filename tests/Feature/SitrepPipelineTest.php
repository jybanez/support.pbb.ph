<?php

namespace Tests\Feature;

use App\Models\ConsolidatedSitrep;
use App\Models\RelayInboundSitrep;
use App\Models\SitrepRelayDelivery;
use App\Models\SitrepStaging;
use App\Models\User;
use App\Support\Settings\SupportSettings;
use App\Support\Sitreps\SitrepConsolidationService;
use App\Support\Sitreps\SitrepRelaySubmissionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SitrepPipelineTest extends TestCase
{
    use RefreshDatabase;

    public function test_relay_sitrep_handler_requires_configured_bearer_token(): void
    {
        $this->postJson('/api/relay/sitreps', [
            'event' => 'relay.message.received',
            'message' => [
                'message_type' => 'sitrep.record',
                'payload' => $this->sitrepPayload(),
            ],
        ])->assertUnauthorized();
    }

    public function test_relay_sitrep_handler_stages_valid_sitrep_latest_by_hub(): void
    {
        app(SupportSettings::class)->update([
            'relayHandlerToken' => 'handler-secret',
        ]);

        $this->postJson('/api/relay/sitreps', [
            'event' => 'relay.message.received',
            'message' => [
                'id' => 100,
                'relay_id' => '01HZ0000000000000000000001',
                'source_hub_id' => 'relay-source-1',
                'source_system' => 'sitrep.app',
                'message_type' => 'sitrep.record',
                'priority' => 'urgent',
                'payload' => $this->sitrepPayload([
                    'sequence_number' => 1,
                    'alert_level' => 'Critical',
                ]),
            ],
        ], [
            'Authorization' => 'Bearer handler-secret',
        ])
            ->assertCreated()
            ->assertJsonPath('data.validation_status', RelayInboundSitrep::STATUS_STAGED)
            ->assertJsonPath('data.staging.source_hub_id', '12');

        $this->postJson('/api/relay/sitreps', [
            'event' => 'relay.message.received',
            'message' => [
                'id' => 101,
                'relay_id' => '01HZ0000000000000000000002',
                'source_hub_id' => 'relay-source-1',
                'source_system' => 'sitrep.app',
                'message_type' => 'sitrep.record',
                'payload' => $this->sitrepPayload([
                    'sequence_number' => 2,
                    'summary' => ['overview' => 'Updated source SITREP'],
                ]),
            ],
        ], [
            'Authorization' => 'Bearer handler-secret',
        ])->assertCreated();

        $this->assertDatabaseCount('relay_inbound_sitreps', 2);
        $this->assertDatabaseCount('sitrep_stagings', 1);

        $staging = SitrepStaging::query()->firstOrFail();
        $this->assertSame(2, $staging->sitrep_payload['sequence_number']);
        $this->assertSame('Updated source SITREP', $staging->sitrep_payload['summary']['overview']);
    }

    public function test_relay_sitrep_handler_retains_invalid_inbound_for_inspection(): void
    {
        app(SupportSettings::class)->update([
            'relayHandlerToken' => 'handler-secret',
        ]);

        $this->postJson('/api/relay/sitreps', [
            'event' => 'relay.message.received',
            'message' => [
                'relay_id' => '01HZ0000000000000000000003',
                'source_system' => 'sitrep.app',
                'message_type' => 'sitrep.record',
                'payload' => [
                    'title' => 'Missing required SITREP metadata',
                ],
            ],
        ], [
            'Authorization' => 'Bearer handler-secret',
        ])
            ->assertAccepted()
            ->assertJsonPath('data.validation_status', RelayInboundSitrep::STATUS_INVALID);

        $inbound = RelayInboundSitrep::query()->firstOrFail();
        $this->assertSame(RelayInboundSitrep::STATUS_INVALID, $inbound->validation_status);
        $this->assertNotEmpty($inbound->validation_issues);
        $this->assertSame('Missing required SITREP metadata', $inbound->sitrep_payload['title']);
    }

    public function test_consolidation_uses_manual_local_alert_level(): void
    {
        Cache::forget('relay.hub_identity_for_consolidation');
        Http::fake([
            'relay.pbb.ph/hub.json' => Http::response([
                'hub_id' => 99,
                'name' => 'Support City',
                'deployment' => 'city',
                'uplinks' => [],
                'sources' => [],
            ]),
        ]);

        app(SupportSettings::class)->update([
            'relayHandlerToken' => 'handler-secret',
            'alertLevel' => 'Normal',
        ]);

        $this->postJson('/api/relay/sitreps', [
            'event' => 'relay.message.received',
            'message' => [
                'relay_id' => '01HZ0000000000000000000004',
                'source_system' => 'sitrep.app',
                'message_type' => 'sitrep.record',
                'payload' => $this->sitrepPayload([
                    'alert_level' => 'Critical',
                ]),
            ],
        ], [
            'Authorization' => 'Bearer handler-secret',
        ])->assertCreated();

        $consolidated = app(SitrepConsolidationService::class)->consolidate();

        $this->assertSame(ConsolidatedSitrep::STATUS_CURRENT, $consolidated->status);
        $this->assertSame('Normal', $consolidated->alert_level);
        $this->assertSame('Critical', $consolidated->computed_source_alert_level);
        $this->assertSame('Normal', $consolidated->sitrep_payload['alert_level']);
        $this->assertSame('Critical', $consolidated->sitrep_payload['source_snapshot']['rollup']['local_policy']['computed_source_alert_level']);
    }

    public function test_submits_latest_consolidated_sitrep_to_relay_with_hotline_envelope_pattern(): void
    {
        Cache::forget('relay.hub_identity_for_outbound');
        Http::fake([
            'relay.pbb.ph/hub.json' => Http::response([
                'hub_id' => 99,
                'name' => 'Support City',
                'deployment' => 'city',
                'uplinks' => [
                    [
                        'hub' => [
                            'id' => 'upstream-city',
                            'name' => 'Upstream City',
                        ],
                    ],
                ],
            ]),
            'relay.pbb.ph/api/v1/messages' => Http::response([
                'success' => true,
                'relay_id' => '01HZUPSTREAM00000000000001',
                'message_id' => 321,
                'deliveries_count' => 1,
            ], 201),
        ]);

        app(SupportSettings::class)->update([
            'relayUrl' => 'https://relay.pbb.ph',
            'sitrepRelayToken' => 'sitrep-relay-secret',
            'supportRequestRelayToken' => 'support-request-relay-secret',
            'relayTargetSystem' => 'sitrep.ingestor',
        ]);

        $consolidated = ConsolidatedSitrep::query()->create([
            'status' => ConsolidatedSitrep::STATUS_CURRENT,
            'alert_level' => 'Elevated',
            'computed_source_alert_level' => 'Critical',
            'source_sitrep_count' => 1,
            'sitrep_payload' => $this->sitrepPayload([
                'alert_level' => 'Elevated',
            ]),
            'source_index' => [],
            'validation_issues' => [],
            'consolidated_at' => now(),
        ]);

        SitrepRelayDelivery::query()->create([
            'consolidated_sitrep_id' => $consolidated->id,
            'status' => SitrepRelayDelivery::STATUS_PENDING,
        ]);

        $delivery = app(SitrepRelaySubmissionService::class)->submitLatest();

        $this->assertSame(SitrepRelayDelivery::STATUS_SENT, $delivery->status);
        $this->assertSame('01HZUPSTREAM00000000000001', $delivery->relay_id);
        $this->assertSame('321', $delivery->relay_message_id);
        $this->assertSame(1, $delivery->deliveries_count);

        Http::assertSent(function ($request): bool {
            $payload = $request->data();

            return $request->url() === 'https://relay.pbb.ph/api/v1/messages'
                && $request->hasHeader('X-Relay-Key', 'sitrep-relay-secret')
                && $payload['source_system'] === 'sitrep.ingestor'
                && $payload['message_type'] === 'sitrep.record'
                && $payload['payload_format'] === 'json'
                && $payload['payload_version'] === '1.0'
                && $payload['reference_type'] === 'consolidated_sitrep'
                && $payload['priority'] === 'high'
                && $payload['targets'] === [
                    ['id' => 'upstream-city', 'systems' => ['sitrep.ingestor']],
                ];
        });
    }

    public function test_current_sitrep_api_returns_map_points_from_incident_coordinates(): void
    {
        $this->actingAs(User::factory()->create([
            'role' => 'admin',
        ]));

        ConsolidatedSitrep::query()->create([
            'status' => ConsolidatedSitrep::STATUS_CURRENT,
            'alert_level' => 'Normal',
            'computed_source_alert_level' => 'Elevated',
            'source_sitrep_count' => 1,
            'sitrep_payload' => $this->sitrepPayload([
                'source_snapshot' => [
                    'rollup' => [
                        'hub_nodes' => [
                            [
                                'snapshot' => [
                                    'hub_id' => '12',
                                    'name' => 'Guadalupe, CEBU CITY, CEBU',
                                    'deployment_label' => 'Barangay Guadalupe',
                                    'deployment' => 'barangay',
                                    'brgy_code' => '072217029',
                                    'citymun_code' => '072217',
                                    'snapshot_at' => '2026-06-06T08:30:00+08:00',
                                ],
                            ],
                        ],
                        'source_sitreps' => [
                            [
                                'source_hub_id' => '12',
                                'alert_level' => 'Critical',
                            ],
                        ],
                        'incident_coordinates' => [
                            [
                                'id' => 234,
                                'lat' => 10.31573,
                                'lng' => 123.89041,
                                'source_hub_id' => '12',
                            ],
                        ],
                    ],
                ],
            ]),
            'source_index' => [],
            'validation_issues' => [],
            'consolidated_at' => now(),
        ]);

        $this->getJson('/api/sitreps/current')
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.identity.name', 'Barangay Source')
            ->assertJsonPath('data.sections.0.id', 'summary')
            ->assertJsonPath('data.sources.0.name', 'Guadalupe, CEBU CITY, CEBU')
            ->assertJsonPath('data.sources.0.subtitle', 'Barangay Guadalupe')
            ->assertJsonPath('data.sources.0.alert_level', 'Critical')
            ->assertJsonPath('data.sources.0.snapshot_at', '2026-06-06T08:30:00+08:00')
            ->assertJsonPath('data.sources.0.boundary.url', 'https://mapserver.pbb.ph/boundaries/barangay/072217029.geojson')
            ->assertJsonPath('data.context_boundary.url', 'https://mapserver.pbb.ph/boundaries/city/072217.geojson')
            ->assertJsonPath('data.map_points.0.id', '234')
            ->assertJsonPath('data.map_points.0.lat', 10.31573)
            ->assertJsonPath('data.map_points.0.lng', 123.89041)
            ->assertJsonPath('data.map_points.0.source_hub_id', '12')
            ->assertJsonPath('data.map_points.0.source_hub_name', 'Guadalupe, CEBU CITY, CEBU');
    }

    public function test_support_map_config_uses_current_sitrep_hub_node_for_boundary(): void
    {
        ConsolidatedSitrep::query()->create([
            'status' => ConsolidatedSitrep::STATUS_CURRENT,
            'alert_level' => 'Normal',
            'computed_source_alert_level' => 'Normal',
            'source_sitrep_count' => 1,
            'sitrep_payload' => $this->sitrepPayload([
                'source_snapshot' => [
                    'hub_node' => [
                        'snapshot' => [
                            'name' => 'CEBU CITY, CEBU',
                            'deployment' => 'city',
                            'citymun_code' => '072217',
                        ],
                    ],
                ],
            ]),
            'source_index' => [],
            'validation_issues' => [],
            'consolidated_at' => now(),
        ]);

        $this->getJson('/support-map.json')
            ->assertOk()
            ->assertJsonPath('map.boundary.enabled', true)
            ->assertJsonPath('map.boundary.scope', 'city')
            ->assertJsonPath('map.boundary.code', '072217')
            ->assertJsonPath('map.boundary.url', 'https://mapserver.pbb.ph/boundaries/city/072217.geojson')
            ->assertJsonPath('map.boundary.source', 'source_snapshot.hub_node');
    }

    public function test_support_map_config_falls_back_to_current_sitrep_rollup_hub_node_boundary(): void
    {
        ConsolidatedSitrep::query()->create([
            'status' => ConsolidatedSitrep::STATUS_CURRENT,
            'alert_level' => 'Normal',
            'computed_source_alert_level' => 'Normal',
            'source_sitrep_count' => 1,
            'sitrep_payload' => [
                'source_snapshot' => [
                    'rollup' => [
                        'hub_node' => [
                            'snapshot' => [
                                'name' => 'CEBU CITY, CEBU',
                                'deployment' => 'city',
                                'citymun_code' => '072217',
                            ],
                        ],
                    ],
                ],
            ],
            'source_index' => [],
            'validation_issues' => [],
            'consolidated_at' => now(),
        ]);

        $this->getJson('/support-map.json')
            ->assertOk()
            ->assertJsonPath('map.boundary.enabled', true)
            ->assertJsonPath('map.boundary.scope', 'city')
            ->assertJsonPath('map.boundary.code', '072217')
            ->assertJsonPath('map.boundary.url', 'https://mapserver.pbb.ph/boundaries/city/072217.geojson')
            ->assertJsonPath('map.boundary.source', 'source_snapshot.rollup.hub_node');
    }

    public function test_outbound_latest_only_skips_superseded_delivery(): void
    {
        app(SupportSettings::class)->update([
            'relayUrl' => 'https://relay.pbb.ph',
            'relayToken' => 'relay-secret',
        ]);

        $old = ConsolidatedSitrep::query()->create([
            'status' => ConsolidatedSitrep::STATUS_SUPERSEDED,
            'alert_level' => 'Normal',
            'computed_source_alert_level' => 'Normal',
            'source_sitrep_count' => 1,
            'sitrep_payload' => $this->sitrepPayload(),
            'consolidated_at' => now()->subMinute(),
        ]);

        $delivery = SitrepRelayDelivery::query()->create([
            'consolidated_sitrep_id' => $old->id,
            'status' => SitrepRelayDelivery::STATUS_PENDING,
        ]);

        $result = app(SitrepRelaySubmissionService::class)->submit($delivery);

        $this->assertSame(SitrepRelayDelivery::STATUS_SUPERSEDED, $result->status);
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function sitrepPayload(array $overrides = []): array
    {
        return array_replace_recursive([
            'title' => 'Barangay SITREP',
            'coverage_area' => 'Barangay Source',
            'coverage_level' => 'barangay',
            'sequence_number' => 1,
            'period_started_at' => '2026-05-30T00:00:00+08:00',
            'period_ended_at' => '2026-05-30T01:00:00+08:00',
            'generated_at' => '2026-05-30T01:05:00+08:00',
            'alert_level' => 'Elevated',
            'summary' => [
                'overview' => 'Source SITREP overview',
            ],
            'situation' => [],
            'damage' => [],
            'population' => [],
            'actions' => [],
            'needs' => [],
            'gaps' => [],
            'source_snapshot' => [
                'hub_node' => [
                    'snapshot' => [
                        'hub_id' => 12,
                        'relay_hub_id' => '072217029',
                        'name' => 'Barangay Source',
                        'deployment' => 'barangay',
                    ],
                ],
            ],
        ], $overrides);
    }
}
