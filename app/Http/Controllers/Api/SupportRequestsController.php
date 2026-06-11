<?php

namespace App\Http\Controllers\Api;

use App\Models\SupportRequest;
use App\Models\SupportRequestAction;
use App\Models\SupportRequestUpdateDelivery;
use App\Support\SupportRequests\SupportRequestLifecycleRelayService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SupportRequestsController extends BaseApiController
{
    private const TERMINAL_STATUSES = ['cancelled', 'completed', 'rejected'];

    public function index(Request $request)
    {
        $query = SupportRequest::query()
            ->latest('requested_at')
            ->latest('id');

        $status = trim((string) $request->query('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }

        return $this->ok([
            'requests' => $query
                ->limit(100)
                ->get()
                ->map(fn (SupportRequest $supportRequest): array => $this->requestPayload($supportRequest, false))
                ->values()
                ->all(),
        ]);
    }

    public function show(SupportRequest $supportRequest)
    {
        return $this->ok([
            'request' => $this->requestPayload($supportRequest, true),
        ]);
    }

    public function receive(
        Request $request,
        SupportRequest $supportRequest,
        SupportRequestLifecycleRelayService $lifecycleRelay,
    )
    {
        $shouldQueueReceivedUpdate = false;

        if ($supportRequest->status === 'cancelled') {
            return $this->fail('Cancelled support requests cannot be received or dispatched.', 409);
        }

        if ($supportRequest->status === 'requested') {
            $updated = SupportRequest::query()
                ->whereKey($supportRequest->id)
                ->where('status', 'requested')
                ->update([
                    'status' => 'received',
                    'received_at' => now(),
                    'received_by_user_id' => $request->user()?->id,
                ]);

            if ($updated === 0 && $supportRequest->refresh()->status === 'cancelled') {
                return $this->fail('Cancelled support requests cannot be received or dispatched.', 409);
            }

            $shouldQueueReceivedUpdate = $updated === 1;
            if ($shouldQueueReceivedUpdate) {
                $supportRequest->refresh();
                $this->recordAction($supportRequest, $request, 'received', 'requested', 'received');
            }
        } elseif ($supportRequest->received_at === null) {
            $updated = SupportRequest::query()
                ->whereKey($supportRequest->id)
                ->where('status', '!=', 'cancelled')
                ->whereNull('received_at')
                ->update([
                    'received_at' => now(),
                    'received_by_user_id' => $request->user()?->id,
                ]);

            if ($updated === 0 && $supportRequest->refresh()->status === 'cancelled') {
                return $this->fail('Cancelled support requests cannot be received or dispatched.', 409);
            }
        }

        if ($shouldQueueReceivedUpdate) {
            $supportRequest->refresh();
            $delivery = $lifecycleRelay->queueLifecycleUpdate($supportRequest, 'received', dispatch: false);
            $lifecycleRelay->submit($delivery, connectTimeoutSeconds: 2, timeoutSeconds: 5);
        }

        return $this->ok([
            'request' => $this->requestPayload($supportRequest->refresh(), true),
        ]);
    }

    public function accept(Request $request, SupportRequest $supportRequest)
    {
        $validated = $request->validate([
            'notes' => ['nullable', 'string', 'max:4000'],
        ]);

        return $this->transition($request, $supportRequest, 'accepted', 'accepted', ['received'], [
            'notes' => $validated['notes'] ?? null,
        ]);
    }

    public function reject(Request $request, SupportRequest $supportRequest)
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:4000'],
        ]);

        return $this->transition($request, $supportRequest, 'rejected', 'rejected', ['received'], [
            'notes' => $validated['reason'],
            'metadata' => [
                'reason' => $validated['reason'],
            ],
        ]);
    }

    public function assign(Request $request, SupportRequest $supportRequest)
    {
        $validated = $request->validate([
            'team_name' => ['required', 'string', 'max:255'],
            'eta' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:4000'],
        ]);

        return $this->transition($request, $supportRequest, 'assigned', 'assigned', ['accepted'], [
            'notes' => $validated['notes'] ?? null,
            'metadata' => [
                'team_name' => $validated['team_name'],
                'eta' => $validated['eta'] ?? null,
            ],
        ]);
    }

    public function markEnRoute(Request $request, SupportRequest $supportRequest)
    {
        $validated = $request->validate([
            'notes' => ['nullable', 'string', 'max:4000'],
        ]);

        return $this->transition($request, $supportRequest, 'en_route', 'en_route', ['assigned'], [
            'notes' => $validated['notes'] ?? null,
        ]);
    }

    public function complete(Request $request, SupportRequest $supportRequest)
    {
        $validated = $request->validate([
            'notes' => ['nullable', 'string', 'max:4000'],
            'outcome' => ['nullable', 'string', 'max:4000'],
        ]);

        return $this->transition($request, $supportRequest, 'completed', 'completed', ['en_route'], [
            'notes' => $validated['notes'] ?? ($validated['outcome'] ?? null),
            'metadata' => [
                'outcome' => $validated['outcome'] ?? null,
            ],
        ]);
    }

    private function requestPayload(SupportRequest $supportRequest, bool $includeDetails): array
    {
        $payload = [
            'id' => $supportRequest->id,
            'support_request_id' => $supportRequest->support_request_id,
            'local_request_id' => $supportRequest->local_request_id,
            'correlation_id' => $supportRequest->correlation_id,
            'relay_message_id' => $supportRequest->relay_message_id,
            'source_system' => $supportRequest->source_system,
            'source_hub_id' => $supportRequest->source_hub_id,
            'source_relay_hub_id' => $supportRequest->source_relay_hub_id,
            'source_hub_name' => $supportRequest->source_hub_name,
            'status' => $supportRequest->status,
            'urgency' => $supportRequest->urgency,
            'requested_assistance' => $supportRequest->requested_assistance,
            'requested_capability' => $supportRequest->requested_capability,
            'quantity' => $supportRequest->quantity,
            'quantity_unit' => $supportRequest->quantity_unit,
            'requested_at' => $supportRequest->requested_at?->toIso8601String(),
            'intake_received_at' => $supportRequest->intake_received_at?->toIso8601String(),
            'received_at' => $supportRequest->received_at?->toIso8601String(),
            'received_by_user_id' => $supportRequest->received_by_user_id,
            'latest_update_delivery' => $this->latestUpdateDeliveryPayload($supportRequest),
            'requester' => [
                'user_id' => $supportRequest->requester_user_id,
                'display_name' => $supportRequest->requester_display_name,
                'role' => $supportRequest->requester_role,
            ],
            'created_at' => $supportRequest->created_at?->toIso8601String(),
            'updated_at' => $supportRequest->updated_at?->toIso8601String(),
        ];

        if ($includeDetails) {
            $payload += [
                'staging_notes' => $supportRequest->staging_notes,
                'command_notes' => $supportRequest->command_notes,
                'sitrep_context' => $supportRequest->sitrep_context,
                'gap_context' => $supportRequest->gap_context,
                'evidence_row' => $supportRequest->evidence_row,
                'incident_refs' => $supportRequest->incident_refs,
                'request_payload' => $supportRequest->request_payload,
                'update_deliveries' => $supportRequest->updateDeliveries()
                    ->latest('created_at')
                    ->latest('id')
                    ->get()
                    ->map(fn (SupportRequestUpdateDelivery $delivery): array => $this->updateDeliveryPayload($delivery))
                    ->values()
                    ->all(),
                'actions' => $supportRequest->actions()
                    ->oldest('acted_at')
                    ->oldest('id')
                    ->get()
                    ->map(fn (SupportRequestAction $action): array => $this->actionPayload($action))
                    ->values()
                    ->all(),
            ];
        }

        return $payload;
    }

    private function latestUpdateDeliveryPayload(SupportRequest $supportRequest): ?array
    {
        $delivery = $supportRequest->updateDeliveries()
            ->latest('created_at')
            ->latest('id')
            ->first();

        return $delivery instanceof SupportRequestUpdateDelivery
            ? $this->updateDeliveryPayload($delivery)
            : null;
    }

    private function updateDeliveryPayload(SupportRequestUpdateDelivery $delivery): array
    {
        return [
            'id' => $delivery->id,
            'update_id' => $delivery->update_id,
            'message_type' => $delivery->message_type,
            'source_system' => $delivery->source_system,
            'target_system' => $delivery->target_system,
            'status' => $delivery->status,
            'delivery_status' => $delivery->delivery_status,
            'relay_id' => $delivery->relay_id,
            'relay_message_id' => $delivery->relay_message_id,
            'deliveries_count' => $delivery->deliveries_count,
            'attempt_count' => $delivery->attempt_count,
            'last_attempted_at' => $delivery->last_attempted_at?->toIso8601String(),
            'submitted_at' => $delivery->submitted_at?->toIso8601String(),
            'last_error' => $delivery->last_error,
            'created_at' => $delivery->created_at?->toIso8601String(),
            'updated_at' => $delivery->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @param array<int, string> $allowedFrom
     * @param array{notes?: ?string, metadata?: ?array<string, mixed>} $options
     */
    private function transition(
        Request $request,
        SupportRequest $supportRequest,
        string $action,
        string $toStatus,
        array $allowedFrom,
        array $options = [],
    ) {
        $result = DB::transaction(function () use ($request, $supportRequest, $action, $toStatus, $allowedFrom, $options): array {
            $lockedRequest = SupportRequest::query()
                ->whereKey($supportRequest->id)
                ->lockForUpdate()
                ->firstOrFail();

            if (in_array($lockedRequest->status, self::TERMINAL_STATUSES, true)) {
                return [
                    'error' => 'Support request is already terminal and cannot be changed.',
                    'status_code' => 409,
                ];
            }

            if (! in_array($lockedRequest->status, $allowedFrom, true)) {
                return [
                    'error' => 'Support request status transition is not allowed.',
                    'status_code' => 409,
                    'data' => [
                        'current_status' => $lockedRequest->status,
                        'allowed_from' => $allowedFrom,
                        'target_status' => $toStatus,
                    ],
                ];
            }

            $fromStatus = $lockedRequest->status;

            $lockedRequest->forceFill([
                'status' => $toStatus,
            ])->save();

            $this->recordAction(
                $lockedRequest,
                $request,
                $action,
                $fromStatus,
                $toStatus,
                $options['notes'] ?? null,
                $options['metadata'] ?? null,
            );

            return [
                'request' => $lockedRequest->refresh(),
            ];
        });

        if (isset($result['error'])) {
            return $this->fail($result['error'], $result['status_code'], $result['data'] ?? null);
        }

        return $this->ok([
            'request' => $this->requestPayload($result['request'], true),
        ]);
    }

    /**
     * @param array<string, mixed>|null $metadata
     */
    private function recordAction(
        SupportRequest $supportRequest,
        Request $request,
        string $action,
        ?string $fromStatus,
        string $toStatus,
        ?string $notes = null,
        ?array $metadata = null,
    ): SupportRequestAction {
        return $supportRequest->actions()->create([
            'action' => $action,
            'from_status' => $fromStatus,
            'to_status' => $toStatus,
            'actor_user_id' => $request->user()?->id,
            'actor_name' => $request->user()?->name,
            'notes' => $notes,
            'metadata' => $metadata,
            'acted_at' => now(),
        ]);
    }

    private function actionPayload(SupportRequestAction $action): array
    {
        return [
            'id' => $action->id,
            'action' => $action->action,
            'from_status' => $action->from_status,
            'to_status' => $action->to_status,
            'actor_user_id' => $action->actor_user_id,
            'actor_name' => $action->actor_name,
            'notes' => $action->notes,
            'metadata' => $action->metadata,
            'acted_at' => $action->acted_at?->toIso8601String(),
        ];
    }
}
