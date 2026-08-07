---
schema: pipeline.backlog-item.v1
id: pipeline.ruleset-freshness-wsl-subsystem-absent
type: defect
owner: pipeline
status: open
source: merge report section 4 finding 10 (specs/sprint-phoenix-epic/evidence/merge-0.5.2-what-fell-away.md gitignored evidence artifact); merge commit 75b8361
created: 2026-08-07
---

# The WSL host-authorized freshness/self-application-comparison subsystem is gone

## Description

The 0.5.2 merge (`75b8361`, local only) resolved
`plugins/pipeline-core/scripts/ruleset-freshness.mjs` to main's version.
Main took this file in an unrelated direction (introducing
`PIPELINE_UPDATE_AVAILABILITY_SCHEMA`), which does not carry forward
Phoenix's WSL host-authorized freshness/self-application-comparison
subsystem — the mechanism that compared this checkout's ruleset against the
public marketplace remote under the `host-authorized-wsl` execution
boundary.

## Triggering situation

Merge conflict resolution, code-conflict batch (28 files, origin/main taken
verbatim per PO's same-function policy).

## Affected artifact

`plugins/pipeline-core/scripts/ruleset-freshness.mjs`, and any bootstrap
step that previously depended on its WSL-specific freshness comparison
(session-bootstrap.md's freshness check, per CLAUDE.md's session bootstrap
step 2).

## Proposal

**Investigated (2026-08-07), not resolved.** Confirmed by direct execution:
`plugins/pipeline-core/scripts/ruleset-freshness-host.mjs` (Phoenix-only,
merged cleanly, never a conflict) fails to import — it depends on 8 named
exports from `ruleset-freshness.mjs` and `observeCodexRulesetSource` from
`codex-host-plugin-list.mjs`, none of which exist in main's versions. This
is an active, currently-broken import chain, not a hypothetical gap.

A straightforward re-port is blocked by two concrete problems, not just
effort:
1. **Name collision:** pre-merge `ruleset-freshness.mjs` exports
   `inspectRulesetFreshness` with WSL-boundary-aware semantics
   `(repoPath, options)`; main's current `ruleset-freshness.mjs` already
   exports a symbol of the exact same name as a deprecated alias for
   `inspectPipelineUpdateAvailability` (line 382). Re-porting verbatim would
   silently clobber an existing compatibility export.
2. **Deeper coupling:** `ruleset-freshness-host.mjs` also imports
   `freshnessHostActionForPreflight` from `pipeline-start-preflight.mjs` —
   which doesn't exist on main either, and whose pre-merge equivalent folded
   ruleset-source verification into the bootstrap readiness gate's `status`
   decision itself (see companion item
   `2026-08-07-self-application-integrity-check-absent.md` for the full
   detail — the two items are one investigation, not two independent ones).

A third, independent finding: `harness/session-bootstrap.md:159` still
describes the WSL host-authorized network-boundary mechanism this subsystem
provided ("use the host-authorized network-open/read-only command boundary
directly") — but main's replacement (`inspectPipelineUpdateAvailability`)
does a direct `git ls-remote`/fetch with no host-boundary delegation at all.
That sentence in the actual bootstrap protocol doc may now describe a
mechanism that doesn't exist in the merged tree either way — worth checking
independently of whichever way this item resolves.

Open question for the PO: is the WSL host-authorized network-boundary
concept still wanted at all, given main's simpler direct-read approach
already works? If not, `ruleset-freshness-host.mjs`'s removal,
`harness/session-bootstrap.md:159`'s sentence, and
`docs/phoenix-governance-threat-model.md:61-70`'s "host receipt package"
rollback text all need to move together (that threat-model section defines
its own rollback protocol for exactly this file).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred — needs PO input (see companion item's Triage for
  the shared underlying question).
- **Rationale:** same as the companion item — this grew into a bootstrap-
  readiness-gate design question, not a contained repair.
- **Assignment (if accepted):** not yet assigned.
- **Date:** 2026-08-07
