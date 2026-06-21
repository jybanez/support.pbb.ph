<?php

namespace App\Support\Relay;

class RelayHttpOptions
{
    /**
     * @return array<string, mixed>
     */
    public static function verifyOptions(): array
    {
        $caBundle = trim((string) config('services.relay.ca_bundle', ''));

        if ($caBundle === '') {
            try {
                $settings = app(\App\Support\Settings\SupportSettings::class)->all();
                $caBundle = trim((string) ($settings['relayCaBundle'] ?? ''));
            } catch (\Throwable) {
                $caBundle = '';
            }
        }

        if ($caBundle === '') {
            return [];
        }

        return ['verify' => $caBundle];
    }
}
