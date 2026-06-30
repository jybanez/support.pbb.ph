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
            'shared.secrets.values.realtime_token_secret',
        ],
        'sourceHeartbeatWebhookToken' => [
            'support.data_prep.apply_settings.source_heartbeat_webhook_token',
            'support.data_prep.apply_settings.relay.source_heartbeat_webhook_token',
            'support.relay.source_heartbeat_webhook_token',
            'support.source_heartbeat_webhook_token',
            'shared.secrets.values.support_source_heartbeat_webhook_token',
            'shared.secrets.values.source_heartbeat_webhook_token',
        ],
        'accountAdminApiToken' => [
            'support.data_prep.apply_settings.account.admin_api_token',
            'support.account.admin_api_token',
            'shared.secrets.values.support_account_admin_api_token',
            'shared.secrets.values.pbb_support_account_admin_api_token',
            'account.admin_api_token',
        ],
        'accountAdminApiClient' => [
            'support.data_prep.apply_settings.account.admin_api_client',
            'support.account.admin_api_client',
            'account.admin_api_client',
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

    if (($settings['accountAdminApiClient'] ?? '') === '') {
        $settings['accountAdminApiClient'] = 'pbb-account';
    }

    if (support_data_prep_any_path_present($config, [
        'support.data_prep.apply_settings.account.admin_api_enabled',
        'support.account.admin_api_enabled',
        'account.admin_api_enabled',
    ]) || ($settings['accountAdminApiToken'] ?? '') !== '') {
        $settings['accountAdminApiEnabled'] = filter_var(support_data_prep_bool_string($config, [
            'support.data_prep.apply_settings.account.admin_api_enabled',
            'support.account.admin_api_enabled',
            'account.admin_api_enabled',
        ], ($settings['accountAdminApiToken'] ?? '') !== ''), FILTER_VALIDATE_BOOLEAN);
    }

    return $settings;
}

function support_data_prep_env_plan(array $config): array
{
    $baseUrl = support_data_prep_first_string($config, [
        'support.data_prep.apply_settings.account.base_url',
        'support.account.base_url',
        'dependencies.account.base_url',
        'account.base_url',
    ]);
    if ($baseUrl === '') {
        $baseUrl = 'https://account.pbb.ph';
    }

    $clientId = support_data_prep_first_string($config, [
        'support.data_prep.apply_settings.account.client_id',
        'support.account.client_id',
        'account.client_id',
    ]);
    if ($clientId === '') {
        $clientId = 'pbb-support';
    }

    $clientSecret = support_data_prep_first_string($config, [
        'support.data_prep.apply_settings.account.client_secret',
        'support.account.client_secret',
        'shared.secrets.values.support_account_client_secret',
        'shared.secrets.values.pbb_support_account_client_secret',
        'account.client_secret',
    ]);

    $redirectUri = support_data_prep_first_string($config, [
        'support.data_prep.apply_settings.account.redirect_uri',
        'support.account.redirect_uri',
        'account.redirect_uri',
    ]);
    if ($redirectUri === '') {
        $redirectUri = 'https://support.pbb.ph/auth/account/callback';
    }

    $postLogoutUri = support_data_prep_first_string($config, [
        'support.data_prep.apply_settings.account.post_logout_redirect_uri',
        'support.account.post_logout_redirect_uri',
        'account.post_logout_redirect_uri',
    ]);
    if ($postLogoutUri === '') {
        $postLogoutUri = 'https://support.pbb.ph';
    }

    $scopes = support_data_prep_first_string($config, [
        'support.data_prep.apply_settings.account.scopes',
        'support.account.scopes',
        'account.scopes',
    ]);
    if ($scopes === '') {
        $scopes = 'openid profile';
    }

    $timeout = support_data_prep_first_string($config, [
        'support.data_prep.apply_settings.account.timeout_seconds',
        'support.account.timeout_seconds',
        'account.timeout_seconds',
    ]);
    if ($timeout === '') {
        $timeout = '10';
    }

    $caBundle = support_data_prep_first_string($config, [
        'support.data_prep.apply_settings.account.ca_bundle',
        'support.account.ca_bundle',
        'dependencies.account.ca_bundle',
        'account.ca_bundle',
        'ssl.chain_file',
    ]);

    $env = [
        'PBB_ACCOUNT_BASE_URL' => $baseUrl,
        'PBB_ACCOUNT_CLIENT_ID' => $clientId,
        'PBB_ACCOUNT_REDIRECT_URI' => $redirectUri,
        'PBB_ACCOUNT_POST_LOGOUT_REDIRECT_URI' => $postLogoutUri,
        'PBB_ACCOUNT_SCOPES' => $scopes,
        'PBB_ACCOUNT_TIMEOUT_SECONDS' => $timeout,
    ];

    if ($clientSecret !== '') {
        $env['PBB_ACCOUNT_CLIENT_SECRET'] = $clientSecret;
    }
    if (support_data_prep_any_path_present($config, [
        'support.data_prep.apply_settings.account.sso_enabled',
        'support.account.sso_enabled',
        'account.sso_enabled',
    ]) || $clientSecret !== '') {
        $env['PBB_ACCOUNT_SSO_ENABLED'] = support_data_prep_bool_string($config, [
            'support.data_prep.apply_settings.account.sso_enabled',
            'support.account.sso_enabled',
            'account.sso_enabled',
        ], $clientSecret !== '');
    }
    if ($caBundle !== '') {
        $env['PBB_ACCOUNT_CA_BUNDLE'] = $caBundle;
    }

    return $env;
}

