<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class BaseApiController extends Controller
{
    protected function ok(mixed $data = null, mixed $meta = null, int $statusCode = 200, array $headers = []): JsonResponse
    {
        return response()->json([
            'status' => true,
            'data' => $data,
            'meta' => $meta,
            'error' => null,
        ], $statusCode, $headers);
    }

    protected function fail(string $error, int $statusCode = 400, mixed $data = null, mixed $meta = null): JsonResponse
    {
        return response()->json([
            'status' => false,
            'data' => $data,
            'meta' => $meta,
            'error' => $error,
        ], $statusCode);
    }
}
