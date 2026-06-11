# Support Request Contract Checklists

Date: 2026-06-10

## Product Boundary

SITREP is situational visibility. It can provide context for access, routing, staging, urgency validation, source provenance, and follow-up questions.

Support Request is the actionable tasking record. Support assistance must be based on an explicit command or barangay request, not inferred from SITREP needs, gaps, or access notes alone.

This document supersedes the earlier inferred Support Strategy direction for active implementation planning. The old Support Strategy proposal and Phase 1 brief should be treated as paused technical exploration only, not as current product guidance. Future agents should not implement deployment, dispatch, commitment, or prioritization workflows from SITREP needs/gaps unless an explicit Support Request contract and request record exist.

Ownership boundaries:

- Hotline owns request creation, approval context, outbound Relay submission, inbound Support updates, and local request history.
- Relay owns transport, routing, delivery, retry, handler registration, and transport authentication.
- Support owns request intake, validation, triage, assignment, lifecycle updates, and support-side status history.

## Jonathan Decisions For V1

These decisions are the approved baseline for first implementation planning:

- Hotline request source system: `hotline.command`.
- Support intake target system: `support.dispatch`.
- Support lifecycle update source system: `support.dispatch`.
- `support.request.received` exists in v1, but it is a human action from the Support side, triggered when an authorized Support user opens or views the request for the first time. Relay delivery alone must not mark the request as received.
- Hotline-side cancellation is supported in v1, including after Support has accepted or assigned the request. Support must receive the cancellation and resolve any local assignment/deployment state through its workflow.
- Support request approval is owned by PBB Hotline.
- Dispatching a received support request is owned by PBB Support.
- SITREP context is included as support request detail/context, but Support Request development must not change the current SITREP JSON structure.
- Support Request payloads must follow the current SITREP privacy boundary: no citizen/private details are added.

## Shared Support Request Contract Checklist

Use this checklist as the joint Hotline, Support, and Relay agreement before implementation starts.

- [ ] Confirm canonical outbound request message type: `support.request`.
- [ ] Confirm canonical Support update message pattern: `support.request.*`.
- [ ] Confirm first-pass update message types:
  - [x] `support.request.received`
  - [ ] `support.request.accepted`
  - [ ] `support.request.rejected`
  - [ ] `support.request.assigned`
  - [ ] `support.request.en_route`
  - [ ] `support.request.fulfilled`
  - [ ] `support.request.closed`
- [ ] Decide whether Hotline outbound amendment types are in v1:
  - [x] `support.request.cancelled`
  - [ ] `support.request.updated`
- [ ] Confirm Relay handler disambiguation rules for similarly named message types:
  - [ ] distinguish by `source_system`
  - [ ] distinguish by target system in `targets[].systems`
  - [ ] distinguish by message direction
  - [ ] prevent Hotline outbound amendments such as `support.request.cancelled` or `support.request.updated` from being routed to Hotline's inbound `support.request.*` update handler
  - [ ] prevent Support lifecycle updates such as `support.request.accepted` or `support.request.assigned` from being routed back into Support intake
- [ ] Confirm Relay envelope fields and target pattern:
  - [ ] `message_type`
  - [ ] `source_system`
  - [ ] `targets`
  - [ ] `priority`
  - [ ] `payload`
- [x] Confirm target system string for Support intake: `support.dispatch`.
- [x] Confirm source system string for Hotline command requests: `hotline.command`.
- [x] Confirm Support update source system string: `support.dispatch`.
- [ ] Confirm target hub selection rules from Relay `/hub.json` uplinks.
- [ ] Finalize support request payload schema version `1`.
- [ ] Finalize required request fields:
  - [ ] `request.local_request_id`
  - [ ] `request.correlation_id`
  - [ ] `request.status`
  - [ ] `request.urgency`
  - [ ] `request.requested_assistance`
  - [ ] `request.requested_capability`
  - [ ] `request.requested_at`
  - [ ] `source.system`
  - [ ] `source.hub_id` or `source.relay_hub_id`
  - [ ] `source.hub_name`
  - [ ] `requester.user_id`
  - [ ] `requester.display_name`
  - [ ] `requester.role`
- [ ] Finalize optional request fields:
  - [ ] `request.quantity`
  - [ ] `request.quantity_unit`
  - [ ] `request.staging_notes`
  - [ ] `request.command_notes`
  - [ ] `sitrep.id`
  - [ ] `sitrep.sequence_number`
  - [ ] `sitrep.generated_at`
  - [ ] `sitrep.evidence_ref`
  - [ ] `sitrep.section`
  - [ ] `gap`
  - [ ] `evidence_row`
  - [ ] `incident_refs`
