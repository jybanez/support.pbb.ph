<?php

namespace App\Services\Account;

use Illuminate\Session\Store;
use Pbb\AccountSdk\AccountStateStoreInterface;

class LaravelAccountStateStore implements AccountStateStoreInterface
{
    public function __construct(
        private readonly Store $session,
    ) {}

    public function put(string $key, string $value): void
    {
        $this->session->put($key, $value);
    }

    public function pull(string $key): ?string
    {
        $value = $this->session->pull($key);

        return is_string($value) ? $value : null;
    }
}
