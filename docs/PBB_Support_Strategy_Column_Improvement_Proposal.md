# PBB Support System Improvement Proposal

## Status: Paused / Superseded By Explicit Support Request Workflow

Date: 2026-06-10

This proposal is retained for historical context and reusable UI/technical ideas, but it is no longer the current implementation direction.

The proposal assumes the Support System can derive actionable support strategy directly from consolidated SITREP needs, gaps, and operational signals. Product review found that this is too aggressive:

- A SITREP is situational visibility, not automatically a request for outside assistance.
- Barangays may already be addressing the reported needs and gaps.
- Acting on inferred needs can duplicate deployed local resources.
- Support should become operational only when barangay or command leadership explicitly requests assistance.
- SITREP access and logistics data should support routing/staging after a request exists, not automatically trigger deployment recommendations.

Current direction is documented in:

```text
docs/support-request-workflow-direction.md
```

Preferred flow:

```text
Barangay SITREP -> Hotline command review -> explicit Request Support action -> Relay -> Support
```

Do not continue implementing or polishing an inferred Support Strategy column unless the user explicitly reopens this direction.

---

## Proposal Title

**Add a Support Strategy Column to the PBB Support System**

## Assigned Codex Agent

**Support**

## Purpose

This proposal defines an improvement to the current **PBB Support System** interface and workflow. The goal is to evolve the system from a consolidated SITREP visibility dashboard into a proactive leadership support tool that helps city/municipality and province leadership interpret downstream SITREPs, identify priority support needs, and coordinate actual assistance back to downstream nodes.

The proposed improvement is to add a new **Support Strategy** column between the existing SITREP panel and the map.

Current high-level layout:

```text
[ SITREP Panel ] [ Map ] [ Source Hubs ]
```

Proposed high-level layout:

```text
[ SITREP Evidence ] [ Support Strategy ] [ Map ] [ Source Hubs ]
```

This allows leadership and operators to view the reported SITREP evidence and the system-generated support strategy side by side.

---

## Background

The current Support System displays consolidated SITREP sections as tabs:

```text
Summary · Situation · Damage · Population · Actions · Needs · Gaps
```

These tabs provide a strong evidence layer. They answer:

> What is being reported?

However, city/municipality and province leadership also need a decision-support layer that answers:

> What should we do about it?

The uploaded generated SITREP and compact HTML already contain enough structured information to support this:

- Source barangays / source hubs
- Alert levels
- People at risk
- Open active/deferred reports
- Active reports
- Deferred reports
- Current assignments
- Requested resource units
- Concern groups
- Resource needs
- Team deployment states
- Assignment timing
- Data confidence gaps
- Route/access constraints
- Resource supply uncertainty
- Population verification warnings

The proposed Support Strategy column should convert this information into actionable support priorities, support packages, pending decisions, resource matching, clarification requests, and support commitments.

---

## Design Principle

The SITREP panel should remain the **evidence layer**.

The Support Strategy panel should become the **action layer**.

The map should remain the **geospatial validation layer**.

The source hub list should remain the **source/provenance layer**.

```text
SITREP Evidence  →  What was reported?
Support Strategy →  What should leadership do next?
Map              →  Where is it happening?
Source Hubs      →  Which downstream nodes reported it?
```

This separation is important because leadership should be able to trace every recommendation back to the original SITREP evidence.

---

## Proposed Layout

### Desktop Command-Center Layout

Recommended starting column widths:

```text
SITREP Evidence Panel:   420px
Support Strategy Panel:  420px
Map Panel:               flexible / remaining width
Source Hubs Panel:       300px
```

Alternative percentage model:

```text
SITREP Evidence:    22–25%
Support Strategy:   24–28%
Map:                35–40%
Source Hubs:        14–18%
```

### Responsive Behavior

For smaller screens:

1. Keep the map as the main working area.
2. Allow the SITREP and Support Strategy panels to collapse.
3. Provide a toggle between:
   - `SITREP`
   - `Strategy`
   - `Sources`
4. Keep the selected source hub and selected map area synchronized across panels.

---

## Support Strategy Tabs

The Support Strategy column should have these tabs:

```text
Priorities · Packages · Decisions · Matching · Clarifications · Commitments
```

Each tab should focus on a different support workflow.

---

## Tab 1: Priorities

### Purpose

Rank downstream areas by support urgency.

This tab should answer:

