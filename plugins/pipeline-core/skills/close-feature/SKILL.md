---
name: close-feature
description: "Feature-lifecycle close: ends the CURRENT activeFeature in .claude/pipeline-state.json via the sanctioned pipeline-state.mjs writer (close-feature subcommand) -- appends an audit entry to closedFeatures, clears activeFeature/planApproval/planRevocation, sets planApproved=false, silences the stop-suggest nudge. Invoke when a feature's work is done and its plan/phase tracking should stop, independent of any session boundary."
argument-hint: "<name performing the close>"
allowed-tools: Bash(node harness/scripts/usage-ledger.mjs:*), Bash(node harness/scripts/pipeline-state.mjs:*), Bash(node plugins/pipeline-core/scripts/close-coordinator.mjs:*)
---

# close-feature — end a feature's lifecycle tracking

H5 compatibility rule: inspect the unified close coordinator, plan the exact
digest-bound transition, obtain confirmation, then apply only that action with
`--activate`. The sanctioned State writer is an atomic sub-effect bound to the
canonical coordinator lifecycle and state digest. This path never implies push
or release.

Closes the feature currently tracked in `.claude/pipeline-state.json` (`activeFeature`). This is a
**feature-lifecycle** transition in the same coordinator. `close-block` requests
a resumable checkpoint or tracked-finalization transition and can run many
times over a feature's life; `close-feature` requests the one feature-completion
transition. A checkpoint does not imply feature completion.

Actor performing the close: `$ARGUMENTS` (name passed as `--by` below; required, non-blank).

## Step 1 — Append the current-session telemetry row (best-effort)

Same mechanism as `close-block` step 8 (see `plugins/pipeline-core/skills/close-block/SKILL.md`
for the full flag reference) -- this skill does not duplicate that logic, it reuses the existing
ledger CLI:

```
node harness/scripts/usage-ledger.mjs "$HOME/.claude/projects" --latest --row "<feature-id>"
```

(Windows: `"%USERPROFILE%\.claude\projects"`.) Append the printed row to the project's
`telemetry/costs.md`. If that file does not exist yet, note that explicitly and SKIP this step --
do not fail the close over a missing telemetry file. This is per-SESSION cost data only; it is NOT
a feature-wide cost total (see "Explicitly out of scope" below).

## Step 2 — Close the feature

First plan and apply `feature-close-prepared` through the coordinator. When
Continuity is active, the planner requires the exact repo-relative
`--continuity-close-request` and binds its bytes, Result and close evidence.
The confirmed coordinator apply returns the only admissible State-writer
action. Execute that returned argv exactly after its separate confirmation;
do not reconstruct it from this prose.

The returned action has this shape (the Continuity flag is mandatory whenever
it is present in the returned argv):

```
node harness/scripts/pipeline-state.mjs close-feature --by "<name>" \
  --coordinator-lifecycle "<lifecycle-id>" \
  --coordinator-sha256 "<exact-state-sha256>" \
  --continuity-close-request "<exact-repo-relative-request>"
```

This is the ONLY sanctioned writer for this transition (see the header doc in
`harness/scripts/pipeline-state.mjs` for the full contract). No `activeFeature` present -> the CLI
refuses (error, exit 2, nothing written) -- report that back rather than working around it.
A `git rev-parse HEAD` failure during this step is NOT fatal (deliberate deviation from
`approve-push`, documented in that file's header): the close still completes with `forCommit: null`.

## Step 3 — Record the close in the handover/state records

The State sub-effect is not the terminal close. Complete Result, backlog,
handover, HISTORY, telemetry and retrospective bytes, then bind their exact
postimage with `tracked-close-finalized`. Only after the one final commit may
the coordinator freeze `candidate-frozen` and accept Verify/Security evidence.
Note in the project's handover file which feature closed, by whom, `forCommit`
(or "—" if Git resolution failed), and the close timestamp from the State
writer output.

Without separately authorized publication, confirmed descriptor-bound cleanup
may end at `closed-local`. Publication, readback, release and promotion are
separate coordinator transitions and are never implied by this skill.

## Explicitly out of scope

**No feature-wide cost aggregation.** Step 1 only appends the CURRENT session's usage row (exactly
what `close-block` already does per session/block) -- it does NOT sum tokens/cost across every
session a feature ever touched. A feature-wide cost rollup is a separate, not-yet-built capability;
do not claim or imply a total here that this skill does not compute.
