<?php

namespace App\Support\Sitreps;

use App\Models\RelayInboundSitrep;
use App\Models\SitrepStaging;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Pbb\Sitreps\Consolidation\Staging\SitrepStagingStore;

class DatabaseSitrepStagingStore implements SitrepStagingStore
{
    public function stage(array $normalizedSitrep, ?RelayInboundSitrep $inbound = null): array
    {
        $deployment = $this->requiredString($normalizedSitrep, 'source_deployment');
        $sourceHubId = $this->requiredString($normalizedSitrep, 'source_hub_id');
        $payload = $normalizedSitrep['payload'] ?? null;

        if (! is_array($payload)) {
            throw new \InvalidArgumentException('Normalized SITREP payload is required for staging.');
        }

        $staging = SitrepStaging::query()->updateOrCreate(
            ['source_hub_id' => $sourceHubId],
            [
                'relay_inbound_sitrep_id' => $inbound?->id,
                'source_deployment' => $deployment,
                'source_hub_name' => $normalizedSitrep['source_hub_name'] ?? null,
                'relay_hub_id' => $normalizedSitrep['relay_hub_id'] ?? null,
                'alert_level' => $normalizedSitrep['alert_level'] ?? 'Normal',
                'payload_hash' => $this->requiredString($normalizedSitrep, 'payload_hash'),
                'period_started_at' => $this->nullableDate($normalizedSitrep['period_started_at'] ?? null),
                'period_ended_at' => $this->nullableDate($normalizedSitrep['period_ended_at'] ?? null),
                'generated_at' => $this->nullableDate($normalizedSitrep['generated_at'] ?? null),
                'normalized_sitrep' => $normalizedSitrep,
                'sitrep_payload' => $payload,
                'staged_at' => now(),
            ],
        );

        return [
            'deployment' => $deployment,
            'source_hub_id' => $sourceHubId,
            'key' => sprintf('%s/%s', $deployment, $sourceHubId),
            'staging_id' => $staging->id,
            'sitrep' => $normalizedSitrep,
        ];
    }

    public function list(string $deployment): array
    {
        return SitrepStaging::query()
            ->where('source_deployment', $deployment)
            ->orderBy('source_hub_name')
            ->orderBy('source_hub_id')
            ->get()
            ->map(fn (SitrepStaging $staging): array => $staging->normalized_sitrep)
            ->filter(fn (mixed $item): bool => is_array($item))
            ->values()
            ->all();
    }

    public function forget(string $deployment, string $sourceHubId): void
    {
        SitrepStaging::query()
            ->where('source_deployment', $deployment)
            ->where('source_hub_id', $sourceHubId)
            ->delete();
    }

    private function requiredString(array $payload, string $key): string
    {
        $value = trim((string) ($payload[$key] ?? ''));

        if ($value === '') {
            throw new \InvalidArgumentException(sprintf('Normalized SITREP field [%s] is required.', $key));
        }

        return $value;
    }

    private function nullableDate(mixed $value): ?CarbonInterface
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }
}
