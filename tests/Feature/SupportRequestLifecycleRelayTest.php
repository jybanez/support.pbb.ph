<?php

namespace Tests\Feature;

use App\Jobs\SubmitSupportRequestUpdateDelivery;
use App\Models\SupportRequest;
use App\Models\SupportRequestUpdateDelivery;
use App\Models\User;
use App\Support\Settings\SupportSettings;
use App\Support\SupportRequests\SupportRequestLifecycleRelayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class SupportRequestLifecycleRelayTest extends TestCase
{
    use RefreshDatabase;

    public function test_received_update_envelope_contains_stable_contract_identifiers(): void
    {
        Queue::fake();
        $this->settings([
            'supportRequestUpdateSourceSystem' => 'support.dispatch',
            'supportRequestUpdateTargetSystem' => 'hotline.command',
        ]);
        $request = $this->supportRequest([
            'status' => 'received',
            'received_at' => '2026-06-11T10:30:00+08:00',
            'updated_at' => '2026-06-11T10:30:00+08:00',
        ]);

        $delivery = app(SupportRequestLifecycleRelayService::class)
            ->queueLifecycleUpdate($request, 'received');

        $envelope = $delivery->envelope;
        $updateId = $delivery->update_id;
        $updatedAt = $request->refresh()->updated_at?->toIso8601String();

        $this->assertSame('support.request.received', $envelope['message_type']);
        $this->assertSame('support.dispatch', $envelope['source_system']);
        $this->assertSame('relay-cebu-apas', $envelope['targets'][0]['id']);
        $this->assertSame(['hotline.command'], $envelope['targets'][0]['systems']);
        $this->assertSame($request->correlation_id, $envelope['correlation_id']);
        $this->assertSame($updateId, $envelope['reference_id']);
        $this->assertSame($updateId, $envelope['payload']['update']['update_id']);
        $this->assertSame('received', $envelope['payload']['update']['status']);
        $this->assertSame($updatedAt, $envelope['payload']['update']['updated_at']);
        $this->assertSame($request->id, $envelope['payload']['request']['id']);
        $this->assertSame('hotline-req-1001', $envelope['payload']['request']['local_request_id']);
        $this->assertSame('sup_01K00000000000000000000000', $envelope['payload']['request']['support_request_id']);
        $this->assertSame('support-corr-1001', $envelope['payload']['request']['correlation_id']);
        $this->assertSame('received', $envelope['payload']['request']['status']);
        $this->assertSame($updatedAt, $envelope['payload']['request']['updated_at']);
        $this->assertSame('support.dispatch', $envelope['payload']['source']['system']);
        $this->assertSame('hotline.command', $envelope['payload']['target']['system']);
    }

    public function test_successful_relay_delivery_marks_support_request_update_sent(): void
    {
        Queue::fake();
        $this->settings([
            'relayUrl' => 'https://relay.pbb.ph',
            'relayToken' => 'relay-secret',
        ]);
        Http::fake([
            'relay.pbb.ph/api/v1/messages' => Http::response([
                'relay_id' => '01JRELAY000000000000000001',
                'message_id' => 'relay-msg-update-1001',
                'deliveries_count' => 1,
            ], 201),
        ]);

        $request = $this->supportRequest([
            'status' => 'received',
            'updated_at' => '2026-06-11T10:30:00+08:00',
        ]);
        $delivery = app(SupportRequestLifecycleRelayService::class)
            ->queueLifecycleUpdate($request, 'received');

        app(SupportRequestLifecycleRelayService::class)->submit($delivery);

        $delivery->refresh();
        $this->assertSame(SupportRequestUpdateDelivery::STATUS_SENT, $delivery->delivery_status);
        $this->assertSame('01JRELAY000000000000000001', $delivery->relay_id);
        $this->assertSame('relay-msg-update-1001', $delivery->relay_message_id);
        $this->assertSame(1, $delivery->deliveries_count);
        $this->assertSame(1, $delivery->attempt_count);
        $this->assertNull($delivery->last_error);

        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://relay.pbb.ph/api/v1/messages'
            && $request->hasHeader('X-Relay-Key', 'relay-secret')
            && $request['message_type'] === 'support.request.received'
            && $request['payload']['request']['support_request_id'] === 'sup_01K00000000000000000000000');
    }

    public function test_relay_failure_is_persisted_for_operator_visibility(): void
    {
        Queue::fake();
        $this->settings([
            'relayUrl' => 'https://relay.pbb.ph',
            'relayToken' => 'relay-secret',
        ]);
        Http::fake([
            'relay.pbb.ph/api/v1/messages' => Http::response(['error' => 'downstream unavailable'], 503),
        ]);

        $request = $this->supportRequest([
            'status' => 'received',
            'updated_at' => '2026-06-11T10:30:00+08:00',
        ]);
        $delivery = app(SupportRequestLifecycleRelayService::class)
            ->queueLifecycleUpdate($request, 'received');

        app(SupportRequestLifecycleRelayService::class)->submit($delivery);

        $delivery->refresh();
        $this->assertSame(SupportRequestUpdateDelivery::STATUS_FAILED, $delivery->delivery_status);
        $this->assertSame(1, $delivery->attempt_count);
        $this->assertStringContainsString('HTTP 503', (string) $delivery->last_error);
        $this->assertStringContainsString('downstream unavailable', (string) $delivery->last_error);

        $operator = User::factory()->create(['role' => 'operator']);
        $this->actingAs($operator)
            ->getJson('/api/support-requests/'.$request->id)
            ->assertOk()
            ->assertJsonPath('data.request.update_deliveries.0.delivery_status', SupportRequestUpdateDelivery::STATUS_FAILED)
            ->assertJsonPath('data.request.update_deliveries.0.last_error', $delivery->last_error);
    }

    public function test_duplicate_receive_retries_do_not_create_duplicate_lifecycle_effects(): void
    {
        Queue::fake();
        $viewer = User::factory()->create(['role' => 'operator']);
        $other = User::factory()->create(['role' => 'admin']);
        $request = $this->supportRequest(['status' => 'requested']);

        $this->actingAs($viewer)
            ->postJson('/api/support-requests/'.$request->id.'/receive')
            ->assertOk()
            ->assertJsonPath('data.request.status', 'received')
            ->assertJsonPath('data.request.latest_update_delivery.delivery_status', SupportRequestUpdateDelivery::STATUS_PENDING);

        $receivedAt = $request->refresh()->received_at?->toIso8601String();
        $updatedAt = $request->updated_at?->toIso8601String();

        $this->actingAs($other)
            ->postJson('/api/support-requests/'.$request->id.'/receive')
            ->assertOk()
            ->assertJsonPath('data.request.status', 'received');

        $request->refresh();
        $this->assertSame($receivedAt, $request->received_at?->toIso8601String());
        $this->assertSame($updatedAt, $request->updated_at?->toIso8601String());
        $this->assertSame($viewer->id, $request->received_by_user_id);
        $this->assertSame(1, SupportRequestUpdateDelivery::query()->where('support_request_id', $request->id)->count());
        Queue::assertPushed(SubmitSupportRequestUpdateDelivery::class, 1);
    }

    /**
     * @param array<string, mixed> $settings
     */
    private function settings(array $settings): void
    {
        app(SupportSettings::class)->update($settings);
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
            'created_at' => $overrides['created_at'] ?? null,
            'updated_at' => $overrides['updated_at'] ?? null,
        ]);
    }
}