> Which barangays/cities/municipalities need support first?

### Inputs

Use SITREP fields such as:

```text
summary.rollup.gap_cards
summary.rollup.priority_watch_items
summary.rollup.supporting_metrics
summary.items[*].location
summary.items[*].data.supporting_metrics
summary.items[*].data.priority_watch_items
summary.items[*].data.gap_cards
situation.items[*].data.current_operating_picture
population.rollup.people_at_risk
```

### Suggested Priority Factors

Calculate or infer priority using:

- Alert level
- People at risk
- Open reports
- Active reports
- Deferred reports
- Current assignments
- Requested resource units
- Blocked/limited route indicators
- Dominant incident type
- Life-safety signals
- Time since last source heartbeat or SITREP generation

### Example Priority Queue from Current Sample

```text
1. Apas
   Critical support review
   20 people at risk · 58 requested resource units · 2 blocked routes · 1 limited route
   Recommended: rescue support + access verification + engineering support

2. Capitol Site
   Access and rescue support
   14 people at risk · 57 requested resource units · constrained access
   Recommended: flood/rescue package + route clearing + public safety support

3. Lahug
   Medical and infrastructure support
   15 people at risk · 51 requested resource units · medical/infrastructure pressure
   Recommended: EMS support + utility/engineering coordination

4. Guadalupe
   Resource and infrastructure support
   49 requested resource units · rescue/flood/infrastructure pressure
   Recommended: resource review + engineering support

5. Labangon
   Medical/flood/landslide support
   41 requested resource units · medical/flood/landslide concerns
   Recommended: EMS review + flood/landslide support
```

### Card Actions

Each priority card should support:

```text
View Evidence
View on Map
Draft Support
Ask Clarification
Escalate
Mark Reviewed
```

---

## Tab 2: Packages

### Purpose

Generate suggested support packages from SITREP concern groups.

This tab should answer:

> What kind of support package should leadership prepare or approve?

### Inputs

Use:

```text
situation.rollup.concern_groups
needs.rollup.category_demand
needs.rollup.resource_groups
population.rollup.population_groups
damage.rollup.damage_groups
actions.rollup.team_deployment
```

### Suggested Support Packages

The current SITREP concern groups map naturally into support packages:

| SITREP Concern Group | Suggested Support Package | Typical Resources |
|---|---|---|
| Flood, Rescue, and Displacement | Rescue / Evacuation Support | Rescue teams, evacuation transport, rope, life vest, rescue boat, welfare team |
| Infrastructure, Access, and Utilities | Engineering / Access Clearing | Engineering team, DPWH, backhoe, bulldozer, road breaker, utility repair team |
| Other Current Concerns | Mixed Emergency Support | EMS, fire support, police/security, specialized rescue tools |
| Fire and Shelter Damage | Fire / Shelter Support | Fire truck, structural assessment, tents, family kits, shelter coordination |
| Public Safety and Protection | Public Safety Support | Police unit, crowd control, perimeter barrier, negotiator |

### Example Package Card

```text
Rescue / Evacuation Support
Triggered by: Flood, Rescue, and Displacement
Open reports: 14
Requested resource units: 85
Affected areas: Guadalupe, Apas, Labangon, Lahug, Capitol Site

Recommended actions:
- Prepare rescue team augmentation
- Confirm evacuation needs
- Check route passability
- Prepare welfare and shelter support

Suggested downstream targets:
- Apas
- Capitol Site
- Guadalupe
```

### Card Actions

```text
Draft Support Commitment
Match Resources
View Evidence
View on Map
Escalate Package
```

---

## Tab 3: Decisions

### Purpose

Show leadership decisions that require approval, rejection, escalation, or clarification.

This tab should answer:

> What decisions need to be made now?

### Inputs

Use:

```text
summary.rollup.decision_points
situation.rollup.decision_points
summary.rollup.priority_watch_items
gaps.rollup
needs.rollup
actions.rollup.assignment_timing
```

### Example Decision Cards

```text
Approve rescue augmentation for Apas
Reason:
- Critical alert
- 20 people at risk
- Rescue is a dominant concern
- 58 requested resource units
- Access constraints reported

Suggested action:
Commit 1 rescue team and 1 access verification team.

Actions:
[Approve] [Edit] [Ask Clarification] [Escalate] [Reject]
```

