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

        foreach (['pbb_maestro_session'] as $name) {
            foreach ([null, 'support.pbb.ph', '.support.pbb.ph'] as $domain) {
                $response->headers->clearCookie($name, '/', $domain, true, $name !== 'XSRF-TOKEN', 'lax');
            }
        }

        return $response;
    }
}
