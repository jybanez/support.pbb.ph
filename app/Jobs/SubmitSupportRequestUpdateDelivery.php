<?php

namespace App\Jobs;

use App\Models\SupportRequestUpdateDelivery;
use App\Support\SupportRequests\SupportRequestLifecycleRelayService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SubmitSupportRequestUpdateDelivery implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(
        private readonly int $deliveryId,
    ) {
        $this->onQueue('default');
    }

    public function handle(SupportRequestLifecycleRelayService $relay): void
    {
        $delivery = SupportRequestUpdateDelivery::query()->find($this->deliveryId);

        if (! $delivery || $delivery->delivery_status === SupportRequestUpdateDelivery::STATUS_SENT) {
            return;
        }

        $relay->submit($delivery);
    }
}
