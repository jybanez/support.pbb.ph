<?php

namespace App\Http\Controllers\Api;

use App\Support\Realtime\SupportRealtimeAdmissionService;
use Illuminate\Http\Request;
use RuntimeException;

class RealtimeAdmissionController extends BaseApiController
{
    public function sourceHeartbeats(Request $request, SupportRealtimeAdmissionService $admissions)
    {
        try {
            return $this->ok([
                'admission' => $admissions->forSourceHeartbeats($request->user()),
            ]);
        } catch (RuntimeException $exception) {
            return response()->json([
                'status' => false,
                'message' => $exception->getMessage(),
            ], 422);
        }
    }
}
