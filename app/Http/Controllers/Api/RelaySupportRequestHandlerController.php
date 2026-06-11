<?php

namespace App\Http\Controllers\Api;

use App\Models\SupportRequest;
use App\Models\SupportRequestMessage;
use App\Support\Settings\SupportSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class RelaySupportRequestHandlerController extends BaseApiController
{
    public function __construct(
        private readonly SupportSettings $settings,
    ) {
    }

    public function store(Request $request): JsonResponse
    {
        if (! $this->isAuthorized($request)) {
            return $this->fail('Invalid Relay handler credentials.', 401);
        }

        $envelope = $request->json()->all();
        $message = is_array($envelope['message'] ?? null) ? $envelope['message'] : $envelope;
        $payload = is_array($message['payload'] ?? null) ? $message['payload'] : null;
        $targets = is_array($message['targets'] ?? null)
            ? $message['targets']
            : (is_array($envelope['targets'] ?? null) ? $envelope['targets'] : []);

        $relayMessageId = $this->stringOrNull($message['id'] ?? $message['message_id'] ?? $envelope['message_id'] ?? null);
        $sourceSystem = $this->stringOrNull($message['source_system'] ?? null);
        $messageType = $this->stringOrNull($message['message_type'] ?? null);
        $targetSystem = $this->firstTargetSystem($targets);

        if ($relayMessageId !== null) {
            $existingMessage = SupportRequestMessage::query()
                ->where('relay_message_id', $relayMessageId)
                ->whereIn('validation_status', [SupportRequestMessage::STATUS_ACCEPTED, SupportRequestMessage::STATUS_DUPLICATE])
                ->first();

            if ($existingMessage) {
                return $this->duplicateResponse($existingMessage->supportRequest);
            }
        }

        $inbound = SupportRequestMessage::query()->create([
            'relay_id' => $this->stringOrNull($message['relay_id'] ?? $envelope['relay_id'] ?? null),
            'relay_message_id' => $relayMessageId,
            'message_type' => $messageType,
            'source_system' => $sourceSystem,
            'target_system' => $targetSystem,
            'direction' => 'inbound',
            'validation_status' => SupportRequestMessage::STATUS_PENDING,
            'raw_envelope' => $envelope,
            'payload' => $payload,
        ]);

        $errors = $this->validateMessage($messageType, $sourceSystem, $targets, $payload);
        if ($errors !== []) {
            return $this->markInvalid($inbound, $errors);
        }

        $requestPayload = $payload['request'];
        $correlationId = (string) $requestPayload['correlation_id'];

        $existingRequest = SupportRequest::query()
            ->where('correlation_id', $correlationId)
            ->first();

        if ($existingRequest) {
            $inbound->forceFill([
                'support_request_id' => $existingRequest->id,
                'validation_status' => SupportRequestMessage::STATUS_DUPLICATE,
                'processed_at' => now(),
            ])->save();

            return $this->duplicateResponse($existingRequest);
        }

        $supportRequest = SupportRequest::query()->create([
            'support_request_id' => 'sup_'.strtolower((string) Str::ulid()),
            'local_request_id' => (string) $requestPayload['local_request_id'],
            'correlation_id' => $correlationId,
            'relay_message_id' => $relayMessageId,
            'source_system' => $sourceSystem,
            'source_hub_id' => $this->stringOrNull(data_get($payload, 'source.hub_id')),
            'source_relay_hub_id' => $this->stringOrNull(data_get($payload, 'source.relay_hub_id')),
            'source_hub_name' => $this->stringOrNull(data_get($payload, 'source.hub_name')),
            'status' => (string) ($requestPayload['status'] ?? 'requested'),
            'urgency' => (string) ($requestPayload['urgency'] ?? 'normal'),
            'requested_assistance' => $this->stringOrNull($requestPayload['requested_assistance'] ?? null),
            'requested_capability' => $this->stringOrNull($requestPayload['requested_capability'] ?? null),
            'quantity' => is_numeric($requestPayload['quantity'] ?? null) ? $requestPayload['quantity'] : null,
            'quantity_unit' => $this->stringOrNull($requestPayload['quantity_unit'] ?? null),
            'staging_notes' => $this->stringOrNull($requestPayload['staging_notes'] ?? null),
            'command_notes' => $this->stringOrNull($requestPayload['command_notes'] ?? null),
            'requested_at' => $this->nullableDate($requestPayload['requested_at'] ?? null),
            'requester_user_id' => $this->stringOrNull(data_get($payload, 'requester.user_id')),
            'requester_display_name' => $this->stringOrNull(data_get($payload, 'requester.display_name')),
            'requester_role' => $this->stringOrNull(data_get($payload, 'requester.role')),
            'sitrep_context' => is_array($payload['sitrep'] ?? null) ? $payload['sitrep'] : null,
            'gap_context' => is_array($payload['gap'] ?? null) ? $payload['gap'] : null,
            'evidence_row' => is_array($payload['evidence_row'] ?? null) ? $payload['evidence_row'] : null,
            'incident_refs' => is_array($payload['incident_refs'] ?? null) ? $payload['incident_refs'] : null,
            'request_payload' => $payload,
            'raw_envelope' => $envelope,
            'intake_received_at' => now(),
        ]);

        $inbound->forceFill([
            'support_request_id' => $supportRequest->id,
            'validation_status' => SupportRequestMessage::STATUS_ACCEPTED,
            'processed_at' => now(),
        ])->save();

        return $this->ok([
            'support_request_id' => $supportRequest->support_request_id,
            'local_request_id' => $supportRequest->local_request_id,
            'correlation_id' => $supportRequest->correlation_id,
            'status' => $supportRequest->status,
            'validation_status' => SupportRequestMessage::STATUS_ACCEPTED,
        ], statusCode: 201);
    }

    /**
     * @return array<int, array{field: string, message: string}>
     */
    private function validateMessage(?string $messageType, ?string $sourceSystem, array $targets, ?array $payload): array
    {
        $settings = $this->settings->all();
        $expectedSourceSystem = (string) ($settings['supportRequestSourceSystem'] ?? 'hotline.command');
        $expectedTargetSystem = (string) ($settings['supportRequestTargetSystem'] ?? 'support.dispatch');
        $errors = [];

        if ($messageType !== 'support.request') {
            $errors[] = [
                'field' => 'message.message_type',
                'message' => 'Support request intake only accepts Hotline outbound support.request messages.',
            ];
        }

        if ($sourceSystem !== $expectedSourceSystem) {
            $errors[] = [
                'field' => 'message.source_system',
                'message' => 'Support request source system is not authorized for intake.',
            ];
        }

        if (! $this->targetsSystem($targets, $expectedTargetSystem)) {
            $errors[] = [
                'field' => 'message.targets',
                'message' => 'Support request target systems must include '.$expectedTargetSystem.'.',
            ];
        }

        if ($payload === null) {
            $errors[] = [
                'field' => 'message.payload',
                'message' => 'Support request payload is required.',
            ];

            return $errors;
        }

        $validator = Validator::make($payload, [
            'schema_version' => ['required', 'integer', 'in:1'],
            'request' => ['required', 'array'],
            'request.local_request_id' => ['required', 'string', 'max:120'],
            'request.correlation_id' => ['required', 'string', 'max:120'],
            'request.status' => ['required', 'string', 'max:80'],
            'request.urgency' => ['required', 'string', 'max:80'],
            'request.requested_assistance' => ['required', 'string', 'max:255'],
            'request.requested_capability' => ['required', 'string', 'max:120'],
            'request.quantity' => ['nullable', 'numeric'],
            'request.quantity_unit' => ['nullable', 'string', 'max:80'],
            'request.staging_notes' => ['nullable', 'string'],
            'request.command_notes' => ['nullable', 'string'],
            'request.requested_at' => ['required', 'date'],
            'source' => ['required', 'array'],
            'source.system' => ['required', 'string', 'max:120'],
            'source.hub_id' => ['nullable', 'string', 'max:120', 'required_without:source.relay_hub_id'],
            'source.relay_hub_id' => ['nullable', 'string', 'max:120', 'required_without:source.hub_id'],
            'source.hub_name' => ['required', 'string', 'max:255'],
            'requester' => ['required', 'array'],
            'requester.user_id' => ['required', 'string', 'max:120'],
            'requester.display_name' => ['required', 'string', 'max:255'],
            'requester.role' => ['required', 'string', 'max:120'],
            'sitrep' => ['nullable', 'array'],
            'gap' => ['nullable', 'array'],
            'evidence_row' => ['nullable', 'array'],
            'incident_refs' => ['nullable', 'array'],
        ]);

        foreach ($validator->errors()->messages() as $field => $messages) {
            foreach ($messages as $message) {
                $errors[] = [
                    'field' => $field,
                    'message' => $message,
                ];
            }
        }

        return $errors;
    }

    /**
     * @param array<int, array{field: string, message: string}> $errors
     */
    private function markInvalid(SupportRequestMessage $inbound, array $errors): JsonResponse
    {
        $inbound->forceFill([
            'validation_status' => SupportRequestMessage::STATUS_INVALID,
            'validation_errors' => $errors,
            'processed_at' => now(),
        ])->save();

        return $this->ok([
            'message_id' => $inbound->id,
            'validation_status' => SupportRequestMessage::STATUS_INVALID,
            'errors' => $errors,
        ], statusCode: 202);
    }

    private function duplicateResponse(?SupportRequest $supportRequest): JsonResponse
    {
        return $this->ok([
            'support_request_id' => $supportRequest?->support_request_id,
            'local_request_id' => $supportRequest?->local_request_id,
            'correlation_id' => $supportRequest?->correlation_id,
            'status' => $supportRequest?->status,
            'validation_status' => SupportRequestMessage::STATUS_DUPLICATE,
        ]);
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

    private function targetsSystem(array $targets, string $expectedSystem): bool
    {
        foreach ($targets as $target) {
            if (! is_array($target)) {
                continue;
            }

            $systems = $target['systems'] ?? [];
            if (! is_array($systems)) {
                $systems = [$systems];
            }

            foreach ($systems as $system) {
                if ((string) $system === $expectedSystem) {
                    return true;
                }
            }
        }

        return false;
    }

    private function firstTargetSystem(array $targets): ?string
    {
        foreach ($targets as $target) {
            if (! is_array($target)) {
                continue;
            }

            $systems = $target['systems'] ?? [];
            if (! is_array($systems)) {
                $systems = [$systems];
            }

            foreach ($systems as $system) {
                $system = $this->stringOrNull($system);
                if ($system !== null) {
                    return $system;
                }
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
