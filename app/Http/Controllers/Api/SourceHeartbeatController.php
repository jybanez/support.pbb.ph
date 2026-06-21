<?php

namespace App\Http\Controllers\Api;

use App\Support\Realtime\SourceHeartbeatSnapshotService;
use Illuminate\Http\Request;

class SourceHeartbeatController extends BaseApiController
{
    public function index(Request $request, SourceHeartbeatSnapshotService $snapshots)
    {
        $hours = max(1, min(72, (int) $request->query('hours', 48)));

        return $this->ok($snapshots->fetch($hours));
    }
}
