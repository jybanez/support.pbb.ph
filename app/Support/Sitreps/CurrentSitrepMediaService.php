<?php

namespace App\Support\Sitreps;

use App\Models\ConsolidatedSitrep;
use App\Support\Settings\SupportSettings;
use Pbb\Hotline\Media\MediaRefLocalUrl;
use Pbb\Hotline\Media\SitrepMediaRefResolver;

class CurrentSitrepMediaService
{
    public function __construct(
        private readonly SupportSettings $settings,
        private readonly SitrepMediaRefResolver $resolver = new SitrepMediaRefResolver,
        private readonly MediaRefLocalUrl $localUrl = new MediaRefLocalUrl,
    ) {}

    public function current(): ?ConsolidatedSitrep
    {
        return ConsolidatedSitrep::query()
            ->where('status', ConsolidatedSitrep::STATUS_CURRENT)
            ->latest('consolidated_at')
            ->latest('id')
            ->first();
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<int, array<string, mixed>>
     */
    public function mediaRefs(array $payload): array
    {
        return collect($this->resolver->extractMediaRefs($payload))
            ->filter(fn (mixed $ref): bool => is_array($ref))
            ->map(function (array $ref): ?array {
                $path = $this->localUrl->path($ref, '/media');
                $cacheKey = $this->localUrl->cacheKey($ref);

                if ($path === null || $cacheKey === null) {
                    return null;
                }

                return [
                    ...$ref,
                    'local_url' => $path,
                    'cache_key' => $cacheKey,
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>|null
     */
    public function findRefByPath(array $payload, string $path): ?array
    {
        $path = '/'.trim($path, '/');

        foreach ($this->mediaRefs($payload) as $ref) {
            if (($ref['local_url'] ?? null) === $path) {
                return $ref;
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array{source_system:string,source_hub_id:string,relay_token?:string}
     */
    public function sdkConfig(array $payload): array
    {
        $settings = $this->settings->all();
        $relayToken = trim((string) ($settings['relayToken'] ?? ''));

        $config = [
            'source_system' => (string) ($settings['supportRequestUpdateSourceSystem'] ?? 'support.dispatch'),
            'source_hub_id' => $this->localHubId($payload),
        ];

        if ($relayToken !== '') {
            $config['relay_token'] = $relayToken;
        }

        return $config;
    }

    public function cachePath(): string
    {
        return storage_path('app/hotline-media');
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function localHubId(array $payload): string
    {
        $value = data_get($payload, 'source_snapshot.rollup.hub_node.snapshot.hub_id')
            ?? data_get($payload, 'source_snapshot.hub_node.snapshot.hub_id')
            ?? data_get($payload, 'source_snapshot.rollup.hub_node.snapshot.relay_hub_id')
            ?? data_get($payload, 'source_snapshot.hub_node.snapshot.relay_hub_id')
            ?? '';

        return trim((string) $value);
    }
}
