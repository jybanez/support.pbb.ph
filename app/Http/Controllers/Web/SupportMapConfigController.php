<?php

namespace App\Http\Controllers\Web;

use App\Models\ConsolidatedSitrep;
use App\Support\Maps\MapServerUrls;
use Illuminate\Http\JsonResponse;

class SupportMapConfigController
{
    private const DEFAULT_EXCLUDED_POI_CLASSES = [
        'gate',
        'parking',
        'parking_entrance',
        'car_parking',
        'bicycle_parking',
        'motorcycle_parking',
        'lift_gate',
        'pitch',
        'post',
        'swimming_pool',
        'office',
        'shelter',
        'bench',
        'toilets',
        'waste_basket',
        'recycling',
        'drinking_water',
        'vending_machine',
    ];

    public function show(): JsonResponse
    {
        $mapServerUrl = MapServerUrls::baseUrl();
        $boundary = $this->boundaryConfig();

        return response()->json([
            'map' => [
                'enabled' => true,
                'provider' => 'maplibre',
                'theme' => 'dark',
                'styleUrl' => '/maps/support-vector-style.json',
                'mapServerUrl' => $mapServerUrl,
                'center' => [123.8854, 10.3157],
                'zoom' => 12,
                'minZoom' => 8,
                'maxZoom' => 18,
                'assets' => [
                    'script' => '/vendor/maplibre/maplibre-gl.js',
                    'css' => '/vendor/maplibre/maplibre-gl.css',
                ],
                'tiles' => [
                    'vector' => $mapServerUrl.'/tiles/vector/{z}/{x}/{y}.pbf',
                    'terrain' => $mapServerUrl.'/tiles/terrain/{z}/{x}/{y}.png',
                    'glyphs' => $mapServerUrl.'/tiles/glyphs/{fontstack}/{range}.pbf',
                    'poi' => $mapServerUrl.'/tiles/poi/{z}/{x}/{y}.pbf',
                ],
                'poi' => [
                    'enabled' => true,
                    'sourceLayers' => ['poi', 'pois', 'point', 'points', 'amenity'],
                    'excludedClasses' => self::DEFAULT_EXCLUDED_POI_CLASSES,
                ],
                'boundary' => $boundary,
            ],
        ]);
    }

    /**
     * @return array{enabled: bool, url?: string, scope?: string, code?: string, source?: string}
     */
    private function boundaryConfig(): array
    {
        $hubNode = $this->currentSitrepHubNode();
        $boundary = is_array($hubNode) ? $this->boundaryReference($hubNode) : null;

        if ($boundary === null) {
            return ['enabled' => false];
        }

        return [
            'enabled' => true,
            'url' => MapServerUrls::boundaryUrl($boundary['scope'], $boundary['code']),
            'scope' => $boundary['scope'],
            'code' => $boundary['code'],
            'source' => $boundary['source'],
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function currentSitrepHubNode(): ?array
    {
        $payload = ConsolidatedSitrep::query()
            ->where('status', ConsolidatedSitrep::STATUS_CURRENT)
            ->latest('consolidated_at')
            ->latest('id')
            ->value('sitrep_payload');

        if (! is_array($payload)) {
            return null;
        }

        $direct = data_get($payload, 'source_snapshot.hub_node');

        if (is_array($direct)) {
            return [
                'source' => 'source_snapshot.hub_node',
                'snapshot' => is_array($direct['snapshot'] ?? null) ? $direct['snapshot'] : $direct,
            ];
        }

        $rollup = data_get($payload, 'source_snapshot.rollup.hub_node');

        if (is_array($rollup)) {
            return [
                'source' => 'source_snapshot.rollup.hub_node',
                'snapshot' => is_array($rollup['snapshot'] ?? null) ? $rollup['snapshot'] : $rollup,
            ];
        }

        return null;
    }

    /**
     * @param array<string, mixed> $hub
     * @return array{scope: string, code: string, source: string}|null
     */
    private function boundaryReference(array $hub): ?array
    {
        $snapshot = is_array($hub['snapshot'] ?? null) ? $hub['snapshot'] : $hub;
        $deployment = strtolower(trim((string) ($snapshot['deployment'] ?? '')));
        $scope = in_array($deployment, ['barangay', 'city', 'province', 'region'], true)
            ? $deployment
            : 'barangay';

        if ($scope === 'barangay' && trim((string) ($snapshot['citymun_code'] ?? '')) !== '') {
            return [
                'scope' => 'city',
                'code' => trim((string) $snapshot['citymun_code']),
                'source' => (string) ($hub['source'] ?? 'source_snapshot.hub_node').'.citymun_code',
            ];
        }

        $code = match ($scope) {
            'city' => $snapshot['citymun_code'] ?? null,
            'province' => $snapshot['prov_code'] ?? null,
            'region' => $snapshot['reg_code'] ?? null,
            default => $snapshot['brgy_code'] ?? $snapshot['relay_hub_id'] ?? null,
        };

        $code = trim((string) $code);

        return $code === ''
            ? null
            : [
                'scope' => $scope,
                'code' => $code,
                'source' => (string) ($hub['source'] ?? 'source_snapshot.hub_node'),
            ];
    }
}
