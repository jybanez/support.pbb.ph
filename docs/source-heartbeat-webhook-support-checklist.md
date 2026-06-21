# Source Heartbeat Webhook Support Checklist

Date: 2026-06-22

## Purpose

Prepare PBB Support System to consume Relay-owned source heartbeat webhook events and update the source heartbeat strip through Support Realtime.

This checklist supersedes the scheduler-polling direction for realtime source heartbeat updates. Polling may remain useful as an HTTP fallback, but it should not be the primary live update mechanism.

## Accepted Architecture

Relay owns source heartbeat state.

Support should not poll Relay every minute for live heartbeat updates. Relay should deliver `source.heartbeat.updated` webhook events to Support when heartbeat state changes.

Support owns:

- webhook authentication and idempotency on its receiver endpoint
- local normalization/cache of received heartbeat data
- publishing received updates to `support.sources.heartbeats` through PBB Realtime
- dashboard websocket subscription and heartbeat strip update
- HTTP fallback through `GET /api/source-heartbeats?hours=48`

Relay owns:

- source heartbeat recording
- event emit rules and debounce/noise control
- webhook subscriber configuration
- delivery retry/dead-letter state
- webhook auth token storage and delivery

## Support Endpoint

Add:

```http
POST /api/relay/source-heartbeats
```

This endpoint is machine-to-machine. It should live in the Relay inbound API boundary, not in the browser-auth route group.

## Authentication

Use a dedicated source heartbeat webhook token.

Proposed Support setting key:

```text
sourceHeartbeatWebhookToken
```

Accept either:

```http
Authorization: Bearer <token>
```

or, if Relay standardizes on a custom header:

```http
X-Relay-Webhook-Key: <token>
```

The token must not be returned by `/api/bootstrap` and must not be stored in frontend state.

## Expected Relay Webhook Body

Support should accept this operational webhook shape:

```json
{
  "event_id": "source-heartbeat:072217003:2026-06-22T10:29:55+08:00",
  "event_type": "source.heartbeat.updated",
  "schema_version": 1,
  "occurred_at": "2026-06-22T10:30:00+08:00",
  "source": {
    "hub_id": "13",
    "relay_hub_id": "072217003",
    "name": "Apas, CEBU CITY, CEBU",
    "domain": "apas-cebu-cebu-relay.pbb.ph",
    "deployment": "barangay"
  },
  "heartbeat": {
    "status": "online",
    "last_seen_at": "2026-06-22T10:29:55+08:00",
    "age_seconds": 5,
    "received_count": 123,
    "last_version": "1.1.0",
    "last_credential_version": "1"
  },
  "rollup": {
    "bucket_started_at": "2026-06-22T10:00:00+08:00",
    "bucket_minutes": 60,
    "expected_count": 12,
    "received_count": 11,
    "first_seen_at": "2026-06-22T10:00:10+08:00",
    "last_seen_at": "2026-06-22T10:29:55+08:00"
  }
}
```

## Normalized Support Realtime Payload

After accepting a webhook, Support should publish:

```json
{
  "available": true,
  "sources": [
    {
      "source_hub_id": "13",
      "source_relay_hub_id": "072217003",
      "status": "online",
      "last_seen_at": "2026-06-22T10:29:55+08:00",
      "age_seconds": 5,
      "history": []
    }
  ],
  "published_at": "2026-06-22T10:30:00+08:00"
}
```

Realtime target:

```text
room: support.sources.heartbeats
event_type: support.source_heartbeats.updated
```

## Implementation Checklist

- [ ] Add `sourceHeartbeatWebhookToken` to backend settings defaults.
- [ ] Add Data Prep support for `sourceHeartbeatWebhookToken`.
- [ ] Redact `sourceHeartbeatWebhookToken` from bootstrap/settings responses.
- [ ] Add webhook receiver controller for `POST /api/relay/source-heartbeats`.
- [ ] Validate auth token.
- [ ] Validate `event_type = source.heartbeat.updated`.
- [ ] Validate `event_id` is present.
- [ ] Add idempotency store/cache for `event_id`.
- [ ] Normalize source identity aliases:
  - `source.hub_id`
  - `source.relay_hub_id`
  - `source_hub_id`
  - `source_relay_hub_id`
  - `hub_id`
  - `relay_hub_id`
- [ ] Normalize heartbeat fields for the existing heartbeat strip helper.
- [ ] Publish normalized payload to Support Realtime.
- [ ] Keep `/api/source-heartbeats?hours=48` read-only for initial load/fallback.
- [ ] Remove or avoid scheduled polling for live heartbeat updates.
- [ ] Keep frontend websocket subscription from the realtime heartbeat branch if the implementation is otherwise valid.
- [ ] Add tests for auth failure, invalid event type, duplicate event id, successful publish, and Realtime publish failure tolerance.

## Verification Checklist

- [ ] Focused webhook tests pass.
- [ ] Full PHP suite passes.
- [ ] `cmd /c npm run build` passes.
- [ ] `git diff --check` passes.
- [ ] Browser smoke: source cards render from fallback HTTP fetch.
- [ ] Browser smoke: simulated webhook updates the active source card heartbeat strip over websocket.
- [ ] No secret token appears in `/api/bootstrap` or browser settings state.

## PR #14 Guidance

PR #14 should be revised away from scheduler polling.

Keep if still valid:

- vendored Realtime SDK runtime files
- authenticated browser Realtime admission
- frontend websocket subscription and heartbeat state merge
- Realtime publisher service, if reused by the webhook receiver

Remove or replace:

- `support:source-heartbeats:publish` as the primary live update trigger
- scheduled minute polling as the accepted architecture
- any browser-exposed realtime token signing or webhook secrets