```text
Escalate heavy equipment support
Reason:
- Heavy Equipment / Clearing demand is 44 units across 4 locations
- Route constraints may affect response movement

Suggested action:
Check city engineering availability. Escalate to province if insufficient.

Actions:
[Check Matching] [Escalate] [Ask Engineering] [Defer]
```

```text
Verify route constraints before public advisory
Reason:
- Road/access constraints are reported by incident records
- SITREP warns that constraints should be verified before public routing guidance

Suggested action:
Ask affected hubs to confirm route passability and alternate access.

Actions:
[Ask Clarification] [View Route Evidence] [Mark Verified]
```

---

## Tab 4: Matching

### Purpose

Compare requested resources from the SITREP against available city/province resources.

This tab should answer:

> Do we have enough resources to meet the requested support demand?

### Inputs

Use:

```text
needs.rollup.category_demand
needs.rollup.resource_groups
summary.rollup.supporting_metrics.resource_need_units
summary.items[*].data.supporting_metrics.resource_need_units
resource_inventory.available_resources    // new or future data source
support.commitments                       // new or future data source
```

### Initial Version

For the first version, available resources may be manually encoded or mocked in a local resource registry.

Suggested resource availability states:

```text
Available
Committed
En Route
On Scene
Unavailable
Under Maintenance
Unknown
```

### Matching Table Example

| Demand Category | Requested | Available | Gap | Suggested Action |
|---|---:|---:|---:|---|
| Specialized Rescue Equipment | 61 | 20 | 41 | Escalate / borrow / procure |
| Heavy Equipment / Clearing | 44 | 8 | 36 | Coordinate city engineering + province |
| Search and Damage Assessment | 40 | 12 | 28 | Mobilize engineers / building officials |
| Rescue and Extraction | 38 | 15 | 23 | Assign rescue teams |
| Public Safety / Traffic Control | 27 | 30 | 0 | Reallocate as needed |

### Card Actions

```text
Reserve Resource
Commit Resource
Escalate Gap
Mark Unavailable
Request from Province
Request from Partner
```

---

## Tab 5: Clarifications

### Purpose

Convert SITREP confidence gaps into actionable questions that can be sent downstream.

This tab should answer:

> What must be verified before leadership commits support or releases public guidance?

### Inputs

Use:

```text
gaps.rollup
summary.rollup.decision_points
population.rollup.numeric_total_note
population.rollup.confidence_note
damage.rollup.confidence_note
needs.rollup.confidence_note
situation.rollup.decision_points
```

### Clarification Types

```text
Route / access verification
Population count verification
Resource need verification
Assignment status verification
Incident status verification
Damage verification
Supply / delivery verification
Source heartbeat / freshness verification
```

### Example Clarification Requests

```text
To: Apas
Question:
Confirm if Main Road and Barangay Hall Vicinity are passable to emergency vehicles.

Reason:
SITREP reports 2 blocked routes and 1 limited route.

Suggested response options:
- Fully blocked
- Passable to emergency vehicles only
- Limited / one lane only
- Cleared
- Unknown / needs field verification
```

```text
To: Capitol Site
Question:
Confirm whether Creekside Lane remains blocked and whether alternate access exists.

Reason:
SITREP reports blocked/limited access and flood/rescue pressure.
```

```text
To: All source hubs
Question:
Which requested resource units remain unmet?

Reason:
SITREP shows 256 requested resource units, but resource supply is not confirmed.
```

```text
To: All source hubs
Question:
Confirm whether people-at-risk counts overlap with patient, evacuation, and affected-family records.

Reason:
SITREP warns that population fields may overlap across source systems.
```

### Card Actions

```text
Send Clarification
Edit Question
Attach SITREP Evidence
View Source Hub
Mark Answered
Convert to Support Decision
```

---

## Tab 6: Commitments

### Purpose

Track support actions approved by leadership and sent downstream.

This tab should answer:

> What support has been committed, sent, acknowledged, dispatched, or completed?

### Suggested Commitment Statuses

```text
Draft
Pending Approval
Approved
Sent Downstream
Acknowledged by Downstream Hub
Assigned
Dispatched
En Route
Arrived
Completed
Partially Completed
Unable to Fulfill
Cancelled
Escalated
```

### Example Commitment Card

