<?php

namespace Tests\Feature;

use App\Models\ConsolidatedSitrep;
use App\Models\User;
use App\Support\Settings\SupportSettings;
use App\Support\Sitreps\CurrentSitrepMediaService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SitrepMediaAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_current_sitrep_media_endpoint_returns_local_support_urls(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $this->createCurrentSitrep();

        $this->getJson('/api/sitreps/current/media')
            ->assertOk()
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.media_refs.0.kind', 'incident_media')
            ->assertJsonPath('data.media_refs.0.source_hub_id', '13')
            ->assertJsonPath('data.media_refs.0.local_url', '/media/13/593/incident_media/citizen_photo/501')
            ->assertJsonPath('data.media_refs.0.cache_key', '13:593:incident_media:501');

        $this->getJson('/api/sitreps/current')
            ->assertOk()
            ->assertJsonPath('data.media_refs.0.local_url', '/media/13/593/incident_media/citizen_photo/501');
    }

    public function test_media_refs_can_span_multiple_source_hubs(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $this->createCurrentSitrep();

        $this->getJson('/api/sitreps/current/media')
            ->assertOk()
            ->assertJsonCount(2, 'data.media_refs')
            ->assertJsonPath('data.media_refs.0.source_hub_id', '13')
            ->assertJsonPath('data.media_refs.0.local_url', '/media/13/593/incident_media/citizen_photo/501')
            ->assertJsonPath('data.media_refs.1.source_hub_id', '14')
            ->assertJsonPath('data.media_refs.1.local_url', '/media/14/605/message_attachment/70/701');
    }

    public function test_media_sdk_config_uses_relay_relationship_resolution(): void
    {
        app(SupportSettings::class)->update([
            'sitrepRelayToken' => 'sitrep-relay-client-token',
            'supportRequestRelayToken' => 'support-request-relay-client-token',
            'supportRequestUpdateSourceSystem' => 'support.dispatch',
        ]);

        $current = $this->createCurrentSitrep();
        $config = app(CurrentSitrepMediaService::class)->sdkConfig($current->sitrep_payload);

        $this->assertSame('sitrep-relay-client-token', $config['relay_token'] ?? null);
        $this->assertSame('support.dispatch', $config['source_system'] ?? null);
        $this->assertSame('11', $config['source_hub_id'] ?? null);
        $this->assertArrayNotHasKey('token', $config);
        $this->assertArrayNotHasKey('source_hubs', $config);
    }

    public function test_support_settings_do_not_expose_legacy_hotline_media_token(): void
    {
        $settings = app(SupportSettings::class);

        $settings->update([
            'relayToken' => 'relay-client-token',
            'hotlineMediaAccessToken' => 'legacy-static-token',
        ]);

        $this->assertArrayNotHasKey('hotlineMediaAccessToken', $settings->all());
    }

    public function test_local_media_route_streams_cached_current_sitrep_media(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $this->createCurrentSitrep();
        $this->seedCachedMedia('13:593:incident_media:501', 'incident-photo.jpg', 'image/jpeg');

        $this->get('/media/13/593/incident_media/citizen_photo/501')
            ->assertOk()
            ->assertHeader('Content-Type', 'image/jpeg')
            ->assertHeader('X-Hotline-Media-Cache', 'hit');
    }

    public function test_local_media_route_rejects_refs_not_in_current_sitrep(): void
    {
        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $this->createCurrentSitrep();
        $this->seedCachedMedia('13:594:incident_media:999', 'other.jpg', 'image/jpeg');

        $this->get('/media/13/594/incident_media/citizen_photo/999')
            ->assertNotFound();
    }

    private function createCurrentSitrep(): ConsolidatedSitrep
    {
        return ConsolidatedSitrep::query()->create([
            'status' => ConsolidatedSitrep::STATUS_CURRENT,
            'alert_level' => 'Normal',
            'computed_source_alert_level' => 'Normal',
            'source_sitrep_count' => 1,
            'sitrep_payload' => [
                'title' => 'Current SITREP',
                'generated_at' => '2026-06-20T08:30:00+08:00',
                'source_snapshot' => [
                    'rollup' => [
                        'hub_node' => [
                            'snapshot' => [
                                'hub_id' => '11',
                                'name' => 'Cebu City',
                                'deployment' => 'city',
                            ],
                        ],
                        'hub_nodes' => [
                            [
                                'snapshot' => [
                                    'hub_id' => '13',
                                    'name' => 'Barangay Apas',
                                    'deployment' => 'barangay',
                                    'domain' => 'apas-cebu-cebu.pbb.ph',
                                ],
                            ],
                            [
                                'snapshot' => [
                                    'hub_id' => '14',
                                    'name' => 'Barangay Lahug',
                                    'deployment' => 'barangay',
                                    'domain' => 'lahug-cebu-cebu.pbb.ph',
                                ],
                            ],
                        ],
                        'media_refs' => [
                            [
                                'kind' => 'incident_media',
                                'source_hub_id' => '13',
                                'incident_id' => 593,
                                'media_id' => 501,
                                'type' => 'citizen_photo',
                                'mime_type' => 'image/jpeg',
                                'original_filename' => 'incident-photo.jpg',
                            ],
                            [
                                'kind' => 'message_attachment',
                                'source_hub_id' => '14',
                                'incident_id' => 605,
                                'message_id' => 70,
                                'attachment_id' => 701,
                                'type' => 'citizen_photo',
                                'mime_type' => 'image/jpeg',
                                'original_filename' => 'lahug-photo.jpg',
                            ],
                        ],
                    ],
                ],
            ],
            'source_index' => [],
            'validation_issues' => [],
            'consolidated_at' => now(),
        ]);
    }

    private function seedCachedMedia(string $cacheKey, string $filename, string $mimeType): void
    {
        $directory = storage_path('app/hotline-media/'.sha1($cacheKey));

        if (! is_dir($directory)) {
            mkdir($directory, 0775, true);
        }

        $path = $directory.'/'.$filename;
        file_put_contents($path, 'cached media');

        file_put_contents($directory.'/metadata.json', json_encode([
            'cache_key' => $cacheKey,
            'local_path' => $path,
            'mime_type' => $mimeType,
            'original_filename' => $filename,
            'cached_at' => now()->toIso8601String(),
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }
}