- [ ] Confirm full SITREP JSON is not embedded in `support.request` v1.
- [x] Confirm Support Request development does not change the current SITREP JSON structure.
- [x] Confirm Support Request payloads follow current SITREP privacy boundaries and add no citizen/private details.
- [ ] Finalize Support update payload schema version `1`.
- [ ] Finalize required update fields:
  - [ ] `correlation_id`
  - [ ] `hotline_request_id`
  - [ ] `support_request_id`
  - [ ] `status`
  - [ ] `status_label`
  - [ ] `updated_at`
  - [ ] `updated_by.system`
  - [ ] `updated_by.display_name`
- [ ] Finalize optional update fields:
  - [ ] `assignment.team_name`
  - [ ] `assignment.eta`
  - [ ] `assignment.notes`
  - [ ] `message`
  - [ ] `update_id`
- [ ] Agree on lifecycle states and owners:
  - [ ] Hotline-owned: `draft`
  - [ ] Hotline-owned: `requested`
  - [ ] Hotline-owned: `relay_accepted`
  - [x] Support-owned: `received`
  - [ ] Support-owned: `under_review`
  - [ ] Support-owned: `accepted`
  - [ ] Support-owned: `rejected`
  - [ ] Support-owned: `assigned`
  - [ ] Support-owned: `en_route`
  - [ ] Support-owned: `fulfilled`
  - [ ] Support-owned: `closed`
  - [x] Hotline-owned or shared: `cancelled`
  - [ ] Hotline-owned: `failed`
- [ ] Define valid status transitions.
- [ ] Define rejection/error semantics.
- [x] Define cancellation semantics for v1: Hotline may cancel even after Support accepts or assigns; Support must receive and resolve local assignment/deployment state through its workflow.
- [ ] Define whether closed requests can be reopened.
- [ ] Define stable ID rules:
  - [ ] `local_request_id`
  - [ ] `correlation_id`
  - [ ] `relay_message_id`
  - [ ] `support_request_id`
  - [ ] `update_id`
- [ ] Define idempotency rules for Hotline outbound retries.
- [ ] Define idempotency rules for Support intake.
- [ ] Define idempotency rules for Hotline inbound updates.
- [ ] Confirm Relay handler auth header and token handling.
- [ ] Confirm unknown-but-authenticated message logging behavior.
- [ ] Confirm privacy limits for incident, citizen, and SITREP details.
- [ ] Create shared request and update JSON fixtures.
- [ ] Validate one end-to-end fixture through Hotline payload creation, Relay envelope, Support intake, Support update, and Hotline inbound handling.

## Hotline Implementation Checklist

Owned by the Hotline implementation agent.

- [ ] Add local support request persistence:
  - [ ] request table/model
  - [ ] request status/history table/model
  - [ ] processed inbound Relay message table or equivalent idempotency record
- [ ] Add Hotline settings for Support Request Relay:
  - [ ] target system
  - [ ] source system
  - [ ] outbound Relay credentials
  - [ ] inbound Relay handler token
- [ ] Add Command UI `Request Support` entry point.
- [ ] Decide which SITREP contexts are requestable in v1:
  - [ ] resource supply not confirmed
  - [ ] open needs tied to active/deferred incidents
  - [ ] road/access constraints affecting movement
  - [ ] logistics/staging constraints
  - [ ] rescue/access support needs
- [ ] Exclude non-requestable contexts by default:
  - [ ] population verification
  - [ ] counting/data-quality notes
  - [ ] purely informational constraints
  - [ ] historical/resolved/discarded context
- [ ] Add Hotline-owned Request Support modal or form.
- [ ] Prefill form from selected SITREP gap, evidence row, incident, or operational context.
- [ ] Allow command user to edit request fields before submission.
- [ ] Capture approval/requester identity.
- [ ] Treat the authorized Hotline Request Support submission as the approval action unless Hotline later adds a separate local approval workflow.
- [ ] Persist `draft` before Relay submission when appropriate.
- [ ] Build `support.request` payload from persisted request.
- [ ] Wrap payload in Relay envelope using agreed target pattern.
- [ ] Submit outbound request to Relay.
- [ ] Track `requested`, `relay_accepted`, and `failed` states.
- [ ] Add retry behavior for failed Relay submissions.
- [ ] Add request status/history display in Command UI.
- [ ] Add inbound Relay endpoint for Support updates:
  - [ ] `POST /api/internal/relay/support-request-updates`
  - [ ] Relay handler token validation
  - [ ] message type prefix validation for `support.request.`
  - [ ] payload schema validation
  - [ ] local request lookup by `local_request_id` or `correlation_id`
  - [ ] duplicate Relay message detection
  - [ ] status history append
  - [ ] current status update
  - [ ] rejected-message logging for unknown or invalid updates
