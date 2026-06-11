<?php

namespace App\Support\Settings;

use App\Models\SupportSetting;
use Illuminate\Support\Facades\Crypt;

class SupportSettings
{
    private const KEY = 'support.settings';

    /**
     * @return array<string, mixed>
     */
    public function all(): array
    {
        $row = SupportSetting::query()->where('key', self::KEY)->first();

        if (! $row || ! is_string($row->value) || $row->value === '') {
            return $this->defaults();
        }

        try {
            $payload = json_decode(Crypt::decryptString($row->value), true, flags: JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            return $this->defaults();
        }

        return [
            ...$this->defaults(),
            ...(is_array($payload) ? $payload : []),
        ];
    }

    /**
     * @param array<string, mixed> $settings
     * @return array<string, mixed>
     */
    public function update(array $settings): array
    {
        $next = [
            ...$this->all(),
            ...$settings,
        ];

        SupportSetting::query()->updateOrCreate(
            ['key' => self::KEY],
            ['value' => Crypt::encryptString(json_encode($next, JSON_THROW_ON_ERROR))],
        );

        return $next;
    }

    /**
     * @return array<string, mixed>
     */
    private function defaults(): array
    {
        return [
            'relayTargetSystem' => 'sitrep.ingestor',
            'alertLevel' => 'Normal',
            'consolidationCadenceMinutes' => 15,
            'relayUrl' => 'https://relay.pbb.ph',
            'relayToken' => '',
            'relayHandlerToken' => '',
            'supportRequestSourceSystem' => 'hotline.command',
            'supportRequestTargetSystem' => 'support.dispatch',
            'supportRequestUpdateSourceSystem' => 'support.dispatch',
            'realtimeUrl' => 'https://realtime.pbb.ph',
            'realtimeClientCode' => '',
            'serverProjectCode' => '',
            'adminProjectCode' => '',
            'realtimeBackendIngressSecret' => '',
        ];
    }
}
