<?php

namespace Tests\Feature;

use App\Models\SupportRequest;
use App\Models\SupportRequestMessage;
use App\Models\User;
use App\Support\Settings\SupportSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupportRequestLifecycleIntakeTest extends TestCase
{
    use RefreshDatabase;

    public function test_hotline_can_cancel_request_before_received(): void
    {
        app(SupportSettings::class)->update([
            'relayHandlerToken' => 'handler-secret',
        ]);
        $request = $this->supportRequest(['status' => 'requested']);

        $this->postJson('/api/relay/support-request-lifecycle', $this->cancellationEnvelope(), [
            'Authorization' => 'Bearer handler-secret',
        ])
            ->assertOk()
            ->assertJsonPath('data.correlation_id', $request->correlation_id)
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.validation_status', SupportRequestMessage::STATUS_ACCEPTED);

        $this->assertSame('cancelled', $request->refresh()->status);

        $message = SupportRequestMessage::query()->firstOrFail();
        $this->assertSame($request->id, $message->support_request_id);
        $this->assertSame('support.request.cancelled', $message->message_type);
        $this->assertSame(SupportRequestMessage::STATUS_ACCEPTED, $message->validation_status);
        $this->assertSame('Command stood down the evacuation request.', $message->payload['request']['cancellation_reason']);
    }

    public function test_hotline_can_cancel_request_after_received(): void
    {
        app(SupportSettings::class)->update([
            'relayHandlerToken' => 'handler-secret',
        ]);
        $request = $this->supportRequest(['status' => 'received', 'received_at' => now()]);

        $this->postJson('/api/relay/support-request-lifecycle', $this->cancellationEnvelope(), [
            'Authorization' => 'Bearer handler-secret',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.validation_status', SupportRequestMessage::STATUS_ACCEPTED);

        $this->assertSame('cancelled', $request->refresh()->status);
    }

    public function test_hotline_can_cancel_request_after_accepted_or_assigned(): void
    {
        foreach (['accepted', 'assigned'] as $status) {
            SupportRequest::query()->delete();
            SupportRequestMessage::query()->delete();

            app(SupportSettings::class)->update([
                'relayHandlerToken' => 'handler-secret',
            ]);
            $request = $this->supportRequest([
                'status' => $status,
                'correlation_id' => 'support-corr-'.$status,
                'local_request_id' => 'hotline-req-'.$status,
            ]);

            $this->postJson('/api/relay/support-request-lifecycle', $this->cancellationEnvelope([
                'message' => [
                    'id' => 'relay-msg-cancel-'.$status,
                    'payload' => [
                        'request' => [
                            'local_request_id' => $request->local_request_id,
                            'correlation_id' => $request->correlation_id,
                        ],
                    ],
                ],
            ]), [
                'Authorization' => 'Bearer handler-secret',
            ])
                ->assertOk()
                ->assertJsonPath('data.status', 'cancelled')
                ->assertJsonPath('data.validation_status', SupportRequestMessage::STATUS_ACCEPTED);

            $this->assertSame('cancelled', $request->refresh()->status);
            $this->assertDatabaseHas('support_request_messages', [
                'support_request_id' => $request->id,
                'message_type' => 'support.request.cancelled',
                'validation_status' => SupportRequestMessage::STATUS_ACCEPTED,
            ]);
        }
    }

    public function test_completed_and_rejected_requests_do_not_get_rewritten_by_late_cancellation(): void
    {
        foreach (['completed', 'rejected'] as $status) {
            SupportRequest::query()->delete();
            SupportRequestMessage::query()->delete();

            app(SupportSettings::class)->update([
                'relayHandlerToken' => 'handler-secret',
            ]);
            $request = $this->supportRequest([
                'status' => $status,
                'correlation_id' => 'support-corr-'.$status,
                'local_request_id' => 'hotline-req-'.$status,
            ]);

            $this->postJson('/api/relay/support-request-lifecycle', $this->cancellationEnvelope([
                'message' => [
                    'id' => 'relay-msg-cancel-'.$status,
                    'payload' => [
                        'request' => [
                            'local_request_id' => $request->local_request_id,
                            'correlation_id' => $request->correlation_id,
                        ],
                    ],
                ],
            ]), [
                'Authorization' => 'Bearer handler-secret',
            ])
                ->assertAccepted()
                ->assertJsonPath('data.validation_status', SupportRequestMessage::STATUS_INVALID);

            $this->assertSame($status, $request->refresh()->status);

            $message = SupportRequestMessage::query()->firstOrFail();
            $this->assertSame($request->id, $message->support_request_id);
            $this->assertSame(SupportRequestMessage::STATUS_INVALID, $message->validation_status);
            $this->assertContains('request.status', collect($message->validation_errors)->pluck('field')->all());
        }
    }

    public function test_cancelled_requests_cannot_be_received_for_dispatch(): void
    {
        $viewer = User::factory()->create(['role' => 'operator']);
        $request = $this->supportRequest(['status' => 'cancelled']);

        $this->actingAs($viewer)
            ->postJson('/api/support-requests/'.$request->id.'/receive')
            ->assertConflict();

        $request->refresh();
        $this->assertSame('cancelled', $request->status);
        $this->assertNull($request->received_at);
        $this->assertNull($request->received_by_user_id);
    }

    public function test_cancellation_for_already_cancelled_request_is_idempotent(): void
    {
        app(SupportSettings::class)->update([
            'relayHandlerToken' => 'handler-secret',
        ]);
        $request = $this->supportRequest(['status' => 'cancelled']);

        $this->postJson('/api/relay/support-request-lifecycle', $this->cancellationEnvelope([
            'message' => [
                'id' => 'relay-msg-cancel-already-cancelled',
            ],
        ]), [
            'Authorization' => 'Bearer handler-secret',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.validation_status', SupportRequestMessage::STATUS_DUPLICATE);

        $this->assertSame('cancelled', $request->refresh()->status);

        $message = SupportRequestMessage::query()->firstOrFail();
        $this->assertSame($request->id, $message->support_request_id);
        $this->assertSame(SupportRequestMessage::STATUS_DUPLICATE, $message->validation_status);
    }

    public function test_lifecycle_handler_rejects_invalid_source_target_and_direction(): void
    {
        app(SupportSettings::class)->update([
            'relayHandlerToken' => 'handler-secret',
        ]);
        $this->supportRequest();

        $this->postJson('/api/relay/support-request-lifecycle', $this->cancellationEnvelope([
            'event' => 'relay.message.sent',
            'message' => [
                'id' => 'relay-msg-wrong-direction',
                'source_system' => 'support.dispatch',
                'targets' => [
                    [
                        'systems' => ['hotline.command'],
                    ],
                ],
            ],
        ]), [
            'Authorization' => 'Bearer handler-secret',
        ])
            ->assertAccepted()
            ->assertJsonPath('data.validation_status', SupportRequestMessage::STATUS_INVALID);

        $message = SupportRequestMessage::query()->firstOrFail();
        $this->assertSame('support.dispatch', $message->source_system);
        $this->assertSame('hotline.command', $message->target_system);
        $this->assertSame(SupportRequestMessage::STATUS_INVALID, $message->validation_status);
        $this->assertContains('event', collect($message->validation_errors)->pluck('field')->all());
        $this->assertContains('message.source_system', collect($message->validation_errors)->pluck('field')->all());
        $this->assertContains('message.targets', collect($message->validation_errors)->pluck('field')->all());
    }

    public function test_lifecycle_handler_rejects_unsupported_hotline_amendment_but_keeps_payload_auditable(): void
    {
        app(SupportSettings::class)->update([
            'relayHandlerToken' => 'handler-secret',
        ]);
        $this->supportRequest();

        $this->postJson('/api/relay/support-request-lifecycle', $this->cancellationEnvelope([
            'message' => [
                'id' => 'relay-msg-updated',
                'message_type' => 'support.request.updated',
                'payload' => [
                    'request' => [
                        'status' => 'updated',
                        'cancellation_reason' => 'Change staging point.',
                    ],
                ],
            ],
        ]), [
            'Authorization' => 'Bearer handler-secret',
        ])
            ->assertAccepted()
            ->assertJsonPath('data.validation_status', SupportRequestMessage::STATUS_INVALID);

        $message = SupportRequestMessage::query()->firstOrFail();
        $this->assertSame('support.request.updated', $message->message_type);
        $this->assertSame('Change staging point.', $message->payload['request']['cancellation_reason']);
        $this->assertNotEmpty($message->validation_errors);
    }

    public function test_lifecycle_handler_rejects_mixed_request_identifiers(): void
    {
        app(SupportSettings::class)->update([
            'relayHandlerToken' => 'handler-secret',
        ]);
        $request = $this->supportRequest();

        $this->postJson('/api/relay/support-request-lifecycle', $this->cancellationEnvelope([
            'message' => [
                'id' => 'relay-msg-mixed-ids',
                'payload' => [
                    'request' => [
                        'local_request_id' => 'hotline-req-other',
                        'correlation_id' => $request->correlation_id,
                    ],
                ],
            ],
        ]), [
            'Authorization' => 'Bearer handler-secret',
        ])
            ->assertAccepted()
            ->assertJsonPath('data.validation_status', SupportRequestMessage::STATUS_INVALID);

        $this->assertSame('requested', $request->refresh()->status);

        $message = SupportRequestMessage::query()->firstOrFail();
        $this->assertSame($request->id, $message->support_request_id);
        $this->assertContains('request.local_request_id', collect($message->validation_errors)->pluck('field')->all());
    }

    /**
     * @param array<string, mixed> $overrides
     */
    private function supportRequest(array $overrides = []): SupportRequest
    {
        return SupportRequest::query()->create([
            'support_request_id' => $overrides['support_request_id'] ?? 'sup_01K00000000000000000000000',
            'local_request_id' => $overrides['local_request_id'] ?? 'hotline-req-1001',
            'correlation_id' => $overrides['correlation_id'] ?? 'support-corr-1001',
            'relay_message_id' => $overrides['relay_message_id'] ?? 'relay-msg-1001',
            'source_system' => $overrides['source_system'] ?? 'hotline.command',
            'source_hub_id' => $overrides['source_hub_id'] ?? 'cebu-apas',
            'source_relay_hub_id' => $overrides['source_relay_hub_id'] ?? 'relay-cebu-apas',
            'source_hub_name' => $overrides['source_hub_name'] ?? 'Apas Command Desk',
            'status' => $overrides['status'] ?? 'requested',
            'urgency' => $overrides['urgency'] ?? 'urgent',
            'requested_assistance' => $overrides['requested_assistance'] ?? 'Transport support',
            'requested_capability' => $overrides['requested_capability'] ?? 'evacuation_transport',
            'quantity' => $overrides['quantity'] ?? 3,
            'quantity_unit' => $overrides['quantity_unit'] ?? 'vehicles',
            'staging_notes' => $overrides['staging_notes'] ?? 'Stage at barangay hall.',
            'command_notes' => $overrides['command_notes'] ?? 'Coordinate before dispatch.',
            'requested_at' => $overrides['requested_at'] ?? '2026-06-11T09:15:00+08:00',
            'requester_user_id' => $overrides['requester_user_id'] ?? 'hotline-user-7',
            'requester_display_name' => $overrides['requester_display_name'] ?? 'Apas Duty Officer',
            'requester_role' => $overrides['requester_role'] ?? 'barangay_command',
            'sitrep_context' => $overrides['sitrep_context'] ?? ['title' => 'Apas SITREP 2026-06-11 09:00'],
            'gap_context' => $overrides['gap_context'] ?? ['gap_id' => 'gap-7'],
            'evidence_row' => $overrides['evidence_row'] ?? ['path' => 'needs.rollup.category_demand[0]'],
            'incident_refs' => $overrides['incident_refs'] ?? [['id' => 'incident-55']],
            'request_payload' => $overrides['request_payload'] ?? ['schema_version' => 1],
            'raw_envelope' => $overrides['raw_envelope'] ?? ['message' => ['id' => 'relay-msg-1001']],
            'intake_received_at' => $overrides['intake_received_at'] ?? now(),
            'received_at' => $overrides['received_at'] ?? null,
            'received_by_user_id' => $overrides['received_by_user_id'] ?? null,
        ]);
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function cancellationEnvelope(array $overrides = []): array
    {
        return array_replace_recursive([
            'event' => 'relay.message.received',
            'message' => [
                'id' => 'relay-msg-cancel-1001',
                'relay_id' => '01J00000000000000000000002',
                'source_system' => 'hotline.command',
                'message_type' => 'support.request.cancelled',
                'targets' => [
                    [
                        'systems' => ['support.dispatch'],
                    ],
                ],
                'payload' => [
                    'schema_version' => 1,
                    'request' => [
                        'local_request_id' => 'hotline-req-1001',
                        'correlation_id' => 'support-corr-1001',
                        'status' => 'cancelled',
                        'cancelled_at' => '2026-06-11T10:15:00+08:00',
                        'cancellation_reason' => 'Command stood down the evacuation request.',
                    ],
                    'source' => [
                        'system' => 'hotline.command',
                    ],
                ],
            ],
        ], $overrides);
    }
}
