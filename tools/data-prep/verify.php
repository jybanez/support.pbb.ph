<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'support-data-prep.php';

$options = support_data_prep_parse_args($argv);

try {
    [$app, $appRoot] = support_data_prep_bootstrap_app();
    $settings = support_data_prep_settings_service($app)->all();
    $missing = support_data_prep_missing_required_settings($settings);
    $warnings = [];
    foreach ($missing as $key) {
        $warnings[] = 'Support setting is not configured: ' . $key . '.';
    }

    $status = count($missing) > 0 ? 'warning' : 'success';
    $summary = $status === 'success'
        ? 'Support settings are ready for Relay and Realtime integration.'
        : 'Support settings are reachable, but one or more integration values are missing.';

    support_data_prep_write_report($options, support_data_prep_report(
        'data_prep_verify',
        $options,
        $status,
        $summary,
        [[
            'id' => 'support_settings',
            'type' => 'settings',
            'action' => 'verify',
            'status' => $status,
            'checked' => 4,
            'missing' => count($missing),
        ]],
        $warnings,
        [],
        [
            'app_root' => $appRoot,
            'settings' => support_data_prep_public_settings([
                'relayUrl' => $settings['relayUrl'] ?? '',
                'relayToken' => $settings['relayToken'] ?? '',
                'relayHandlerToken' => $settings['relayHandlerToken'] ?? '',
                'realtimeUrl' => $settings['realtimeUrl'] ?? '',
                'realtimeClientCode' => $settings['realtimeClientCode'] ?? '',
                'serverProjectCode' => $settings['serverProjectCode'] ?? '',
                'adminProjectCode' => $settings['adminProjectCode'] ?? '',
                'realtimeBackendIngressSecret' => $settings['realtimeBackendIngressSecret'] ?? '',
            ]),
            'missing' => $missing,
        ]
    ));
    exit(0);
} catch (Throwable $e) {
    support_data_prep_write_report($options, support_data_prep_report(
        'data_prep_verify',
        $options,
        'failed',
        'Support settings verification failed.',
        [],
        [],
        [$e->getMessage()]
    ));
    exit(1);
}