```text
Support Commitment: Rescue and Access Support for Apas
Status: Sent Downstream
Priority: Critical
Target: Apas, Cebu City, Cebu
Approved by: City Command

Committed resources:
- 1 rescue team
- 1 engineering/access verification team

Reason:
- 20 people at risk
- 58 requested resource units
- 2 blocked routes and 1 limited route
- Rescue is dominant concern

Awaiting:
- Barangay acknowledgement
- Route condition confirmation
```

### Card Actions

```text
Send Downstream
Mark Acknowledged
Update Status
Attach Resource
Escalate
Cancel
Close Commitment
```

---

## Interaction Model

The four columns should be synchronized.

### Click Source Hub

When a user clicks a source hub, such as Apas:

```text
SITREP Panel:
- Show Apas-specific SITREP evidence.

Support Strategy:
- Show Apas priority card.
- Show Apas support packages.
- Show Apas clarification requests.
- Show Apas commitments.

Map:
- Zoom to Apas boundary.
- Highlight incident markers and constrained routes.

Source Hubs:
- Mark Apas as selected.
```

### Click SITREP Gap

When a user clicks `Resource supply not confirmed`:

```text
Support Strategy:
- Open Matching tab.
- Show requested units by barangay.
- Show available resources and unresolved gaps.

Map:
- Highlight barangays with highest unmet demand.
```

### Click Concern Group

When a user clicks `Flood, Rescue, and Displacement`:

```text
Support Strategy:
- Open Packages tab.
- Show Rescue / Evacuation Support package.
- List affected barangays and required resources.

Map:
- Highlight flood/rescue incident clusters.
```

### Click Support Strategy Card

When a user clicks a support strategy card:

```text
SITREP Panel:
- Scroll to or filter relevant evidence.

Map:
- Highlight associated locations, incident markers, or routes.

Source Hubs:
- Highlight affected source hubs.
```

---

## Recommended Data Model

Add a generated `support_strategy` object derived from the consolidated SITREP.

Example shape:

```json
{
  "support_strategy": {
    "generated_at": "2026-06-09T00:00:00+08:00",
    "source_sitrep_id": "city-sitrep-2026-06-05",
    "coverage_area": "CEBU CITY, CEBU",
    "coverage_level": "city",
    "priorities": [],
    "packages": [],
    "decisions": [],
    "matching": [],
    "clarifications": [],
    "commitments": []
  }
}
```

### Priority Object

```json
{
  "priority_id": "priority-apas-001",
  "source_hub_id": "13",
  "source_hub_name": "Apas, Cebu City, Cebu",
  "rank": 1,
  "priority_level": "critical",
  "summary": "Critical support review",
  "reasons": [
    "20 people at risk",
    "58 requested resource units",
    "2 blocked routes; 1 limited route",
    "Rescue is dominant concern"
  ],
  "recommended_next_steps": [
    "Prepare rescue augmentation",
    "Verify route passability",
    "Check engineering support availability"
  ],
  "evidence_refs": [
    "summary.items[Apas].gap_cards",
    "situation.items[Apas].current_operating_picture",
    "needs.rollup.category_demand"
  ]
}
```

### Package Object

```json
{
  "package_id": "package-rescue-evacuation-001",
  "title": "Rescue / Evacuation Support",
  "trigger_concern_group": "Flood, Rescue, and Displacement",
  "priority_level": "critical",
  "target_hubs": ["Apas", "Capitol Site", "Guadalupe"],
  "open_reports": 14,
  "requested_resource_units": 85,
  "suggested_resources": [
    "Rescue Team",
    "Evacuation Transport",
    "Rope",
    "Life Vest",
    "Rescue Boat",
    "Welfare Team"
  ],
  "recommended_actions": [
    "Confirm evacuation needs",
    "Assign rescue team augmentation",
    "Prepare shelter/welfare support"
  ],
  "evidence_refs": [
    "situation.rollup.concern_groups[0]",
    "needs.rollup.resource_groups.Rescue and Extraction"
  ]
}
```

### Decision Object

```json
{
  "decision_id": "decision-apas-rescue-001",
  "title": "Approve rescue augmentation for Apas",
  "decision_type": "approve_support",
  "priority_level": "critical",
  "target_hub_id": "13",
  "target_hub_name": "Apas, Cebu City, Cebu",
  "reason": "Critical alert, 20 people at risk, rescue concern, constrained access, and 58 requested resource units.",
  "recommended_action": "Commit 1 rescue team and 1 access verification team.",
  "status": "pending_leadership_action",
  "allowed_actions": [
    "approve",
    "edit",
    "ask_clarification",
    "escalate",
    "reject"
  ],
  "evidence_refs": []
}
```

