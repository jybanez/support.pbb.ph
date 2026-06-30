<?php

declare(strict_types=1);

$startedAt = date(DATE_ATOM);
$args = parse_args($argv);
$reportPath = isset($args['report']) ? (string) $args['report'] : null;
$report = base_report($startedAt);
$temporarySourceRoot = null;

try {
    $configPath = isset($args['config']) ? (string) $args['config'] : null;
    if ($configPath === null || !is_file($configPath)) {
        throw new InstallerException('Config file is required.', 2);
    }

    $config = read_json($configPath);
    $mode = (string) ($args['mode'] ?? $config['mode'] ?? 'fresh');
    if (!in_array($mode, ['fresh', 'repair', 'upgrade', 'preflight'], true)) {
        throw new InstallerException('Unsupported mode: ' . $mode, 3);
    }

    $dryRun = isset($args['dry-run']);
    $bundleRoot = dirname(__DIR__);
    $nestedSourceRoot = $bundleRoot . DIRECTORY_SEPARATOR . 'app';
    $sourceRoot = is_file($nestedSourceRoot . DIRECTORY_SEPARATOR . 'artisan')
        ? $bundleRoot . DIRECTORY_SEPARATOR . 'app'
        : $bundleRoot;
    $release = read_json($sourceRoot . DIRECTORY_SEPARATOR . 'release.json');
    $installPath = required_string($config, 'app.install_path');
    $appUrl = rtrim(required_string($config, 'app.app_url'), '/');

    $report['app'] = (string) ($release['app'] ?? 'pbb-support');
    $report['version'] = (string) ($release['version'] ?? '0.1.0');
    $report['mode'] = $mode;
    $report['build'] = $release['build'] ?? [];
    $report['urls'] = [
        'app' => $appUrl,
        'health' => $appUrl . '/api/bootstrap',
    ];
    $report['runtime_services'] = decorate_services($release['runtime_services'] ?? []);
    $report['landing'] = $release['landing'] ?? null;

    $checks = preflight_checks($config, $sourceRoot, $installPath, $mode);
    $failed = array_values(array_filter($checks, fn (array $check): bool => $check['status'] === 'failed'));
    $report['preflight'] = [
        'status' => $failed ? 'failed' : 'passed',
        'checks' => $checks,
    ];
    $report['steps'][] = step('preflight', $failed ? 'failed' : 'success', $failed ? 'Preflight failed.' : 'Preflight passed.');

    if ($failed) {
        throw new InstallerException('Preflight failed.', 1);
    }

    if ($dryRun || $mode === 'preflight') {
        $report['status'] = 'success';
        $report['summary'] = $mode === 'preflight'
            ? 'Preflight passed.'
            : 'Dry run completed without mutation.';
        finish_report($report, $startedAt, $reportPath);
        exit(0);
    }

    ensure_dir($installPath);
    if (source_root_is_inside_install_path($sourceRoot, $installPath)) {
        $temporarySourceRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pbb-support-install-source-' . date('YmdHis') . '-' . bin2hex(random_bytes(4));
        copy_tree($sourceRoot, $temporarySourceRoot, []);
        $sourceRoot = $temporarySourceRoot;
        $report['steps'][] = step('source_snapshot', 'success', 'Self-deployed package source snapshotted before filesystem preparation.');
    }

    if ($mode === 'fresh') {
        assert_empty_database($config);
    }

    copy_app_payload($sourceRoot, $installPath, $mode);
    $report['steps'][] = step('filesystem', 'success', 'Application files prepared.');

    ensure_laravel_runtime($installPath);
    write_env($installPath, $config, $release);
    $report['steps'][] = step('environment', 'success', '.env prepared without reporting secrets.');

    if ($mode === 'fresh' && !fresh_install_uses_migrations($config)) {
        $schema = import_baseline_schema($sourceRoot, $release, $config);
        $report['steps'][] = step('database_schema', 'success', 'Database schema imported from release baseline.');
        $report['database_setup'] = [
            'strategy' => 'baseline_schema',
            'artifact' => $schema['path'],
            'artifact_sha256' => $schema['sha256'],
            'upgrade_strategy' => 'versioned_migrations',
        ];
    } elseif ($mode === 'upgrade' || ($mode === 'fresh' && fresh_install_uses_migrations($config))) {
        run_artisan($installPath, ['migrate', '--force']);
        $report['steps'][] = step('database_schema', 'success', 'Database schema prepared with additive versioned migrations.');
        $report['database_setup'] = [
            'strategy' => 'versioned_migrations',
            'upgrade_strategy' => 'versioned_migrations',
        ];
    } else {
        verify_existing_schema($config);
        $report['steps'][] = step('database_schema', 'success', 'Existing database schema verified; repair did not run migrations.');
        $report['database_setup'] = [
            'strategy' => 'repair_verify_existing_schema',
            'upgrade_strategy' => 'versioned_migrations',
        ];
    }

    run_artisan($installPath, ['optimize:clear'], 3);
    bootstrap_admin($installPath, $config, $mode);
    $report['steps'][] = step('admin_bootstrap', 'success', 'First administrator checked or created when configured.');

    run_artisan($installPath, ['config:cache'], 3);
    run_artisan($installPath, ['view:cache'], 3);
    $report['steps'][] = step('runtime_cache', 'success', 'Laravel runtime caches refreshed.');

    $manifest = install_manifest($release, $config, $mode, $appUrl);
    $manifestPath = $installPath . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'app' . DIRECTORY_SEPARATOR . 'installer' . DIRECTORY_SEPARATOR . 'install-manifest.json';
    write_json_file($manifestPath, $manifest);
    $report['manifest'] = $manifestPath;
    $report['status'] = 'success';
    $report['summary'] = 'PBB Support System ' . $mode . ' completed successfully.';
    cleanup_temp_source($temporarySourceRoot);
    finish_report($report, $startedAt, $reportPath);
    exit(0);
} catch (InstallerException $e) {
    cleanup_temp_source($temporarySourceRoot);
    $report['status'] = 'failed';
    $report['summary'] = $e->getMessage();
    $report['errors'][] = $e->getMessage();
    finish_report($report, $startedAt, $reportPath);
    exit($e->exitCode);
} catch (Throwable $e) {
    cleanup_temp_source($temporarySourceRoot);
    $report['status'] = 'failed';
    $report['summary'] = $e->getMessage();
    $report['errors'][] = $e->getMessage();
    finish_report($report, $startedAt, $reportPath);
    exit(1);
}

