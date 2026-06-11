# Support Strategy Phase 1 Implementation Brief

## Status: Paused / Superseded

Date: 2026-06-10

Do not use this brief for new implementation work unless the user explicitly reactivates the inferred Support Strategy direction.

This brief captured an earlier approach: deriving a Support Strategy column directly from the current consolidated SITREP. That approach is now paused because a SITREP is situational visibility, not necessarily an explicit request for outside support.

Current product direction is documented in `docs/support-request-workflow-direction.md`.

Key decision:

- Support should not infer deployment priorities from SITREP needs/gaps alone.
- Barangays may already be working on the reported needs.
- Outside assistance should be triggered by an explicit command/barangay support request.
- Hotline is the likely owner of a `Request Support` action.
- Support should use SITREP evidence as routing, staging, validation, and provenance context after a request exists.

The branch `sitrep/support-strategy-phase-1` should remain available as a technical experiment only. Do not merge it as the target product workflow without a new product decision.

---

## Purpose

Implement the first version of the Support Strategy column for the PBB Support System.

This is a scoped engineering handoff for a coding agent. The product rationale is in `docs/PBB_Support_Strategy_Column_Improvement_Proposal.md`; this brief defines the implementation boundary, API contract, data rules, test expectations, and review checklist.

## Current Architecture

The dashboard currently renders:

```text
[ SITREP Evidence ] [ Map ] [ Source Hubs ]
```

Current implementation shape:

- `resources/js/app.js` owns dashboard composition, SITREP tab rendering, source rail rendering, and map sync.
- `resources/css/app.css` owns dashboard layout and command-center styling.
- `GET /api/sitreps/current` is served by `App\Http\Controllers\Api\CurrentSitrepController`.
- `GET /api/sitreps/current` returns SITREP metadata, rendered compact section HTML, source hub records, map points, context boundary, and viewer CSS.
- The full consolidated SITREP payload is stored server-side in `ConsolidatedSitrep::sitrep_payload`.

Do not derive support strategy from rendered HTML. Strategy must be derived from the structured consolidated SITREP payload on the backend.

## Phase 1 Scope

Deliver:

- Add a separate endpoint: `GET /api/sitreps/current/support`.
- Build a backend-derived `support_strategy` object from the current consolidated SITREP payload.
- Add a Support Strategy column between the SITREP Evidence panel and the map.
- Render six strategy tabs:
  - `Priorities`
  - `Packages`
  - `Decisions`
  - `Matching`
  - `Clarifications`
  - `Commitments`
- Render strategy cards with evidence-backed reasons.
- Add independent loading, empty, and error states for the strategy column.
- Add basic source/priority click synchronization with existing source boundary/map hooks where available.
- Preserve the current SITREP, map, and source rail behavior.

Out of scope:

- No Relay sends.
- No downstream clarification delivery.
- No real support commitment dispatch.
- No persistent resource inventory.
- No auto-dispatch or automatic resource commitment.
- No modification of original SITREP evidence.
- No dependency on the in-progress Hotline JS SITREP Viewer SDK until Beta publishes a committed contract.

## API Contract

Add this route under authenticated API routes:

```text
GET /api/sitreps/current/support
```

Recommended response when current SITREP exists:

```json
{
  "available": true,
  "sitrep_id": 12,
  "generated_at": "2026-06-09T02:30:00+08:00",
  "source_generated_at": "2026-06-07T09:05:48+08:00",
  "coverage_area": "CEBU CITY, CEBU",
  "coverage_level": "city",
  "strategy": {
    "priorities": [],
    "packages": [],
    "decisions": [],
    "matching": [],
    "clarifications": [],
    "commitments": []
  }
}
```

Recommended response when no current SITREP exists:

```json
{
  "available": false,
  "sitrep_id": null,
  "generated_at": null,
  "source_generated_at": null,
  "coverage_area": null,
  "coverage_level": null,
  "strategy": null
}
```

If strategy derivation fails, return an API error for this endpoint only. The dashboard must keep `/api/sitreps/current` loading independently.

## Backend Implementation

Recommended files:

```text
app/Http/Controllers/Api/CurrentSitrepSupportController.php
app/Support/Sitreps/SupportStrategyBuilder.php
routes/api.php
tests/Feature/SitrepSupportStrategyTest.php
```

`SupportStrategyBuilder` should accept the consolidated SITREP payload and the `ConsolidatedSitrep` model metadata. Keep it pure and testable:

```php
public function build(array $payload, ConsolidatedSitrep $current): array
```

