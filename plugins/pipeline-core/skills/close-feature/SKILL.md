---
name: close-feature
description: "Feature-lifecycle close: ends the CURRENT activeFeature in .claude/pipeline-state.json via the sanctioned pipeline-state.mjs writer (close-feature subcommand) -- appends an audit entry to closedFeatures, clears activeFeature/planApproval/planRevocation, sets planApproved=false, silences the stop-suggest nudge. Invoke when a feature's work is done and its plan/phase tracking should stop, independent of any session boundary."
argument-hint: "<name performing the close>"
allowed-tools: Bash(node harness/scripts/usage-ledger.mjs:*), Bash(node harness/scripts/pipeline-state.mjs:*)
---

# close-feature — end a feature's lifecycle tracking

Closes the feature currently tracked in `.claude/pipeline-state.json` (`activeFeature`). This is a
**feature-lifecycle** action, not a session ritual -- **not the same thing as `close-block`**:
`close-block` closes a session/work-block (handover, HISTORY, retro, telemetry, commit) and can run
many times over a feature's life; `close-feature` runs ONCE, when the feature itself is done, and
does none of close-block's session-ritual steps. A block close does not imply a feature close, and
vice versa -- run both when both boundaries actually coincide.

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

```
node harness/scripts/pipeline-state.mjs close-feature --by "<name>"
```

This is the ONLY sanctioned writer for this transition (see the header doc in
`harness/scripts/pipeline-state.mjs` for the full contract). No `activeFeature` present -> the CLI
refuses (error, exit 2, nothing written) -- report that back rather than working around it.
A `git rev-parse HEAD` failure during this step is NOT fatal (deliberate deviation from
`approve-push`, documented in that file's header): the close still completes with `forCommit: null`.

## Step 3 — Record the close in the handover/state records

Note in the project's handover file (or equivalent state record): which feature closed, by whom,
`forCommit` (or "—" if git resolution failed), and the close timestamp -- all of which the CLI's
stdout confirmation already gives you verbatim.

## Explicitly out of scope

**No feature-wide cost aggregation.** Step 1 only appends the CURRENT session's usage row (exactly
what `close-block` already does per session/block) -- it does NOT sum tokens/cost across every
session a feature ever touched. A feature-wide cost rollup is a separate, not-yet-built capability;
do not claim or imply a total here that this skill does not compute.
