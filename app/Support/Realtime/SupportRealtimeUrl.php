<?php

namespace App\Support\Realtime;

use Illuminate\Support\Str;

class SupportRealtimeUrl
{
    public static function publishEndpoint(string $baseUrl): string
    {
        return rtrim(trim($baseUrl), '/').'/api/v1/events/publish';
    }

    public static function websocketUrl(string $baseUrl): string
    {
        $trimmed = trim($baseUrl);

        if ($trimmed === '') {
            return 'wss://realtime.pbb.ph/realtime';
        }

        if (Str::startsWith($trimmed, ['ws://', 'wss://'])) {
            return preg_match('/\/realtime\/?$/', $trimmed) ? rtrim($trimmed, '/') : rtrim($trimmed, '/').'/realtime';
        }

        if (Str::startsWith($trimmed, 'https://')) {
            $trimmed = 'wss://'.ltrim(Str::after($trimmed, 'https://'), '/');
        } elseif (Str::startsWith($trimmed, 'http://')) {
            $trimmed = 'ws://'.ltrim(Str::after($trimmed, 'http://'), '/');
        } else {
            $trimmed = 'wss://'.ltrim($trimmed, '/');
        }

        return preg_match('/\/realtime\/?$/', $trimmed) ? rtrim($trimmed, '/') : rtrim($trimmed, '/').'/realtime';
    }
}