The builder should return:

```php
[
    'priorities' => [],
    'packages' => [],
    'decisions' => [],
    'matching' => [],
    'clarifications' => [],
    'commitments' => [],
]
```

Use Laravel `data_get()` for nested SITREP paths. Do not assume every section exists.

## Strategy Data Rules

### General

- Every generated recommendation must include `evidence_refs` or `based_on`.
- Never claim resource availability unless an availability data source exists.
- Requested resources are demand signals, not confirmed supply.
- Population counts are planning signals and may overlap.
- Route/access reports require verification before public routing guidance.
- Recommendations are advisory and require leadership approval.

### Priorities

Generate source-hub or location priority cards from available signals:

- source alert level
- people at risk
- open reports
- active/deferred reports
- current assignments
- requested resource units
- blocked/limited route indicators
- dominant incident/concern type
- source SITREP freshness or heartbeat status if available in current response data

Recommended object shape:

```json
{
  "id": "priority-apas",
  "rank": 1,
  "source_hub_id": "13",
  "source_relay_hub_id": "11",
  "source_hub_name": "Apas, Cebu City, Cebu",
  "priority_level": "critical",
  "title": "Critical support review",
  "summary": "Rescue/access support should be reviewed first.",
  "based_on": [
    "Critical alert level",
    "20 people at risk",
    "58 requested resource units"
  ],
  "recommended_next_steps": [
    "Prepare rescue augmentation",
    "Verify route passability",
    "Check engineering support availability"
  ],
  "evidence_refs": [
    "summary.items[Apas].gap_cards",
    "needs.rollup.category_demand"
  ]
}
```

Keep scoring simple and deterministic in Phase 1. If a value is missing, skip that factor rather than inventing it.

### Packages

Generate package cards from concern groups and needs categories.

Examples:

- Flood, Rescue, and Displacement -> Rescue / Evacuation Support
- Infrastructure, Access, and Utilities -> Engineering / Access Clearing
- Fire and Shelter Damage -> Fire / Shelter Support
- Public Safety and Protection -> Public Safety Support
- Other Current Concerns -> Mixed Emergency Support

### Decisions

Generate pending leadership decision cards only when the SITREP contains enough basis. Suggested examples:

- Approve rescue augmentation for a critical/high priority source.
- Escalate heavy equipment gap when requested heavy equipment demand exists.
- Verify route/access constraints before public routing guidance.

Cards must remain draft/advisory in Phase 1.

### Matching

Render requested demand categories. Since no resource registry exists yet, availability must be:

```text
availability unknown
```

Do not show invented available counts.

### Clarifications

Generate clarification cards from confidence gaps, route/access constraints, population overlap warnings, resource supply uncertainty, stale heartbeat/freshness conditions, and missing verification notes.

### Commitments

In Phase 1, commitments should be empty or local draft examples only when derived from a user action. Do not generate operational commitments as if they were approved.

Default empty state should say that no support commitments have been drafted yet.

## Frontend Implementation

Recommended files:

```text
resources/js/app.js
resources/js/supportStrategy.js
resources/css/app.css
```

It is acceptable to start inside `resources/js/app.js` if that better matches current project structure, but keep strategy derivation/render helpers clearly separated. If the implementation grows, extract to `resources/js/supportStrategy.js`.

State additions:

```js
supportStrategy: {
  loading: false,
  available: false,
  error: null,
  activeTab: 'priorities',
  data: null,
}
```

Load behavior:

- `loadCurrentSitrep()` should continue to call `/api/sitreps/current`.
- Strategy should load independently from `/api/sitreps/current/support`.
- Strategy loading failure must not clear or break the current SITREP, map, or source list.
- Render a Helper skeleton in the Strategy column while loading.

Layout:

Target command-center layout for a 1920px display:

```text
SITREP Evidence:   about 480px
Support Strategy:  about 420px
Map:               flexible remaining width
Source Hubs:       360px fixed
```

The current dashboard uses a splitter for SITREP + map and a fixed source rail. Update the central layout carefully so map resize still fires after splitter/layout changes.

Suggested initial approach:

- Keep source rail fixed at current width.
- Create a nested or expanded splitter region for SITREP, Strategy, and Map.
- Ensure `dashboardMap.resize()` is called after splitter changes.
- Avoid mobile work unless required for basic non-breakage; Support is large-screen-first.

Strategy panel UI:

