# Relay SITREP Pipeline

## Boundary

Support is not Hotline and does not handle calls or source incident management.

Relay owns transport. Support owns:

- Relay handler authentication.
- Raw inbound storage.
- SITREP validation and latest-by-source-hub staging.
- Scheduled consolidation.
- Current consolidated SITREP rendering.
- Latest-only upstream Relay handoff.

Inbound Relay requests must not consolidate. The inbound handler only authenticates, stores, validates, and stages.

## Vendored SDKs

Support vendors the official PBB SITREP SDKs so it can be installed without Hotline:

```text
packages/pbb-sitrep-consolidator
packages/pbb-sitrep-viewer
```

The app uses:

- `Pbb\Sitreps\Consolidation\SitrepNormalizer`
- `Pbb\Sitreps\Consolidation\SitrepConsolidator`
- `Pbb\Sitreps\Consolidation\Staging\SitrepStagingStore`
- `Pbb\Sitreps\Viewer\SitrepViewer`

Do not point Support Composer autoload to Hotline package paths.

Support consumes the schema v2 SITREP contract documented in
[`docs/sitrep-payload-schema-v2.md`](sitrep-payload-schema-v2.md). Operational
sections such as `summary`, `situation`, `damage`, `population`, `actions`,
`needs`, `gaps`, `source_snapshot`, and `data_quality` may be schema v2 wrapped
as `{ "rollup": {}, "items": [] }`. Support code should use the vendored
Viewer/Consolidator helpers and should not assume operational section fields are
always top-level.

For schema v2 source snapshots, `source_snapshot.rollup.hub_node` identifies
the hub that generated the current SITREP, while
`source_snapshot.rollup.hub_nodes[]` lists the accepted source hubs used for
consolidation. `source_snapshot.items[]` preserves original source snapshots for
audit and drill-down.

## Inbound Flow

Relay client handler target:

```text
sitrep.ingestor
```

Support handler endpoint:

```text
POST https://support.pbb.ph/api/relay/sitreps
Authorization: Bearer <Relay handler token>
```

Expected Relay callback shape:

```json
{
  "event": "relay.message.received",
  "message": {
    "id": 123,
    "relay_id": "01HZ...",
    "source_hub_id": "source-relay-hub",
    "source_system": "sitrep.app",
    "targets": [
      { "id": "local-hub", "systems": ["sitrep.ingestor"] }
    ],
    "message_type": "sitrep.record",
    "payload_format": "json",
    "payload_version": "1.0",
    "payload": {},
    "priority": "normal",
    "occurred_at": "2026-05-30T00:00:00+08:00",
    "received_at": "2026-05-30T00:01:00+08:00"
  },
  "receipt": {
    "id": 456,
    "status": "processed"
  }
}
```

Support stores every inbound message in `relay_inbound_sitreps`.

Valid SITREPs are normalized with the Consolidator SDK and staged in `sitrep_stagings`. Invalid SITREPs are retained with `validation_status=invalid` and `validation_issues` for inspection and investigation.

## Staging Rule

Latest valid SITREP per source hub wins.

The SDK resolves the source PBB HUB HQ `hub_id` from the SITREP payload,
including schema v2 wrapped sections. In schema v2 rollups, source hub
provenance is listed in:

```text
source_snapshot.rollup.hub_nodes[].snapshot.hub_id
```

In legacy flat payloads the identity is:

```text
source_snapshot.hub_node.snapshot.hub_id
```

Support uses the SDK-normalized source hub value as the staging source key. Do
not use `relay_hub_id`, `brgy_code`, or other administrative codes as the
staging identity.

## Consolidation

Command:

```powershell
& 'C:\wamp64\bin\php\php8.2.29\php.exe' artisan support:sitreps:consolidate
```

Schedule:

```text
every 15 minutes
```

The worker:

1. Reads staged latest-by-hub SITREPs.
2. Calls `SitrepConsolidator::consolidate(...)`.
3. Stores a new `consolidated_sitreps` row.
4. Marks previous current consolidated SITREPs as superseded.
5. Queues one pending `sitrep_relay_deliveries` row for the new current SITREP.

## Local Simulation

Use this only for local development when Relay is not yet feeding Support with
live inbound SITREPs. The simulation still uses Support's real normalizer,
staging store, and consolidation service; it does not hand-edit the generated
consolidated SITREP.

Expected sample files:

```text
Z:\tmp\sitreps\cebucity.hub.json
Z:\tmp\sitreps\apas.sitrep.json
Z:\tmp\sitreps\capitol-site.sitrep.json
Z:\tmp\sitreps\guadalupe.sitrep.json
Z:\tmp\sitreps\labangon.sitrep.json
Z:\tmp\sitreps\lahug.sitrep.json
```

The simulated output is written to:

```text
Z:\tmp\sitreps\consolidated.sitrep.json
```

