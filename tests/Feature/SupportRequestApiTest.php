<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\SupportRequestsController;
use App\Models\SupportRequest;
use App\Models\User;
use App\Support\SupportRequests\SupportRequestLifecycleRelayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

class SupportRequestApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_list_support_requests(): void
    {
        $user = User::factory()->create(['role' => 'operator']);
        $request = $this->supportRequest([
            'requested_assistance' => 'Evacuation transport',
            'source_hub_name' => 'Apas Command Desk',
        ]);

        $this->actingAs($user)
            ->getJson('/api/support-requests')
            ->assertOk()
            ->assertJsonPath('data.requests.0.id', $request->id)
            ->assertJsonPath('data.requests.0.source_hub_name', 'Apas Command Desk')
            ->assertJsonPath('data.requests.0.requested_assistance', 'Evacuation transport')
            ->assertJsonMissing(['request_payload']);
    }

    public function test_authenticated_user_can_view_support_request_detail(): void
    {
        $user = User::factory()->create(['role' => 'operator']);
        $request = $this->supportRequest([
            'sitrep_context' => ['title' => 'Apas SITREP'],
            'evidence_row' => ['path' => 'needs.rollup.category_demand[0]'],
        ]);

        $this->actingAs($user)
            ->getJson('/api/support-requests/'.$request->id)
            ->assertOk()
            ->assertJsonPath('data.request.id', $request->id)
            ->assertJsonPath('data.request.sitrep_context.title', 'Apas SITREP')
            ->assertJsonPath('data.request.evidence_row.path', 'needs.rollup.category_demand[0]');
    }

    public function test_opening_request_marks_requested_item_received_once(): void
    {
        $viewer = User::factory()->create(['role' => 'operator']);
        $other = User::factory()->create(['role' => 'admin']);
        $request = $this->supportRequest(['status' => 'requested']);

        $this->actingAs($viewer)
            ->postJson('/api/support-requests/'.$request->id.'/receive')
            ->assertOk()
            ->assertJsonPath('data.request.status', 'received')
            ->assertJsonPath('data.request.received_by_user_id', $viewer->id);

        $receivedAt = $request->refresh()->received_at?->toIso8601String();

        $this->actingAs($other)
            ->postJson('/api/support-requests/'.$request->id.'/receive')
            ->assertOk()
            ->assertJsonPath('data.request.status', 'received')
            ->assertJsonPath('data.request.received_by_user_id', $viewer->id);

        $request->refresh();
        $this->assertSame($receivedAt, $request->received_at?->toIso8601String());
        $this->assertSame($viewer->id, $request->received_by_user_id);
    }

    public function test_stale_requested_receive_does_not_overwrite_cancelled_request(): void
    {
        $viewer = User::factory()->create(['role' => 'operator']);
        $request = $this->supportRequest(['status' => 'requested']);
        $httpRequest = Request::create('/api/support-requests/'.$request->id.'/receive', 'POST');
        $httpRequest->setUserResolver(fn () => $viewer);

        SupportRequest::query()
            ->whereKey($request->id)
            ->update(['status' => 'cancelled']);

        $response = app(SupportRequestsController::class)->receive(
            $httpRequest,
            $request,
            app(SupportRequestLifecycleRelayService::class),
        );

        $this->assertSame(409, $response->getStatusCode());

        $request->refresh();
        $this->assertSame('cancelled', $request->status);
        $this->assertNull($request->received_at);
        $this->assertNull($request->received_by_user_id);
        $this->assertDatabaseCount('support_request_update_deliveries', 0);
    }

    public function test_stale_non_requested_receive_does_not_touch_cancelled_request(): void
    {
        $viewer = User::factory()->create(['role' => 'operator']);
        $request = $this->supportRequest(['status' => 'accepted']);
        $httpRequest = Request::create('/api/support-requests/'.$request->id.'/receive', 'POST');
        $httpRequest->setUserResolver(fn () => $viewer);

        SupportRequest::query()
            ->whereKey($request->id)
            ->update(['status' => 'cancelled']);

        $response = app(SupportRequestsController::class)->receive(
            $httpRequest,
            $request,
            app(SupportRequestLifecycleRelayService::class),
        );

        $this->assertSame(409, $response->getStatusCode());

        $request->refresh();
        $this->assertSame('cancelled', $request->status);
        $this->assertNull($request->received_at);
        $this->assertNull($request->received_by_user_id);
        $this->assertDatabaseCount('support_request_update_deliveries', 0);
    }

    public function test_guest_cannot_access_support_requests(): void
    {
        $request = $this->supportRequest();

        $this->getJson('/api/support-requests')->assertUnauthorized();
        $this->getJson('/api/support-requests/'.$request->id)->assertUnauthorized();
        $this->postJson('/api/support-requests/'.$request->id.'/receive')->assertUnauthorized();
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
        ]);
    }
}
