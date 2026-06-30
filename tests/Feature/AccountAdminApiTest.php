<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccountAdminApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'account.admin_api_enabled' => true,
            'account.admin_api_token' => 'app-admin-token',
        ]);
    }

    public function test_missing_or_invalid_app_admin_token_returns_401(): void
    {
        $this->getJson('/api/account-admin/meta')
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'invalid_app_admin_token');

        $this->withHeaders($this->accountHeaders('wrong-token'))
            ->getJson('/api/account-admin/meta')
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'invalid_app_admin_token');

        $this->withHeaders([
            'Authorization' => 'Bearer app-admin-token',
            'X-PBB-Account-Client' => 'other-client',
        ])
            ->getJson('/api/account-admin/meta')
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'invalid_account_client');
    }

    public function test_disabled_admin_api_returns_503(): void
    {
        config(['account.admin_api_enabled' => false]);

        $this->withHeaders($this->accountHeaders())
            ->getJson('/api/account-admin/meta')
            ->assertStatus(503)
            ->assertJsonPath('error.code', 'account_admin_disabled');
    }

    public function test_meta_returns_support_roles_statuses_and_capabilities(): void
    {
        $this->withHeaders($this->accountHeaders())
            ->getJson('/api/account-admin/meta')
            ->assertOk()
            ->assertJsonPath('data.app.id', 'pbb-support')
            ->assertJsonPath('data.roles.0.value', 'admin')
            ->assertJsonPath('data.roles.1.value', 'command')
            ->assertJsonPath('data.roles.2.value', 'operator')
            ->assertJsonPath('data.statuses.0.value', 'active')
            ->assertJsonPath('data.capabilities.provisionUser', true)
            ->assertJsonPath('data.capabilities.updateRole', true)
            ->assertJsonPath('data.capabilities.blockLogin', false)
            ->assertJsonPath('data.capabilities.suspendLogin', false);
    }

    public function test_get_missing_linked_user_returns_404(): void
    {
        $this->withHeaders($this->accountHeaders())
            ->getJson('/api/account-admin/users/pbb-missing')
            ->assertNotFound()
            ->assertJsonPath('error.code', 'linked_user_not_found');
    }

    public function test_put_creates_new_user_by_pbb_user_id_with_default_role(): void
    {
        $this->withHeaders($this->accountHeaders())
            ->putJson('/api/account-admin/users/pbb-user-001', [
                'name' => 'Command User',
                'email' => 'command@support.pbb.local',
                'mobile' => '09170000000',
                'defaultRole' => 'command',
            ])
            ->assertCreated()
            ->assertJsonPath('data.user.pbbUserId', 'pbb-user-001')
            ->assertJsonPath('data.user.name', 'Command User')
            ->assertJsonPath('data.user.email', 'command@support.pbb.local')
            ->assertJsonPath('data.user.role', 'command')
            ->assertJsonPath('data.user.status', 'active');

        $this->assertDatabaseHas('users', [
            'pbb_user_id' => 'pbb-user-001',
            'email' => 'command@support.pbb.local',
            'role' => 'command',
        ]);
    }

    public function test_put_updates_existing_linked_user_without_changing_role(): void
    {
        $user = User::factory()->create([
            'pbb_user_id' => 'pbb-user-002',
            'name' => 'Old Name',
            'email' => 'old@support.pbb.local',
            'role' => 'admin',
        ]);

        $this->withHeaders($this->accountHeaders())
            ->putJson('/api/account-admin/users/pbb-user-002', [
                'name' => 'Updated Name',
                'email' => 'updated@support.pbb.local',
                'defaultRole' => 'operator',
            ])
            ->assertOk()
            ->assertJsonPath('data.user.localUserId', (string) $user->id)
            ->assertJsonPath('data.user.name', 'Updated Name')
            ->assertJsonPath('data.user.email', 'updated@support.pbb.local')
            ->assertJsonPath('data.user.role', 'admin');

        $user->refresh();
        $this->assertSame('admin', $user->role);
    }

    public function test_put_rejects_existing_linked_user_email_conflict(): void
    {
        $linked = User::factory()->create([
            'pbb_user_id' => 'pbb-user-linked',
            'email' => 'linked@support.pbb.local',
            'role' => 'operator',
        ]);
        $other = User::factory()->create([
            'pbb_user_id' => 'pbb-user-other',
            'email' => 'other@support.pbb.local',
            'role' => 'admin',
        ]);

        $this->withHeaders($this->accountHeaders())
            ->putJson('/api/account-admin/users/pbb-user-linked', [
                'name' => 'Linked User',
                'email' => 'other@support.pbb.local',
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'identity_conflict');

        $this->assertSame('linked@support.pbb.local', $linked->refresh()->email);
        $this->assertSame('other@support.pbb.local', $other->refresh()->email);
    }

    public function test_put_rejects_conflicting_email_identity_link(): void
    {
        User::factory()->create([
            'pbb_user_id' => 'other-pbb-user',
            'email' => 'conflict@support.pbb.local',
        ]);

        $this->withHeaders($this->accountHeaders())
            ->putJson('/api/account-admin/users/pbb-user-003', [
                'name' => 'Conflict User',
                'email' => 'conflict@support.pbb.local',
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'identity_conflict');
    }

    public function test_put_rejects_invalid_default_role_with_stable_code(): void
    {
        $this->withHeaders($this->accountHeaders())
            ->putJson('/api/account-admin/users/pbb-user-invalid-default-role', [
                'name' => 'Invalid Default Role',
                'email' => 'invalid-default-role@support.pbb.local',
                'defaultRole' => 'viewer',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'invalid_default_role')
            ->assertJsonPath('error.details.allowed.0', 'admin');
    }

    public function test_put_rejects_malformed_identity_payload_with_stable_code(): void
    {
        $this->withHeaders($this->accountHeaders())
            ->putJson('/api/account-admin/users/pbb-user-malformed', [
                'name' => '',
                'email' => 'not-an-email',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_patch_role_updates_valid_role(): void
    {
        $user = User::factory()->create([
            'pbb_user_id' => 'pbb-user-004',
            'role' => 'operator',
        ]);

        $this->withHeaders($this->accountHeaders())
            ->patchJson('/api/account-admin/users/pbb-user-004/role', [
                'role' => 'admin',
                'reason' => 'Assigned by Account admin',
            ])
            ->assertOk()
            ->assertJsonPath('data.user.role', 'admin');

        $this->assertSame('admin', $user->refresh()->role);
    }

    public function test_patch_role_rejects_invalid_role(): void
    {
        User::factory()->create([
            'pbb_user_id' => 'pbb-user-005',
            'role' => 'operator',
        ]);

        $this->withHeaders($this->accountHeaders())
            ->patchJson('/api/account-admin/users/pbb-user-005/role', [
                'role' => 'viewer',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'invalid_role')
            ->assertJsonPath('error.details.allowed.0', 'admin');
    }

    public function test_patch_status_accepts_active(): void
    {
        $user = User::factory()->create([
            'pbb_user_id' => 'pbb-user-006',
            'role' => 'operator',
        ]);

        $this->withHeaders($this->accountHeaders())
            ->patchJson('/api/account-admin/users/pbb-user-006/status', [
                'status' => 'active',
            ])
            ->assertOk()
            ->assertJsonPath('data.user.localUserId', (string) $user->id)
            ->assertJsonPath('data.user.status', 'active');
    }

    public function test_patch_status_rejects_blocked_or_suspended_for_v1(): void
    {
        User::factory()->create([
            'pbb_user_id' => 'pbb-user-007',
            'role' => 'operator',
        ]);

        foreach (['blocked', 'suspended'] as $status) {
            $this->withHeaders($this->accountHeaders())
                ->patchJson('/api/account-admin/users/pbb-user-007/status', [
                    'status' => $status,
                ])
                ->assertUnprocessable()
                ->assertJsonPath('error.code', 'unsupported_status');
        }
    }

    /**
     * @return array<string, string>
     */
    private function accountHeaders(string $token = 'app-admin-token'): array
    {
        return [
            'Authorization' => 'Bearer '.$token,
            'X-PBB-Account-Client' => 'pbb-account',
        ];
    }
}
