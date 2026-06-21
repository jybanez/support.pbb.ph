<?php

namespace App\Support\Sitreps;

use App\Models\ConsolidatedSitrep;
use App\Models\SitrepRelayDelivery;
use App\Support\Relay\RelayHttpOptions;
use App\Support\Settings\SupportSettings;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class SitrepRelaySubmissionService
{
    public function __construct(
        private readonly SupportSettings $settings,
    ) {
    }

    public function submitLatest(): ?SitrepRelayDelivery
    {
        $delivery = app(SitrepRelayOutboxService::class)->latestUnsentDelivery();

        if (! $delivery) {
            return null;
        }

        return $this->submit($delivery);
    }

    public function submit(SitrepRelayDelivery $delivery): SitrepRelayDelivery
    {
        $delivery->loadMissing('consolidatedSitrep');
        $consolidated = $delivery->consolidatedSitrep;

        if (! $consolidated instanceof ConsolidatedSitrep || $consolidated->status !== ConsolidatedSitrep::STATUS_CURRENT) {
            $delivery->forceFill(['status' => SitrepRelayDelivery::STATUS_SUPERSEDED])->save();

            return $delivery;
        }

        $settings = $this->settings->all();
        $relayUrl = rtrim(trim((string) ($settings['relayUrl'] ?? 'https://relay.pbb.ph')), '/');
        $relayToken = trim((string) ($settings['sitrepRelayToken'] ?? $settings['relayToken'] ?? ''));

        if ($relayUrl === '' || $relayToken === '') {
            return $this->markFailed($delivery, 'Relay URL or token is not configured.');
        }

        $delivery->forceFill([
            'attempt_count' => $delivery->attempt_count + 1,
            'last_attempted_at' => now(),
        ])->save();

        try {
            $response = Http::acceptJson()
                ->withOptions(RelayHttpOptions::verifyOptions())
                ->asJson()
                ->withHeaders([
                    'Connection' => 'close',
                    'X-Relay-Key' => $relayToken,
                ])
                ->connectTimeout(5)
                ->timeout(30)
                ->post($relayUrl.'/api/v1/messages', $this->envelope($consolidated, $settings));
        } catch (\Throwable $exception) {
            return $this->markFailed($delivery, $exception->getMessage());
        }

        if (! $response->successful()) {
            return $this->markFailed($delivery, sprintf(
                'Relay rejected consolidated SITREP with HTTP %d: %s',
                $response->status(),
                Str::limit($response->body(), 500),
            ));
        }

        $payload = $response->json();

        $delivery->forceFill([
            'status' => SitrepRelayDelivery::STATUS_SENT,
            'relay_id' => is_string($payload['relay_id'] ?? null) ? $payload['relay_id'] : null,
            'relay_message_id' => is_scalar($payload['message_id'] ?? null) ? (string) $payload['message_id'] : null,
            'deliveries_count' => is_numeric($payload['deliveries_count'] ?? null) ? (int) $payload['deliveries_count'] : null,
            'last_error' => null,
            'submitted_at' => now(),
            'response_json' => is_array($payload) ? $payload : null,
        ])->save();

        return $delivery;
    }

    /**
     * @param array<string, mixed> $settings
     * @return array<string, mixed>
     */
    private function envelope(ConsolidatedSitrep $consolidated, array $settings): array
    {
        return [
            'source_system' => (string) ($settings['relayTargetSystem'] ?? 'sitrep.ingestor'),
            'targets' => $this->targets($settings),
            'message_type' => 'sitrep.record',
            'payload_format' => 'json',
            'payload_version' => '1.0',
            'reference_type' => 'consolidated_sitrep',
            'reference_id' => (string) $consolidated->id,
            'correlation_id' => 'support-consolidated-sitrep-'.$consolidated->id,
            'priority' => $this->priority($consolidated->alert_level),
            'attachments_count' => 0,
            'occurred_at' => $consolidated->consolidated_at?->toIso8601String(),
            'payload' => $consolidated->sitrep_payload,
        ];
    }

    /**
     * @param array<string, mixed> $settings
     * @return array<int, array{id: string, systems: array<int, string>}>
     */
    private function targets(array $settings): array
    {
        $hub = $this->hubIdentity();
        $uplinks = is_array($hub['uplinks'] ?? null) ? $hub['uplinks'] : [];
        $system = (string) ($settings['relayTargetSystem'] ?? 'sitrep.ingestor');
        $targets = [];

        foreach ($uplinks as $uplink) {
            if (! is_array($uplink)) {
                continue;
            }

            $id = $uplink['hub']['id'] ?? $uplink['uplink_hub_id'] ?? $uplink['id'] ?? null;
            if (! is_scalar($id)) {
                continue;
            }

            $id = trim((string) $id);
            if ($id === '') {
                continue;
            }

            $targets[$id] = [
                'id' => $id,
                'systems' => [$system],
            ];
        }

        if ($targets === []) {
            throw new \InvalidArgumentException('Relay target hubs are not available from hub.json uplinks.');
        }

        return array_values($targets);
    }

    /**
     * @return array<string, mixed>
     */
    private function hubIdentity(): array
    {
        return Cache::remember('relay.hub_identity_for_outbound', now()->addSeconds(30), function (): array {
            $url = (string) config('services.relay.hub_json_url', 'https://relay.pbb.ph/hub.json');

            try {
                $payload = Http::acceptJson()
                    ->withOptions(RelayHttpOptions::verifyOptions())
                    ->timeout(5)
                    ->get($url)
                    ->throw()
                    ->json();
            } catch (\Throwable) {
                return [];
            }

            return is_array($payload) ? $payload : [];
        });
    }

    private function priority(string $alertLevel): string
    {
        return match ($alertLevel) {
            'Critical' => 'urgent',
            'Elevated' => 'high',
            default => 'normal',
        };
    }

    private function markFailed(SitrepRelayDelivery $delivery, string $message): SitrepRelayDelivery
    {
        $delivery->forceFill([
            'status' => SitrepRelayDelivery::STATUS_FAILED,
            'last_error' => Str::limit($message, 2000),
            'last_attempted_at' => now(),
        ])->save();

        return $delivery;
    }
}
