<?php

namespace Tests\Feature;

use Symfony\Component\Process\Process;
use Tests\TestCase;

class SourceHeartbeatFrontendMergeTest extends TestCase
{
    public function test_realtime_single_source_update_preserves_other_heartbeat_rows(): void
    {
        $script = <<<'JS'
            import assert from 'node:assert/strict';
            import { pathToFileURL } from 'node:url';

            const {
                mergeHeartbeatCache,
                mergeSourceHeartbeats,
            } = await import(pathToFileURL(process.argv[1]).href);

            const existing = [
                {
                    source_hub_id: '13',
                    source_relay_hub_id: '072217003',
                    status: 'online',
                    last_seen_at: '2026-06-22T10:29:55+08:00',
                },
                {
                    source_hub_id: '14',
                    source_relay_hub_id: '072217004',
                    status: 'offline',
                    last_seen_at: '2026-06-22T09:00:00+08:00',
                },
            ];

            const merged = mergeHeartbeatCache(existing, [{
                hub_id: '13',
                relay_hub_id: '072217003',
                status: 'stale',
                age_seconds: 360,
            }]);

            assert.equal(merged.length, 2);
            assert.equal(merged[0].source_hub_id, '13');
            assert.equal(merged[0].hub_id, '13');
            assert.equal(merged[0].status, 'stale');
            assert.equal(merged[1].source_hub_id, '14');
            assert.equal(merged[1].status, 'offline');

            const sources = mergeSourceHeartbeats([
                { id: '13', name: 'Apas' },
                { id: '14', name: 'Capitol Site' },
            ], merged);

            assert.equal(sources[0].heartbeat.status, 'stale');
            assert.equal(sources[1].heartbeat.status, 'offline');

            const replaced = mergeHeartbeatCache(existing, [{ source_hub_id: '99', status: 'online' }], { replace: true });
            assert.deepEqual(replaced, [{ source_hub_id: '99', status: 'online' }]);
        JS;

        $process = new Process([
            'node',
            '--input-type=module',
            '-e',
            $script,
            base_path('resources/js/sourceHeartbeats.js'),
        ], base_path());
        $process->run();

        $this->assertTrue(
            $process->isSuccessful(),
            trim($process->getErrorOutput()."\n".$process->getOutput()),
        );
    }
}
