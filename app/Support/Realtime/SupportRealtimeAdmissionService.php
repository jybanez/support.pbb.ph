<?php

namespace App\Support\Realtime;

use App\Models\User;
use App\Support\Settings\SupportSettings;
use RuntimeException;

require_once __DIR__.'/Sdk/pbb_realtime_backend_sdk.php';

class SupportRealtimeAdmissionService
{
    private const REALTIME_AUDIENCE = 'pbb-realtime';

    public function __construct(
        private readonly SupportSettings $settings,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function forSourceHeartbeats(User $user): array
    {
        $config = $this->config();
        $builder = new \RealtimeTokenBuilder($config);
        $room = SupportRealtimeRooms::SOURCE_HEARTBEATS_ROOM;
        $claims = $builder->forChatSession([
            'app_code' => $this->setting('realtimeClientCode'),
            'project_code' => $this->setting('serverProjectCode'),
            'user_id' => (string) $user->getKey(),
            'display_name' => $user->name,
            'email' => $user->email,
            'roles' => [$user->role],
            'room' => $room,
            'capabilities' => [
                'session.connect',
                'room.join',
            ],
            'allowed_room_prefixes' => [],
        ]);
        $claims['allowed_rooms'] = [$room];
        $claims['allowed_room_prefixes'] = [];

        $token = $builder->sign($claims);

        return [
            'token' => $token,
            'websocket_url' => $config->websocketUrl,
            'app_code' => $claims['app_code'],
            'project_code' => $claims['project_code'],
            'room' => $room,
            'event_type' => SupportRealtimeRooms::SOURCE_HEARTBEATS_UPDATED,
            'expires_at' => gmdate('c', (int) $claims['exp']),
            'session' => [
                'token_id' => $claims['jti'],
                'user_id' => $claims['user_id'],
                'display_name' => $claims['display_name'],
                'capabilities' => $claims['capabilities'],
                'allowed_rooms' => $claims['allowed_rooms'],
                'allowed_room_prefixes' => $claims['allowed_room_prefixes'],
            ],
        ];
    }

    private function config(): \RealtimeConfig
    {
        return new \RealtimeConfig([
            'issuer' => config('app.url', 'pbb-support-backend') ?: 'pbb-support-backend',
            'audience' => self::REALTIME_AUDIENCE,
            'signing_secret' => $this->setting('realtimeTokenSigningSecret'),
            'websocket_url' => SupportRealtimeUrl::websocketUrl($this->setting('realtimeUrl', 'https://realtime.pbb.ph')),
            'token_ttl_seconds' => 1800,
        ]);
    }

    private function setting(string $key, string $fallback = ''): string
    {
        $settings = $this->settings->all();
        $value = trim((string) ($settings[$key] ?? $fallback));

        if ($value === '') {
            throw new RuntimeException("Realtime {$key} is not configured.");
        }

        return $value;
    }
}
