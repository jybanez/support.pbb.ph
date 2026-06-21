<?php

declare(strict_types=1);

use App\Support\Settings\SupportSettings;
use Illuminate\Contracts\Console\Kernel;

function support_data_prep_parse_args(array $argv): array
{
    $options = [
        'mode' => 'initial',
        'dry-run' => false,
        'verbose' => false,
    ];
    $count = count($argv);
    for ($i = 1; $i < $count; $i++) {
        $arg = (string) $argv[$i];
        if (!str_starts_with($arg, '--')) {
            continue;
        }
        $name = substr($arg, 2);
        $value = true;
        $next = $argv[$i + 1] ?? null;
        if (is_string($next) && !str_starts_with($next, '--')) {
            $value = $next;
            $i++;
        }
        $options[$name] = $value;
    }

    return $options;
}

function support_data_prep_load_config(array $options): array
{
    $path = isset($options['config']) ? (string) $options['config'] : '';
    if ($path === '' || !is_file($path)) {
        throw new RuntimeException('Config file not found: ' . ($path !== '' ? $path : '(missing --config)'));
    }

    $config = json_decode((string) file_get_contents($path), true);
    if (!is_array($config)) {
        throw new RuntimeException('Config file is not valid JSON: ' . $path);
    }

    return $config;
}

