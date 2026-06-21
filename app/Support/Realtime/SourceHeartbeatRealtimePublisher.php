<?php

namespace App\Support\Realtime;

use App\Support\Settings\SupportSettings;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class SourceHeartbeatRealtimePublisher
{
    private const HASH_CACHE_KEY = 'support.source_heartbeats.last_publish_hash';

    public function __construct(
        private readonly SupportSettings $settings,
    ) {}

    /**
     * @param array<string, mixed> $snapshot
     */
    public function publish(array $snapshot): bool
    {
        $allSettings = $this->settings->all();
        $realtimeUrl = rtrim(trim((string) ($allSettings['realtimeUrl'] ?? '')), '/');
        $clientCode = trim((string) ($allSettings['realtimeClientCode'] ?? ''));
        $projectCode = trim((string) ($allSettings['serverProjectCode'] ?? ''));
        $secret = trim((string) ($allSettings['realtimeBackendIngressSecret'] ?? ''));

        if ($realtimeUrl === '' || $clientCode === '' || $projectCode === '' || $secret === '') {
            return false;
        }

        $basePayload = $this->normalizeSnapshot($snapshot);
        $hash = hash('sha256', json_encode($basePayload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));

        if (Cache::get(self::HASH_CACHE_KEY) === $hash) {
            return false;
        }

        $payload = [
            ...$basePayload,
            'published_at' => now()->toIso8601String(),
        ];

        try {
            $response = Http::acceptJson()
                ->asJson()
                ->withHeaders([
                    'Connection' => 'close',
                    'X-Realtime-Backend-Secret' => $secret,
                ])
                ->connectTimeout(2)
                ->timeout(5)
                ->post(SupportRealtimeUrl::publishEndpoint($realtimeUrl), [
                    'client_code' => $clientCode,
                    'project_code' => $projectCode,
                    'room' => SupportRealtimeRooms::SOURCE_HEARTBEATS_ROOM,
                    'event_type' => SupportRealtimeRooms::SOURCE_HEARTBEATS_UPDATED,
                    'payload' => $payload,
                    'meta' => [
                        'source' => 'pbb-support-backend',
                        'source_module' => 'support-source-heartbeats',
                    ],
                    'event_id' => 'support_source_heartbeats_'.substr($hash, 0, 24),
                ]);

            if (! $response->successful()) {
                return false;
            }

            Cache::put(self::HASH_CACHE_KEY, $hash, now()->addMinutes(10));

            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * @param array<string, mixed> $snapshot
     * @return array<string, mixed>
     */
    private function normalizeSnapshot(array $snapshot): array
    {
        $payload = [
            'available' => (bool) ($snapshot['available'] ?? false),
            'sources' => is_array($snapshot['sources'] ?? null) ? array_values($snapshot['sources']) : [],
        ];

        if (isset($snapshot['error']) && trim((string) $snapshot['error']) !== '') {
            $payload['error'] = Str::limit((string) $snapshot['error'], 240);
        }

        return $payload;
    }
}
