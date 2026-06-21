# Support Relay Identities And Tokens

Date: 2026-06-21

## Decision

PBB Support is one application with two Relay identities:

- `sitrep.ingestor`
- `support.dispatch`

These identities should be modeled separately in Relay and Kit Data Prep because
they represent different operational roles, handler routes, message contracts,
and outbound message sources.

## Relay Identities

### `sitrep.ingestor`

Purpose:

- Receive system-generated SITREP records from Hotline.
- Stage the latest valid SITREP per source hub.
- Consolidate current SITREP visibility for the Support dashboard.

Inbound route:

```text
POST https://support.pbb.ph/api/relay/sitreps
```

Inbound message contract:

```text
message_type: sitrep.record
source_system: sitrep.app
target system: sitrep.ingestor
```

This flow is situational visibility. It must not create support deployments,
assignments, or commitments by itself.

### `support.dispatch`

Purpose:

- Receive explicit Hotline Command support requests.
- Receive Hotline-originated support request lifecycle intake such as
  cancellation.
- Send support request lifecycle/status updates back toward Hotline through
  Relay.

Inbound routes:

```text
POST https://support.pbb.ph/api/relay/support-requests
POST https://support.pbb.ph/api/relay/support-request-lifecycle
```

Inbound message contracts:

```text
message_type: support.request
source_system: hotline.command
target system: support.dispatch
```

```text
message_type: support.request.cancelled
source_system: hotline.command
target system: support.dispatch
```

Outbound lifecycle callback source:

```text
source_system: support.dispatch
message_type pattern: support.request.*
```

Examples include `support.request.received`, `support.request.accepted`,
`support.request.rejected`, `support.request.assigned`,
`support.request.en_route`, and `support.request.fulfilled`.

## Relay Client Records

Relay should keep separate client records for the two Support identities:

```text
system_code: sitrep.ingestor
display_name: Support SITREP Ingestor
```

```text
system_code: support.dispatch
display_name: Support Dispatch
```

Each client identity should have its own handler rows. Handler tokens may be
shared or separate depending on Relay and Kit policy, but the handler rows must
remain role-scoped so `sitrep.record`, `support.request`, and
`support.request.*` messages cannot be routed into the wrong workflow.

## Support Settings Model

Visible Support Relay settings should describe only outbound calls Support makes
to Relay:

- Relay URL
- SITREP Relay Client Token
- Support Request Relay Client Token

These tokens are client/API tokens used by Support when it posts outbound Relay
messages.

Inbound Relay-to-Support authentication is different. Relay uses handler tokens
when posting into Support's machine endpoints. Handler tokens are Relay/Kit
managed machine-to-machine secrets and should not be confused with operator
visible outbound Relay client tokens.

## Routing Rules

Relay handler routing must distinguish by:

- `message_type`
- `source_system`
- target system in `targets[].systems`
- message direction

Required disambiguation:

- `sitrep.record` from `sitrep.app` to `sitrep.ingestor` goes only to
  `/api/relay/sitreps`.
- `support.request` from `hotline.command` to `support.dispatch` goes only to
  `/api/relay/support-requests`.
- `support.request.cancelled` from `hotline.command` to `support.dispatch` goes
  only to `/api/relay/support-request-lifecycle`.
- Support-originated `support.request.*` lifecycle callbacks from
  `support.dispatch` must not be routed back into Support intake.

## Kit Data Prep Implications

Kit should provide Support with outbound Relay client tokens for both roles:

- SITREP Relay Client Token for `sitrep.ingestor`.
- Support Request Relay Client Token for `support.dispatch`.

Kit and Relay should seed handler rows for each role separately. Support should
consume Kit-provided settings without requiring operators to manually understand
or rotate inbound handler secrets during normal installation.
