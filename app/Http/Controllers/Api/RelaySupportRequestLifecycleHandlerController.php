<?php

namespace App\Http\Controllers\Api;

use App\Models\SupportRequest;
use App\Models\SupportRequestMessage;
use App\Support\Settings\SupportSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class RelaySupportRequestLifecycleHandlerController extends BaseApiController
{
    private const CANCELLABLE_STATUSES = [
        'requested',
        'received',
        'accepted',
        'assigned',
    ];

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
        $relayEvent = $this->stringOrNull($envelope['event'] ?? null);
        $sourceSystem = $this->stringOrNull($message['source_system'] ?? null);
        $messageType = $this->stringOrNull($message['message_type'] ?? null);
        $targetSystem = $this->firstTargetSystem($targets);

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

        if ($relayMessageId !== null) {
            $existingMessage = SupportRequestMessage::query()
                ->where('relay_message_id', $relayMessageId)
                ->where('id', '!=', $inbound->id)
                ->whereIn('validation_status', [SupportRequestMessage::STATUS_ACCEPTED, SupportRequestMessage::STATUS_DUPLICATE])
                ->first();

            if ($existingMessage) {
                $inbound->forceFill([
                    'support_request_id' => $existingMessage->support_request_id,
                    'validation_status' => SupportRequestMessage::STATUS_DUPLICATE,
                    'processed_at' => now(),
                ])->save();

                return $this->duplicateResponse($existingMessage->supportRequest);
            }
        }

        $errors = $this->validateMessage($relayEvent, $messageType, $sourceSystem, $targets, $payload);
        if ($errors !== []) {
            return $this->markInvalid($inbound, $errors);
        }

        $supportRequest = SupportRequest::query()
            ->where('correlation_id', (string) data_get($payload, 'request.correlation_id'))
            ->first();

        if (! $supportRequest) {
            return $this->markInvalid($inbound, [[
                'field' => 'request.correlation_id',
                'message' => 'Support request cancellation must reference an existing support request.',
            ]]);
        }

        $inbound->forceFill([
            'support_request_id' => $supportRequest->id,
        ])->save();

        if ($supportRequest->local_request_id !== (string) data_get($payload, 'request.local_request_id')) {
            return $this->markInvalid($inbound, [[
                'field' => 'request.local_request_id',
                'message' => 'Support request cancellation local request ID must match the existing support request.',
            ]]);
        }

        if (! in_array($supportRequest->status, self::CANCELLABLE_STATUSES, true)) {
            return $this->markInvalid($inbound, [[
                'field' => 'request.status',
                'message' => 'Support request cancellation is not allowed after the request is '.$supportRequest->status.'.',
            ]]);
        }

        $supportRequest->forceFill([
            'status' => 'cancelled',
        ])->save();

        $inbound->forceFill([
            'validation_status' => SupportRequestMessage::STATUS_ACCEPTED,
            'processed_at' => now(),
        ])->save();

        return $this->ok([
            'support_request_id' => $supportRequest->support_request_id,
            'local_request_id' => $supportRequest->local_request_id,
            'correlation_id' => $supportRequest->correlation_id,
            'status' => $supportRequest->status,
            'validation_status' => SupportRequestMessage::STATUS_ACCEPTED,
        ]);
    }

    /**
     * @return array<int, array{field: string, message: string}>
     */
    private function validateMessage(?string $relayEvent, ?string $messageType, ?string $sourceSystem, array $targets, ?array $payload): array
    {
        $settings = $this->settings->all();
        $expectedSourceSystem = (string) ($settings['supportRequestSourceSystem'] ?? 'hotline.command');
        $expectedTargetSystem = (string) ($settings['supportRequestTargetSystem'] ?? 'support.dispatch');
        $errors = [];

        if ($relayEvent !== 'relay.message.received') {
            $errors[] = [
                'field' => 'event',
                'message' => 'Support request lifecycle intake only accepts received inbound Relay messages.',
            ];
        }

        if ($messageType !== 'support.request.cancelled') {
            $errors[] = [
                'field' => 'message.message_type',
                'message' => 'Support request lifecycle intake only accepts Hotline outbound support.request.cancelled messages.',
            ];
        }

        if ($sourceSystem !== $expectedSourceSystem) {
            $errors[] = [
                'field' => 'message.source_system',
                'message' => 'Support request lifecycle source system is not authorized for intake.',
            ];
        }

        if (! $this->targetsSystem($targets, $expectedTargetSystem)) {
            $errors[] = [
                'field' => 'message.targets',
                'message' => 'Support request lifecycle target systems must include '.$expectedTargetSystem.'.',
            ];
        }

        if ($payload === null) {
            $errors[] = [
                'field' => 'message.payload',
                'message' => 'Support request lifecycle payload is required.',
            ];

            return $errors;
        }

        $validator = Validator::make($payload, [
            'schema_version' => ['required', 'integer', 'in:1'],
            'request' => ['required', 'array'],
            'request.local_request_id' => ['required', 'string', 'max:120'],
            'request.correlation_id' => ['required', 'string', 'max:120'],
            'request.status' => ['required', 'string', 'in:cancelled'],
            'request.cancelled_at' => ['nullable', 'date'],
            'request.cancellation_reason' => ['nullable', 'string'],
            'source' => ['required', 'array'],
            'source.system' => ['required', 'string', 'max:120'],
        ]);

        foreach ($validator->errors()->messages() as $field => $messages) {
            foreach ($messages as $message) {
                $errors[] = [
                    'field' => $field,
                    'message' => $message,
                ];
            }
        }

        $payloadSourceSystem = $this->stringOrNull(data_get($payload, 'source.system'));
        if ($payloadSourceSystem !== $expectedSourceSystem) {
            $errors[] = [
                'field' => 'source.system',
                'message' => 'Support request lifecycle payload source system must match the expected Hotline source system.',
            ];
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
}
