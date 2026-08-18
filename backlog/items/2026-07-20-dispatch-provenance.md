---
schema: "pipeline.backlog-item.v1"
id: "pipeline.dispatch-provenance"
type: "workflow-improvement"
owner: "pipeline"
status: "closed"
created: "2026-07-20"
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "e7d729042a1dfdf6439c74959b143eade6d7870c"
closure_evidence: "plugins/pipeline-core/scripts/dispatch-authorship-verify.test.mjs"
source: "Public V3 Foundation stabilization close authorship check: delivered Goldfish work packages lacked required public Dispatch trailers"
due: "2026-07-27"
expires: "2026-08-03"
---

# Preserve dispatch provenance for delivered work packages

## Description

The delivery record is incomplete when a work package is implemented through a
dispatched role but the resulting public commit omits the required Dispatch
trailer. Attribution may remain known in the active session, yet it is no longer
auditable from the durable public history alone.

## Triggering situation

The Public V3 Foundation stabilization close on 2026-07-20 found implementation
commits attributable to dispatched Goldfish work packages without their required
public Dispatch trailers.

## Affected artifact

The Goldfish delivery template, commit handoff procedure, and close authorship
check.

## Proposal

Require the dispatch record identifier to be part of the Goldfish commit handoff
before the coordinator commits or accepts a delivery. The close authorship check
should fail with a precise, public-safe remediation when a production diff lacks
both the dispatch record mapping and the matching `Dispatch:` trailer.

## Ownership and expiry

The next Pipeline Elephant owns triage and an accepted implementation package.
The triage due date is **2026-07-27**. If no decision is recorded by
**2026-08-03**, this item expires and must be renewed with current evidence
rather than silently retained as an active commitment.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Renewal (2026-08-18):** expired 2026-08-03, never triaged — found
  during a systematic sweep for the same expired-unread-item pattern
  caught repeatedly tonight. Renewed with current evidence.
- **Decision:** accepted, closed. `dispatch-authorship-verify.mjs` and its
  test suite already implement and extensively enforce this item's
  Proposal — a precise, typed FAIL when a production diff lacks both the
  dispatch-record mapping and the matching `Dispatch:` trailer — and were
  observed in active, load-bearing use throughout tonight's own dispatch
  closures. A dedicated Critic review (`a31d506f..e7d72904`, scoped to the
  most recent substantive commit `e7d72904`/NVA-BL-78 per its guardrail
  selection, disclosed explicitly given the literal diff range's much
  larger unrelated bundle) returned **PASS, no findings** — independently
  re-ran both touched suites (`agent-model-registry.test.mjs` 13/13,
  `dispatch-authorship-verify.test.mjs` 31/31) and traced the
  path-traversal guard and model/effort-mismatch detection logic by hand.
- **Rationale:** the mechanism was already built, tested, and in
  continuous active use — what was missing was purely the triage/closure
  step, the same shape as several other items closed this session.
- **Assignment:** closed, no further work.
- **Date:** 2026-08-18
