<?php

namespace App\Http\Controllers\Api;

use App\Support\Settings\SupportSettings;
use App\Support\Relay\RelayHttpOptions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class SourceHeartbeatController extends BaseApiController
{
    public function index(Request $request, SupportSettings $settings)
    {
        $hours = max(1, min(72, (int) $request->query('hours', 48)));
        $allSettings = $settings->all();
        $relayUrl = rtrim(trim((string) ($allSettings['relayUrl'] ?? '')), '/');
        $relayToken = trim((string) ($allSettings['relayToken'] ?? ''));

        if ($relayUrl === '' || $relayToken === '') {
            return $this->ok([
                'available' => false,
                'sources' => [],
                'error' => 'Relay URL or token is not configured.',
            ]);
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
            return $this->ok([
                'available' => false,
                'sources' => [],
                'error' => $exception->getMessage(),
            ]);
        }

        if (! $response->successful()) {
            return $this->ok([
                'available' => false,
                'sources' => [],
                'error' => sprintf('Relay source heartbeat API returned HTTP %d: %s', $response->status(), Str::limit($response->body(), 240)),
            ]);
        }

        $payload = $response->json();
        $data = is_array($payload['data'] ?? null) ? $payload['data'] : (is_array($payload) ? $payload : []);

        return $this->ok([
            ...$data,
            'available' => true,
            'sources' => is_array($data['sources'] ?? null) ? $data['sources'] : [],
        ]);
    }
}
