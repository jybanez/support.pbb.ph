<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'support-data-prep.php';

$options = support_data_prep_parse_args($argv);

try {
    [$app, $appRoot] = support_data_prep_bootstrap_app();
    $settings = support_data_prep_settings_service($app)->all();
    $env = is_file(support_data_prep_env_path($appRoot))
        ? support_data_prep_parse_env_file(support_data_prep_env_path($appRoot))
        : [];
    $missing = support_data_prep_missing_required_settings($settings);
    $missingEnv = support_data_prep_missing_required_env($env);
    $warnings = [];
    foreach ($missing as $key) {
        $warnings[] = 'Support setting is not configured: ' . $key . '.';
    }
    foreach ($missingEnv as $key) {
        $warnings[] = 'Support Account environment value is not configured: ' . $key . '.';
    }

    $status = count($missing) > 0 || count($missingEnv) > 0 ? 'warning' : 'success';
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
            'checked' => 6 + 10,
            'missing' => count($missing) + count($missingEnv),
        ]],
        $warnings,
        [],
        [
            'app_root' => $appRoot,
            'settings' => support_data_prep_public_settings([
                'relayUrl' => $settings['relayUrl'] ?? '',
                'relayToken' => $settings['relayToken'] ?? '',
                'sitrepRelayToken' => $settings['sitrepRelayToken'] ?? '',
                'supportRequestRelayToken' => $settings['supportRequestRelayToken'] ?? '',
                'relayHandlerToken' => $settings['relayHandlerToken'] ?? '',
                'realtimeUrl' => $settings['realtimeUrl'] ?? '',
                'realtimeClientCode' => $settings['realtimeClientCode'] ?? '',
                'serverProjectCode' => $settings['serverProjectCode'] ?? '',
                'adminProjectCode' => $settings['adminProjectCode'] ?? '',
                'realtimeBackendIngressSecret' => $settings['realtimeBackendIngressSecret'] ?? '',
                'accountAdminApiEnabled' => $settings['accountAdminApiEnabled'] ?? false,
                'accountAdminApiToken' => $settings['accountAdminApiToken'] ?? '',
                'accountAdminApiClient' => $settings['accountAdminApiClient'] ?? '',
            ]),
            'environment' => support_data_prep_public_settings(array_intersect_key($env, array_flip([
                'PBB_ACCOUNT_SSO_ENABLED',
                'PBB_ACCOUNT_BASE_URL',
                'PBB_ACCOUNT_CLIENT_ID',
                'PBB_ACCOUNT_CLIENT_SECRET',
                'PBB_ACCOUNT_REDIRECT_URI',
                'PBB_ACCOUNT_POST_LOGOUT_REDIRECT_URI',
                'PBB_ACCOUNT_SCOPES',
                'PBB_ACCOUNT_TIMEOUT_SECONDS',
                'PBB_ACCOUNT_CA_BUNDLE',
            ]))),
            'missing' => array_merge($missing, $missingEnv),
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