Run from `C:\wamp64\www\pbb\support`:

```powershell
@'
$base = 'Z:/tmp/sitreps';
$hub = json_decode(file_get_contents($base.'/cebucity.hub.json'), true);
if (! is_array($hub)) {
    throw new RuntimeException('Unable to read Cebu City hub JSON.');
}

$files = [
    'apas.sitrep.json',
    'capitol-site.sitrep.json',
    'guadalupe.sitrep.json',
    'labangon.sitrep.json',
    'lahug.sitrep.json',
];

\App\Models\SitrepStaging::query()->delete();
\Illuminate\Support\Facades\Cache::put('relay.hub_identity_for_consolidation', $hub, now()->addSeconds(120));

$normalizer = app(\Pbb\Sitreps\Consolidation\SitrepNormalizer::class);
$store = app(\App\Support\Sitreps\DatabaseSitrepStagingStore::class);
$staged = [];

foreach ($files as $file) {
    $payload = json_decode(file_get_contents($base.'/'.$file), true);
    if (! is_array($payload)) {
        throw new RuntimeException("Unable to read {$file}.");
    }

    $result = $normalizer->normalize($payload);
    if (($result['normalized'] ?? null) === null) {
        $issues = array_map(
            fn ($issue) => method_exists($issue, 'toArray') ? $issue->toArray() : $issue,
            $result['issues'] ?? []
        );
        throw new RuntimeException("Normalizer rejected {$file}: ".json_encode($issues));
    }

    $stage = $store->stage($result['normalized']);
    $staged[] = $stage['source_hub_id'];
}

$consolidated = app(\App\Support\Sitreps\SitrepConsolidationService::class)->consolidate();
file_put_contents(
    $base.'/consolidated.sitrep.json',
    json_encode($consolidated->sitrep_payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
);

echo json_encode([
    'staged' => $staged,
    'consolidated_id' => $consolidated->id,
    'status' => $consolidated->status,
    'source_sitrep_count' => $consolidated->source_sitrep_count,
    'alert_level' => $consolidated->alert_level,
    'computed_source_alert_level' => $consolidated->computed_source_alert_level,
    'output' => $base.'/consolidated.sitrep.json',
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL;
'@ | & 'C:\wamp64\bin\php\php8.2.29\php.exe' artisan tinker
```

This script clears `sitrep_stagings` before staging the supplied files, so do
not use it against a live Support instance with real Relay-fed staging data.

After the command succeeds, the newest `consolidated_sitreps` row becomes the
current dashboard SITREP. Refresh `https://support.pbb.ph/` while logged in as
an admin to inspect the rendered SITREP, source list, boundaries, and SITREP
points.

## Alert Level Policy

Source alert levels are input signals only.

The official local consolidated `alert_level` is manual and comes from Support Settings as directed by local leadership. The worker preserves the SDK/source-derived level as `computed_source_alert_level`.

Example:

```json
{
  "alert_level": "Normal",
  "computed_source_alert_level": "Critical"
}
```

## Current SITREP Rendering

Authenticated dashboard clients call:

```text
GET /api/sitreps/current
```

Support uses `SitrepViewer` to render the current consolidated SITREP HTML and CSS. The dashboard mounts that output in the right pane.

## Upstream Relay Handoff

Support follows Hotline's upstream Relay pattern.

Command:

```powershell
& 'C:\wamp64\bin\php\php8.2.29\php.exe' artisan support:sitreps:relay-latest
```

Schedule:

```text
every 5 minutes
```

Submission endpoint:

```text
POST {relayUrl}/api/v1/messages
X-Relay-Key: <Relay token>
```

Envelope:

```json
{
  "source_system": "sitrep.ingestor",
  "targets": [
    { "id": "UPLINK_HUB_ID", "systems": ["sitrep.ingestor"] }
  ],
  "message_type": "sitrep.record",
  "payload_format": "json",
  "payload_version": "1.0",
  "reference_type": "consolidated_sitrep",
  "reference_id": "1",
  "correlation_id": "support-consolidated-sitrep-1",
  "priority": "normal",
  "attachments_count": 0,
  "occurred_at": "2026-05-30T00:15:00+08:00",
  "payload": {}
}
```

Targets come from the local Relay `hub.json` `uplinks` array. Support only caches `hub.json` briefly because Relay can hydrate changed uplinks and sources over time.

Older pending or failed outbound deliveries are superseded when a newer consolidated SITREP becomes current. Relay carries only the latest Support SITREP state upstream.

## Tables

- `relay_inbound_sitreps`: raw inbound Relay callbacks and validation status.
- `sitrep_stagings`: latest valid normalized SITREP per source hub.
- `consolidated_sitreps`: current/superseded/failed consolidated SITREPs.
- `sitrep_relay_deliveries`: latest-only upstream Relay delivery attempts.
