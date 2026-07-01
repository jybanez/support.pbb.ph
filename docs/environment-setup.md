# PBB Support System Environment Setup

## Runtime

- PHP 8.2 or newer is required. On this WAMP workstation, use `C:\wamp64\bin\php\php8.2.29\php.exe`.
- Node.js 22 or newer is expected for the Vite build.
- The assigned local database is MySQL on `127.0.0.1`, database `pbb_support`, username `root`, blank password.
- The assigned project domain is `https://support.pbb.ph/`.

## First Install

```powershell
& 'C:\wamp64\bin\php\php8.2.29\php.exe' 'C:\ProgramData\ComposerSetup\bin\composer.phar' install
Copy-Item .env.example .env
& 'C:\wamp64\bin\php\php8.2.29\php.exe' artisan key:generate
& 'C:\wamp64\bin\php\php8.2.29\php.exe' artisan migrate --seed
npm install
npm run build
```

## Local Admin Account

The baseline seeder creates:

- Email: `admin@support.pbb.ph`
- Password: `password`
- Role: `admin`

Change this password before any shared or public deployment.

## Local Development

```powershell
& 'C:\wamp64\bin\php\php8.2.29\php.exe' artisan serve --host=127.0.0.1 --port=8010
npm run dev
```

Open `https://support.pbb.ph/` when the WAMP virtual host is enabled. The direct Laravel development server remains available at `http://127.0.0.1:8010`.

Because `.env` sets `SESSION_DOMAIN=support.pbb.ph`, browser login should be verified through `https://support.pbb.ph/`. Direct `127.0.0.1` checks are useful for server reachability, but the browser will not retain the Laravel session cookie for that host while the production-style session domain is active.

## Relay and SITREP Operations

Support has two Relay identities. See
[`docs/relay-identities-and-tokens.md`](relay-identities-and-tokens.md) for the
canonical identity and token contract.

Support receives SITREPs through the local Relay handler endpoint:

```text
https://support.pbb.ph/api/relay/sitreps
```

Configure a Relay client handler for target system `sitrep.ingestor` with:

- Name: `PBB Support SITREP Ingestor`
- Endpoint URL: `https://support.pbb.ph/api/relay/sitreps`
- Message Type Pattern: `sitrep.*` or `sitrep.record`
- Auth Token: a dedicated Support Relay handler token
- Active: checked

Handler tokens are machine-to-machine secrets used by Relay when posting into
Support endpoints. Operator-visible Support Relay settings should describe
outbound client tokens only: Relay URL, SITREP Relay Client Token, and Support
Request Relay Client Token.

Useful commands:

```powershell
& 'C:\wamp64\bin\php\php8.2.29\php.exe' artisan support:sitreps:consolidate
& 'C:\wamp64\bin\php\php8.2.29\php.exe' artisan support:sitreps:relay-latest
```

Scheduled tasks:

- `support:sitreps:consolidate` every 15 minutes.
- `support:sitreps:relay-latest` every 5 minutes for pending/failed latest outbound delivery.

The Laravel scheduler must be running in production for cadence-based consolidation and retry.

## PBB Account Integration

Support uses PBB Account for browser SSO and exposes a service-only app-admin
API so Account can manage Support-local user links and roles without writing
directly to the Support database.

Browser SSO is configured through environment values:

```text
PBB_ACCOUNT_SSO_ENABLED=true
PBB_ACCOUNT_BASE_URL=https://account.pbb.ph
PBB_ACCOUNT_CLIENT_ID=pbb-support
PBB_ACCOUNT_CLIENT_SECRET=<support Account OAuth client secret>
PBB_ACCOUNT_REDIRECT_URI=https://support.pbb.ph/auth/account/callback
PBB_ACCOUNT_POST_LOGOUT_REDIRECT_URI=https://support.pbb.ph
PBB_ACCOUNT_SCOPES="openid profile"
PBB_ACCOUNT_TIMEOUT_SECONDS=10
```

The app-admin API is server-to-server only:

```text
GET   /api/account-admin/meta
GET   /api/account-admin/users/{pbb_user_id}
PUT   /api/account-admin/users/{pbb_user_id}
DELETE /api/account-admin/users/{pbb_user_id}
PATCH /api/account-admin/users/{pbb_user_id}/role
PATCH /api/account-admin/users/{pbb_user_id}/status
```

It requires:

```text
Authorization: Bearer <accountAdminApiToken>
X-PBB-Account-Client: pbb-account
```

Support role vocabulary for Account is `admin`, `command`, and `operator`.
Support v1 exposes only the local app status `active`; `blocked` and
`suspended` are intentionally rejected until Support has local status fields.
Remove Access unlinks `users.pbb_user_id` and preserves the local Support user
record. The operation writes an `account_admin_audit_events` row and is
idempotent when the Account identity is already unlinked.

Readiness handoffs must distinguish package state from runtime state:

```text
code-ready:
  endpoints, middleware, config, and tests exist.
  accountAdminApiEnabled remains false by default.
  accountAdminApiToken remains empty by default.

runtime-ready:
  accountAdminApiEnabled=true in Support settings.
  accountAdminApiToken=<dedicated app-admin token> in Support settings.
  accountAdminApiClient=pbb-account in Support settings.
  Account trusted client pbb-support has the same token, base URL, and
  app_admin_enabled=true.
  GET https://support.pbb.ph/api/account-admin/meta is callable from Account.
```

Do not reuse `PBB_ACCOUNT_CLIENT_SECRET` as `accountAdminApiToken`.
The OAuth client secret is for Support-to-Account OAuth token exchange; the
app-admin token is for Account-to-Support privileged role/user orchestration.
Support stores app-admin runtime credentials in encrypted app-local DB settings,
not request-time `.env`, to prevent shared WAMP/Apache/PHP env bleed across PBB
apps.

Kit/Data Prep may supply Account values using:

```text
support.data_prep.apply_settings.account.base_url
support.data_prep.apply_settings.account.client_id
support.data_prep.apply_settings.account.client_secret
support.data_prep.apply_settings.account.redirect_uri
support.data_prep.apply_settings.account.post_logout_redirect_uri
support.data_prep.apply_settings.account.scopes
support.data_prep.apply_settings.account.timeout_seconds
support.data_prep.apply_settings.account.ca_bundle
support.data_prep.apply_settings.account.sso_enabled
support.data_prep.apply_settings.account.admin_api_enabled
support.data_prep.apply_settings.account.admin_api_token
```

Supported shared secret aliases are:

```text
shared.secrets.values.support_account_client_secret
shared.secrets.values.support_account_admin_api_token
```

## Vendored SITREP SDKs

Support vendors the PBB SITREP SDKs locally:

```text
packages/pbb-sitrep-consolidator
packages/pbb-sitrep-viewer
```

Do not point Composer autoload at Hotline package paths. Hotline may not be installed on the same hub.

## Current Scope

The foundation includes the installable Laravel structure, session-authenticated admin shell, bootstrap/session/user APIs, helper integration, public hub identity page, map/current-SITREP dashboard shell, inbound Relay SITREP handler, latest-by-hub staging, scheduled consolidation, viewer SDK rendering, outbound latest-only Relay handoff, `release.json`, and setup docs.
