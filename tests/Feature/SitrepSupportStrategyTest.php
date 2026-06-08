<?php

namespace Tests\Feature;

use App\Models\ConsolidatedSitrep;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SitrepSupportStrategyTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_access_current_sitrep_support_strategy(): void
    {
        $this->getJson('/api/sitreps/current/support')
            ->assertUnauthorized();
    }

    public function test_current_sitrep_support_strategy_returns_unavailable_without_current_sitrep(): void
    {
        $this->actingAs(User::factory()->create());

        $this->getJson('/api/sitreps/current/support')
            ->assertOk()
            ->assertJsonPath('data.available', false)
            ->assertJsonPath('data.sitrep_id', null)
            ->assertJsonPath('data.strategy', null);
    }

    public function test_current_sitrep_support_strategy_tolerates_sparse_payload(): void
    {
        $this->actingAs(User::factory()->create());

        ConsolidatedSitrep::query()->create([
            'status' => ConsolidatedSitrep::STATUS_CURRENT,
            'alert_level' => 'Normal',
            'computed_source_alert_level' => 'Normal',
            'source_sitrep_count' => 1,
            'sitrep_payload' => [
                'title' => 'Sparse SITREP',
                'generated_at' => '2026-06-09T01:00:00+08:00',
                'coverage_area' => 'CEBU CITY, CEBU',
                'coverage_level' => 'city',
            ],
            'source_index' => [],
            'validation_issues' => [],
            'consolidated_at' => now(),
        ]);

        $this->getJson('/api/sitreps/current/support')
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.coverage_area', 'CEBU CITY, CEBU')
            ->assertJsonStructure([
                'data' => [
                    'strategy' => [
                        'priorities',
                        'packages',
                        'decisions',
                        'matching',
                        'clarifications',
                        'commitments',
                    ],
                ],
            ])
            ->assertJsonPath('data.strategy.commitments', []);
    }

    public function test_current_sitrep_support_strategy_derives_recommendations_from_payload(): void
    {
        $this->actingAs(User::factory()->create());

        ConsolidatedSitrep::query()->create([
            'status' => ConsolidatedSitrep::STATUS_CURRENT,
            'alert_level' => 'Normal',
            'computed_source_alert_level' => 'Critical',
            'source_sitrep_count' => 1,
            'sitrep_payload' => $this->consolidatedPayload(),
            'source_index' => [],
            'validation_issues' => [],
            'consolidated_at' => now(),
        ]);

        $response = $this->getJson('/api/sitreps/current/support')
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.source_generated_at', '2026-06-09T01:00:00+08:00')
            ->assertJsonPath('data.strategy.priorities.0.source_hub_id', '13')
            ->assertJsonPath('data.strategy.priorities.0.priority_level', 'critical')
            ->assertJsonPath('data.strategy.packages.0.title', 'Rescue / Evacuation Support')
            ->assertJsonPath('data.strategy.matching.0.availability_status', 'availability unknown')
            ->assertJsonPath('data.strategy.matching.0.available', null)
            ->assertJsonPath('data.strategy.commitments', []);

        $strategy = $response->json('data.strategy');
        $this->assertNotEmpty($strategy['decisions']);
        $this->assertNotEmpty($strategy['clarifications']);

        foreach (['priorities', 'packages', 'decisions', 'matching', 'clarifications'] as $section) {
            foreach ($strategy[$section] as $card) {
                $this->assertTrue(
                    ! empty($card['based_on']) || ! empty($card['evidence_refs']),
                    sprintf('Strategy card in [%s] is missing based_on/evidence_refs.', $section),
                );
            }
        }
    }

    public function test_current_sitrep_support_strategy_uses_selected_need_source_path_for_evidence_refs(): void
    {
        $this->actingAs(User::factory()->create());

        $payload = $this->consolidatedPayload();
        unset($payload['needs']['rollup']['category_demand']);
        $payload['needs']['rollup']['category_groups'] = [
            [
                'category' => 'Heavy Equipment / Clearing',
                'quantity_requested' => 44,
            ],
        ];

        ConsolidatedSitrep::query()->create([
            'status' => ConsolidatedSitrep::STATUS_CURRENT,
            'alert_level' => 'Normal',
            'computed_source_alert_level' => 'Critical',
            'source_sitrep_count' => 1,
            'sitrep_payload' => $payload,
            'source_index' => [],
            'validation_issues' => [],
            'consolidated_at' => now(),
        ]);

        $this->getJson('/api/sitreps/current/support')
            ->assertOk()
            ->assertJsonPath('data.strategy.matching.0.evidence_refs.0', 'needs.rollup.category_groups[0]');
    }

    public function test_current_sitrep_support_strategy_matches_relay_hub_only_source_identity(): void
    {
        $this->actingAs(User::factory()->create());

        $payload = $this->consolidatedPayload();
        $payload['summary']['items'][0]['location'] = [
            'name' => 'Apas, Cebu City, Cebu',
            'deployment' => 'barangay',
            'relay_hub_id' => 'relay-apas',
        ];
        $payload['situation']['items'][0]['location'] = [
            'relay_hub_id' => 'relay-apas',
        ];
        $payload['population']['items'][0]['location'] = [
            'relay_hub_id' => 'relay-apas',
        ];
        $payload['needs']['items'][0]['location'] = [
            'relay_hub_id' => 'relay-apas',
        ];
        $payload['source_snapshot']['rollup']['hub_nodes'][0] = [
            'source_relay_hub_id' => 'relay-apas',
            'snapshot' => [
                'relay_hub_id' => 'relay-apas',
                'name' => 'Apas, Cebu City, Cebu',
                'deployment' => 'barangay',
                'brgy_code' => '072217017',
                'citymun_code' => '072217',
            ],
        ];
        $payload['source_snapshot']['rollup']['source_sitreps'][0] = [
            'source_relay_hub_id' => 'relay-apas',
            'alert_level' => 'Critical',
        ];

        ConsolidatedSitrep::query()->create([
            'status' => ConsolidatedSitrep::STATUS_CURRENT,
            'alert_level' => 'Normal',
            'computed_source_alert_level' => 'Critical',
            'source_sitrep_count' => 1,
            'sitrep_payload' => $payload,
            'source_index' => [],
            'validation_issues' => [],
            'consolidated_at' => now(),
        ]);

        $this->getJson('/api/sitreps/current/support')
            ->assertOk()
            ->assertJsonPath('data.strategy.priorities.0.source_hub_id', 'relay-apas')
            ->assertJsonPath('data.strategy.priorities.0.source_relay_hub_id', 'relay-apas')
            ->assertJsonPath('data.strategy.priorities.0.priority_level', 'critical')
            ->assertJsonPath('data.strategy.priorities.0.based_on.0', '14 open reports');
    }

    /**
     * @return array<string, mixed>
     */
    private function consolidatedPayload(): array
    {
        return [
            'schema_version' => 2,
            'title' => 'Consolidated City SITREP',
            'coverage_area' => 'CEBU CITY, CEBU',
            'coverage_level' => 'city',
            'generated_at' => '2026-06-09T01:00:00+08:00',
            'alert_level' => 'Normal',
            'summary' => [
                'rollup' => [],
                'items' => [
                    [
                        'location' => [
                            'id' => '13',
                            'name' => 'Apas, Cebu City, Cebu',
                            'deployment' => 'barangay',
                            'relay_hub_id' => '072217017',
                        ],
                        'data' => [
                            'dominant_incident_type' => 'Rescue',
                            'supporting_metrics' => [
                                'open_reports' => 14,
                                'resource_need_units' => 58,
                            ],
                            'gap_cards' => [
                                ['title' => 'Access constraints reported'],
                            ],
                        ],
                    ],
                ],
            ],
            'situation' => [
                'rollup' => [
                    'concern_groups' => [
                        [
                            'concern' => 'Flood, Rescue, and Displacement',
                            'open_reports' => 14,
                            'resource_units' => 85,
                            'areas' => ['Apas'],
                        ],
                    ],
                ],
                'items' => [
                    [
                        'location' => ['id' => '13'],
                        'data' => [
                            'current_operating_picture' => [
                                'active_reports' => 10,
                                'current_assignments' => 4,
                            ],
                        ],
                    ],
                ],
            ],
            'population' => [
                'rollup' => [
                    'numeric_total_note' => 'Population counts may overlap across source systems.',
                ],
                'items' => [
                    [
                        'location' => ['id' => '13'],
                        'data' => [
                            'people_at_risk' => 20,
                        ],
                    ],
                ],
            ],
            'needs' => [
                'rollup' => [
                    'category_demand' => [
                        [
                            'category' => 'Rescue and Extraction',
                            'quantity_requested' => 58,
                            'location_count' => 1,
                        ],
                        [
                            'category' => 'Heavy Equipment / Clearing',
                            'quantity_requested' => 44,
                            'location_count' => 1,
                        ],
                    ],
                ],
                'items' => [
                    [
                        'location' => ['id' => '13'],
                        'data' => [
                            'items' => [
                                [
                                    'resource' => 'Rescue team',
                                    'quantity_requested' => 58,
                                ],
                            ],
                        ],
                    ],
                ],
            ],
            'gaps' => [
                'rollup' => [
                    'items' => [
                        [
                            'title' => 'Route access verification',
                            'body' => 'SITREP reports blocked and limited routes near the evacuation path.',
                            'category' => 'Route / access',
                        ],
                    ],
                ],
            ],
            'source_snapshot' => [
                'rollup' => [
                    'hub_nodes' => [
                        [
                            'source_hub_id' => '13',
                            'source_relay_hub_id' => '072217017',
                            'snapshot' => [
                                'hub_id' => '13',
                                'relay_hub_id' => '072217017',
                                'name' => 'Apas, Cebu City, Cebu',
                                'deployment' => 'barangay',
                                'brgy_code' => '072217017',
                                'citymun_code' => '072217',
                                'snapshot_at' => '2026-06-09T00:45:00+08:00',
                            ],
                        ],
                    ],
                    'source_sitreps' => [
                        [
                            'source_hub_id' => '13',
                            'alert_level' => 'Critical',
                        ],
                    ],
                ],
            ],
        ];
    }
}
