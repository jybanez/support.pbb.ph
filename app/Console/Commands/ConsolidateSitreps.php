<?php

namespace App\Console\Commands;

use App\Support\Sitreps\SitrepConsolidationService;
use Illuminate\Console\Command;

class ConsolidateSitreps extends Command
{
    protected $signature = 'support:sitreps:consolidate';

    protected $description = 'Consolidate staged SITREPs into the current Support SITREP.';

    public function handle(SitrepConsolidationService $service): int
    {
        $consolidated = $service->consolidate();

        $this->info(sprintf(
            'Consolidated SITREP #%d stored with status [%s] from %d source SITREP(s).',
            $consolidated->id,
            $consolidated->status,
            $consolidated->source_sitrep_count,
        ));

        return self::SUCCESS;
    }
}
