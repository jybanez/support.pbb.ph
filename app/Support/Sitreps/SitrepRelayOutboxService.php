<?php

namespace App\Support\Sitreps;

use App\Jobs\SubmitSitrepRelayDelivery;
use App\Models\ConsolidatedSitrep;
use App\Models\SitrepRelayDelivery;

class SitrepRelayOutboxService
{
    public function queue(ConsolidatedSitrep $sitrep): SitrepRelayDelivery
    {
        $delivery = SitrepRelayDelivery::query()->firstOrCreate(
            ['consolidated_sitrep_id' => $sitrep->id],
            ['status' => SitrepRelayDelivery::STATUS_PENDING],
        );

        SubmitSitrepRelayDelivery::dispatch($delivery->id);

        return $delivery;
    }

    public function latestUnsentDelivery(): ?SitrepRelayDelivery
    {
        $latest = ConsolidatedSitrep::query()
            ->where('status', ConsolidatedSitrep::STATUS_CURRENT)
            ->latest('consolidated_at')
            ->latest('id')
            ->first();

        if (! $latest) {
            return null;
        }

        return SitrepRelayDelivery::query()
            ->where('consolidated_sitrep_id', $latest->id)
            ->whereIn('status', [
                SitrepRelayDelivery::STATUS_PENDING,
                SitrepRelayDelivery::STATUS_FAILED,
            ])
            ->first();
    }
}
