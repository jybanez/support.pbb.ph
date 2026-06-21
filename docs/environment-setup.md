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

## Vendored SITREP SDKs

Support vendors the PBB SITREP SDKs locally:

```text
packages/pbb-sitrep-consolidator
packages/pbb-sitrep-viewer
```

Do not point Composer autoload at Hotline package paths. Hotline may not be installed on the same hub.

## Current Scope

The foundation includes the installable Laravel structure, session-authenticated admin shell, bootstrap/session/user APIs, helper integration, public hub identity page, map/current-SITREP dashboard shell, inbound Relay SITREP handler, latest-by-hub staging, scheduled consolidation, viewer SDK rendering, outbound latest-only Relay handoff, `release.json`, and setup docs.
