<?php

declare(strict_types=1);

$options = parse_args($argv);
$root = dirname(__DIR__);
$outDir = absolute_path($root, isset($options['out']) ? (string) $options['out'] : ($root . DIRECTORY_SEPARATOR . 'dist'));
$kitOutDir = 'C:' . DIRECTORY_SEPARATOR . 'wamp64' . DIRECTORY_SEPARATOR . 'www' . DIRECTORY_SEPARATOR . 'pbb' . DIRECTORY_SEPARATOR . 'kit-setup' . DIRECTORY_SEPARATOR . 'packages' . DIRECTORY_SEPARATOR . 'bundled';
$phpBinary = isset($options['php']) ? (string) $options['php'] : PHP_BINARY;
$composerPhar = isset($options['composer'])
    ? (string) $options['composer']
    : 'C:' . DIRECTORY_SEPARATOR . 'ProgramData' . DIRECTORY_SEPARATOR . 'ComposerSetup' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'composer.phar';
$release = release_payload($root);
$version = (string) ($release['version'] ?? '0.1.0');
$app = (string) ($release['app'] ?? 'pbb-support');
$bundleName = $app . '-' . $version . '.zip';
$bundlePath = rtrim($outDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $bundleName;
$stage = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'pbb-support-bundle-' . date('YmdHis') . '-' . bin2hex(random_bytes(4));

if (!class_exists('ZipArchive')) {
    fwrite(STDERR, "PHP zip extension is required to build the bundle.\n");
    exit(4);
}

try {
    $dirty = trim(git_value($root, 'status --short', ''));
    if ($dirty !== '' && empty($options['allow-dirty'])) {
        throw new RuntimeException('Working tree is dirty. Commit changes first or pass --allow-dirty for a non-canonical test build.');
    }

    ensure_file($phpBinary, 'PHP binary');
    ensure_file($composerPhar, 'Composer phar');
    ensure_dir($outDir);
    ensure_dir($stage);

    if (empty($options['skip-npm'])) {
        run_process(['cmd', '/c', 'npm', 'run', 'build'], $root);
    }

    $buildId = 'pbb-support-' . $version . '-' . date('Ymd.His');
    $gitCommit = git_value($root, 'rev-parse --short=12 HEAD', 'unknown');
    $release['build'] = array_merge(is_array($release['build'] ?? null) ? $release['build'] : [], [
        'version' => $version,
        'id' => $buildId,
        'built_at' => date(DATE_ATOM),
        'git_commit' => $gitCommit,
        'builder' => 'pbb-support-bundle-builder',
    ]);
    if ($dirty !== '') {
        $release['build']['dirty'] = true;
    }

    ensure_dir($stage . DIRECTORY_SEPARATOR . 'app');
    copy_app_payload($root, $stage . DIRECTORY_SEPARATOR . 'app');
    copy_tree($root . DIRECTORY_SEPARATOR . 'installer', $stage . DIRECTORY_SEPARATOR . 'installer', []);
    copy_tree($root . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR . 'data-prep', $stage . DIRECTORY_SEPARATOR . 'tools' . DIRECTORY_SEPARATOR . 'data-prep', []);

    $baseline = generate_baseline_schema($root, $stage . DIRECTORY_SEPARATOR . 'app', $phpBinary);
    $release = with_baseline_metadata($release, $baseline);
    write_json_file($stage . DIRECTORY_SEPARATOR . 'release.json', $release);
    write_json_file($stage . DIRECTORY_SEPARATOR . 'app' . DIRECTORY_SEPARATOR . 'release.json', $release);

    clean_runtime($stage . DIRECTORY_SEPARATOR . 'app');
    install_production_vendor($stage . DIRECTORY_SEPARATOR . 'app', $phpBinary, $composerPhar);
    run_process([$phpBinary, 'artisan', 'package:discover', '--ansi'], $stage . DIRECTORY_SEPARATOR . 'app');
    prune_production_noise($stage . DIRECTORY_SEPARATOR . 'app');

    $checksums = checksums($stage);
    write_file($stage . DIRECTORY_SEPARATOR . 'checksums.sha256', implode("\n", $checksums) . "\n");

    if (is_file($bundlePath)) {
        unlink($bundlePath);
    }
    zip_dir($stage, $bundlePath);

    if (!empty($options['kit-copy'])) {
        ensure_dir($kitOutDir);
        copy_file($bundlePath, $kitOutDir . DIRECTORY_SEPARATOR . $bundleName);
    }

    $audit = audit_stage($stage);
    $summary = [
        'bundle' => $bundlePath,
        'kit_bundle' => !empty($options['kit-copy']) ? ($kitOutDir . DIRECTORY_SEPARATOR . $bundleName) : null,
        'sha256' => hash_file('sha256', $bundlePath),
        'bytes' => filesize($bundlePath),
        'entries' => count_zip_entries($bundlePath),
        'build_id' => $buildId,
        'git_commit' => $gitCommit,
        'dirty' => $dirty !== '',
        'internal_checksums' => [
            'checked' => count($checksums),
            'missing' => 0,
            'bad' => 0,
        ],
        'baseline_schema' => $baseline,
        'audit' => $audit,
        'landing_public_gateway' => $release['landing']['public_gateway'] ?? null,
    ];

    echo json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . PHP_EOL);
    exit(1);
} finally {
    remove_tree($stage);
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

function absolute_path(string $root, string $path): string
{
    if (preg_match('/^[A-Za-z]:[\\\\\\/]/', $path) || str_starts_with($path, DIRECTORY_SEPARATOR)) {
        return $path;
    }

    return $root . DIRECTORY_SEPARATOR . $path;
}

function release_payload(string $root): array
{
    $data = json_decode((string) file_get_contents($root . DIRECTORY_SEPARATOR . 'release.json'), true);
    if (!is_array($data)) {
        throw new RuntimeException('Invalid release.json.');
    }

    return $data;
}

function with_baseline_metadata(array $release, array $baseline): array
{
    $release['installer']['database']['fresh_install_strategy'] = 'baseline_schema';
    $release['installer']['database']['baseline_schema'] = [
        'path' => $baseline['path'],
        'engine' => 'mysql',
        'generated_at' => $baseline['generated_at'],
        'source' => 'current-release-schema',
        'sha256' => $baseline['sha256'],
    ];
    $release['installer']['database']['upgrade_strategy'] = 'versioned_migrations';

    return $release;
}

function generate_baseline_schema(string $root, string $appRoot, string $phpBinary): array
{
    $env = read_env_file($root . DIRECTORY_SEPARATOR . '.env');
    if (($env['DB_CONNECTION'] ?? 'mysql') !== 'mysql') {
        throw new RuntimeException('Baseline schema generation requires DB_CONNECTION=mysql in .env.');
    }

    $host = (string) ($env['DB_HOST'] ?? '127.0.0.1');
    $port = (string) ($env['DB_PORT'] ?? '3306');
    $username = (string) ($env['DB_USERNAME'] ?? 'root');
    $password = (string) ($env['DB_PASSWORD'] ?? '');
    $baseDatabase = (string) ($env['DB_DATABASE'] ?? 'pbb_support');
    $database = preg_replace('/[^A-Za-z0-9_]/', '_', $baseDatabase) . '_bundle_' . date('YmdHis') . '_' . bin2hex(random_bytes(3));
    $server = new PDO("mysql:host={$host};port={$port};charset=utf8mb4", $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    $path = 'database/schema/mysql-schema.sql';
    $absolutePath = $appRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $path);

    try {
        $server->exec('CREATE DATABASE ' . mysql_identifier($database) . ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        run_process_with_env([$phpBinary, 'artisan', 'migrate', '--force'], $root, [
            'DB_CONNECTION' => 'mysql',
            'DB_HOST' => $host,
            'DB_PORT' => $port,
            'DB_DATABASE' => $database,
            'DB_USERNAME' => $username,
            'DB_PASSWORD' => $password,
        ]);
        $schema = dump_mysql_schema($host, $port, $database, $username, $password);
        write_file($absolutePath, $schema);
    } finally {
        $server->exec('DROP DATABASE IF EXISTS ' . mysql_identifier($database));
    }

    return [
        'path' => $path,
        'generated_at' => date(DATE_ATOM),
        'sha256' => hash_file('sha256', $absolutePath),
        'bytes' => filesize($absolutePath),
    ];
}

function read_env_file(string $path): array
{
    if (!is_file($path)) {
        throw new RuntimeException('.env is required to generate the package baseline schema.');
    }

    $values = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $value = trim($value);
        if ((str_starts_with($value, '"') && str_ends_with($value, '"')) || (str_starts_with($value, "'") && str_ends_with($value, "'"))) {
            $value = substr($value, 1, -1);
        }
        $values[trim($key)] = $value;
    }

    return $values;
}

function dump_mysql_schema(string $host, string $port, string $database, string $username, string $password): string
{
    $pdo = new PDO("mysql:host={$host};port={$port};dbname={$database};charset=utf8mb4", $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    $tables = $pdo->query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name")->fetchAll(PDO::FETCH_COLUMN);

    $sql = [
        '-- PBB Support System baseline schema generated at ' . date(DATE_ATOM),
        'SET FOREIGN_KEY_CHECKS=0;',
    ];

    foreach ($tables as $table) {
        $create = $pdo->query('SHOW CREATE TABLE ' . mysql_identifier((string) $table))->fetch(PDO::FETCH_ASSOC);
        $statement = (string) ($create['Create Table'] ?? array_values($create)[1] ?? '');
        $statement = preg_replace('/ AUTO_INCREMENT=\d+\b/', '', $statement) ?: $statement;
        $sql[] = 'DROP TABLE IF EXISTS ' . mysql_identifier((string) $table) . ';';
        $sql[] = $statement . ';';
        if ($table === 'migrations') {
            $rows = $pdo->query('SELECT id, migration, batch FROM `migrations` ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
            if ($rows) {
                $values = array_map(
                    fn (array $row): string => '(' . (int) $row['id'] . ', ' . $pdo->quote((string) $row['migration']) . ', ' . (int) $row['batch'] . ')',
                    $rows
                );
                $sql[] = 'INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES ' . implode(",\n", $values) . ';';
            }
        }
    }

    $sql[] = 'SET FOREIGN_KEY_CHECKS=1;';

    return implode("\n\n", $sql) . "\n";
}

function mysql_identifier(string $identifier): string
{
    return '`' . str_replace('`', '``', $identifier) . '`';
}

function copy_app_payload(string $root, string $target): void
{
    $names = [
        'app',
        'bootstrap',
        'config',
        'database',
        'packages',
        'public',
        'resources',
        'routes',
        'storage',
        'artisan',
        'composer.json',
        'composer.lock',
    ];

    foreach ($names as $name) {
        $source = $root . DIRECTORY_SEPARATOR . $name;
        $destination = $target . DIRECTORY_SEPARATOR . $name;
        if (is_dir($source)) {
            copy_tree($source, $destination, [
                'factories',
                'factories/*',
                'seeders',
                'seeders/*',
                '*/demo',
                '*/demo/*',
                '*/demos',
                '*/demos/*',
                '*/docs',
                '*/docs/*',
                '*/test',
                '*/test/*',
                '*/tests',
                '*/tests/*',
                '*/sample',
                '*/sample/*',
                '*/samples',
                '*/samples/*',
                '*/fixtures',
                '*/fixtures/*',
                '*/README.md',
                '*/CHANGELOG.md',
                '*/UPGRADING.md',
                'app/*.png',
                'logs/*',
                'framework/cache/*',
                'framework/sessions/*',
                'framework/views/*',
                'app/installer/*',
            ]);
        } elseif (is_file($source)) {
            copy_file($source, $destination);
        }
    }

    foreach ([
        'storage/app',
        'storage/app/installer',
        'storage/framework/cache',
        'storage/framework/sessions',
        'storage/framework/views',
        'storage/logs',
        'bootstrap/cache',
    ] as $relative) {
        ensure_dir($target . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative));
        write_file($target . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative) . DIRECTORY_SEPARATOR . '.gitkeep', '');
    }
}

function install_production_vendor(string $appRoot, string $phpBinary, string $composerPhar): void
{
    run_process([
        $phpBinary,
        $composerPhar,
        'install',
        '--no-dev',
        '--prefer-dist',
        '--optimize-autoloader',
        '--no-interaction',
        '--no-progress',
        '--no-scripts',
    ], $appRoot);
}

function clean_runtime(string $appRoot): void
{
    foreach ([
        '.env',
        'bootstrap/cache/config.php',
        'bootstrap/cache/packages.php',
        'bootstrap/cache/routes-v7.php',
        'bootstrap/cache/services.php',
        'storage/logs/laravel.log',
    ] as $relative) {
        $path = $appRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
        if (is_file($path)) {
            unlink($path);
        }
    }
}

function audit_stage(string $stage): array
{
    $forbidden = [
        'app/.env',
        'app/.git',
        'app/node_modules',
        'app/tests',
        'app/database/factories',
        'app/database/seeders',
        'app/vendor/phpunit',
        'app/vendor/mockery',
        'app/vendor/fakerphp',
        'app/vendor/nunomaduro/collision',
        'app/vendor/laravel/sail',
        'app/vendor/laravel/pint',
        'app/vendor/laravel/pail',
        'app/vendor/sebastian',
        'app/vendor/theseer',
        'app/vendor/myclabs/deep-copy',
        'app/vendor/phar-io',
    ];
    $matches = [];
    foreach ($forbidden as $relative) {
        $path = $stage . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
        if (file_exists($path)) {
            $matches[] = $relative;
        }
    }

    return [
        'forbidden_matches' => $matches,
        'production_vendor' => is_dir($stage . DIRECTORY_SEPARATOR . 'app' . DIRECTORY_SEPARATOR . 'vendor')
            && !is_dir($stage . DIRECTORY_SEPARATOR . 'app' . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'phpunit'),
        'required_present' => [
            'release.json' => is_file($stage . DIRECTORY_SEPARATOR . 'release.json'),
            'checksums.sha256' => true,
            'app/public/.htaccess' => is_file($stage . DIRECTORY_SEPARATOR . 'app' . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . '.htaccess'),
            'installer/install-run.php' => is_file($stage . DIRECTORY_SEPARATOR . 'installer' . DIRECTORY_SEPARATOR . 'install-run.php'),
        ],
    ];
}

function prune_production_noise(string $appRoot): void
{
    $directoryNames = [
        'demo',
        'demos',
        'doc',
        'docs',
        'fixture',
        'fixtures',
        'sample',
        'samples',
        'test',
        'tests',
    ];
    $fileNames = [
        'changelog',
        'changelog.md',
        'readme',
        'readme.md',
        'upgrading',
        'upgrading.md',
    ];

    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($appRoot, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($items as $item) {
        $name = $item->getFilename();
        if ($item->isDir() && in_array(strtolower($name), $directoryNames, true)) {
            remove_tree($item->getPathname());
            continue;
        }

        if ($item->isFile() && in_array(strtolower($name), $fileNames, true)) {
            unlink($item->getPathname());
        }
    }
}

function checksums(string $stage): array
{
    $rows = [];
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($stage, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($items as $item) {
        if (!$item->isFile()) {
            continue;
        }
        $relative = str_replace('\\', '/', substr($item->getPathname(), strlen($stage) + 1));
        if ($relative === 'checksums.sha256') {
            continue;
        }
        $rows[] = hash_file('sha256', $item->getPathname()) . '  ' . $relative;
    }
    sort($rows, SORT_STRING);

    return $rows;
}

function zip_dir(string $source, string $zipPath): void
{
    $zip = new ZipArchive();
    if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        throw new RuntimeException('Unable to create ZIP: ' . $zipPath);
    }
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($items as $item) {
        if (!$item->isFile()) {
            continue;
        }
        $relative = str_replace('\\', '/', substr($item->getPathname(), strlen($source) + 1));
        $zip->addFile($item->getPathname(), $relative);
    }
    $zip->close();
}

function count_zip_entries(string $zipPath): int
{
    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) {
        return 0;
    }
    $count = $zip->numFiles;
    $zip->close();

    return $count;
}

function run_process(array $command, string $cwd): void
{
    $stdoutPath = tempnam(sys_get_temp_dir(), 'pbb-support-build-out-');
    $stderrPath = tempnam(sys_get_temp_dir(), 'pbb-support-build-err-');
    $descriptors = [
        1 => ['file', $stdoutPath, 'w'],
        2 => ['file', $stderrPath, 'w'],
    ];
    $process = proc_open($command, $descriptors, $pipes, $cwd);
    if (!is_resource($process)) {
        throw new RuntimeException('Unable to start process: ' . implode(' ', $command));
    }
    $code = proc_close($process);
    $stdout = is_file($stdoutPath) ? (string) file_get_contents($stdoutPath) : '';
    $stderr = is_file($stderrPath) ? (string) file_get_contents($stderrPath) : '';
    @unlink($stdoutPath);
    @unlink($stderrPath);
    if ($code !== 0) {
        throw new RuntimeException("Command failed: " . implode(' ', $command) . "\n" . trim($stderr ?: $stdout));
    }
}

function run_robocopy(array $command, string $cwd): void
{
    $stdoutPath = tempnam(sys_get_temp_dir(), 'pbb-support-build-out-');
    $stderrPath = tempnam(sys_get_temp_dir(), 'pbb-support-build-err-');
    $descriptors = [
        1 => ['file', $stdoutPath, 'w'],
        2 => ['file', $stderrPath, 'w'],
    ];
    $process = proc_open($command, $descriptors, $pipes, $cwd);
    if (!is_resource($process)) {
        throw new RuntimeException('Unable to start process: ' . implode(' ', $command));
    }
    $code = proc_close($process);
    $stdout = is_file($stdoutPath) ? (string) file_get_contents($stdoutPath) : '';
    $stderr = is_file($stderrPath) ? (string) file_get_contents($stderrPath) : '';
    @unlink($stdoutPath);
    @unlink($stderrPath);
    if ($code > 7) {
        throw new RuntimeException("Robocopy failed with code {$code}: " . trim($stderr ?: $stdout));
    }
}

function run_process_with_env(array $command, string $cwd, array $env): void
{
    $previous = [];
    foreach ($env as $key => $value) {
        $previous[$key] = getenv((string) $key);
        putenv($key . '=' . $value);
        $_ENV[(string) $key] = (string) $value;
        $_SERVER[(string) $key] = (string) $value;
    }

    try {
        run_process($command, $cwd);
    } finally {
        foreach ($previous as $key => $value) {
            if ($value === false) {
                putenv((string) $key);
                unset($_ENV[(string) $key], $_SERVER[(string) $key]);
            } else {
                putenv($key . '=' . $value);
                $_ENV[(string) $key] = (string) $value;
                $_SERVER[(string) $key] = (string) $value;
            }
        }
    }
}

function git_value(string $root, string $command, string $default): string
{
    $output = [];
    $code = 0;
    exec('git -C ' . escapeshellarg($root) . ' ' . $command . ' 2>NUL', $output, $code);
    if ($code !== 0) {
        return $default;
    }

    return trim(implode("\n", $output));
}

function copy_tree(string $source, string $target, array $excludePatterns): void
{
    ensure_dir($target);
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
        throw new RuntimeException('Unable to copy ' . $source . ' to ' . $target);
    }
}

function write_json_file(string $path, array $data): void
{
    write_file($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL);
}

function write_file(string $path, string $contents): void
{
    ensure_dir(dirname($path));
    file_put_contents($path, $contents);
}

function ensure_dir(string $path): void
{
    if (!is_dir($path) && !mkdir($path, 0775, true) && !is_dir($path)) {
        throw new RuntimeException('Unable to create directory: ' . $path);
    }
}

function ensure_file(string $path, string $label): void
{
    if (!is_file($path)) {
        throw new RuntimeException($label . ' not found: ' . $path);
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
