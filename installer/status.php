<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$release = read_json($root . DIRECTORY_SEPARATOR . 'release.json');
$manifestPath = $root . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'app' . DIRECTORY_SEPARATOR . 'installer' . DIRECTORY_SEPARATOR . 'install-manifest.json';
$manifest = is_file($manifestPath) ? read_json($manifestPath) : [];

$installed = is_array($manifest) && ($manifest['app'] ?? null) === ($release['app'] ?? 'pbb-support');

json_response([
    'schema_version' => 1,
    'app' => $release['app'] ?? 'pbb-support',
    'version' => $release['version'] ?? '0.1.0',
    'installed' => $installed,
    'status' => $installed ? 'healthy' : 'not-installed',
    'mode' => $manifest['install_mode'] ?? ($installed ? 'installed' : 'not-installed'),
    'health' => [
        'manifest' => $installed ? 'ok' : 'missing',
    ],
    'services' => $release['runtime_services'] ?? [],
    'warnings' => [],
]);

function read_json(string $path): array
{
    if (!is_file($path)) {
        return [];
    }

    $data = json_decode((string) file_get_contents($path), true);

    return is_array($data) ? $data : [];
}

function json_response(array $payload): void
{
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
}
