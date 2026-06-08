<?php

namespace App\Http\Controllers\Api;

use App\Models\RelayInboundSitrep;
use App\Support\Settings\SupportSettings;
use App\Support\Sitreps\DatabaseSitrepStagingStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Pbb\Sitreps\Consolidation\SitrepNormalizer;
use Pbb\Sitreps\Consolidation\SitrepValidationIssue;

class RelaySitrepHandlerController extends BaseApiController
{
    public function __construct(
        private readonly SupportSettings $settings,
        private readonly SitrepNormalizer $normalizer,
        private readonly DatabaseSitrepStagingStore $stagingStore,
    ) {
    }

    public function store(Request $request): JsonResponse
    {
        if (! $this->isAuthorized($request)) {
            return $this->fail('Invalid Relay handler credentials.', 401);
        }

        $envelope = $request->json()->all();
        $message = is_array($envelope['message'] ?? null) ? $envelope['message'] : $envelope;
        $sitrepPayload = is_array($message['payload'] ?? null) ? $message['payload'] : null;

        $inbound = RelayInboundSitrep::query()->create([
            'relay_id' => $this->stringOrNull($message['relay_id'] ?? $envelope['relay_id'] ?? null),
            'relay_message_id' => $this->stringOrNull($message['id'] ?? null),
            'source_hub_id' => $this->stringOrNull($message['source_hub_id'] ?? null),
            'source_system' => $this->stringOrNull($message['source_system'] ?? null),
            'message_type' => $this->stringOrNull($message['message_type'] ?? null),
            'priority' => $this->stringOrNull($message['priority'] ?? null),
            'occurred_at' => $this->nullableDate($message['occurred_at'] ?? null),
            'received_at' => $this->nullableDate($message['received_at'] ?? null) ?? now(),
            'validation_status' => RelayInboundSitrep::STATUS_PENDING,
            'raw_envelope' => $envelope,
            'sitrep_payload' => $sitrepPayload,
        ]);

        if ($sitrepPayload === null) {
            return $this->markInvalid($inbound, [
                new SitrepValidationIssue('error', 'missing_payload', 'Relay message payload must be a SITREP object.', 'message.payload'),
            ]);
        }

        if (! str_starts_with((string) $inbound->message_type, 'sitrep.')) {
            return $this->markInvalid($inbound, [
                new SitrepValidationIssue('error', 'invalid_message_type', 'Relay message type must target SITREP ingestion.', 'message.message_type', $inbound->message_type),
            ]);
        }

        $result = $this->normalizer->normalize($sitrepPayload);
        $issues = $this->issueArrays($result['issues']);

        if ($result['normalized'] === null) {
            $inbound->forceFill([
                'validation_status' => RelayInboundSitrep::STATUS_INVALID,
                'validation_issues' => $issues,
            ])->save();

            return $this->ok([
                'inbound_id' => $inbound->id,
                'validation_status' => RelayInboundSitrep::STATUS_INVALID,
                'issues' => $issues,
            ], statusCode: 202);
        }

        $stage = $this->stagingStore->stage($result['normalized'], $inbound);
        $inbound->forceFill([
            'validation_status' => RelayInboundSitrep::STATUS_STAGED,
            'normalized_sitrep' => $result['normalized'],
            'validation_issues' => $issues,
            'staged_at' => now(),
        ])->save();

        return $this->ok([
            'inbound_id' => $inbound->id,
            'validation_status' => RelayInboundSitrep::STATUS_STAGED,
            'staging' => [
                'deployment' => $stage['deployment'],
                'source_hub_id' => $stage['source_hub_id'],
                'staging_id' => $stage['staging_id'],
            ],
            'issues' => $issues,
        ], statusCode: 201);
    }

    /**
     * @param SitrepValidationIssue[] $issues
     */
    private function markInvalid(RelayInboundSitrep $inbound, array $issues): JsonResponse
    {
        $issueArrays = $this->issueArrays($issues);

        $inbound->forceFill([
            'validation_status' => RelayInboundSitrep::STATUS_INVALID,
            'validation_issues' => $issueArrays,
        ])->save();

        return $this->ok([
            'inbound_id' => $inbound->id,
            'validation_status' => RelayInboundSitrep::STATUS_INVALID,
            'issues' => $issueArrays,
        ], statusCode: 202);
    }

    private function isAuthorized(Request $request): bool
    {
        $allSettings = $this->settings->all();
        $expected = trim((string) ($allSettings['relayHandlerToken'] ?? ''));

        if ($expected === '') {
            return false;
        }

        $token = $request->bearerToken();

        return is_string($token) && hash_equals($expected, $token);
    }

    /**
     * @param SitrepValidationIssue[] $issues
     * @return array<int, array<string, mixed>>
     */
    private function issueArrays(array $issues): array
    {
        return array_map(
            static fn (SitrepValidationIssue $issue): array => $issue->toArray(),
            $issues,
        );
    }

    private function stringOrNull(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $string = trim((string) $value);

        return $string !== '' ? $string : null;
    }

    private function nullableDate(mixed $value): ?Carbon
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }
}
