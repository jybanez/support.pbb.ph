<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ExpireDomainScopedSupportCookies
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);

        $host = $request->getHost();

        if ($host !== 'support.pbb.ph') {
            return $response;
        }

        foreach (['pbb_maestro_session', 'pbb-support-system-session', 'XSRF-TOKEN'] as $name) {
            foreach ([null, 'support.pbb.ph', '.support.pbb.ph'] as $domain) {
                if ($domain === null && $name !== 'pbb_maestro_session') {
                    continue;
                }

                $response->headers->clearCookie($name, '/', $domain, true, $name !== 'XSRF-TOKEN', 'lax');
            }
        }

        return $response;
    }
}
