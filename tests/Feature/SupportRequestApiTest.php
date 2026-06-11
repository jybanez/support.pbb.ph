<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\SupportRequestsController;
use App\Models\SupportRequest;
use App\Models\SupportRequestAction;
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
        $this->assertDatabaseCount('support_request_actions', 1);
        $this->assertDatabaseHas('support_request_actions', [
            'support_request_id' => $request->id,
            'action' => 'received',
            'from_status' => 'requested',
            'to_status' => 'received',
            'actor_user_id' => $viewer->id,
        ]);
    }

    public function test_operator_can_accept_received_request(): void
    {
        $user = User::factory()->create(['role' => 'operator', 'name' => 'Support Lead']);
        $request = $this->supportRequest(['status' => 'received']);

        $this->actingAs($user)
            ->postJson('/api/support-requests/'.$request->id.'/accept', [
                'notes' => 'Support can provide transport.',
            ])
            ->assertOk()
            ->assertJsonPath('data.request.status', 'accepted')
            ->assertJsonPath('data.request.actions.0.action', 'accepted')
            ->assertJsonPath('data.request.actions.0.actor_name', 'Support Lead');

        $this->assertSame('accepted', $request->refresh()->status);
        $this->assertActionWritten($request, 'accepted', 'received', 'accepted', $user->id);
    }

    public function test_operator_can_reject_received_request_as_cannot_support(): void
    {
        $user = User::factory()->create(['role' => 'operator']);
        $request = $this->supportRequest(['status' => 'received']);

        $this->actingAs($user)
            ->postJson('/api/support-requests/'.$request->id.'/reject', [
                'reason' => 'No available transport team for the requested window.',
            ])
            ->assertOk()
            ->assertJsonPath('data.request.status', 'rejected')
            ->assertJsonPath('data.request.actions.0.action', 'rejected')
            ->assertJsonPath('data.request.actions.0.metadata.reason', 'No available transport team for the requested window.');

        $this->assertSame('rejected', $request->refresh()->status);
        $this->assertActionWritten($request, 'rejected', 'received', 'rejected', $user->id);
    }

    public function test_operator_can_assign_accepted_request(): void
    {
        $user = User::factory()->create(['role' => 'operator']);
        $request = $this->supportRequest(['status' => 'accepted']);

        $this->actingAs($user)
            ->postJson('/api/support-requests/'.$request->id.'/assign', [
                'team_name' => 'Rescue Team 1',
                'eta' => '20 minutes',
                'notes' => 'Dispatch via barangay hall.',
            ])
            ->assertOk()
            ->assertJsonPath('data.request.status', 'assigned')
            ->assertJsonPath('data.request.actions.0.action', 'assigned')
            ->assertJsonPath('data.request.actions.0.metadata.team_name', 'Rescue Team 1')
            ->assertJsonPath('data.request.actions.0.metadata.eta', '20 minutes');

        $this->assertSame('assigned', $request->refresh()->status);
        $this->assertActionWritten($request, 'assigned', 'accepted', 'assigned', $user->id);
    }

    public function test_operator_can_mark_assigned_request_en_route(): void
    {
        $user = User::factory()->create(['role' => 'operator']);
        $request = $this->supportRequest(['status' => 'assigned']);

        $this->actingAs($user)
            ->postJson('/api/support-requests/'.$request->id.'/en-route', [
                'notes' => 'Team departed staging area.',
            ])
            ->assertOk()
            ->assertJsonPath('data.request.status', 'en_route')
            ->assertJsonPath('data.request.actions.0.action', 'en_route');

        $this->assertSame('en_route', $request->refresh()->status);
        $this->assertActionWritten($request, 'en_route', 'assigned', 'en_route', $user->id);
    }

    public function test_operator_can_complete_en_route_request(): void
    {
        $user = User::factory()->create(['role' => 'operator']);
        $request = $this->supportRequest(['status' => 'en_route']);

        $this->actingAs($user)
            ->postJson('/api/support-requests/'.$request->id.'/complete', [
                'outcome' => 'Evacuation transport completed.',
            ])
            ->assertOk()
            ->assertJsonPath('data.request.status', 'completed')
            ->assertJsonPath('data.request.actions.0.action', 'completed')
            ->assertJsonPath('data.request.actions.0.metadata.outcome', 'Evacuation transport completed.');

        $this->assertSame('completed', $request->refresh()->status);
        $this->assertActionWritten($request, 'completed', 'en_route', 'completed', $user->id);
    }

    public function test_invalid_lifecycle_transition_is_rejected_without_history(): void
    {
        $user = User::factory()->create(['role' => 'operator']);
        $request = $this->supportRequest(['status' => 'received']);

        $this->actingAs($user)
            ->postJson('/api/support-requests/'.$request->id.'/en-route')
            ->assertStatus(409)
            ->assertJsonPath('data.current_status', 'received')
            ->assertJsonPath('data.target_status', 'en_route');

        $this->assertSame('received', $request->refresh()->status);
        $this->assertDatabaseCount('support_request_actions', 0);
    }

    public function test_repeated_lifecycle_transition_is_rejected_without_duplicate_history(): void
    {
        $user = User::factory()->create(['role' => 'operator']);
        $request = $this->supportRequest(['status' => 'received']);

        $this->actingAs($user)
            ->postJson('/api/support-requests/'.$request->id.'/accept')
            ->assertOk()
            ->assertJsonPath('data.request.status', 'accepted');

        $this->actingAs($user)
            ->postJson('/api/support-requests/'.$request->id.'/accept')
            ->assertStatus(409)
            ->assertJsonPath('data.current_status', 'accepted');

        $this->assertSame('accepted', $request->refresh()->status);
        $this->assertDatabaseCount('support_request_actions', 1);
    }

    public function test_terminal_support_requests_cannot_be_changed(): void
    {
        $user = User::factory()->create(['role' => 'operator']);

        foreach (['cancelled', 'completed', 'rejected'] as $status) {
            $request = $this->supportRequest([
                'support_request_id' => 'sup_'.$status,
                'local_request_id' => 'hotline-'.$status,
                'correlation_id' => 'corr-'.$status,
                'status' => $status,
            ]);

            $this->actingAs($user)
                ->postJson('/api/support-requests/'.$request->id.'/accept')
                ->assertStatus(409);

            $this->assertSame($status, $request->refresh()->status);
        }

        $this->assertDatabaseCount('support_request_actions', 0);
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
        $this->postJson('/api/support-requests/'.$request->id.'/accept')->assertUnauthorized();
        $this->postJson('/api/support-requests/'.$request->id.'/reject')->assertUnauthorized();
        $this->postJson('/api/support-requests/'.$request->id.'/assign')->assertUnauthorized();
        $this->postJson('/api/support-requests/'.$request->id.'/en-route')->assertUnauthorized();
        $this->postJson('/api/support-requests/'.$request->id.'/complete')->assertUnauthorized();
    }

    private function assertActionWritten(
        SupportRequest $request,
        string $action,
        string $fromStatus,
        string $toStatus,
        int $actorUserId,
    ): void {
        $this->assertDatabaseHas('support_request_actions', [
            'support_request_id' => $request->id,
            'action' => $action,
            'from_status' => $fromStatus,
            'to_status' => $toStatus,
            'actor_user_id' => $actorUserId,
        ]);

        $this->assertSame(1, SupportRequestAction::query()
            ->where('support_request_id', $request->id)
            ->where('action', $action)
            ->count());
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
