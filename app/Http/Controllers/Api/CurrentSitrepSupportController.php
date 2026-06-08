<?php

namespace App\Http\Controllers\Api;

use App\Models\ConsolidatedSitrep;
use App\Support\Sitreps\SupportStrategyBuilder;

class CurrentSitrepSupportController extends BaseApiController
{
    public function show(SupportStrategyBuilder $builder)
    {
        $current = ConsolidatedSitrep::query()
            ->where('status', ConsolidatedSitrep::STATUS_CURRENT)
            ->latest('consolidated_at')
            ->latest('id')
            ->first();

        if (! $current || ! is_array($current->sitrep_payload)) {
            return $this->ok([
                'available' => false,
                'sitrep_id' => null,
                'generated_at' => null,
                'source_generated_at' => null,
                'coverage_area' => null,
                'coverage_level' => null,
                'strategy' => null,
            ]);
        }

        $payload = $current->sitrep_payload;

        return $this->ok([
            'available' => true,
            'sitrep_id' => $current->id,
            'generated_at' => $current->consolidated_at?->toIso8601String(),
            'source_generated_at' => $this->text($payload['generated_at'] ?? null),
            'coverage_area' => $this->text($payload['coverage_area'] ?? $payload['title'] ?? null),
            'coverage_level' => $this->text($payload['coverage_level'] ?? null),
            'strategy' => $builder->build($payload, $current),
        ]);
    }

    private function text(mixed $value): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }

        $value = trim((string) $value);

        return $value !== '' ? $value : null;
    }
}
