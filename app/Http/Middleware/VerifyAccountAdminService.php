<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerifyAccountAdminService
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! (bool) config('account.admin_api_enabled', false)) {
            return $this->fail('account_admin_disabled', 'Account admin API is disabled.', 503);
        }

        $configuredToken = trim((string) config('account.admin_api_token'));
        $providedToken = trim((string) $request->bearerToken());
        $client = trim((string) $request->header('X-PBB-Account-Client'));

        if ($configuredToken === '' || $providedToken === '' || ! hash_equals($configuredToken, $providedToken)) {
            return $this->fail('invalid_app_admin_token', 'The app-admin token is missing or invalid.', 401);
        }

        if ($client !== 'pbb-account') {
            return $this->fail('invalid_account_client', 'The Account client header is missing or invalid.', 401);
        }

        return $next($request);
    }

    private function fail(string $code, string $message, int $status): Response
    {
        return response()->json([
            'message' => $message,
            'error' => [
                'code' => $code,
            ],
        ], $status, [
            'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma' => 'no-cache',
        ]);
    }
}