function support_data_prep_bootstrap_app(): array
{
    $releaseRoot = dirname(__DIR__, 2);
    $candidates = [
        $releaseRoot,
        $releaseRoot . DIRECTORY_SEPARATOR . 'app',
        getcwd() ?: '',
    ];

    foreach ($candidates as $candidate) {
        if ($candidate === '') {
            continue;
        }
        $candidate = rtrim($candidate, DIRECTORY_SEPARATOR);
        if (is_file($candidate . DIRECTORY_SEPARATOR . 'artisan')
            && is_file($candidate . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php')
            && is_file($candidate . DIRECTORY_SEPARATOR . 'bootstrap' . DIRECTORY_SEPARATOR . 'app.php')) {
            require_once $candidate . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
            $app = require $candidate . DIRECTORY_SEPARATOR . 'bootstrap' . DIRECTORY_SEPARATOR . 'app.php';
            $app->make(Kernel::class)->bootstrap();

            return [$app, $candidate];
        }
    }

    throw new RuntimeException('Unable to locate installed Support Laravel app root.');
}

function support_data_prep_get(array $data, string $path): mixed
{
    $current = $data;
    foreach (explode('.', $path) as $segment) {
        if (!is_array($current) || !array_key_exists($segment, $current)) {
            return null;
        }
        $current = $current[$segment];
    }

    return $current;
}

function support_data_prep_first_string(array $config, array $paths): string
{
    foreach ($paths as $path) {
        $value = support_data_prep_get($config, $path);
        if (is_scalar($value)) {
            $text = trim((string) $value);
            if ($text !== '') {
                return $text;
            }
        }
    }

    return '';
}

function support_data_prep_setting_plan(array $config): array
{
    $paths = [
        'relayUrl' => [
            'support.data_prep.apply_settings.relay.base_url',
            'support.data_prep.apply_settings.relay_url',
            'support.relay.base_url',
            'support.relay_url',
            'dependencies.relay.base_url',
            'relay.base_url',
        ],
        'relayToken' => [
            'support.data_prep.apply_settings.relay.token',
            'support.data_prep.apply_settings.relay.outbound_token',
            'support.data_prep.apply_settings.relay.client_token',
            'support.data_prep.apply_settings.relay_token',
            'support.relay.token',
            'support.relay_token',
            'shared.secrets.values.support_relay_token',
            'shared.secrets.values.relay_support_client_token',
            'shared.secrets.values.relay_client_token',
            'shared.secrets.values.relay_token',
        ],
        'sitrepRelayToken' => [
            'support.data_prep.apply_settings.relay.sitrep_client_token',
            'support.data_prep.apply_settings.relay.sitrep_token',
            'support.data_prep.apply_settings.sitrep_relay_token',
            'support.relay.sitrep_client_token',
            'support.relay.sitrep_token',
            'support.sitrep_relay_token',
            'shared.secrets.values.support_sitrep_relay_token',
            'shared.secrets.values.support_relay_token',
        ],
        'supportRequestRelayToken' => [
            'support.data_prep.apply_settings.relay.support_request_client_token',
            'support.data_prep.apply_settings.relay.support_request_token',
            'support.data_prep.apply_settings.support_request_relay_token',
            'support.data_prep.apply_settings.dispatch_relay_token',
            'support.relay.support_request_client_token',
            'support.relay.support_request_token',
            'support.support_request_relay_token',
            'shared.secrets.values.support_request_relay_token',
            'shared.secrets.values.support_dispatch_relay_token',
        ],
        'relayHandlerToken' => [
            'support.data_prep.apply_settings.relay.handler_token',
            'support.data_prep.apply_settings.relay.inbound_handler_token',
            'support.data_prep.apply_settings.relay_handler_token',
            'support.relay.handler_token',
            'support.relay_handler_token',
            'shared.secrets.values.support_relay_handler_token',
            'shared.secrets.values.relay_support_handler_token',
            'shared.secrets.values.support_handler_token',
            'shared.secrets.values.relay_handler_token',
        ],
        'relayCaBundle' => [
            'support.data_prep.apply_settings.relay.ca_bundle',
            'support.data_prep.apply_settings.relay_ca_bundle',
            'support.relay.ca_bundle',
            'services.relay.ca_bundle',
            'dependencies.relay.ca_bundle',
            'relay.ca_bundle',
            'ssl.chain_file',
        ],
        'realtimeUrl' => [
            'support.data_prep.apply_settings.realtime.base_url',
            'support.data_prep.apply_settings.realtime_url',
            'support.realtime.base_url',
            'support.realtime_url',
            'dependencies.realtime.base_url',
            'realtime.base_url',
        ],
        'realtimeClientCode' => [
            'support.data_prep.apply_settings.realtime.client_code',
            'support.data_prep.apply_settings.realtime_client_code',
            'support.realtime.client_code',
            'support.realtime_client_code',
            'shared.secrets.values.support_realtime_client_code',
            'shared.secrets.values.realtime_support_client_code',
        ],
        'serverProjectCode' => [
            'support.data_prep.apply_settings.realtime.server_project_code',
            'support.data_prep.apply_settings.server_project_code',
            'support.realtime.server_project_code',
            'support.server_project_code',
            'shared.secrets.values.support_realtime_server_project_code',
        ],
        'adminProjectCode' => [
            'support.data_prep.apply_settings.realtime.admin_project_code',
            'support.data_prep.apply_settings.admin_project_code',
            'support.realtime.admin_project_code',
            'support.admin_project_code',
            'shared.secrets.values.support_realtime_admin_project_code',
        ],
        'realtimeBackendIngressSecret' => [
            'support.data_prep.apply_settings.realtime.backend_ingress_secret',
            'support.data_prep.apply_settings.realtime_backend_ingress_secret',
            'support.realtime.backend_ingress_secret',
            'support.realtime_backend_ingress_secret',
            'shared.secrets.values.support_realtime_backend_ingress_secret',
            'shared.secrets.values.realtime_backend_ingress_secret',
        ],
        'realtimeTokenSigningSecret' => [
            'support.data_prep.apply_settings.realtime.token_signing_secret',
            'support.data_prep.apply_settings.realtime_token_signing_secret',
            'support.realtime.token_signing_secret',
            'support.realtime_token_signing_secret',
            'shared.secrets.values.support_realtime_token_signing_secret',
            'shared.secrets.values.realtime_token_signing_secret',
        ],
    ];

    $settings = [];
    foreach ($paths as $key => $candidates) {
        $value = support_data_prep_first_string($config, $candidates);
        if ($value !== '') {
            $settings[$key] = $value;
        }
    }

    if (($settings['relayToken'] ?? '') !== '') {
        $settings['sitrepRelayToken'] = $settings['sitrepRelayToken'] ?? $settings['relayToken'];
        $settings['supportRequestRelayToken'] = $settings['supportRequestRelayToken'] ?? $settings['relayToken'];
    }

    return $settings;
}

function support_data_prep_public_setting_value(string $key, mixed $value): array|string|int|bool|null
{
    $secretKeys = [
        'relayToken' => true,
        'sitrepRelayToken' => true,
        'supportRequestRelayToken' => true,
        'relayHandlerToken' => true,
        'realtimeBackendIngressSecret' => true,
        'realtimeTokenSigningSecret' => true,
    ];

    if (!isset($secretKeys[$key])) {
        return is_scalar($value) ? (string) $value : null;
    }

    $text = is_scalar($value) ? (string) $value : '';

    return [
        'configured' => $text !== '',
        'length' => strlen($text),
        'sha256_12' => $text !== '' ? substr(hash('sha256', $text), 0, 12) : null,
    ];
}

function support_data_prep_public_settings(array $settings): array
{
    $public = [];
    foreach ($settings as $key => $value) {
        $public[$key] = support_data_prep_public_setting_value((string) $key, $value);
    }

    return $public;
}

function support_data_prep_write_report(array $options, array $report): void
{
    $encoded = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    $path = isset($options['report']) ? (string) $options['report'] : '';
    if ($path !== '') {
        $dir = dirname($path);
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException('Unable to create report directory: ' . $dir);
        }
        file_put_contents($path, $encoded);
    }
    echo $encoded;
}

function support_data_prep_report(string $tool, array $options, string $status, string $summary, array $results = [], array $warnings = [], array $errors = [], array $details = []): array
{
    return [
        'schema_version' => 1,
        'app' => 'pbb-support',
        'tool' => $tool,
        'mode' => (string) ($options['mode'] ?? 'initial'),
        'dry_run' => (bool) ($options['dry-run'] ?? false),
        'status' => $status,
        'summary' => $summary,
        'sources' => ['kit_config'],
        'results' => $results,
        'warnings' => array_values($warnings),
        'errors' => array_values($errors),
        'details' => $details,
    ];
}

function support_data_prep_missing_required_settings(array $settings): array
{
    $missing = [];
    foreach (['relayUrl', 'sitrepRelayToken', 'supportRequestRelayToken', 'relayHandlerToken', 'realtimeUrl'] as $key) {
        if (trim((string) ($settings[$key] ?? '')) === '') {
            $missing[] = $key;
        }
    }

    return $missing;
}

function support_data_prep_settings_service(object $app): SupportSettings
{
    return $app->make(SupportSettings::class);
}
