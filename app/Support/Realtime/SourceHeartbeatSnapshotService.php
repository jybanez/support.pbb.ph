<?php

namespace App\Support\Realtime;

use App\Support\Relay\RelayHttpOptions;
use App\Support\Settings\SupportSettings;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class SourceHeartbeatSnapshotService
{
    public function __construct(
        private readonly SupportSettings $settings,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function fetch(int $hours = 48): array
    {
        $hours = max(1, min(72, $hours));
        $allSettings = $this->settings->all();
        $relayUrl = rtrim(trim((string) ($allSettings['relayUrl'] ?? '')), '/');
        $relayToken = trim((string) ($allSettings['sitrepRelayToken'] ?? $allSettings['relayToken'] ?? ''));

        if ($relayUrl === '' || $relayToken === '') {
            return [
                'available' => false,
                'sources' => [],
                'error' => 'Relay URL or token is not configured.',
            ];
        }

        try {
            $response = Http::acceptJson()
                ->withOptions(RelayHttpOptions::verifyOptions())
                ->withHeaders([
                    'Connection' => 'close',
                    'X-Relay-Key' => $relayToken,
                ])
                ->connectTimeout(10)
                ->timeout(30)
                ->get($relayUrl.'/api/v1/source-heartbeats', [
                    'hours' => $hours,
                ]);
        } catch (\Throwable $exception) {
            return [
                'available' => false,
                'sources' => [],
                'error' => $exception->getMessage(),
            ];
        }

        if (! $response->successful()) {
            return [
                'available' => false,
                'sources' => [],
                'error' => sprintf('Relay source heartbeat API returned HTTP %d: %s', $response->status(), Str::limit($response->body(), 240)),
            ];
        }

        $payload = $response->json();
        $data = is_array($payload['data'] ?? null) ? $payload['data'] : (is_array($payload) ? $payload : []);

        return [
            ...$data,
            'available' => true,
            'sources' => is_array($data['sources'] ?? null) ? $data['sources'] : [],
        ];
    }
}
