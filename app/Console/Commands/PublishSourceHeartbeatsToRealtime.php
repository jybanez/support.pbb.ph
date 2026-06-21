<?php

namespace App\Console\Commands;

use App\Support\Realtime\SourceHeartbeatRealtimePublisher;
use App\Support\Realtime\SourceHeartbeatSnapshotService;
use Illuminate\Console\Command;

class PublishSourceHeartbeatsToRealtime extends Command
{
    protected $signature = 'support:source-heartbeats:publish {--hours=48}';

    protected $description = 'Poll Relay source heartbeats and publish changes to Realtime.';

    public function handle(SourceHeartbeatSnapshotService $snapshots, SourceHeartbeatRealtimePublisher $publisher): int
    {
        $hours = max(1, min(72, (int) $this->option('hours')));
        $snapshot = $snapshots->fetch($hours);
        $published = $publisher->publish($snapshot);

        $this->info($published
            ? 'Source heartbeat snapshot published to Realtime.'
            : 'Source heartbeat snapshot unchanged, unavailable, or Realtime is not configured.');

        return self::SUCCESS;
    }
}
