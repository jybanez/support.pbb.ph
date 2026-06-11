<?php

namespace App\Http\Controllers\Api;

use App\Models\SupportRequest;
use App\Models\SupportRequestUpdateDelivery;
use App\Support\SupportRequests\SupportRequestLifecycleRelayService;
use Illuminate\Http\Request;

class SupportRequestsController extends BaseApiController
{
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
}