- [ ] Add tests for request creation permissions.
- [ ] Add tests for payload generation.
- [ ] Add tests for Relay outbound submission and retry/failure paths.
- [ ] Add tests for inbound idempotency.
- [ ] Add tests for unknown request/update handling.
- [ ] Add browser smoke for Command request creation and status history display.

## Support Implementation Checklist

Owned by the Support implementation agent.

- [x] Add Support settings for request intake:
  - [x] expected source system
  - [x] Support source system for updates
  - [x] Relay handler token
  - [ ] outbound Relay credentials for updates
- [x] Add internal Relay intake endpoint for `support.request`.
- [x] Validate Relay handler auth token.
- [x] Validate Relay envelope and payload schema.
- [x] Store raw inbound request for audit/debug.
- [x] Implement idempotent intake by Relay message ID and correlation ID.
- [x] Create support request staging/intake table/model.
- [x] Preserve source Hotline request IDs:
  - [x] `local_request_id`
  - [x] `correlation_id`
  - [x] `relay_message_id`
- [x] Generate Support-owned `support_request_id`.
- [x] Store linked SITREP references without requiring full SITREP JSON.
- [x] Store selected evidence row, gap, and incident references when provided.
- [x] Add Support request list/intake UI.
- [x] Add request detail/review drawer.
- [x] Show linked SITREP context as visibility, not as inferred deployment instruction.
- [ ] Add triage actions:
  - [x] mark received on first authorized human open/view
  - [ ] mark under review
  - [ ] accept
  - [ ] reject with reason
  - [ ] ask for clarification
- [ ] Add assignment/status workflow:
  - [ ] assigned
  - [ ] en route
  - [ ] fulfilled
  - [ ] closed
- [ ] Add outbound Support update payload builder.
- [ ] Submit lifecycle updates to Relay using `support.request.*` message types.
- [ ] Store outbound update attempts and delivery results.
- [ ] Add retry/failure visibility for outbound updates.
- [ ] Add map/source/SITREP context links for routing and staging support.
- [x] Ensure Support never creates deployment tasks solely from SITREP gaps.
- [x] Add tests for intake auth and schema validation.
- [x] Add tests for idempotent request intake.
- [ ] Add tests for lifecycle transition rules.
- [ ] Add tests for outbound update payloads.
- [ ] Add tests for rejection/clarification paths.
- [ ] Add browser smoke for intake list, request detail, accept/reject, and status update flows.

## Open Questions Requiring Jonathan Decision

- [x] What is the canonical Support target system string?
  - Decision: `support.dispatch`.
- [x] What is the canonical Hotline source system string?
  - Decision: `hotline.command`.
- [x] What is the canonical Support update source system string?
  - Decision: `support.dispatch`.
- [x] Should `support.request.received` exist, or is Relay accepted delivery enough before Support accepts/rejects?
  - Decision: `support.request.received` exists and is triggered by a Support-side human action when the request is first opened/viewed.
- [x] Does Hotline Command require a separate approval step, or is submitting the Request Support form the approval action?
  - Decision: Support request approval is owned by PBB Hotline; v1 may treat authorized submission as approval unless Hotline adds a separate local approval workflow.
- [x] Should request cancellation be supported in v1?
  - Decision: yes.
- [x] If cancellation is supported, can Hotline cancel after Support accepts or assigns?
  - Decision: yes. Support must handle cancellation and resolve local assignment/deployment state.
- [ ] Should Support be allowed to reopen a closed request?
- [ ] Should `quantity` and `quantity_unit` be free-form in v1, or constrained to a resource/capability catalog?
- [x] Which SITREP gap/evidence types are requestable in v1?
  - Decision: SITREP context is provided as part of support request details. Requestability is owned by Hotline request creation and must not mutate SITREP JSON.
- [ ] Should access constraints be requestable by themselves, or only when tied to a movement/deployment need?
- [ ] What minimum requester identity must be included in cross-app messages?
- [x] Should Support receive citizen-facing incident references, or only Hotline public incident codes?
  - Decision: follow current SITREP JSON privacy structure; no citizen/private details.
- [x] How much command note text may be relayed before privacy review is required?
  - Decision: follow current SITREP JSON privacy boundaries; Support Request work must not add citizen/private details.
- [ ] Where should unknown-but-authenticated updates be visible for operators?
- [ ] What SLA or freshness expectations should be shown for unacknowledged requests?
- [ ] Should Support request lifecycle labels be shared centrally or duplicated per app?
- [ ] Should Relay dead-letter/replay behavior be operator-visible in Hotline, Support, or both?
