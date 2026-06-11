# Support Request Workflow Direction

Date: 2026-06-10

## Status

This is the current product direction for support assistance workflows.

The previous Support Strategy proposal explored deriving action cards directly from consolidated SITREP needs, gaps, access notes, and resource signals. That direction is now paused because it can overstate what Support should do from passive SITREP evidence.

## Core Decision

A SITREP is situational visibility. It is not automatically a request for outside support.

Support assistance should be based on an explicit request from barangay or command leadership, not inferred from SITREP gaps alone.

## Why This Changed

The earlier strategy model risks operational mistakes:

- Barangays may already be addressing the reported needs and gaps.
- Acting on current needs without confirmation can duplicate deployed local resources.
- A SITREP may report problems without asking for outside assistance.
- Support is most useful when barangay-level capacity, coordination, or logistics are exceeded.
- Deployment should use SITREP access information for routing and staging context, not as a standalone trigger.

## Preferred Flow

```text
Barangay SITREP
-> Hotline command review
-> Explicit Request Support action
-> Relay transport
-> Support request intake
-> Support coordination, deployment, and status tracking
```

## Ownership

### Hotline

Hotline should own the explicit `Request Support` action because it is closest to barangay operations and command review.

The request should be created by an authorized command user after reviewing the SITREP and local response state.

### Relay

Relay should transport support request messages and status updates between participating hubs using a clear message contract.

### Support

Support should receive, validate, coordinate, deploy, and track explicit support requests.

Support should use SITREP evidence as context for:

- access and routing
- staging considerations
- source provenance
- urgency validation
- logistics planning
- follow-up questions

Support should not infer resource deployment directly from a SITREP without an explicit request.

## Request Support Contract Direction

A support request should carry enough information for Support to act without guessing:

- requesting hub or barangay
- linked SITREP id or SITREP message id
- requested capability, team, or resource type
- requested quantity when known
- reason for escalation
- urgency or priority
- access constraints and route notes
- staging or rendezvous location when known
- known local actions already underway
- approving/requesting command user
- free-text command notes

Recommended lifecycle states:

```text
draft
submitted
acknowledged
needs_clarification
accepted
assigned
en_route
on_scene
completed
cancelled
rejected
```

The exact message schema and status lifecycle should be finalized with Hotline Beta and Relay before Support implementation starts.

## What To Do With Support Strategy Work

Do not merge or continue polishing the current inferred Support Strategy branch as the target product flow.

Reusable ideas from that branch:

- independent loading from a separate endpoint
- evidence/provenance linking
- map/source synchronization concepts
- compact review card experiments
- local reviewed state patterns

Do not reuse the assumption that Support can generate deployment priorities from SITREP needs/gaps alone.

## Future Support UI Direction

The Support dashboard should eventually show explicit support requests, not inferred support strategy recommendations.

Likely Support panels:

- current consolidated SITREP
- support requests
- map and route context
- source hubs
- request detail/review drawer
- deployment/status tracking

Until the Request Support contract exists, Support can show SITREP visibility and source/map context, but should avoid action wording such as deploy, commit, or dispatch based only on SITREP data.
