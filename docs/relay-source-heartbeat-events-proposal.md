# Relay-Driven Source Heartbeat Events for Support

Date: 2026-06-22

## Goal

Remove Support-side polling for source heartbeat changes.

Relay owns source heartbeat state, so Relay should notify Support when a source heartbeat is created, updated, or changes status. Support can then publish the update to its own dashboard Realtime room and refresh heartbeat strips through websocket.

## Current Problem

Support currently discovers heartbeat changes by calling Relay:

```http
GET /api/v1/source-heartbeats?hours=48
```

That endpoint is still useful for initial dashboard load and fallback, but it forces Support to poll Relay if live updates are required. Since Relay already knows exactly when heartbeat state changes, the cleaner architecture is for Relay to emit an event at that point.

## Proposed Flow

1. Source hub sends a heartbeat to Relay.
2. Relay records or updates the source heartbeat.
3. Relay emits a heartbeat update event to subscribed target systems.
4. Support receives the event through a Relay-authenticated endpoint.
5. Support publishes `support.source_heartbeats.updated` to its Realtime room.
6. Browser clients update heartbeat strips over websocket.

Support should keep the existing HTTP heartbeat fetch as initial load and fallback. Realtime should improve live behavior without becoming the only way to render heartbeat state.

## Relay Message

Recommended message type:

```text
source.heartbeat.updated
```

Recommended source system:

```text
relay.core
```

Alternative source system:

```text
relay.monitor
```

Recommended target system:

```text
sitrep.ingestor
```

Rationale: source heartbeat health belongs to SITREP/source ingestion context, not Support Request dispatch.

## Suggested Envelope

```json
{
  "message_type": "source.heartbeat.updated",
  "priority": "normal",
  "source_system": "relay.core",
  "source_hub_id": "relay",
  "targets": [
    {
      "id": "11",
      "systems": ["sitrep.ingestor"]
    }
  ],
  "payload": {
    "schema_version": 1,
    "event_id": "hb_01...",
    "changed_at": "2026-06-22T10:30:00+08:00",
    "source": {
      "hub_id": "13",
      "relay_hub_id": "072217029",
      "hub_name": "Barangay Apas",
      "domain": "apas-relay.pbb.ph"
    },
    "heartbeat": {
      "status": "online",
      "last_seen_at": "2026-06-22T10:29:55+08:00",
      "age_seconds": 5,
      "history": []
    }
  }
}
```

## Support Receiver

Support can add a Relay-authenticated endpoint such as:

```http
POST /api/relay/source-heartbeats
```

Authentication should use the existing inbound Relay handler token model. It should not use Support's outbound Relay client tokens.

Receiver behavior:

- Validate Relay handler authentication.
- Validate `message_type = source.heartbeat.updated`.
- Validate target system includes `sitrep.ingestor`.
- Normalize source identity using the existing source matching aliases:
  - `hub_id`
  - `source_hub_id`
  - `relay_hub_id`
  - `source_relay_hub_id`
- Treat duplicate `payload.event_id` as idempotent.
- Publish the normalized heartbeat update to Support Realtime.

## Support Realtime Event

Support should publish into:

```text
room: support.sources.heartbeats
event_type: support.source_heartbeats.updated
```

Suggested payload:

```json
{
  "available": true,
  "sources": [
    {
      "source_hub_id": "13",
      "source_relay_hub_id": "072217029",
      "status": "online",
      "last_seen_at": "2026-06-22T10:29:55+08:00",
      "age_seconds": 5,
      "history": []
    }
  ],
  "published_at": "2026-06-22T10:30:00+08:00"
}
```

## Idempotency And Noise Control

Relay should include a stable `payload.event_id`.

Support should persist or cache received event IDs long enough to ignore duplicate deliveries.

Relay may debounce high-frequency heartbeat updates if needed. Recommended meaningful emit triggers:

- `last_seen_at` changed
- `status` changed
- online, stale, offline transition changed
- heartbeat history bucket changed
- source identity or health metadata changed

## Fallback

Support should retain:

```http
GET /api/source-heartbeats?hours=48
```

This remains the initial load and fallback path for dashboards that load after events already occurred or when websocket delivery is unavailable.

## Open Question For Relay

Can Relay emit `source.heartbeat.updated` as a routed message to Support targets using the same handler/token model as SITREP delivery?

If yes, Support can remove the scheduled heartbeat polling approach and implement an event receiver instead.
