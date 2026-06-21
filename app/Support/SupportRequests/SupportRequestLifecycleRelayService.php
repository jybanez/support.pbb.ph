<?php

namespace App\Support\SupportRequests;

use App\Jobs\SubmitSupportRequestUpdateDelivery;
use App\Models\SupportRequest;
use App\Models\SupportRequestUpdateDelivery;
use App\Support\Relay\RelayHttpOptions;
use App\Support\Settings\SupportSettings;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class SupportRequestLifecycleRelayService
{
    public function __construct(
        private readonly SupportSettings $settings,
    ) {
    }

    public function queueLifecycleUpdate(SupportRequest $supportRequest, string $status, bool $dispatch = true): SupportRequestUpdateDelivery
    {
        $supportRequest->refresh();
        $outboundStatus = $this->outboundStatus($status);
        $settings = $this->settings->all();
        $sourceSystem = (string) ($settings['supportRequestUpdateSourceSystem'] ?? 'support.dispatch');
        $targetSystem = (string) ($settings['supportRequestUpdateTargetSystem']
            ?? $settings['supportRequestSourceSystem']
            ?? 'hotline.command');
        $updatedAt = $supportRequest->updated_at ?? now();
        $updateId = $this->updateId($supportRequest, $outboundStatus, $updatedAt->toIso8601String());

        $delivery = SupportRequestUpdateDelivery::query()->firstOrCreate(
            ['update_id' => $updateId],
            [
                'support_request_id' => $supportRequest->id,
                'message_type' => 'support.request.'.$outboundStatus,
                'source_system' => $sourceSystem,
                'target_system' => $targetSystem,
                'status' => $outboundStatus,
                'delivery_status' => SupportRequestUpdateDelivery::STATUS_PENDING,
                'envelope' => $this->envelope($supportRequest, $outboundStatus, $updateId, $sourceSystem, $targetSystem, $updatedAt->toIso8601String()),
            ],
        );

        if ($dispatch && $delivery->wasRecentlyCreated) {
            SubmitSupportRequestUpdateDelivery::dispatch($delivery->id);
        }

        return $delivery;
    }

    public function submit(
        SupportRequestUpdateDelivery $delivery,
        int $connectTimeoutSeconds = 5,
        int $timeoutSeconds = 30,
    ): SupportRequestUpdateDelivery
    {
        if ($delivery->delivery_status === SupportRequestUpdateDelivery::STATUS_SENT) {
            return $delivery;
        }

        $settings = $this->settings->all();
        $relayUrl = rtrim(trim((string) ($settings['relayUrl'] ?? 'https://relay.pbb.ph')), '/');
        $relayToken = trim((string) ($settings['relayToken'] ?? ''));

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
                ->connectTimeout($connectTimeoutSeconds)
                ->timeout($timeoutSeconds)
                ->post($relayUrl.'/api/v1/messages', $delivery->envelope);
        } catch (\Throwable $exception) {
            return $this->markFailed($delivery, $exception->getMessage());
        }

        if (! $response->successful()) {
            return $this->markFailed($delivery, sprintf(
                'Relay rejected support request update with HTTP %d: %s',
                $response->status(),
                Str::limit($response->body(), 500),
            ));
        }

        $payload = $response->json();

        $delivery->forceFill([
            'delivery_status' => SupportRequestUpdateDelivery::STATUS_SENT,
            'relay_id' => is_string($payload['relay_id'] ?? null) ? $payload['relay_id'] : null,
            'relay_message_id' => is_scalar($payload['message_id'] ?? null) ? (string) $payload['message_id'] : null,
            'deliveries_count' => is_numeric($payload['deliveries_count'] ?? null) ? (int) $payload['deliveries_count'] : null,
            'last_error' => null,
            'submitted_at' => now(),
            'response_json' => is_array($payload) ? $payload : null,
        ])->save();

        return $delivery;
    }

    private function updateId(SupportRequest $supportRequest, string $status, string $updatedAt): string
    {
        return 'supupd_'.substr(hash('sha256', implode('|', [
            $supportRequest->support_request_id,
            $supportRequest->local_request_id,
            $supportRequest->correlation_id,
            $status,
            $updatedAt,
        ])), 0, 32);
    }

    private function envelope(
        SupportRequest $supportRequest,
        string $status,
        string $updateId,
        string $sourceSystem,
        string $targetSystem,
        string $updatedAt,
    ): array {
        return [
            'source_system' => $sourceSystem,
            'targets' => $this->targets($supportRequest, $targetSystem),
            'message_type' => 'support.request.'.$status,
            'payload_format' => 'json',
            'payload_version' => '1.0',
            'reference_type' => 'support_request_update',
            'reference_id' => $updateId,
            'correlation_id' => $supportRequest->correlation_id,
            'priority' => $this->priority($supportRequest->urgency),
            'attachments_count' => 0,
            'occurred_at' => $updatedAt,
            'payload' => [
                'schema_version' => 1,
                'update_id' => $updateId,
                'local_request_id' => $supportRequest->local_request_id,
                'hotline_request_id' => $supportRequest->local_request_id,
                'support_request_id' => $supportRequest->support_request_id,
                'correlation_id' => $supportRequest->correlation_id,
                'status' => $status,
                'status_label' => Str::headline($status),
                'updated_at' => $updatedAt,
                'updated_by' => [
                    'system' => $sourceSystem,
                    'display_name' => 'PBB Support',
                ],
                'message' => 'Support request '.str_replace('_', ' ', $status).' by PBB Support.',
                'request' => [
                    'id' => $supportRequest->id,
                    'local_request_id' => $supportRequest->local_request_id,
                    'support_request_id' => $supportRequest->support_request_id,
                    'correlation_id' => $supportRequest->correlation_id,
                    'status' => $status,
                    'updated_at' => $updatedAt,
                ],
                'source' => [
                    'system' => $sourceSystem,
                ],
                'target' => [
                    'system' => $targetSystem,
                ],
            ],
        ];
    }

    /**
     * @return array<int, array{id: string, systems: array<int, string>}>
     */
    private function targets(SupportRequest $supportRequest, string $targetSystem): array
    {
        $targetHubId = $supportRequest->source_relay_hub_id ?: $supportRequest->source_hub_id;

        return [[
            'id' => (string) $targetHubId,
            'systems' => [$targetSystem],
        ]];
    }

    private function priority(?string $urgency): string
    {
        return match (strtolower((string) $urgency)) {
            'critical', 'urgent' => 'urgent',
            'high' => 'high',
            default => 'normal',
        };
    }

    private function outboundStatus(string $status): string
    {
        return $status === 'completed' ? 'fulfilled' : $status;
    }

    private function markFailed(SupportRequestUpdateDelivery $delivery, string $message): SupportRequestUpdateDelivery
    {
        $delivery->forceFill([
            'delivery_status' => SupportRequestUpdateDelivery::STATUS_FAILED,
            'last_error' => Str::limit($message, 2000),
            'last_attempted_at' => now(),
        ])->save();

        return $delivery;
    }
}
