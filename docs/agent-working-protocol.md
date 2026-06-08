# Agent Working Protocol

Date: 2026-06-09

This protocol keeps PBB Support System work clean when multiple agents or contributors are active at the same time.

## Start Point

Before starting a task, inspect the current workspace state.

```powershell
Get-Location
Get-ChildItem -Force
git status --short
```

If the checkout is a git repository, start new work from the latest `main` unless the task explicitly continues another branch.

```powershell
git checkout main
git pull --ff-only origin main
```

If the checkout is not a git repository, state that in the task handoff and avoid pretending branch/commit state exists.

## Branch Naming

When git is available, use meaningful branch names:

```text
<category>/<task-name>
```

Good examples:

```text
sitrep/support-strategy-phase-1
dashboard/strategy-column
sources/heartbeat-strip
users/admin-drawer
docs/agent-working-protocol
```

Avoid vague names:

```text
fixes
update
new-work
test
```

## Worktree Folder Naming

When a separate checkout is needed, keep it under a Support branch workspace so it does not get mixed with other PBB apps.

Preferred structure:

```text
C:\wamp64\www\pbb\support-branches\<category>\<task-name>
```

Examples:

```text
C:\wamp64\www\pbb\support-branches\sitrep\support-strategy-phase-1
C:\wamp64\www\pbb\support-branches\dashboard\strategy-column
C:\wamp64\www\pbb\support-branches\sources\heartbeat-strip
```

If the worktree must be served through a local domain, use a DNS-friendly folder name:

```text
C:\wamp64\www\pbb\support-branches\<category>-<task-name>
```

Example:

```text
C:\wamp64\www\pbb\support-branches\sitrep-support-strategy-phase-1
```

Use an explicit local test domain when needed:

```text
support-strategy.pbb.ph
support-dashboard.pbb.ph
support-sources.pbb.ph
```

Do not replace the main Support local domain unless the task explicitly requires it.

## Branch Databases

Each served branch worktree should use its own database unless explicitly approved to share the main Support database.

Database names should follow the branch category and task:

```text
pbb_support_<category>_<task_name>
```

Examples:

```text
pbb_support_sitrep_strategy
pbb_support_dashboard_strategy_column
pbb_support_sources_heartbeat
```

MySQL database names are limited to 64 characters. If the full branch task name is too long, shorten the task segment while keeping it meaningful.

Create branch databases by cloning the current Support database, then point the branch `.env` to the copied database. Do not run broad seed/migration reset flows against shared data unless explicitly approved.

If the branch adds new migrations, run only the required migrations against the copied branch database:

```powershell
& 'C:\wamp64\bin\php\php8.2.29\php.exe' artisan migrate
```

Only use the main Support database directly for approved read-only verification or when the task specifically requires testing against the current local operating dataset.

## Task Isolation

One branch or task workspace should solve one task.

Do not mix unrelated work into the same task:

- no unrelated cleanup
- no unrelated formatting
- no unrelated vendored refreshes
- no Relay, Hotline, Helper, MapServer, or Kit changes from the Support workspace
- no documentation drift unless it is part of the task

If a second issue is discovered, document it and create a separate task or cross-team request.

## Cross-Team Boundaries

Agents may inspect other PBB repositories to understand behavior, but should not edit code owned by another team.

If Hotline, Relay, Helper, MapServer, Realtime, HQ, Maestro, or Kit needs a change, post a concise request in the shared chat log:

```text
C:\wamp64\www\pbb\chat_log.md
```

Include:

- observed behavior
- expected behavior
- affected endpoint, component, file, or contract when known
- trace id, log excerpt, screenshot, or command output when useful
- what Support needs from that team

If the request is long, create a document in the appropriate repo and post a short chat message linking to the document path.

## Vendored Dependencies

Support vendors runtime packages from other PBB apps and Helper.

Before refreshing vendored dependencies:

- confirm the owning team has committed and pushed the intended source
- confirm any bundle/cache revision has been bumped when relevant
- record the source commit in the task handoff
- run Support verification after the refresh

Do not consume uncommitted cross-team work unless the user explicitly approves temporary local testing.

## Support Strategy Work

For Support Strategy tasks, use:

```text
docs/PBB_Support_Strategy_Column_Improvement_Proposal.md
docs/support-strategy-phase-1-implementation-brief.md
```

Phase 1 boundaries:

- `GET /api/sitreps/current` remains independent.
- Strategy generation belongs in `GET /api/sitreps/current/support`.
- Strategy is backend-derived from structured SITREP payload, not rendered HTML.
- No Relay sends.
- No real resource dispatch.
- No invented resource availability.
- Every recommendation needs evidence references or a visible `Based on` section.

## Verification

Use the PHP 8.2 binary explicitly:

```powershell
& 'C:\wamp64\bin\php\php8.2.29\php.exe' artisan test
```

For frontend changes:

```powershell
npm run build
```

For targeted backend changes, run focused tests first, then the full suite before handoff when practical.

For UI work, perform a browser/manual smoke check when the browser is available:

- dashboard loads
- SITREP tabs work
- map renders and resizes
- source rail works
- new UI state has loading, empty, error, and loaded behavior

If browser verification is not available, say so in the handoff.

## Committing And Pushing

When git is available, approved work should not be left only in a local working tree.

Expected finish state:

```text
working tree clean
branch pushed
PR opened or merged when approved
```

Use focused commits with messages that describe the behavior changed.

If git is not available in the Support checkout, the handoff must say:

```text
Git repository: unavailable in this checkout
```

## Bundle Handoff

Support bundle creation must come from the approved main checkout, not an unreviewed feature branch.

Create a fresh Support bundle from `main` when a merged change affects:

- runtime files
- frontend build output
- vendored assets
- config defaults
- release metadata
- install/update behavior

After creating a main-built bundle, inform Kit with:

```text
Bundle path:
Version:
Build id:
SHA256:
Main commit:
Release URL:
Tests run:
Notes for installer:
```

Feature branches and branch worktrees should not hand bundles to Kit directly.

## Stale Work

Do not merge or continue old work blindly when it is far behind the current state.

For stale work:

- inspect the intent
- check whether the feature is still wanted
- close or archive if superseded
- recreate useful parts from current main if needed

## Agent Handoff

Each agent should end with this handoff block:

```text
Task:
Branch:
Commit:
Pushed:
PR:
Git repository:
Tests run:
Browser/manual verification:
Bundle created: yes/no
Kit informed: yes/no
Cross-team messages: yes/no
Known risks:
Follow-ups:
```

If a field does not apply, write `n/a` instead of omitting it.