final class InstallerException extends RuntimeException
{
    public function __construct(string $message, public int $exitCode = 1)
    {
        parent::__construct($message);
    }
}

function parse_args(array $argv): array
{
    $options = [];
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

function base_report(string $startedAt): array
{
    return [
        'schema_version' => 1,
        'app' => 'pbb-support',
        'version' => '0.1.0',
        'mode' => 'fresh',
        'status' => 'running',
        'started_at' => $startedAt,
        'finished_at' => null,
        'summary' => '',
        'steps' => [],
        'warnings' => [],
        'errors' => [],
    ];
}

function preflight_checks(array $config, string $sourceRoot, string $installPath, string $mode): array
{
    $checks = [];
    $checks[] = check('php.version', 'PHP version', version_compare(PHP_VERSION, '8.2.0', '>='), 'PHP ' . PHP_VERSION . ' detected.', 'Use PHP 8.2 or newer.');
    foreach (['json', 'openssl', 'mbstring', 'pdo', 'pdo_mysql', 'fileinfo', 'tokenizer'] as $extension) {
        $checks[] = check('php.extension.' . $extension, 'PHP extension ' . $extension, extension_loaded($extension), 'Extension loaded.', 'Enable PHP extension ' . $extension . '.');
    }
    $checks[] = check('source.artisan', 'Source artisan', is_file($sourceRoot . DIRECTORY_SEPARATOR . 'artisan'), 'Application payload has artisan.', 'Bundle must contain app/artisan.');
    $checks[] = check('source.vendor', 'Source vendor', is_dir($sourceRoot . DIRECTORY_SEPARATOR . 'vendor'), 'Production vendor directory is present.', 'Bundle must include production Composer dependencies.');
    $checks[] = check('install.path', 'Install path', $installPath !== '' && (is_dir($installPath) || is_writable(dirname($installPath))), 'Install path can be prepared.', 'Choose a writable install path.');
    $checks[] = database_check($config);
    if ($mode === 'fresh') {
        $checks[] = check('database.empty', 'Fresh database empty', database_table_count($config) === 0, 'Fresh target database is empty.', 'Reset or choose an empty database before fresh install.');
    }

    return $checks;
}

function check(string $id, string $label, bool $passed, string $message, string $remediation): array
{
    return [
        'id' => $id,
        'label' => $label,
        'status' => $passed ? 'passed' : 'failed',
        'message' => $passed ? $message : $remediation,
        'remediation' => $passed ? null : $remediation,
    ];
}

function database_check(array $config): array
{
    try {
        pdo($config);
        return check('database.connection', 'Database connection', true, 'Database connection works.', '');
    } catch (Throwable $e) {
        return check('database.connection', 'Database connection', false, '', 'Could not connect to MySQL: ' . $e->getMessage());
    }
}

function assert_empty_database(array $config): void
{
    if (database_table_count($config) > 0) {
        throw new InstallerException('Fresh install target database is not empty.', 1);
    }
}

function fresh_install_uses_migrations(array $config): bool
{
    $databaseSetup = (string) data_get($config, 'options.database_setup', 'baseline_schema');
    $runMigrations = (bool) data_get($config, 'options.run_migrations', false);

    return $databaseSetup === 'versioned_migrations' || $runMigrations;
}

function import_baseline_schema(string $sourceRoot, array $release, array $config): array
{
    $relative = (string) data_get($release, 'installer.database.baseline_schema.path', 'database/schema/mysql-schema.sql');
    $path = $sourceRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    if (!is_file($path)) {
        throw new InstallerException('Fresh install baseline schema is missing: ' . $relative, 1);
    }

    $expectedHash = (string) data_get($release, 'installer.database.baseline_schema.sha256', '');
    $actualHash = hash_file('sha256', $path);
    if ($expectedHash !== '' && !hash_equals(strtolower($expectedHash), strtolower($actualHash))) {
        throw new InstallerException('Fresh install baseline schema checksum mismatch.', 1);
    }

    $pdo = pdo($config);
    foreach (split_sql_statements((string) file_get_contents($path)) as $statement) {
        $pdo->exec($statement);
    }

    return [
        'path' => $relative,
        'sha256' => $actualHash,
    ];
}

function verify_existing_schema(array $config): void
{
    if (database_table_count($config) <= 0) {
        throw new InstallerException('Repair requires an existing database schema.', 1);
    }
}

function split_sql_statements(string $sql): array
{
    $statements = [];
    $buffer = '';
    $quote = null;
    $escaped = false;
    $length = strlen($sql);

    for ($i = 0; $i < $length; $i++) {
        $char = $sql[$i];
        $buffer .= $char;

        if ($quote !== null) {
            if ($escaped) {
                $escaped = false;
                continue;
            }
            if ($char === '\\') {
                $escaped = true;
                continue;
            }
            if ($char === $quote) {
                $quote = null;
            }
            continue;
        }

        if ($char === '\'' || $char === '"') {
            $quote = $char;
            continue;
        }

        if ($char === ';') {
            $statement = trim($buffer);
            if ($statement !== '') {
                $statements[] = rtrim($statement, ';');
            }
            $buffer = '';
        }
    }

    $statement = trim($buffer);
    if ($statement !== '') {
        $statements[] = $statement;
    }

    return $statements;
}

function database_table_count(array $config): int
{
    $pdo = pdo($config);
    $database = required_string($config, 'database.database');
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ?');
    $stmt->execute([$database]);

    return (int) $stmt->fetchColumn();
}

function pdo(array $config): PDO
{
    $host = required_string($config, 'database.host');
    $port = (string) data_get($config, 'database.port', '3306');
    $database = required_string($config, 'database.database');
    $username = required_string($config, 'database.username');
    $password = (string) data_get($config, 'database.password', '');

    return new PDO("mysql:host={$host};port={$port};dbname={$database};charset=utf8mb4", $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
}

function copy_app_payload(string $sourceRoot, string $installPath, string $mode): void
{
    $preserve = [
        '.env',
        'storage',
        'bootstrap/cache',
    ];

    foreach (new DirectoryIterator($sourceRoot) as $item) {
        if ($item->isDot()) {
            continue;
        }
        $name = $item->getFilename();
        if (in_array($name, ['installer', 'checksums.sha256'], true)) {
            continue;
        }
        if ($mode !== 'fresh' && in_array($name, $preserve, true)) {
            continue;
        }
        $target = $installPath . DIRECTORY_SEPARATOR . $name;
        if ($item->isDir()) {
            if ($mode === 'fresh' && is_dir($target) && !in_array($name, ['storage', 'bootstrap'], true)) {
                remove_tree($target);
            }
            copy_tree($item->getPathname(), $target, []);
        } else {
            copy_file($item->getPathname(), $target);
        }
    }
}

function source_root_is_inside_install_path(string $sourceRoot, string $installPath): bool
{
    $source = realpath($sourceRoot);
    $target = realpath($installPath);
    if ($source === false || $target === false) {
        return false;
    }

    $source = rtrim(str_replace('\\', '/', $source), '/');
    $target = rtrim(str_replace('\\', '/', $target), '/');

    return $source === $target || str_starts_with($source . '/', $target . '/');
}

function cleanup_temp_source(?string $path): void
{
    if ($path !== null && is_dir($path)) {
        remove_tree($path);
    }
}

function write_env(string $installPath, array $config, array $release): void
{
    $envPath = $installPath . DIRECTORY_SEPARATOR . '.env';
    $existing = is_file($envPath) ? parse_env_file($envPath) : [];
    $appKey = $existing['APP_KEY'] ?? ('base64:' . base64_encode(random_bytes(32)));
    $settings = array_merge($existing, [
        'APP_NAME' => 'PBB Support System',
        'APP_ENV' => (string) data_get($config, 'app.app_env', 'production'),
        'APP_KEY' => $appKey,
        'APP_DEBUG' => data_get($config, 'app.app_debug', false) ? 'true' : 'false',
        'APP_URL' => rtrim(required_string($config, 'app.app_url'), '/'),
        'APP_LOCALE' => 'en',
        'APP_FALLBACK_LOCALE' => 'en',
        'LOG_CHANNEL' => 'stack',
        'DB_CONNECTION' => 'mysql',
        'DB_HOST' => required_string($config, 'database.host'),
        'DB_PORT' => (string) data_get($config, 'database.port', '3306'),
        'DB_DATABASE' => required_string($config, 'database.database'),
        'DB_USERNAME' => required_string($config, 'database.username'),
        'DB_PASSWORD' => (string) data_get($config, 'database.password', ''),
        'CACHE_STORE' => 'database',
        'QUEUE_CONNECTION' => 'database',
        'SESSION_DRIVER' => 'database',
        'SESSION_LIFETIME' => '120',
        'RELEASE_BUILD_ID' => (string) data_get($release, 'build.id', ''),
    ]);

    foreach (account_env_settings($config, $appUrl, $existing) as $key => $value) {
        if ($value !== null) {
            $settings[$key] = $value;
        }
    }

    write_env_file($envPath, $settings);
}

function account_env_settings(array $config, string $appUrl, array $existing): array
{
    $accountBaseUrl = first_config_string($config, [
        'support.data_prep.apply_settings.account.base_url',
        'support.account.base_url',
        'dependencies.account.base_url',
        'account.base_url',
    ], 'https://account.pbb.ph');
    $clientId = first_config_string($config, [
        'support.data_prep.apply_settings.account.client_id',
        'support.account.client_id',
        'account.client_id',
    ], 'pbb-support');
    $clientSecret = first_config_string($config, [
        'support.data_prep.apply_settings.account.client_secret',
        'support.account.client_secret',
        'shared.secrets.values.support_account_client_secret',
        'shared.secrets.values.pbb_support_account_client_secret',
        'account.client_secret',
    ], '');
    $adminApiToken = first_config_string($config, [
        'support.data_prep.apply_settings.account.admin_api_token',
        'support.account.admin_api_token',
        'shared.secrets.values.support_account_admin_api_token',
        'shared.secrets.values.pbb_support_account_admin_api_token',
        'account.admin_api_token',
    ], '');
    $redirectUri = first_config_string($config, [
        'support.data_prep.apply_settings.account.redirect_uri',
        'support.account.redirect_uri',
        'account.redirect_uri',
    ], rtrim($appUrl, '/') . '/auth/account/callback');
    $postLogoutUri = first_config_string($config, [
        'support.data_prep.apply_settings.account.post_logout_redirect_uri',
        'support.account.post_logout_redirect_uri',
        'account.post_logout_redirect_uri',
    ], rtrim($appUrl, '/'));
    $scopes = first_config_string($config, [
        'support.data_prep.apply_settings.account.scopes',
        'support.account.scopes',
        'account.scopes',
    ], 'openid profile');
    $timeout = first_config_string($config, [
        'support.data_prep.apply_settings.account.timeout_seconds',
        'support.account.timeout_seconds',
        'account.timeout_seconds',
    ], '10');
    $caBundle = first_config_string($config, [
        'support.data_prep.apply_settings.account.ca_bundle',
        'support.account.ca_bundle',
        'dependencies.account.ca_bundle',
        'account.ca_bundle',
        'ssl.chain_file',
    ], '');

    return [
        'PBB_ACCOUNT_SSO_ENABLED' => config_bool_string($config, [
            'support.data_prep.apply_settings.account.sso_enabled',
            'support.account.sso_enabled',
            'account.sso_enabled',
        ], $clientSecret !== '', $existing['PBB_ACCOUNT_SSO_ENABLED'] ?? null),
        'PBB_ACCOUNT_BASE_URL' => $accountBaseUrl,
        'PBB_ACCOUNT_CLIENT_ID' => $clientId,
        'PBB_ACCOUNT_CLIENT_SECRET' => $clientSecret !== '' ? $clientSecret : null,
        'PBB_ACCOUNT_REDIRECT_URI' => $redirectUri,
        'PBB_ACCOUNT_POST_LOGOUT_REDIRECT_URI' => $postLogoutUri,
        'PBB_ACCOUNT_SCOPES' => $scopes,
        'PBB_ACCOUNT_TIMEOUT_SECONDS' => $timeout,
        'PBB_ACCOUNT_CA_BUNDLE' => $caBundle !== '' ? $caBundle : null,
        'PBB_ACCOUNT_ADMIN_API_ENABLED' => config_bool_string($config, [
            'support.data_prep.apply_settings.account.admin_api_enabled',
            'support.account.admin_api_enabled',
            'account.admin_api_enabled',
        ], $adminApiToken !== '', $existing['PBB_ACCOUNT_ADMIN_API_ENABLED'] ?? null),
        'PBB_ACCOUNT_ADMIN_API_TOKEN' => $adminApiToken !== '' ? $adminApiToken : null,
    ];
}

function bootstrap_admin(string $installPath, array $config, string $mode): void
{
    $admin = is_array($config['admin'] ?? null) ? $config['admin'] : [];
    if (($admin['strategy'] ?? 'create_if_missing') === 'skip') {
        return;
    }

    $email = trim((string) ($admin['email'] ?? 'admin@pbb.local'));
    $password = (string) ($admin['password'] ?? '');
    if ($email === '' || $password === '') {
        if ($mode === 'fresh') {
            throw new InstallerException('Admin email and password are required for fresh install.', 2);
        }
        return;
    }

    $script = <<<'PHP'
<?php
$root = getcwd();
require $root . '/vendor/autoload.php';
$app = require $root . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$email = getenv('PBB_ADMIN_EMAIL') ?: 'admin@pbb.local';
$name = getenv('PBB_ADMIN_NAME') ?: 'PBB Administrator';
$password = getenv('PBB_ADMIN_PASSWORD') ?: '';
$overwrite = getenv('PBB_ADMIN_OVERWRITE') === '1';
$user = App\Models\User::where('email', $email)->first();
if (!$user) {
    $user = new App\Models\User();
    $user->email = $email;
}
if (!$user->exists || $overwrite) {
    $user->name = $name;
    $user->password = Illuminate\Support\Facades\Hash::make($password);
    $user->role = 'admin';
    $user->save();
}
PHP;

    $temp = $installPath . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'app' . DIRECTORY_SEPARATOR . 'installer' . DIRECTORY_SEPARATOR . 'bootstrap-admin.php';
    write_file($temp, $script);
    $env = [
        'PBB_ADMIN_EMAIL' => $email,
        'PBB_ADMIN_NAME' => (string) ($admin['name'] ?? 'PBB Administrator'),
        'PBB_ADMIN_PASSWORD' => $password,
        'PBB_ADMIN_OVERWRITE' => !empty($admin['overwrite_existing']) ? '1' : '0',
    ];
    run_php($installPath, [$temp], $env);
    @unlink($temp);
}

function run_artisan(string $installPath, array $args, int $attempts = 1): void
{
    run_php($installPath, array_merge(['artisan'], $args), [], $attempts);
}

function run_php(string $cwd, array $args, array $env, int $attempts = 1): void
{
    $cmd = array_merge([PHP_BINARY], $args);
    $lastOutput = '';
    for ($attempt = 1; $attempt <= max(1, $attempts); $attempt++) {
        $stdoutPath = tempnam(sys_get_temp_dir(), 'pbb-install-out-');
        $stderrPath = tempnam(sys_get_temp_dir(), 'pbb-install-err-');
        if ($stdoutPath === false || $stderrPath === false) {
            throw new InstallerException('Unable to allocate installer command logs.', 1);
        }

        $descriptors = [
            1 => ['file', $stdoutPath, 'w'],
            2 => ['file', $stderrPath, 'w'],
        ];

        $processEnv = getenv();
        if (!is_array($processEnv)) {
            $processEnv = [];
        }
        $process = proc_open($cmd, $descriptors, $pipes, $cwd, array_merge($processEnv, $env));
        if (!is_resource($process)) {
            @unlink($stdoutPath);
            @unlink($stderrPath);
            throw new InstallerException('Unable to start PHP process.', 1);
        }

        $code = proc_close($process);
        $stdout = (string) @file_get_contents($stdoutPath);
        $stderr = (string) @file_get_contents($stderrPath);
        @unlink($stdoutPath);
        @unlink($stderrPath);

        if ($code === 0) {
            return;
        }

        $lastOutput = trim($stderr ?: $stdout) ?: 'PHP process failed.';
        if ($attempt < $attempts) {
            sleep(1);
        }
    }

    throw new InstallerException($lastOutput, 1);
}

function install_manifest(array $release, array $config, string $mode, string $appUrl): array
{
    return [
        'schema_version' => 1,
        'app' => $release['app'] ?? 'pbb-support',
        'name' => $release['name'] ?? 'PBB Support System',
        'version' => $release['version'] ?? '0.1.0',
        'build' => $release['build'] ?? [],
        'installed_at' => date(DATE_ATOM),
        'install_mode' => $mode,
        'install_path' => required_string($config, 'app.install_path'),
        'public_path' => (string) data_get($config, 'app.public_path', ''),
        'app_url' => $appUrl,
        'environment' => (string) data_get($config, 'app.app_env', 'production'),
        'database' => [
            'driver' => 'mysql',
            'host' => required_string($config, 'database.host'),
            'port' => (string) data_get($config, 'database.port', '3306'),
            'database' => required_string($config, 'database.database'),
            'username' => required_string($config, 'database.username'),
        ],
        'runtime_services' => $release['runtime_services'] ?? [],
        'landing' => $release['landing'] ?? null,
    ];
}

function decorate_services(array $services): array
{
    return array_map(function (array $service): array {
        $service['status'] = 'declared';
        $service['message'] = 'Runtime service requirement declared for Kit orchestration.';
        return $service;
    }, $services);
}

function finish_report(array $report, string $startedAt, ?string $reportPath): void
{
    $report['started_at'] = $startedAt;
    $report['finished_at'] = date(DATE_ATOM);
    if ($reportPath !== null) {
        write_json_file($reportPath, $report);
    }
    echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
}

function ensure_laravel_runtime(string $installPath): void
{
    foreach ([
        'storage/app',
        'storage/app/installer',
        'storage/framework/cache',
        'storage/framework/sessions',
        'storage/framework/views',
        'storage/logs',
        'bootstrap/cache',
    ] as $relative) {
        ensure_dir($installPath . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative));
    }
}

function read_json(string $path): array
{
    $data = json_decode((string) file_get_contents($path), true);
    if (!is_array($data)) {
        throw new InstallerException('Invalid JSON file: ' . $path, 2);
    }

    return $data;
}

function write_json_file(string $path, array $data): void
{
    write_file($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL);
}

function parse_env_file(string $path): array
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

function write_env_file(string $path, array $settings): void
{
    $lines = [];
    foreach ($settings as $key => $value) {
        $value = (string) $value;
        if (preg_match('/\s|#|=|"/', $value)) {
            $value = '"' . str_replace('"', '\\"', $value) . '"';
        }
        $lines[] = $key . '=' . $value;
    }
    write_file($path, implode("\n", $lines) . "\n");
}

function required_string(array $data, string $path): string
{
    $value = data_get($data, $path);
    if (!is_scalar($value) || trim((string) $value) === '') {
        throw new InstallerException('Missing required config value: ' . $path, 2);
    }

    return trim((string) $value);
}

function data_get(array $data, string $path, mixed $default = null): mixed
{
    $value = $data;
    foreach (explode('.', $path) as $segment) {
        if (!is_array($value) || !array_key_exists($segment, $value)) {
            return $default;
        }
        $value = $value[$segment];
    }

    return $value;
}

function first_config_string(array $config, array $paths, string $default = ''): string
{
    foreach ($paths as $path) {
        $value = data_get($config, $path);
        if (is_scalar($value)) {
            $text = trim((string) $value);
            if ($text !== '') {
                return $text;
            }
        }
    }

    return $default;
}

function config_bool_string(array $config, array $paths, bool $default, mixed $existing = null): ?string
{
    foreach ($paths as $path) {
        $value = data_get($config, $path);
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

    if (is_scalar($existing) && trim((string) $existing) !== '') {
        return null;
    }

    return $default ? 'true' : 'false';
}

function step(string $id, string $status, string $message): array
{
    return [
        'id' => $id,
        'status' => $status,
        'message' => $message,
    ];
}

function copy_tree(string $source, string $target, array $excludePatterns): void
{
    ensure_dir($target);
    if ($excludePatterns === [] && copy_tree_native($source, $target)) {
        return;
    }

    $source = rtrim($source, DIRECTORY_SEPARATOR);
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($items as $item) {
        $sourcePath = $item->getPathname();
        $relative = str_replace('\\', '/', substr($sourcePath, strlen($source) + 1));
        if (excluded($relative, $excludePatterns)) {
            continue;
        }
        $targetPath = $target . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
        if ($item->isDir()) {
            ensure_dir($targetPath);
        } else {
            copy_file($sourcePath, $targetPath);
        }
    }
}

function copy_tree_native(string $source, string $target): bool
{
    if (PHP_OS_FAMILY !== 'Windows') {
        return false;
    }

    $stdoutPath = tempnam(sys_get_temp_dir(), 'pbb-install-copy-out-');
    $stderrPath = tempnam(sys_get_temp_dir(), 'pbb-install-copy-err-');
    if ($stdoutPath === false || $stderrPath === false) {
        return false;
    }

    $command = [
        'robocopy',
        $source,
        $target,
        '/E',
        '/NFL',
        '/NDL',
        '/NJH',
        '/NJS',
        '/NP',
    ];
    $descriptors = [
        1 => ['file', $stdoutPath, 'w'],
        2 => ['file', $stderrPath, 'w'],
    ];
    $process = proc_open($command, $descriptors, $pipes);
    if (!is_resource($process)) {
        @unlink($stdoutPath);
        @unlink($stderrPath);
        return false;
    }

    $code = proc_close($process);
    $stdout = (string) @file_get_contents($stdoutPath);
    $stderr = (string) @file_get_contents($stderrPath);
    @unlink($stdoutPath);
    @unlink($stderrPath);

    if ($code <= 7) {
        return true;
    }

    throw new InstallerException(trim($stderr ?: $stdout) ?: 'Native directory copy failed.', 1);
}

function excluded(string $relative, array $patterns): bool
{
    foreach ($patterns as $pattern) {
        $regex = '#^' . str_replace('\*', '.*', preg_quote($pattern, '#')) . '$#';
        if (preg_match($regex, $relative)) {
            return true;
        }
    }

    return false;
}

function copy_file(string $source, string $target): void
{
    ensure_dir(dirname($target));
    if (!copy($source, $target)) {
        throw new InstallerException('Unable to copy ' . $source . ' to ' . $target, 1);
    }
}

function write_file(string $path, string $contents): void
{
    ensure_dir(dirname($path));
    file_put_contents($path, $contents);
}

function ensure_dir(string $path): void
{
    if (!is_dir($path) && !mkdir($path, 0775, true) && !is_dir($path)) {
        throw new InstallerException('Unable to create directory: ' . $path, 1);
    }
}

function remove_tree(string $path): void
{
    if (!is_dir($path)) {
        return;
    }
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($items as $item) {
        $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    }
    rmdir($path);
}
