<?php

namespace Tests\Feature;

use App\Models\ConsolidatedSitrep;
use App\Models\User;
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
