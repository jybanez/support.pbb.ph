<?php

namespace App\Console\Commands;

use App\Support\Sitreps\SitrepRelaySubmissionService;
use Illuminate\Console\Command;

class SubmitLatestSitrepToRelay extends Command
{
    protected $signature = 'support:sitreps:relay-latest';

    protected $description = 'Submit the latest pending consolidated SITREP to Relay.';

    public function handle(SitrepRelaySubmissionService $service): int
    {
        $delivery = $service->submitLatest();

        if ($delivery === null) {
            $this->info('No pending consolidated SITREP delivery.');

            return self::SUCCESS;
        }

        $this->info(sprintf(
            'Relay delivery #%d finished with status [%s].',
            $delivery->id,
            $delivery->status,
        ));

        return $delivery->status === 'failed' ? self::FAILURE : self::SUCCESS;
    }
}
