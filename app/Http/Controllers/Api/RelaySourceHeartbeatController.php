<?php

namespace App\Http\Controllers\Api;

use App\Support\Realtime\SourceHeartbeatRealtimePublisher;
use App\Support\Settings\SupportSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class RelaySourceHeartbeatController extends BaseApiController
{
    private const EVENT_TYPE = 'source.heartbeat.updated';

    public function __construct(
        private readonly SupportSettings $settings,
        private readonly SourceHeartbeatRealtimePublisher $publisher,
    ) {}

    public function store(Request $request)
    {
        if (! $this->isAuthorized($request)) {
            return $this->fail('Invalid source heartbeat webhook credentials.', 401);
        }

        $event = $request->json()->all();
        $payload = is_array($event['payload'] ?? null) ? $event['payload'] : $event;
        $eventId = $this->stringOrNull($payload['event_id'] ?? $event['event_id'] ?? null);
        $eventType = $this->stringOrNull($payload['event_type'] ?? $event['event_type'] ?? $event['message_type'] ?? null);

        if ($eventId === null) {
            return $this->fail('Source heartbeat webhook event_id is required.', 422);
        }

        if ($eventType !== self::EVENT_TYPE) {
            return $this->fail('Source heartbeat webhook event_type must be source.heartbeat.updated.', 422);
        }

        $idempotencyKey = $this->idempotencyKey($eventId);
        if (Cache::has($idempotencyKey)) {
            return $this->ok([
                'event_id' => $eventId,
                'validation_status' => 'duplicate',
                'published' => false,
            ]);
        }

        $heartbeat = $this->normalizeHeartbeat($payload);
        if ($heartbeat === null) {
            return $this->fail('Source heartbeat webhook must include source identity and heartbeat data.', 422);
        }

        $published = $this->publisher->publish([
            'available' => true,
            'sources' => [$heartbeat],
        ]);

        Cache::put($idempotencyKey, [
            'event_id' => $eventId,
            'published' => $published,
            'received_at' => now()->toIso8601String(),
        ], now()->addDay());

        return $this->ok([
            'event_id' => $eventId,
            'validation_status' => 'accepted',
            'published' => $published,
        ], statusCode: 202);
    }

    private function isAuthorized(Request $request): bool
    {
        $expected = trim((string) ($this->settings->all()['sourceHeartbeatWebhookToken'] ?? ''));

        if ($expected === '') {
            return false;
        }

        $token = $request->bearerToken();
        if (! is_string($token) || trim($token) === '') {
            $token = $request->headers->get('X-Relay-Webhook-Key');
        }

        return is_string($token) && hash_equals($expected, trim($token));
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>|null
     */
    private function normalizeHeartbeat(array $payload): ?array
    {
        $source = is_array($payload['source'] ?? null) ? $payload['source'] : [];
        $heartbeat = is_array($payload['heartbeat'] ?? null) ? $payload['heartbeat'] : [];
        $rollup = is_array($payload['rollup'] ?? null) ? $payload['rollup'] : [];

        $sourceHubId = $this->firstString([
            $source['hub_id'] ?? null,
            $source['source_hub_id'] ?? null,
            $payload['source_hub_id'] ?? null,
            $payload['hub_id'] ?? null,
        ]);
        $sourceRelayHubId = $this->firstString([
            $source['relay_hub_id'] ?? null,
            $source['source_relay_hub_id'] ?? null,
            $payload['source_relay_hub_id'] ?? null,
            $payload['relay_hub_id'] ?? null,
        ]);

        if ($sourceHubId === null && $sourceRelayHubId === null) {
            return null;
        }

        if ($heartbeat === []) {
            return null;
        }

        $normalized = [
            'source_hub_id' => $sourceHubId,
            'source_relay_hub_id' => $sourceRelayHubId,
            'hub_id' => $sourceHubId,
            'relay_hub_id' => $sourceRelayHubId,
            'status' => $this->stringOrNull($heartbeat['status'] ?? null) ?? 'unknown',
            'last_seen_at' => $this->stringOrNull($heartbeat['last_seen_at'] ?? null),
            'age_seconds' => is_numeric($heartbeat['age_seconds'] ?? null) ? (int) $heartbeat['age_seconds'] : null,
            'history' => $this->history($heartbeat, $rollup),
        ];

        foreach ([
            'source_name' => $source['name'] ?? $source['hub_name'] ?? null,
            'hub_name' => $source['name'] ?? $source['hub_name'] ?? null,
            'domain' => $source['domain'] ?? null,
            'deployment' => $source['deployment'] ?? null,
            'received_count' => $heartbeat['received_count'] ?? null,
            'last_version' => $heartbeat['last_version'] ?? null,
            'last_credential_version' => $heartbeat['last_credential_version'] ?? null,
        ] as $key => $value) {
            if ($value !== null) {
                $normalized[$key] = $value;
            }
        }

        return array_filter($normalized, static fn (mixed $value): bool => $value !== null);
    }

    /**
     * @param array<string, mixed> $heartbeat
     * @param array<string, mixed> $rollup
     * @return array<int, array<string, mixed>>
     */
    private function history(array $heartbeat, array $rollup): array
    {
        if (is_array($heartbeat['history'] ?? null)) {
            return array_values($heartbeat['history']);
        }

        return $rollup !== [] ? [$rollup] : [];
    }

    /**
     * @param array<int, mixed> $values
     */
    private function firstString(array $values): ?string
    {
        foreach ($values as $value) {
            $normalized = $this->stringOrNull($value);
            if ($normalized !== null) {
                return $normalized;
            }
        }

        return null;
    }

    private function stringOrNull(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $string = trim((string) $value);

        return $string !== '' ? $string : null;
    }

    private function idempotencyKey(string $eventId): string
    {
        return 'support.source_heartbeats.webhook.event.'.sha1(Str::lower($eventId));
    }
}
