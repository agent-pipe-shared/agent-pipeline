# W7-DISPATCH-HOOK-AUTHORITY-TRACE-T1 -- notes (state: CHECKPOINT, patch installed with the work so far)

Candidate 190501f96a8214a775e3fc41d504c58a475ccacd. Patch: `w7-dispatch-hook-authority-trace-t1.patch` (7 paths, `git apply --check` exit 0 on the plain candidate in the baseline clone).

## Changed files (in the patch)

- `plugins/pipeline-core/lib/authority-trace-hook.mjs` (new, 71 lines): `installHookAuthorityTrace({ hook, pluginRootUrl })`. Does nothing and imports nothing unless `PIPELINE_AUTHORITY_TRACE` is exactly `1`. Idempotent per process via `Symbol.for("pipeline.authority-trace-hook.installed")`. Lazily imports the three counter modules by the same relative paths as the hooks. One `process.on("exit")` writer appends a `pipeline.hook-authority-trace.v1` line (preload fields plus `wallMs`) to `PIPELINE_AUTHORITY_TRACE_FILE`, else stderr as `AUTHORITY-TRACE <json>`. Never throws, never changes the exit code. Hook name defaults to `basename(argv[1])`.
- `plugins/pipeline-core/scripts/authority-trace-preload.mjs` (rewritten, 89 lines changed): thin wrapper calling the installer; keeps `PIPELINE_AUTHORITY_TRACE_PLUGIN_ROOT`; a lone copy with no reachable plugin still writes its line with `counters` all false (small inline fallback, needed to keep APT4 green).
- `plugins/pipeline-core/scripts/authority-trace-preload.test.mjs` (+70): cases APT5..APT9.
- Hooks (each gets one guarded line, `if (process.env.PIPELINE_AUTHORITY_TRACE === "1") await (await import("../lib/authority-trace-hook.mjs")).installHookAuthorityTrace();`, placed BEFORE the governance early `process.exit(0)` where one exists):
  - `hooks/guard-lifecycle-ready.mjs` (+3, before the "Repository admission" comment)
  - `hooks/guard-dispatch.mjs` (+3, before the `GOLDFISH_SHAPE_MARKERS` block, line ~100; its early exit is later at ~147)
  - `hooks/guard-dispatch-budget.mjs` (+2, before the "Repository admission" comment, line ~244)
  - `hooks/guard-worktree-isolation.mjs` (+2, the fourth plain-script hook on the Agent/Task matcher with the counter-relevant path; before its governance exit)

## Observations

- `guard-slicing.mjs` (matcher `Task|Agent|Workflow|TodoWrite`, plain script) was seen and NOT changed: it statically imports `guard-dispatch.mjs` and `guard-dispatch-budget.mjs`, so the installer runs in its process too and names it `guard-slicing.mjs` (default name = argv[1]). Same applies to any importer of those two modules.
- `guard-lifecycle-ready` is wired on Bash/PowerShell/Read/Grep/Glob (not Task/Agent): it fires on the dispatched subagent's own tool calls, not on the dispatch call. Observation, not a deviation.
- The briefing's "fourth hook" was ambiguous (slicing or worktree-count); worktree-isolation was chosen, slicing is covered through its imports.

## RED to GREEN

- RED (before any production edit), `authority-trace-preload.test.mjs`: 5 new cases APT5..APT9 fail, the 4 existing pass.
- GREEN (c1, with the first hook placement): preload suite 9 tests, 9 pass, 0 fail.
- Final-state rerun (label c2, after moving the call above the early exits in guard-dispatch-budget and guard-dispatch): preload suite 9/9 pass; guard-dispatch 81/81; guard-dispatch-budget 127 tests, 125 pass, 0 fail (2 skipped); guard-dispatch-budget-checkpoint 17/17; guard-slicing 53/53. guard-lifecycle-ready was not rerun after c1 (its file is unchanged since c1: 414 tests, 411 pass, 0 fail).
- Baseline (clone2, label base1, plain candidate): guard-dispatch 81/81; guard-dispatch-budget 127 tests, 125 pass, 0 fail (same 2 skipped); checkpoint 17/17. Failing-name sets are empty on both sides for these three. The baseline lifecycle-ready, slicing and preload runs had not finished when the report was written; the clone has no failing name there, so it cannot have one that the baseline lacks.
- Revert proof: with the three hook edits reverted to the candidate (driver) and guard-worktree-isolation.mjs reverted by hand, the preload test file fails exactly `APT8` (hook cases); APT5-APT7 and APT9 (installer only) stay green as expected. Hooks restored byte-equal (driver `restored byte-equal: true`; worktree hook restored by the exact inverse edit, patch regenerated afterwards is byte-identical, 20951 bytes, apply-check exit 0).
- c1 hook suites (clone, before the placement move in budget/dispatch): guard-dispatch 81/81 pass; guard-dispatch-budget 127 tests, 125 pass, 0 fail (2 skipped); guard-dispatch-budget-checkpoint 17/17; guard-lifecycle-ready 414 tests, 411 pass, 0 fail (final state for that hook); guard-slicing 53/53.

## NOT verified

- A real Windows measurement and the hook line count of a real dispatch. Hook ordering in a governed consumer.
- Baseline lifecycle-ready, slicing and preload runs in the plain clone (unfinished at write time; see above).
- Integrated Verify, batch Critic and PO acceptance remain parent-owned and pending.
- The installed patch already contains the final placement (regenerated after the revert proof, byte-identical).

## How the PO uses it after the install

PowerShell, no NODE_OPTIONS and no plugin-root override:

1. `$env:PIPELINE_AUTHORITY_TRACE = '1'`
2. `$env:PIPELINE_AUTHORITY_TRACE_FILE = "$env:TEMP\hook-authority-trace.jsonl"`
3. Start the runner from this shell, run ONE Agent dispatch, then send the file. One JSON line per ended hook process (`hook`, `exitCode`, `processMs`, `wallMs`, `custodyInspections`, `nativeObservations`, `authorityMemo`).
