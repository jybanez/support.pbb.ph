<?php

return [
    'enabled' => filter_var(env('PBB_ACCOUNT_SSO_ENABLED', false), FILTER_VALIDATE_BOOLEAN),
    'base_url' => env('PBB_ACCOUNT_BASE_URL', 'https://account.pbb.ph'),
    'client_id' => env('PBB_ACCOUNT_CLIENT_ID', 'pbb-support'),
    'client_secret' => env('PBB_ACCOUNT_CLIENT_SECRET', ''),
    'redirect_uri' => env('PBB_ACCOUNT_REDIRECT_URI', 'https://support.pbb.ph/auth/account/callback'),
    'post_logout_redirect_uri' => env('PBB_ACCOUNT_POST_LOGOUT_REDIRECT_URI', 'https://support.pbb.ph'),
    'scopes' => array_values(array_filter(preg_split('/\s+/', trim((string) env('PBB_ACCOUNT_SCOPES', 'openid profile'))) ?: [])),
    'timeout_seconds' => (int) env('PBB_ACCOUNT_TIMEOUT_SECONDS', 10),
    'ca_bundle' => env('PBB_ACCOUNT_CA_BUNDLE'),
];
