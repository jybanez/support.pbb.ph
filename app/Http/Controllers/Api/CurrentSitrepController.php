<?php

namespace App\Http\Controllers\Api;

use App\Models\ConsolidatedSitrep;
use App\Support\Maps\MapServerUrls;
use Pbb\Sitreps\Viewer\SitrepViewer;

class CurrentSitrepController extends BaseApiController
{
    public function show(SitrepViewer $viewer)
    {
        $current = ConsolidatedSitrep::query()
            ->where('status', ConsolidatedSitrep::STATUS_CURRENT)
            ->latest('consolidated_at')
            ->latest('id')
            ->first();

        if (! $current || ! is_array($current->sitrep_payload)) {
            return $this->ok([
                'available' => false,
                'sitrep' => null,
                'identity' => null,
                'sections' => [],
                'sources' => [],
                'html' => null,
                'css' => $viewer->css(),
            ]);
        }

        return $this->ok([
            'available' => true,
            'sitrep' => [
                'id' => $current->id,
                'alert_level' => $current->alert_level,
                'computed_source_alert_level' => $current->computed_source_alert_level,
                'source_sitrep_count' => $current->source_sitrep_count,
                'consolidated_at' => $current->consolidated_at?->toIso8601String(),
                'generated_at' => $this->scalarString($current->sitrep_payload['generated_at'] ?? null),
            ],
            'identity' => $this->identity($current->sitrep_payload),
            'context_boundary' => $this->contextBoundary($current->sitrep_payload),
            'sections' => $this->sections($viewer, $current->sitrep_payload),
            'sources' => $this->sources($current->sitrep_payload),
            'map_points' => $this->mapPoints($current->sitrep_payload),
            'html' => $viewer->render($current->sitrep_payload, [
                'full_document' => false,
                'inline_css' => false,
            ]),
            'css' => $viewer->css(),
        ]);
    }

