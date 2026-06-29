<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Account\AccountClientFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Mockery;
use Pbb\AccountSdk\AccountClient;
use Pbb\AccountSdk\AccountIdentity;
use Tests\TestCase;

class AccountSsoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'account.enabled' => true,
            'account.base_url' => 'https://account.pbb.ph',
            'account.client_id' => 'pbb-support',
            'account.client_secret' => 'test-secret',
            'account.redirect_uri' => 'https://support.pbb.ph/auth/account/callback',
            'account.post_logout_redirect_uri' => 'https://support.pbb.ph',
            'account.scopes' => ['openid', 'profile'],
        ]);
    }

    public function test_redirect_route_builds_account_authorization_redirect(): void
    {
        $response = $this->get('/auth/account/redirect?return=%2Fdashboard');

        $response->assertRedirect();
        $location = $response->headers->get('Location');

        $this->assertStringStartsWith('https://account.pbb.ph/oauth/authorize?', (string) $location);
        $this->assertStringContainsString('client_id=pbb-support', (string) $location);
        $this->assertStringContainsString('redirect_uri=https%3A%2F%2Fsupport.pbb.ph%2Fauth%2Faccount%2Fcallback', (string) $location);
        $this->assertStringContainsString('response_type=code', (string) $location);
        $this->assertStringContainsString('scope=openid+profile', (string) $location);
        $this->assertNotEmpty(session('_pbb_account_oauth_state'));
        $this->assertSame('/dashboard', session('pbb_account.return_to'));
    }

    public function test_callback_rejects_invalid_state(): void
    {
        $this->withSession(['_pbb_account_oauth_state' => 'expected-state'])
            ->get('/auth/account/callback?code=test-code&state=wrong-state')
            ->assertRedirect('/');

        $this->assertGuest();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_callback_provisions_local_user_by_pbb_user_id_and_logs_in(): void
    {
        $this->fakeAccountCallback([
            'pbb_user_id' => 'pbb-user-001',
            'name' => 'Support Operator',
            'email' => 'operator@pbb.local',
            'status' => 'active',
        ]);

        $this->withSession(['pbb_account.return_to' => '/dashboard'])
            ->get('/auth/account/callback?code=test-code&state=valid-state')
            ->assertRedirect('/dashboard');

        $user = User::query()->where('pbb_user_id', 'pbb-user-001')->first();

        $this->assertNotNull($user);
        $this->assertSame('Support Operator', $user->name);
        $this->assertSame('operator@pbb.local', $user->email);
        $this->assertSame('operator', $user->role);
        $this->assertAuthenticatedAs($user);
    }

    public function test_callback_matches_existing_local_user_by_pbb_user_id_without_replacing_role(): void
    {
        $existing = User::factory()->create([
            'pbb_user_id' => 'pbb-user-admin',
            'name' => 'Old Name',
            'email' => 'old-admin@pbb.local',
            'role' => 'admin',
        ]);

        $this->fakeAccountCallback([
            'pbb_user_id' => 'pbb-user-admin',
            'name' => 'Updated Admin',
            'email' => 'admin@pbb.local',
            'status' => 'active',
        ]);

        $this->get('/auth/account/callback?code=test-code&state=valid-state')
            ->assertRedirect('/');

        $existing->refresh();
        $this->assertSame('Updated Admin', $existing->name);
        $this->assertSame('admin@pbb.local', $existing->email);
        $this->assertSame('admin', $existing->role);
        $this->assertAuthenticatedAs($existing);
    }

    public function test_callback_links_existing_local_user_by_email(): void
    {
        $existing = User::factory()->create([
            'pbb_user_id' => null,
            'name' => 'Local User',
            'email' => 'local@pbb.local',
            'role' => 'operator',
        ]);

        $this->fakeAccountCallback([
            'pbb_user_id' => 'pbb-user-linked',
            'name' => 'Linked User',
            'email' => 'local@pbb.local',
            'status' => 'active',
        ]);

        $this->get('/auth/account/callback?code=test-code&state=valid-state')
            ->assertRedirect('/');

        $existing->refresh();
        $this->assertSame('pbb-user-linked', $existing->pbb_user_id);
        $this->assertSame('Linked User', $existing->name);
        $this->assertSame('operator', $existing->role);
        $this->assertAuthenticatedAs($existing);
    }

    public function test_logout_clears_local_session_and_redirects_to_account_logout(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get('/auth/logout')
            ->assertRedirect('https://account.pbb.ph/oauth/logout?client_id=pbb-support&post_logout_redirect_uri=https%3A%2F%2Fsupport.pbb.ph');

        $this->assertGuest();
    }

    public function test_sso_disabled_mode_does_not_break_existing_login_behavior(): void
    {
        config(['account.enabled' => false]);

        $user = User::factory()->create([
            'email' => 'local-admin@pbb.local',
            'password' => Hash::make('local-password'),
            'role' => 'admin',
        ]);

        $this->get('/auth/account/redirect')->assertNotFound();

        $this->postJson('/api/login', [
            'email' => 'local-admin@pbb.local',
            'password' => 'local-password',
        ])->assertOk()
            ->assertJsonPath('data.account.id', $user->id)
            ->assertJsonPath('data.account.role', 'admin');

        $this->assertAuthenticatedAs($user);
    }

    /**
     * @param array<string, mixed> $identity
     */
    private function fakeAccountCallback(array $identity): void
    {
        $client = Mockery::mock(AccountClient::class);
        $client->shouldReceive('handleCallback')
            ->once()
            ->andReturn(new AccountIdentity($identity));

        $factory = Mockery::mock(AccountClientFactory::class);
        $factory->shouldReceive('make')
            ->once()
            ->andReturn($client);

        $this->app->instance(AccountClientFactory::class, $factory);
    }
}
