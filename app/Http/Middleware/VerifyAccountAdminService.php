<?php

namespace App\Http\Middleware;

use Closure;
use App\Support\Settings\SupportSettings;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerifyAccountAdminService
{
    public function handle(Request $request, Closure $next): Response
    {
        $settings = app(SupportSettings::class)->all();
        $configuredEnabled = filter_var($settings['accountAdminApiEnabled'] ?? false, FILTER_VALIDATE_BOOLEAN);

        if (! $configuredEnabled) {
            return $this->fail('account_admin_disabled', 'Account admin API is disabled.', 503);
        }

        $configuredToken = trim((string) ($settings['accountAdminApiToken'] ?? ''));
        $providedToken = trim((string) $request->bearerToken());
        $configuredClient = trim((string) ($settings['accountAdminApiClient'] ?? ''));
        $client = trim((string) $request->header('X-PBB-Account-Client'));

        if ($configuredToken === '' || $providedToken === '' || ! hash_equals($configuredToken, $providedToken)) {
            return $this->fail('invalid_app_admin_token', 'The app-admin token is missing or invalid.', 401);
        }

        if ($configuredClient === '' || $client !== $configuredClient) {
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