    /**
     * @param array<string, mixed> $payload
     * @return array{name: string, code: string|null, deployment: string|null}
     */
    private function identity(array $payload): array
    {
        $snapshot = data_get($payload, 'source_snapshot.rollup.hub_node.snapshot');

        if (! is_array($snapshot)) {
            $snapshot = data_get($payload, 'source_snapshot.hub_node.snapshot');
        }

        if (! is_array($snapshot)) {
            $snapshot = [];
        }

        $name = $snapshot['name'] ?? $payload['coverage_area'] ?? $payload['title'] ?? config('app.name', 'PBB Support System');

        return [
            'name' => is_scalar($name) ? (string) $name : config('app.name', 'PBB Support System'),
            'code' => is_scalar($snapshot['code'] ?? null) ? (string) $snapshot['code'] : null,
            'deployment' => is_scalar($snapshot['deployment'] ?? null) ? (string) $snapshot['deployment'] : null,
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @return array{scope: string, code: string, url: string}|null
     */
    private function contextBoundary(array $payload): ?array
    {
        $hubSnapshots = [
            data_get($payload, 'source_snapshot.rollup.hub_node.snapshot'),
            data_get($payload, 'source_snapshot.hub_node.snapshot'),
        ];

        $sources = data_get($payload, 'source_snapshot.rollup.hub_nodes');

        if (is_array($sources)) {
            foreach ($sources as $source) {
                if (! is_array($source)) {
                    continue;
                }

                $snapshot = is_array($source['snapshot'] ?? null) ? $source['snapshot'] : [];
                $hubSnapshots[] = $snapshot;

                $uplinks = $snapshot['uplinks'] ?? [];
                if (! is_array($uplinks)) {
                    continue;
                }

                foreach ($uplinks as $uplink) {
                    if (is_array($uplink) && is_array($uplink['hub'] ?? null)) {
                        $hubSnapshots[] = $uplink['hub'];
                    }
                }
            }
        }

        foreach ($hubSnapshots as $snapshot) {
            if (! is_array($snapshot)) {
                continue;
            }

            $deployment = strtolower(trim((string) ($snapshot['deployment'] ?? '')));
            $code = null;

            if ($deployment === 'city') {
                $code = $snapshot['citymun_code'] ?? $snapshot['relay_hub_id'] ?? null;
            } elseif ($deployment === 'barangay') {
                $code = $snapshot['citymun_code'] ?? null;
            }

            $code = $this->scalarString($code);

            if ($code !== null) {
                return [
                    'scope' => 'city',
                    'code' => $code,
                    'url' => MapServerUrls::boundaryUrl('city', $code),
                ];
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<int, array{id: string, label: string, html: string}>
     */
    private function sections(SitrepViewer $viewer, array $payload): array
    {
        return collect($viewer->sectionNames())
            ->reject(fn (string $section): bool => in_array($section, [
                'header',
                'footer',
                'period_activity',
                'verification_notes',
            ], true))
            ->map(fn (string $section): array => [
                'id' => $section,
                'label' => $this->sectionLabel($section),
                'html' => $viewer->renderSection($payload, $section, [
                    'layout' => 'compact',
                ]),
            ])
            ->values()
            ->all();
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<int, array<string, mixed>>
     */
    private function sources(array $payload): array
    {
        $sources = data_get($payload, 'source_snapshot.rollup.hub_nodes');

        if (! is_array($sources)) {
            return [];
        }

        $sourceAlertLevels = $this->sourceAlertLevels($payload);

        return collect($sources)
            ->filter(fn (mixed $source): bool => is_array($source))
            ->map(function (array $source) use ($sourceAlertLevels): array {
                $snapshot = is_array($source['snapshot'] ?? null) ? $source['snapshot'] : [];
                $name = $snapshot['name'] ?? $source['source_hub_name'] ?? $source['name'] ?? 'Source hub';
                $subtitle = $snapshot['deployment_label'] ?? $source['deployment_label'] ?? $snapshot['deployment'] ?? $source['deployment'] ?? null;
                $sourceId = $this->scalarString($source['source_hub_id'] ?? $snapshot['hub_id'] ?? $source['hub_id'] ?? null);

                return [
                    'id' => $sourceId,
                    'relay_hub_id' => $this->scalarString($source['source_relay_hub_id'] ?? $snapshot['relay_hub_id'] ?? $source['relay_hub_id'] ?? null),
                    'name' => $this->scalarString($name) ?? 'Source hub',
                    'subtitle' => $this->scalarString($subtitle),
                    'alert_level' => $this->scalarString($source['alert_level'] ?? $snapshot['alert_level'] ?? null)
                        ?? ($sourceId !== null ? ($sourceAlertLevels[$sourceId] ?? null) : null),
                    'snapshot_at' => $this->scalarString($snapshot['snapshot_at'] ?? $source['snapshot_at'] ?? null),
                    'code' => $this->scalarString($snapshot['code'] ?? $source['code'] ?? null),
                    'domain' => $this->scalarString($snapshot['domain'] ?? $source['domain'] ?? null),
                    'status' => $this->scalarString($snapshot['status'] ?? $source['status'] ?? null),
                    'boundary' => $this->boundaryReference($snapshot),
                    'data' => $source,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, string>
     */
    private function sourceAlertLevels(array $payload): array
    {
        $alerts = [];
        $sourceSitreps = data_get($payload, 'source_snapshot.rollup.source_sitreps');

        if (is_array($sourceSitreps)) {
            foreach ($sourceSitreps as $sourceSitrep) {
                if (! is_array($sourceSitrep)) {
                    continue;
                }

                $hubId = $this->scalarString($sourceSitrep['source_hub_id'] ?? $sourceSitrep['hub_id'] ?? $sourceSitrep['relay_hub_id'] ?? null);
                $alertLevel = $this->scalarString($sourceSitrep['alert_level'] ?? null);

                if ($hubId !== null && $alertLevel !== null) {
                    $alerts[$hubId] = $alertLevel;
                }
            }
        }

        $items = data_get($payload, 'source_snapshot.items');

        if (is_array($items)) {
            foreach ($items as $item) {
                if (! is_array($item)) {
                    continue;
                }

                $hubId = $this->scalarString(
                    $item['source_hub_id']
                    ?? data_get($item, 'location.id')
                    ?? data_get($item, 'location.relay_hub_id')
                    ?? data_get($item, 'data.hub_node.snapshot.hub_id')
                    ?? data_get($item, 'data.hub_node.snapshot.relay_hub_id')
                    ?? null,
                );
                $alertLevel = $this->scalarString($item['alert_level'] ?? data_get($item, 'location.alert_level'));

                if ($hubId !== null && $alertLevel !== null) {
                    $alerts[$hubId] = $alertLevel;
                }
            }
        }

        return $alerts;
    }

    /**
     * @param array<string, mixed> $snapshot
     * @return array{scope: string, code: string, url: string}|null
     */
    private function boundaryReference(array $snapshot): ?array
    {
        $deployment = strtolower(trim((string) ($snapshot['deployment'] ?? '')));
        $scope = in_array($deployment, ['barangay', 'city', 'province', 'region'], true)
            ? $deployment
            : null;

        if ($scope === null) {
            return null;
        }

        $code = match ($scope) {
            'barangay' => $snapshot['brgy_code'] ?? null,
            'city' => $snapshot['citymun_code'] ?? null,
            'province' => $snapshot['prov_code'] ?? null,
            'region' => $snapshot['reg_code'] ?? null,
        };

        $code = $this->scalarString($code);

        if ($code === null) {
            return null;
        }

        return [
            'scope' => $scope,
            'code' => $code,
            'url' => MapServerUrls::boundaryUrl($scope, $code),
        ];
    }

    private function scalarString(mixed $value): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }

        $value = trim((string) $value);

        return $value !== '' ? $value : null;
    }

    private function sectionLabel(string $section): string
    {
        return str((string) $section)
            ->replace('_', ' ')
            ->title()
            ->toString();
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<int, array<string, mixed>>
     */
    private function mapPoints(array $payload): array
    {
        $coordinates = data_get($payload, 'source_snapshot.rollup.incident_coordinates');

        if (! is_array($coordinates)) {
            $coordinates = data_get($payload, 'source_snapshot.incident_coordinates');
        }

        if (! is_array($coordinates)) {
            return [];
        }

        $sourceNames = $this->sourceNames($payload);

        return collect($coordinates)
            ->filter(fn (mixed $item): bool => is_array($item))
            ->map(function (array $item) use ($payload, $sourceNames): ?array {
                $lat = $item['lat'] ?? $item['latitude'] ?? null;
                $lng = $item['lng'] ?? $item['lon'] ?? $item['longitude'] ?? null;

                if (! is_numeric($lat) || ! is_numeric($lng)) {
                    return null;
                }

                $id = is_scalar($item['id'] ?? null) ? (string) $item['id'] : md5(json_encode($item));
                $sourceHubId = is_scalar($item['source_hub_id'] ?? null) ? (string) $item['source_hub_id'] : null;
                $sourceHubName = $sourceHubId !== null ? ($sourceNames[$sourceHubId] ?? null) : null;

                return [
                    'id' => $id,
                    'lat' => (float) $lat,
                    'lng' => (float) $lng,
                    'source_hub_id' => $sourceHubId,
                    'source_hub_name' => $sourceHubName,
                    'display_id' => '#'.$id,
                    'alert_level' => (string) ($payload['alert_level'] ?? 'Normal'),
                    'status' => 'SITREP point',
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, string>
     */
    private function sourceNames(array $payload): array
    {
        $sources = data_get($payload, 'source_snapshot.rollup.hub_nodes');

        if (! is_array($sources)) {
            $sources = data_get($payload, 'source_snapshot.rollup.source_sitreps');
        }

        if (! is_array($sources)) {
            $sources = data_get($payload, 'source_snapshot.source_sitreps');
        }

        if (! is_array($sources)) {
            return [];
        }

        $names = [];

        foreach ($sources as $source) {
            if (! is_array($source)) {
                continue;
            }

            $snapshot = is_array($source['snapshot'] ?? null) ? $source['snapshot'] : [];
            $hubId = $source['source_hub_id'] ?? $snapshot['hub_id'] ?? $source['hub_id'] ?? null;

            if (! is_scalar($hubId)) {
                continue;
            }

            $hubId = (string) $hubId;
            $name = $source['source_hub_name'] ?? $snapshot['name'] ?? $source['name'] ?? null;
            $name = is_scalar($name) ? trim((string) $name) : '';

            if ($name !== '') {
                $names[$hubId] = $name;
            }
        }

        return $names;
    }
}