### Clarification Object

```json
{
  "clarification_id": "clarify-apas-route-001",
  "target_hub_id": "13",
  "target_hub_name": "Apas, Cebu City, Cebu",
  "type": "route_access_verification",
  "question": "Confirm if Main Road and Barangay Hall Vicinity are passable to emergency vehicles.",
  "reason": "SITREP reports 2 blocked routes and 1 limited route.",
  "suggested_response_options": [
    "Fully blocked",
    "Passable to emergency vehicles only",
    "Limited / one lane only",
    "Cleared",
    "Unknown / needs field verification"
  ],
  "status": "draft"
}
```

### Commitment Object

```json
{
  "commitment_id": "commitment-apas-rescue-001",
  "target_hub_id": "13",
  "target_hub_name": "Apas, Cebu City, Cebu",
  "priority_level": "critical",
  "support_type": "rescue_access_support",
  "status": "draft",
  "committed_resources": [
    {
      "resource": "Rescue Team",
      "quantity": 1
    },
    {
      "resource": "Engineering / Access Verification Team",
      "quantity": 1
    }
  ],
  "reason": [
    "20 people at risk",
    "58 requested resource units",
    "2 blocked routes; 1 limited route",
    "Rescue is dominant concern"
  ],
  "downstream_acknowledgement": null
}
```

---

## Relay Envelope Types

When Support Strategy actions become operational messages, they should use Relay envelope types such as:

```text
sitrep.support_analysis.generated
support.clarification.requested
support.clarification.responded
support.request.created
support.request.acknowledged
support.commitment.created
support.commitment.accepted
support.commitment.dispatched
support.commitment.status_updated
support.commitment.completed
support.request.escalated
resource.availability.updated
```

For the first implementation, these can be mocked locally or emitted as draft payloads without full Relay delivery.

---

## Suggested UI Component Structure

Suggested frontend structure:

```text
SupportStrategyPanel
├── SupportStrategyTabs
│   ├── PrioritiesTab
│   ├── PackagesTab
│   ├── DecisionsTab
│   ├── MatchingTab
│   ├── ClarificationsTab
│   └── CommitmentsTab
├── SupportStrategyCard
├── EvidenceRefList
├── StrategyActionButtons
└── StrategyStatusBadge
```

Suggested CSS naming:

```text
.pbb-support-strategy
.pbb-support-strategy__tabs
.pbb-support-strategy__tab
.pbb-support-strategy__panel
.pbb-support-card
.pbb-support-card__header
.pbb-support-card__meta
.pbb-support-card__evidence
.pbb-support-card__actions
.pbb-support-priority
.pbb-support-package
.pbb-support-decision
.pbb-support-matching
.pbb-support-clarification
.pbb-support-commitment
```

---

## Visual Design Guidance

The Support Strategy column should follow the existing PBB Support System dark command-center theme.

Use visual distinction:

| Item Type | Suggested Visual Treatment |
|---|---|
| Priority | Alert-colored left border / rank badge |
| Package | Blue/cyan operational card |
| Decision | Amber pending-decision badge |
| Matching gap | Red or amber resource gap indicator |
| Clarification | Purple or blue question badge |
| Commitment | Green/blue status badge depending on state |

Every recommendation must show a **Based on** evidence section.

Example:

```text
Based on:
- 20 people at risk
- 58 requested resource units
- 2 blocked routes; 1 limited route
- Rescue is dominant concern
```

This is important for trust and explainability.

---

## Implementation Phases

### Phase 1: UI Shell and Local Derived Strategy

Deliver:

- Add the Support Strategy column between SITREP and map.
- Add tabs: Priorities, Packages, Decisions, Matching, Clarifications, Commitments.
- Generate local support strategy from the loaded SITREP JSON.
- Render cards for all six tabs.
- Add basic selection sync with source hubs and map.
- No Relay integration required yet.

### Phase 2: Strategy Actions and Draft Payloads

Deliver:

- Add buttons for Draft Support, Ask Clarification, Escalate, Mark Reviewed.
- Generate draft support commitment payloads.
- Generate draft clarification payloads.
- Add local state for card status changes.
- Add audit-style event log locally.

### Phase 3: Relay Integration

Deliver:

- Send clarification requests downstream through Relay.
- Send support commitments downstream through Relay.
- Receive acknowledgement/status updates from downstream hubs.
- Track support commitment status in the Commitments tab.

### Phase 4: Resource Registry / Matching

Deliver:

- Add city/province resource availability registry.
- Compare requested resources against available inventory.
- Track committed resources.
- Identify unmet resource gaps.
- Support escalation to province or partner organizations.

---

## Acceptance Criteria

### Layout

- Support Strategy column appears between SITREP and map.
- Existing SITREP tabs continue working.
- Map continues working.
- Source hub list continues working.
- Layout remains usable at common desktop command-center resolutions.

### Tabs

- Support Strategy has six tabs:
  - Priorities
  - Packages
  - Decisions
  - Matching
  - Clarifications
  - Commitments

### Priorities

- System ranks source hubs using SITREP-derived urgency signals.
- Cards show rank, hub name, priority level, summary, reasons, and suggested next steps.
- Clicking a priority card highlights relevant evidence and map area.

### Packages

- System generates support packages from concern groups and needs categories.
- Package cards show target hubs, open reports, requested resource units, suggested resources, and recommended actions.

### Decisions

- System generates pending leadership decision cards.
- Cards allow at least draft actions: approve, ask clarification, escalate, reject.

### Matching

- System displays requested demand categories.
- If available resource data is absent, Matching must clearly show `availability unknown` rather than invent availability.

### Clarifications

- System generates clarification questions from confidence gaps.
- Clarification cards identify target hub, question, reason, and status.

### Commitments

- System can show draft support commitments.
- Commitment cards show target hub, support type, resources, status, and evidence-based reason.

### Evidence and Trust

- Every strategy recommendation must include evidence references or a `Based on` section.
- The strategy layer must not overwrite or modify the original SITREP evidence.
- The system must distinguish between requested resources and confirmed available resources.

---

## Important Constraints

1. Do not make the system auto-dispatch resources.
2. Recommendations should remain leadership-approved actions.
3. Requested resources are not confirmed supply.
4. Population totals may overlap and must be treated as planning signals unless verified.
5. Route/access reports should be verified before public routing guidance.
6. The Support Strategy layer should be derived from SITREP data and should preserve source provenance.
7. Keep the SITREP panel as evidence; keep the Support Strategy panel as interpretation/action.

---

## Suggested First Task for Codex Agent Support

Implement Phase 1.

### Task Summary

Add a new **Support Strategy** column between the existing SITREP panel and the map. The column should have tabs for Priorities, Packages, Decisions, Matching, Clarifications, and Commitments. Generate a local derived support strategy object from the existing consolidated SITREP JSON and render actionable strategy cards without yet sending any Relay messages.

### Expected Output

- Updated UI layout with Support Strategy column.
- Strategy tabs rendered.
- Derived support strategy generator function/module.
- Card components for priorities, packages, decisions, matching, clarifications, and commitments.
- Basic click synchronization with selected source hub and map highlight if existing selection hooks are available.
- Clear fallback states when data is missing.

### Suggested File/Module Names

Use actual project structure if different, but recommended names are:

```text
support-strategy.js
support-strategy-panel.js
support-strategy-renderer.js
support-strategy.css
support-strategy.schema.js
```

### Suggested Main Function

```js
function buildSupportStrategyFromSitrep(sitrep) {
  return {
    generated_at: new Date().toISOString(),
    source_sitrep_id: sitrep?.id || sitrep?.report_id || null,
    coverage_area: sitrep?.coverage_area || null,
    coverage_level: sitrep?.coverage_level || null,
    priorities: buildPriorityQueue(sitrep),
    packages: buildSupportPackages(sitrep),
    decisions: buildPendingDecisions(sitrep),
    matching: buildResourceMatching(sitrep),
    clarifications: buildClarificationRequests(sitrep),
    commitments: buildDraftCommitments(sitrep)
  };
}
```

---

## Final Recommendation

Proceed with the side-by-side Support Strategy column.

This is better than adding Support as another SITREP tab because it preserves the distinction between evidence and action.

The SITREP panel tells leadership what was reported.

The Support Strategy column tells leadership what to do next.

The map shows where the support is needed.

The source hub list preserves downstream provenance.

This design moves the PBB Support System from visibility toward proactive downstream support while keeping command authority, verification, and Relay-based offline-first coordination intact.