function support_data_prep_any_path_present(array $config, array $paths): bool
{
    foreach ($paths as $path) {
        if (support_data_prep_get($config, $path) !== null) {
            return true;
        }
    }

    return false;
}

function support_data_prep_bool_string(array $config, array $paths, bool $default): string
{
    foreach ($paths as $path) {
        $value = support_data_prep_get($config, $path);
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_scalar($value)) {
            $text = trim((string) $value);
            if ($text !== '') {
                return filter_var($text, FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false';
            }
        }
    }

    return $default ? 'true' : 'false';
}

function support_data_prep_env_path(string $appRoot): string
{
    return rtrim($appRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . '.env';
}

function support_data_prep_apply_env(string $appRoot, array $env): void
{
    $path = support_data_prep_env_path($appRoot);
    $existing = is_file($path) ? support_data_prep_parse_env_file($path) : [];
    foreach ($env as $key => $value) {
        if ($value !== null) {
            $existing[$key] = (string) $value;
        }
    }
    support_data_prep_write_env_file($path, $existing);
}

function support_data_prep_parse_env_file(string $path): array
{
    $rows = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $rows[$key] = trim($value, "\"'");
    }

    return $rows;
}

function support_data_prep_write_env_file(string $path, array $settings): void
{
    $lines = [];
    foreach ($settings as $key => $value) {
        $value = (string) $value;
        if (preg_match('/\s|#|=|"/', $value)) {
            $value = '"' . str_replace('"', '\\"', $value) . '"';
        }
        $lines[] = $key . '=' . $value;
    }
    file_put_contents($path, implode("\n", $lines) . "\n");
}

function support_data_prep_run_artisan(string $appRoot, array $args): void
{
    $command = array_merge([PHP_BINARY, 'artisan'], $args);
    $stdoutPath = tempnam(sys_get_temp_dir(), 'pbb-support-data-prep-out-');
    $stderrPath = tempnam(sys_get_temp_dir(), 'pbb-support-data-prep-err-');
    if ($stdoutPath === false || $stderrPath === false) {
        throw new RuntimeException('Unable to allocate Data Prep command logs.');
    }

    $process = proc_open($command, [
        1 => ['file', $stdoutPath, 'w'],
        2 => ['file', $stderrPath, 'w'],
    ], $pipes, $appRoot);

    if (!is_resource($process)) {
        @unlink($stdoutPath);
        @unlink($stderrPath);
        throw new RuntimeException('Unable to start artisan command.');
    }

    $code = proc_close($process);
    $stdout = (string) @file_get_contents($stdoutPath);
    $stderr = (string) @file_get_contents($stderrPath);
    @unlink($stdoutPath);
    @unlink($stderrPath);

    if ($code !== 0) {
        throw new RuntimeException(trim($stderr ?: $stdout) ?: 'Artisan command failed.');
    }
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
        'sourceHeartbeatWebhookToken' => true,
        'accountAdminApiToken' => true,
        'PBB_ACCOUNT_CLIENT_SECRET' => true,
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

    if (filter_var($settings['accountAdminApiEnabled'] ?? false, FILTER_VALIDATE_BOOLEAN)
        && trim((string) ($settings['accountAdminApiToken'] ?? '')) === '') {
        $missing[] = 'accountAdminApiToken';
    }

    return $missing;
}

function support_data_prep_missing_required_env(array $env): array
{
    $missing = [];

    if (filter_var((string) ($env['PBB_ACCOUNT_SSO_ENABLED'] ?? 'false'), FILTER_VALIDATE_BOOLEAN)) {
        foreach (['PBB_ACCOUNT_BASE_URL', 'PBB_ACCOUNT_CLIENT_ID', 'PBB_ACCOUNT_CLIENT_SECRET', 'PBB_ACCOUNT_REDIRECT_URI'] as $key) {
            if (trim((string) ($env[$key] ?? '')) === '') {
                $missing[] = $key;
            }
        }
    }

    return $missing;
}

function support_data_prep_settings_service(object $app): SupportSettings
{
    return $app->make(SupportSettings::class);
}
