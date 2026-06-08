<?php

namespace App\Support\Maps;

class MapServerUrls
{
    public static function baseUrl(): string
    {
        $url = trim((string) config('services.map_server.url', 'https://mapserver.pbb.ph'));
        $url = rtrim($url !== '' ? $url : 'https://mapserver.pbb.ph', '/');
        $host = parse_url($url, PHP_URL_HOST);

        if (is_string($host) && in_array(strtolower($host), ['localhost', '127.0.0.1', '::1'], true)) {
            return 'https://mapserver.pbb.ph';
        }

        return $url;
    }

    public static function boundaryUrl(string $scope, string $code): string
    {
        return sprintf(
            '%s/boundaries/%s/%s.geojson',
            self::baseUrl(),
            rawurlencode($scope),
            rawurlencode($code),
        );
    }
}
