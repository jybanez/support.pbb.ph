<?php

namespace App\Http\Controllers\Web;

use App\Support\Maps\MapServerUrls;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

class SupportMapBoundaryController
{
    public function show(string $scope, string $code): JsonResponse
    {
        $scope = strtolower(trim($scope));
        $code = trim($code);

        if (! in_array($scope, ['barangay', 'city', 'province', 'region'], true) || $code === '') {
            return response()->json(['error' => 'Invalid boundary reference.'], Response::HTTP_NOT_FOUND);
        }

        $url = MapServerUrls::boundaryUrl($scope, $code);

        try {
            $response = Http::acceptJson()
                ->connectTimeout(3)
                ->timeout(10)
                ->get($url);
        } catch (\Throwable) {
            try {
                $response = Http::acceptJson()
                    ->withoutVerifying()
                    ->connectTimeout(3)
                    ->timeout(10)
                    ->get($url);
            } catch (\Throwable) {
                return response()->json(['error' => 'Boundary is unavailable.'], Response::HTTP_NOT_FOUND);
            }
        }

        if (! $response->successful()) {
            return response()->json(['error' => 'Boundary was not found.'], Response::HTTP_NOT_FOUND);
        }

        $geojson = $response->json();

        if (! is_array($geojson) || ($geojson['type'] ?? null) !== 'FeatureCollection') {
            return response()->json(['error' => 'Boundary payload is invalid.'], Response::HTTP_NOT_FOUND);
        }

        return response()
            ->json($geojson)
            ->header('Cache-Control', 'public, max-age=300');
    }

}
