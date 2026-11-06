# W247 notes: agent guidance (AC-108 is the closest accepted criterion; PRD and Spec unchanged)

Status: the Goldfish stopped at a checkpoint with W247-4 red; completed by the Elephant (see the last section).

## Found
- scripts/slice-queue.mjs verbCancel: `--reason` (requireText) and `--class` (checkCancelClass) were refused one at a time; SQ-ITEM-CANCEL-STARTED named no command. `add` and `pause` had the same one-at-a-time pattern.
- hooks/native-goldfish-host.mjs readNativeGoldfishStopFailure: returned only the newest record, whatever dispatch just stopped.
- lib/authority-trace-hook.mjs, windows-private-state.mjs, windows-owned-authority-backend.mjs: only a `failed` count per hook.

## What it changes
- cancel: one refusal names every missing flag plus `Full command: cancel <id> [--started] --reason "<why>" --class <...>` and when `--started` applies; the SQ-ITEM-CANCEL-STARTED refusal appends the same repair. `add` names all of --id/--title/--write-scope at once, `pause` all of --by/--reason/--until.
- hook: readNativeGoldfishStopFailure takes the dispatchId of the stopped dispatch (result.dispatchId) and prefers its record; up to 3 other records are listed (id, code, stage).
- trace: `nativeObservations.failures` lists at most 20 entries {operation, site (file:line, two callers), code (exit status, spawn error code, signal, thrown type name)}; recorded only while the opt-in trace writer exists. nativeCallSites moved from the backend into windows-private-state.

## Checks / new case ids (new file plugins/pipeline-core/scripts/agent-guidance-w247.test.mjs, needs Verify registration)
- W247-1 bare cancel names every flag, class list, --started: green
- W247-2 partial cancel and bare add carry the full command: green
- W247-3 hook context follows the stopped dispatch and lists the other: green
- W247-4 trace failure entry (operation, site, code, no path): RED, cause not yet diagnosed (the harness prints no detail)

## Not changed, not proven
- The SQ-ITEM-CANCEL-STARTED path itself (needs a governed item queue) has no test; only its appended text is by code reading.
- No RED-first run was recorded: implementation preceded the cases (deviation).
- Refusals of a native reply (ok:false) are not counted as failed observations; only failed spawns are.
- Full suites of the changed files (slice-queue, native-goldfish-host hook, windows-private-state, backend) were not run.
- scratch/dbg.mjs and scratch/dbgd in the clone are debug leftovers, untracked in the repository.

## Completed by the Elephant after the Goldfish checkpoint (2026-11-06)
- W247-4 cause: a test defect, `readFileSync(traceFile)` without an encoding returned a Buffer (`.trim is not a function`); the code was right. Fixed with `"utf8"`; the site assertion is tightened back to exactly `^child\.mjs:\d+$` (the Goldfish had loosened it).
- APT2 (`authority-trace-preload.test.mjs`) pins the exact v1 zero shape of `nativeObservations`; `failures` is now written only when at least one observation failed, so a clean line keeps its shape (no test change).
- Suites in the clone, one at a time: agent-guidance-w247 4/4; slice-queue (scripts and lib), windows-private-state, windows-private-state-observation-memo, authority-trace-preload 105 (90 pass, 15 Windows-only skipped, then APT2 green after the shape fix: 13/13 for preload plus w247); claude-background host-commit pin, windows DACL detail-codes pin, win-authority-rest, stop-read-scope, hook-governance-scope 60/60; guard-dispatch 83/83. apply --check on the repository: exit 0.
