<?php

namespace App\Http\Controllers\Api;

use App\Support\Sitreps\CurrentSitrepMediaService;

class CurrentSitrepMediaController extends BaseApiController
{
    public function index(CurrentSitrepMediaService $media)
    {
        $current = $media->current();

        if (! $current || ! is_array($current->sitrep_payload)) {
            return $this->ok([
                'available' => false,
                'media_refs' => [],
            ]);
        }

        return $this->ok([
            'available' => true,
            'sitrep' => [
                'id' => $current->id,
                'generated_at' => $this->scalarString($current->sitrep_payload['generated_at'] ?? null),
            ],
            'media_refs' => $media->mediaRefs($current->sitrep_payload),
        ]);
    }

    private function scalarString(mixed $value): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }

        $value = trim((string) $value);

        return $value !== '' ? $value : null;
    }
}
