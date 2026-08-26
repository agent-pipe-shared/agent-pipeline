---
schema: pipeline.backlog-item.v1
id: pipeline.readonly-and-chain-grep-pipe-trailing-stage-not-implemented
type: requirement
owner: pipeline
status: closed
created: 2026-08-19
closed_at: "2026-08-23"
closure_repository: "self"
closure_evidence: "plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs"
source: "Critic round-1 review (Finding 3) of commit b3153385, PHX-WP-READONLY-GRAMMAR-WIDEN. Split out as follow-up work rather than crammed into the same rework that fixed Finding 1 (blocker, security regression) and Finding 2 (vacuous test)."
---

## Closed — 2026-08-23

Implemented in `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`:
`splitTopLevelAndChain` now permits `|` to be evaluated per-segment by
`isBoundedReadOnlyAndChain`, which checks non-trailing segments against
`isChainEligibleSegment` and admits a trailing segment that matches
`isBoundedGrepPipeline`. Verified with unit test fixtures in
`plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`.

# `&&`-chain grammar does not admit a trailing bounded grep-pipe stage, though the PO accepted this as in-scope

## Description

`backlog/items/2026-08-19-closed-shell-grammar-still-rejects-common-readonly-composition.md`'s
Proposal point 1 names, as part of the accepted allowlist for `&&`-chained
read-only commands: "...and the existing grep-to-grep/grep-to-head pipeline
shape as a trailing stage." `splitTopLevelAndChain()`
(`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`) aborts the entire
chain parse the moment it meets a `|` at the top level, so a chain like
`git rev-parse HEAD && grep -rl pattern backlog/items/ | head -5` is refused
end-to-end — the trailing bounded-grep-pipe shape (already admitted as a
standalone two-segment pipeline via `isBoundedGrepPipeline`) cannot compose
with a preceding `&&`-chain.

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (`splitTopLevelAndChain`,
`isBoundedReadOnlyAndChain`, `isBoundedGrepPipeline`) and its test file.

## Proposal

Extend `isBoundedReadOnlyAndChain` (or a sibling function) to admit a chain
whose FINAL segment is itself a bounded grep-to-grep/grep-to-head pipeline
(reuse `isBoundedGrepPipeline`'s existing validation for that trailing
segment specifically, rather than duplicating its logic), while every
preceding segment still goes through the existing `isChainEligibleSegment`
check and no OTHER position in the chain may contain a `|`. Add closed
fixtures proving: the admitted combined shape passes; a `|` in a
non-trailing position still fails closed; a trailing pipe using anything
other than the exact bounded grep-to-grep/grep-to-head shape still fails
closed.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted and implemented per Proposal.
- **Rationale:** Completes the trailing grep-to-grep/grep-to-head pipeline admission in `&&`-chains while preserving fail-closed rejection of non-trailing pipes and arbitrary commands.
- **Assignment (if accepted):** `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` and `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`.
- **Date:** 2026-08-23
