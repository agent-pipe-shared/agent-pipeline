---
schema: pipeline.review-spec.v1
id: pipeline.role-dispatch-payload-errors-fail-before-model-launch
source: backlog/items/2026-09-10-role-dispatch-payload-errors-fail-before-model-launch.md
---

# Native Antigravity dispatch coordinator review specification

## Problem

Malformed, incomplete, stale, or expired role dispatches can reach an expensive
launcher before the packet is proven usable. A failed launch can consume many
minutes and hide the coordinator defect that should have been reported before
any model call.

## Required behavior

- The user starts the Antigravity CLI. The active Antigravity parent prepares
  the complete native subagent batch and directly calls its native
  `invoke_subagent` tool. Codex does not spawn Antigravity and the coordinator
  does not recursively launch another Antigravity CLI.
- The coordinator validates the whole subagent array, role identity, exact
  candidate commit and tree, required candidate paths, result contract, and
  authorization before the first native tool call.
- Invalid input returns a bounded structured diagnostic with zero launcher and
  model calls. All packets reach `PREPARE` success or failure before the first
  `START`.
- A valid authorization remains single-use and cannot be replaced while it is
  outstanding. An expired or candidate-stale authorization may be replaced
  only after its own shape, self-digest, repository binding, and array binding
  authenticate; forged artifacts remain blocking.
- Preparation has one shared deadline across all Git probes and completes in
  less than five seconds on the local supported path.
- Immediately before the native call, the coordinator rechecks the exact
  prepared candidate and packet so that a changed input cannot inherit the
  earlier authorization.
- Focused tests prove the zero-call invalid paths, stale/expired replacement
  boundary, valid unchanged invocation, and the five-second bound.

<!-- pipeline.backlog-item-strip-for-dispatch.v1: implementation, closure,
review and evidence prose intentionally omitted -->
