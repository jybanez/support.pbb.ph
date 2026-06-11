<?php

namespace Tests\Feature;

use App\Models\SupportRequest;
use App\Models\SupportRequestMessage;
use App\Support\Settings\SupportSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupportRequestIntakeTest extends TestCase
{
    use RefreshDatabase;

    public function test_support_request_handler_requires_configured_bearer_token(): void
    {
        $this->postJson('/api/relay/support-requests', $this->supportRequestEnvelope())
            ->assertUnauthorized();
    }

    public function test_support_request_handler_accepts_valid_hotline_request(): void
    {
        app(SupportSettings::class)->update([
            'relayHandlerToken' => 'handler-secret',
        ]);

        $this->postJson('/api/relay/support-requests', $this->supportRequestEnvelope(), [
            'Authorization' => 'Bearer handler-secret',
        ])
            ->assertCreated()
            ->assertJsonPath('data.local_request_id', 'hotline-req-1001')
            ->assertJsonPath('data.correlation_id', 'support-corr-1001')
            ->assertJsonPath('data.status', 'requested')
            ->assertJsonPath('data.validation_status', SupportRequestMessage::STATUS_ACCEPTED);

        $request = SupportRequest::query()->firstOrFail();

        $this->assertStringStartsWith('sup_', $request->support_request_id);
        $this->assertSame('hotline-req-1001', $request->local_request_id);
        $this->assertSame('support-corr-1001', $request->correlation_id);
        $this->assertSame('hotline.command', $request->source_system);
        $this->assertSame('relay-cebu-apas', $request->source_relay_hub_id);
        $this->assertSame('Apas Command Desk', $request->source_hub_name);
        $this->assertSame('evacuation_transport', $request->requested_capability);
        $this->assertSame('Apas SITREP 2026-06-11 09:00', $request->sitrep_context['title']);
        $this->assertSame('gap-7', $request->gap_context['gap_id']);
        $this->assertSame('needs.rollup.category_demand[0]', $request->evidence_row['path']);

        $message = SupportRequestMessage::query()->firstOrFail();

        $this->assertSame(SupportRequestMessage::STATUS_ACCEPTED, $message->validation_status);
        $this->assertSame('support.request', $message->message_type);
        $this->assertSame('hotline.command', $message->source_system);
        $this->assertSame('support.dispatch', $message->target_system);
        $this->assertSame($request->id, $message->support_request_id);
    }

    public function test_support_request_handler_rejects_lifecycle_update_direction_for_intake(): void
    {
        app(SupportSettings::class)->update([
            'relayHandlerToken' => 'handler-secret',
        ]);

        $envelope = $this->supportRequestEnvelope([
            'message' => [
                'id' => 'relay-msg-2001',
                'source_system' => 'support.dispatch',
                'message_type' => 'support.request.cancelled',
                'targets' => [
                    [
                        'systems' => ['hotline.command'],
                    ],
                ],
            ],
        ]);

        $this->postJson('/api/relay/support-requests', $envelope, [
            'Authorization' => 'Bearer handler-secret',
        ])
            ->assertAccepted()
            ->assertJsonPath('data.validation_status', SupportRequestMessage::STATUS_INVALID);

        $this->assertDatabaseCount('support_requests', 0);

        $message = SupportRequestMessage::query()->firstOrFail();

        $this->assertSame(SupportRequestMessage::STATUS_INVALID, $message->validation_status);
        $this->assertSame('support.request.cancelled', $message->message_type);
        $this->assertSame('support.dispatch', $message->source_system);
        $this->assertSame('hotline.command', $message->target_system);
        $this->assertNotEmpty($message->validation_errors);
    }

    public function test_support_request_handler_rejects_hotline_amendment_messages_for_intake(): void
    {
        app(SupportSettings::class)->update([
            'relayHandlerToken' => 'handler-secret',
        ]);

        $envelope = $this->supportRequestEnvelope([
            'message' => [
                'id' => 'relay-msg-2002',
                'message_type' => 'support.request.cancelled',
            ],
        ]);

        $this->postJson('/api/relay/support-requests', $envelope, [
            'Authorization' => 'Bearer handler-secret',
        ])
            ->assertAccepted()
            ->assertJsonPath('data.validation_status', SupportRequestMessage::STATUS_INVALID);

        $this->assertDatabaseCount('support_requests', 0);

        $message = SupportRequestMessage::query()->firstOrFail();

        $this->assertSame(SupportRequestMessage::STATUS_INVALID, $message->validation_status);
        $this->assertSame('support.request.cancelled', $message->message_type);
        $this->assertSame('hotline.command', $message->source_system);
        $this->assertSame('support.dispatch', $message->target_system);
        $this->assertNotEmpty($message->validation_errors);
    }

    public function test_support_request_handler_is_idempotent_by_relay_message_id(): void
    {
        app(SupportSettings::class)->update([
            'relayHandlerToken' => 'handler-secret',
        ]);

        $envelope = $this->supportRequestEnvelope();

        $this->postJson('/api/relay/support-requests', $envelope, [
            'Authorization' => 'Bearer handler-secret',
        ])->assertCreated();

        $this->postJson('/api/relay/support-requests', $envelope, [
            'Authorization' => 'Bearer handler-secret',
        ])
            ->assertOk()
            ->assertJsonPath('data.validation_status', SupportRequestMessage::STATUS_DUPLICATE)
            ->assertJsonPath('data.correlation_id', 'support-corr-1001');

        $this->assertDatabaseCount('support_requests', 1);
        $this->assertDatabaseCount('support_request_messages', 1);
    }

    public function test_support_request_handler_is_idempotent_by_correlation_id(): void
    {
        app(SupportSettings::class)->update([
            'relayHandlerToken' => 'handler-secret',
        ]);

        $this->postJson('/api/relay/support-requests', $this->supportRequestEnvelope(), [
            'Authorization' => 'Bearer handler-secret',
        ])->assertCreated();

        $this->postJson('/api/relay/support-requests', $this->supportRequestEnvelope([
            'message' => [
                'id' => 'relay-msg-1002',
            ],
        ]), [
            'Authorization' => 'Bearer handler-secret',
        ])
            ->assertOk()
            ->assertJsonPath('data.validation_status', SupportRequestMessage::STATUS_DUPLICATE)
            ->assertJsonPath('data.correlation_id', 'support-corr-1001');

        $this->assertDatabaseCount('support_requests', 1);
        $this->assertDatabaseCount('support_request_messages', 2);

        $duplicate = SupportRequestMessage::query()
            ->where('relay_message_id', 'relay-msg-1002')
            ->firstOrFail();

        $this->assertSame(SupportRequestMessage::STATUS_DUPLICATE, $duplicate->validation_status);
        $this->assertNotNull($duplicate->support_request_id);
    }

    public function test_support_request_handler_retains_invalid_payload_for_inspection(): void
    {
        app(SupportSettings::class)->update([
            'relayHandlerToken' => 'handler-secret',
        ]);

        $envelope = $this->supportRequestEnvelope([
            'message' => [
                'id' => 'relay-msg-invalid',
            ],
        ]);
        $envelope['message']['payload'] = [
            'schema_version' => 1,
            'request' => [
                'local_request_id' => 'missing-required-fields',
            ],
        ];

        $this->postJson('/api/relay/support-requests', $envelope, [
            'Authorization' => 'Bearer handler-secret',
        ])
            ->assertAccepted()
            ->assertJsonPath('data.validation_status', SupportRequestMessage::STATUS_INVALID);

        $this->assertDatabaseCount('support_requests', 0);

        $message = SupportRequestMessage::query()->firstOrFail();

        $this->assertSame(SupportRequestMessage::STATUS_INVALID, $message->validation_status);
        $this->assertSame('missing-required-fields', $message->payload['request']['local_request_id']);
        $this->assertNotEmpty($message->validation_errors);
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function supportRequestEnvelope(array $overrides = []): array
    {
        return array_replace_recursive([
            'event' => 'relay.message.received',
            'message' => [
                'id' => 'relay-msg-1001',
                'relay_id' => '01J00000000000000000000001',
                'source_system' => 'hotline.command',
                'message_type' => 'support.request',
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
                        'status' => 'requested',
                        'urgency' => 'urgent',
                        'requested_assistance' => 'Transport support for evacuation staging',
                        'requested_capability' => 'evacuation_transport',
                        'quantity' => 3,
                        'quantity_unit' => 'vehicles',
                        'staging_notes' => 'Stage at barangay hall.',
                        'command_notes' => 'Coordinate with barangay captain before dispatch.',
                        'requested_at' => '2026-06-11T09:15:00+08:00',
                    ],
                    'source' => [
                        'system' => 'hotline.command',
                        'hub_id' => 'cebu-apas',
                        'relay_hub_id' => 'relay-cebu-apas',
                        'hub_name' => 'Apas Command Desk',
                    ],
                    'requester' => [
                        'user_id' => 'hotline-user-7',
                        'display_name' => 'Apas Duty Officer',
                        'role' => 'barangay_command',
                    ],
                    'sitrep' => [
                        'title' => 'Apas SITREP 2026-06-11 09:00',
                        'generated_at' => '2026-06-11T09:00:00+08:00',
                    ],
                    'gap' => [
                        'gap_id' => 'gap-7',
                        'category' => 'transport',
                    ],
                    'evidence_row' => [
                        'path' => 'needs.rollup.category_demand[0]',
                        'label' => 'Transport support requested',
                    ],
                    'incident_refs' => [
                        [
                            'id' => 'incident-55',
                            'label' => 'Flooded road access',
                        ],
                    ],
                ],
            ],
        ], $overrides);
    }
}