- Header: `Support Strategy`
- Subheader/meta: generated time or source SITREP time when available.
- Tabs: priorities, packages, decisions, matching, clarifications, commitments.
- Cards should be compact, scannable, and command-center styled.
- Use existing color/tone patterns from source cards and alert badges.
- Every card should include a visible `Based on` or equivalent evidence section.

Actions:

Phase 1 actions are local UI affordances only. Acceptable actions:

- `View Evidence`
- `View on Map`
- `Mark Reviewed` local state only

Avoid functional buttons that imply Relay delivery:

- Do not implement `Send Downstream`.
- Do not implement `Commit Resource`.
- Do not implement `Dispatch`.

## Source and Map Synchronization

Implement basic sync using existing Support map/source hooks:

- Clicking a priority card with `source_hub_id` should fit/highlight that source boundary if available.
- Clicking `View on Map` should call existing map fit/highlight behavior.
- Do not block Phase 1 on deep SITREP evidence scrolling.

Future sync with the Hotline JS SITREP Viewer SDK should wait for Beta to publish stable browser-side evidence APIs.

## Tests

Backend feature tests should cover:

- Unauthenticated users cannot access `/api/sitreps/current/support`.
- Authenticated request with no current SITREP returns `available=false`.
- Authenticated request with sparse current SITREP returns all six strategy arrays and does not error.
- Authenticated request with sample-like SITREP produces at least one priority, one package or decision when corresponding source data exists.
- Matching reports availability as unknown when no resource registry exists.
- Recommendations include `based_on` or `evidence_refs`.

Frontend verification should include:

- `npm run build`
- Existing PHP suite with PHP 8.2 binary:

```powershell
& 'C:\wamp64\bin\php\php8.2.29\php.exe' artisan test
```

If practical, add a small browser/manual smoke check:

- Dashboard loads.
- SITREP column loads even if strategy endpoint fails.
- Strategy skeleton appears while loading.
- Strategy tabs switch.
- Source rail remains usable.
- Map still resizes and displays markers/boundaries.

## Acceptance Checklist

### API

- [ ] `GET /api/sitreps/current/support` exists under authenticated API routes.
- [ ] Endpoint does not modify database state.
- [ ] Endpoint returns `available=false` when no current SITREP exists.
- [ ] Endpoint returns six strategy arrays when current SITREP exists.
- [ ] Endpoint failure is isolated from `/api/sitreps/current`.

### Strategy Builder

- [ ] Builder derives from structured SITREP payload, not HTML.
- [ ] Builder tolerates missing sections and sparse payloads.
- [ ] Priorities are deterministic and ranked.
- [ ] Matching never invents available resource counts.
- [ ] Commitments are empty or clearly draft-only in Phase 1.
- [ ] Every recommendation has evidence references or visible basis.

### UI

- [ ] Strategy column appears between SITREP and map.
- [ ] SITREP tabs still work.
- [ ] Map still works and resizes.
- [ ] Source hub list still works.
- [ ] Strategy has loading, empty, error, and loaded states.
- [ ] Strategy tabs render: Priorities, Packages, Decisions, Matching, Clarifications, Commitments.
- [ ] Cards are compact and do not overflow the 420px column.
- [ ] Large-screen layout remains usable at 1920px width.

### Sync

- [ ] Priority/source card `View on Map` highlights or fits source boundary when available.
- [ ] Missing boundary does not throw.
- [ ] Strategy interactions do not break existing source hover/select behavior.

### Verification

- [ ] `npm run build` passes.
- [ ] Full PHP test suite passes with PHP 8.2.29.
- [ ] New backend tests cover the support strategy endpoint.

## Reviewer Notes

The reviewer should reject implementations that:

- Parse strategy out of rendered SITREP HTML.
- Add strategy generation into `/api/sitreps/current` in a way that makes SITREP loading depend on strategy generation.
- Auto-dispatch or imply approved support commitments.
- Invent resource availability.
- Hide evidence/provenance from recommendation cards.
- Regress map resize, SITREP tabs, or source rail behavior.
- Depend on uncommitted Hotline JS SDK files.

## Suggested Agent Instruction

Give the implementation agent this instruction:

```text
Implement Phase 1 only from docs/support-strategy-phase-1-implementation-brief.md. Keep /api/sitreps/current independent and add /api/sitreps/current/support for backend-derived support strategy. Do not implement Relay sends, resource registry persistence, or committed dispatch workflows. Add focused tests and run npm build plus the full PHP 8.2 test suite. Preserve existing SITREP, map, and source rail behavior.
```
