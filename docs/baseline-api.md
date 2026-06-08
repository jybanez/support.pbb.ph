# Baseline API

All endpoints are session-oriented Laravel browser APIs.

## Public Session Endpoints

- `GET /api/bootstrap`
- `GET /api/csrf-token`
- `POST /api/login`

## Authenticated Endpoints

- `GET /api/user`
- `POST /api/user`
- `POST /api/user/password`
- `GET /api/settings`
- `POST /api/settings`
- `GET /api/sitreps/current`
- `POST /api/logout`
- `GET /api/session/ping`

## Relay Handler Endpoint

- `POST /api/relay/sitreps`

This endpoint is machine-to-machine and does not use the Laravel browser session. It requires:

```text
Authorization: Bearer <Relay handler token>
```

Relay posts handler callbacks with top-level `event`, `message`, and `receipt` keys. Support stores every inbound request. Valid SITREP payloads are normalized and staged latest-by-source-hub. Invalid payloads are retained with validation issues for inspection and investigation.

## Bootstrap Payload

```json
{
  "status": true,
  "data": {
    "app": {
      "name": "PBB Support System",
      "page": "dashboard"
    },
    "auth": {
      "authenticated": true,
      "account": {
        "id": 1,
        "name": "Support Admin",
        "email": "admin@support.pbb.ph",
        "role": "admin"
      }
    },
    "security": {
      "csrfToken": "...",
      "sessionLifetimeMinutes": 15,
      "touched_at": "2026-05-30T14:00:00+08:00"
    },
    "settings": {
      "relayTargetSystem": "sitrep.ingestor",
      "alertLevel": "Normal",
      "consolidationCadenceMinutes": 15,
      "relayUrl": "https://relay.pbb.ph",
      "relayToken": "",
      "relayHandlerToken": "",
      "realtimeUrl": "https://realtime.pbb.ph"
    },
    "hub": {
      "available": true,
      "url": "https://relay.pbb.ph/hub.json",
      "data": {
        "relay_hub_id": "072217029",
        "name": "Guadalupe, CEBU CITY, CEBU",
        "deployment": "barangay",
        "domain": "guadalupe-cebu-cebu.pbb.ph",
        "uplinks": [],
        "sources": []
      }
    }
  },
  "meta": null,
  "error": null
}
```

`GET /api/session/ping` is authenticated and returns the current account, a refreshed CSRF token, and `touched_at` for the activity-aware keepalive loop.

The bootstrap `hub` payload is fetched from Relay `hub.json` with only a short 30-second server cache because uplinks and sources can change as Relay hydrates the local hub snapshot.

## Current SITREP Endpoint

`GET /api/sitreps/current` returns the current consolidated SITREP viewer payload for authenticated users.

```json
{
  "status": true,
  "data": {
    "available": true,
    "sitrep": {
      "id": 1,
      "alert_level": "Normal",
      "computed_source_alert_level": "Critical",
      "source_sitrep_count": 3,
      "consolidated_at": "2026-05-30T15:00:00+08:00"
    },
    "html": "<section class=\"pbb-sitrep-viewer\">...</section>",
    "css": ".pbb-sitrep-viewer { ... }"
  },
  "meta": null,
  "error": null
}
```

`alert_level` is the official local manual alert level. `computed_source_alert_level` is the source-derived signal preserved from consolidation.
