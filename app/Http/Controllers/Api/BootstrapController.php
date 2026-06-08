<?php

namespace App\Http\Controllers\Api;

use App\Support\Settings\SupportSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class BootstrapController extends BaseApiController
{
    public function show(Request $request, SupportSettings $settings)
    {
        $user = $request->user();

        return $this->ok([
            'app' => [
                'name' => config('app.name', 'PBB Support System'),
                'page' => $this->pageName($request),
            ],
            'auth' => [
                'authenticated' => (bool) $user,
                'account' => $user ? [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role,
                ] : null,
            ],
            'security' => [
                'csrfToken' => $request->session()->token(),
                'sessionLifetimeMinutes' => (int) config('session.lifetime', 120),
                'touched_at' => now()->toIso8601String(),
            ],
            'settings' => [
                ...$settings->all(),
            ],
            'hub' => $this->hubIdentity(),
        ]);
    }

    private function pageName(Request $request): string
    {
        $page = trim((string) $request->query('page'));

        return $page !== '' ? $page : 'dashboard';
    }

    private function hubIdentity(): array
    {
        return Cache::remember('relay.hub_identity', now()->addSeconds(30), function (): array {
            $url = (string) config('services.relay.hub_json_url', 'https://relay.pbb.ph/hub.json');

            try {
                $payload = Http::acceptJson()
                    ->timeout(5)
                    ->get($url)
                    ->throw()
                    ->json();
            } catch (\Throwable) {
                return [
                    'available' => false,
                    'url' => $url,
                    'data' => null,
                ];
            }

            return [
                'available' => is_array($payload),
                'url' => $url,
                'data' => is_array($payload) ? $payload : null,
            ];
        });
    }
}
