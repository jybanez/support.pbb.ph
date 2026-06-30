<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'support-data-prep.php';

$options = support_data_prep_parse_args($argv);

try {
    $config = support_data_prep_load_config($options);
    $settings = support_data_prep_setting_plan($config);
    $env = support_data_prep_env_plan($config);
    $missing = support_data_prep_missing_required_settings($settings);
    [$app, $appRoot] = support_data_prep_bootstrap_app();
    $missingEnv = support_data_prep_missing_required_env($env);

    $results = [
        [
            'id' => 'support_settings',
            'type' => 'settings',
            'action' => !empty($options['dry-run']) ? 'plan' : 'update',
            'status' => 'success',
            'applied' => !empty($options['dry-run']) ? 0 : count($settings),
            'planned' => count($settings),
            'settings' => array_keys($settings),
        ],
        [
            'id' => 'support_account_env',
            'type' => 'environment',
            'action' => !empty($options['dry-run']) ? 'plan' : 'update',
            'status' => 'success',
            'applied' => !empty($options['dry-run']) ? 0 : count($env),
            'planned' => count($env),
            'settings' => array_keys($env),
        ],
    ];
    $warnings = [];
    foreach ($missing as $key) {
        $warnings[] = 'No generated value found for ' . $key . '.';
    }
    foreach ($missingEnv as $key) {
        $warnings[] = 'No generated Account environment value found for ' . $key . '.';
    }

    if (empty($options['dry-run']) && count($settings) > 0) {
        support_data_prep_settings_service($app)->update($settings);
    }
    if (empty($options['dry-run']) && count($env) > 0) {
        support_data_prep_apply_env($appRoot, $env);
        support_data_prep_run_artisan($appRoot, ['optimize:clear']);
        support_data_prep_run_artisan($appRoot, ['config:cache']);
    }

    $status = count($missing) > 0 || count($missingEnv) > 0 ? 'warning' : 'success';
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
            'environment' => support_data_prep_public_settings($env),
            'missing' => array_merge($missing, $missingEnv),
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
