<?php

namespace App\Http\Controllers\Api;

use App\Models\SupportRequest;
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

    public function receive(Request $request, SupportRequest $supportRequest)
    {
        if ($supportRequest->status === 'requested') {
            $supportRequest->forceFill([
                'status' => 'received',
                'received_at' => now(),
                'received_by_user_id' => $request->user()?->id,
            ])->save();
        } elseif ($supportRequest->received_at === null) {
            $supportRequest->forceFill([
                'received_at' => now(),
                'received_by_user_id' => $request->user()?->id,
            ])->save();
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
            ];
        }

        return $payload;
    }
}
