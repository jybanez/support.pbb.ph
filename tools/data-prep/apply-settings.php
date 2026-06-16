<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'support-data-prep.php';

$options = support_data_prep_parse_args($argv);

try {
    $config = support_data_prep_load_config($options);
    $settings = support_data_prep_setting_plan($config);
    $missing = support_data_prep_missing_required_settings($settings);
    [$app, $appRoot] = support_data_prep_bootstrap_app();

    $results = [[
        'id' => 'support_settings',
        'type' => 'settings',
        'action' => !empty($options['dry-run']) ? 'plan' : 'update',
        'status' => 'success',
        'applied' => !empty($options['dry-run']) ? 0 : count($settings),
        'planned' => count($settings),
        'settings' => array_keys($settings),
    ]];
    $warnings = [];
    foreach ($missing as $key) {
        $warnings[] = 'No generated value found for ' . $key . '.';
    }

    if (empty($options['dry-run']) && count($settings) > 0) {
        support_data_prep_settings_service($app)->update($settings);
    }

    $status = count($missing) > 0 ? 'warning' : 'success';
    $summary = !empty($options['dry-run'])
        ? 'Support settings application planned.'
        : 'Support settings applied.';

    support_data_prep_write_report($options, support_data_prep_report(
        'data_prep_apply_settings',
        $options,
        $status,
        $summary,
        $results,
        $warnings,
        [],
        [
            'app_root' => $appRoot,
            'settings' => support_data_prep_public_settings($settings),
            'missing' => $missing,
        ]
    ));
    exit($status === 'success' || $status === 'warning' ? 0 : 1);
} catch (Throwable $e) {
    support_data_prep_write_report($options, support_data_prep_report(
        'data_prep_apply_settings',
        $options,
        'failed',
        'Support settings application failed.',
        [],
        [],
        [$e->getMessage()]
    ));
    exit(1);
}
