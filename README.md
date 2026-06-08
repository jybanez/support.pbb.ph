# PBB Support System

Installable Laravel-based PBB support app for receiving Relay SITREPs, staging the latest valid report per source hub, consolidating reports, showing the current consolidated SITREP, relaying the latest consolidated report upstream, and supporting deployment composition back to source areas.

The current milestone includes the app shell plus the first Relay/SITREP pipeline slice: inbound Relay handler, latest-by-hub staging, scheduled consolidation, current SITREP rendering, and latest-only upstream Relay handoff.

## Current Foundation

- Laravel 12 app scaffold
- Session-authenticated admin shell
- Login, logout, bootstrap, current-user, password, CSRF, and keepalive APIs
- Vendored helper runtime entry point
- `release.json` skeleton
- Map/current-SITREP dashboard shell
- Relay SITREP inbound handler
- Latest-by-source-hub SITREP staging
- Scheduled SITREP consolidation
- Current consolidated SITREP rendering through the vendored viewer SDK
- Latest-only outbound Relay handoff foundation
- Environment/setup documentation

## Docs

- [Environment Setup](docs/environment-setup.md)
- [Baseline API](docs/baseline-api.md)
- [Helper Integration](docs/helper-integration.md)
- [Relay SITREP Pipeline](docs/relay-sitrep-pipeline.md)

## Vendored SDKs

Support vendors the official PBB SITREP SDKs under `packages/` so it can be installed on hubs where Hotline is not present:

- `packages/pbb-sitrep-consolidator`
- `packages/pbb-sitrep-viewer`

Composer autoload maps the SDK namespaces from those local vendored copies.

## Default Local Login

- Email: `admin@support.pbb.ph`
- Password: `password`

Change the default password before any shared deployment.
