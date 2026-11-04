# w211: the admission deadline covers the whole preparation, and every phase and native observation is marked (measurement gap of the Windows runs)

Evidence: two measurements of a normal dispatch on native Windows, installed 19c, empty registry (2026-11-04, `gf-probe-7` and `gf-probe-8`). Both ended with `hook_cancelled`, `PreToolUse:Agent`, `durationMs` about 330 100 (the 330 s timeout) and the dispatch running unguarded. The other three Agent hooks needed under 8 s each. The trace has no line for `guard-dispatch` because the process is ended by the host before its exit writer runs. Details: `specs/sprint-alfred-epic/plans/windows-authority-latency-plan-2026-11-04.md`, sections 2e and 2f.

## Change

- `hooks/guard-dispatch.mjs`: the admission deadline starts at the process start (`performance.timeOrigin`), so loading the modules counts; before, it started after the hoisted imports. Marks `hook-entry`, `dispatch-checks-done`, `prepare-attempt`, `prepare-done`.
- `lib/native-goldfish-host-state.mjs`: the deadline is set around the WHOLE preparation (`prepareNativeGoldfishHostState`), not only around the registry publish; an overrun before the publish becomes the same typed `GUARD-DISPATCH-SLOW` result and the queue row it wrote is restored. New phase marks: `prepare-start`, `queue-resolve`, `integration-readiness`, `candidate-git`, `agy-baseline`, `publish-start`, `repository-inspect`, `registry-migrate`, `registry-init`, `owner`, `prescan`, `lock-wait`, `lock-held` (the old `integrated-slice-read` to `reserve` remain).
- `lib/admission-progress.mjs` (new): `admissionProgress(phase)` calls a writer registered on a well-known global; without the trace nothing is registered and the call does nothing.
- `lib/authority-trace-hook.mjs`: with `PIPELINE_AUTHORITY_TRACE=1` it registers that writer; each mark appends one `pipeline.hook-authority-progress.v1` line (hook, pid, phase, epoch ms, process ms, native observation count and ms) to the trace file at once, so a hook the host ends leaves the phases it reached.
- `lib/windows-owned-authority-backend.mjs`: each native observation also appends `native:<operation>:<ms>ms:<file:line><file:line>`, the two nearest callers outside the native modules (file name and line only, no path, no input). The stack is only read when the writer exists.
- `lib/guard-maintenance-window.mjs`, `docs/guard-maintenance-window-threat-model.md`: `admission-deadline.mjs` (w209) and `admission-progress.mjs` join the never-liftable kernel list and its prose. The kernel closure test (GMWKC01) fails without them; the w209 module was missing there, which the 19d rehearsal does not run.

## Tests

- `native-goldfish-host-state.test.mjs`: D177 (stubbed clock: the first mark is read at clock 0, the second names the overrun; a stale real-clock deadline refuses at the first mark; the registry loop check on its own), `D177-trace-progress-native-observation-sites`, `D177-trace-progress-survives-a-killed-hook` (a child process killed after two marks leaves both lines and no exit line; with the trace off nothing is written).
- `authority-trace-preload.test.mjs` APT8 restated: still exactly one exit trace line per hook; guard-dispatch also leaves its `hook-entry` progress line.

## Result in the work clone

native-goldfish-host-state D177 cases 7/7; trace preload 9/9; kernel closure and the other kernel-list suites 30/30 and 1/1; guard-dispatch 83/83. The whole native-goldfish-host-state suite was not rerun in the clone (a first run was disturbed by a parallel run, the second was stopped on purpose); it is part of the Full Verify on the main tree after the apply.

## What it is for

It does not make the admission faster. The next Windows run of a normal dispatch on this build either refuses with `GUARD-DISPATCH-SLOW` before the host ends the hook, or leaves the phase marks up to the point where the process died. Directions 1 and 3 of the latency plan are decided on those lines.

## Open

Independent Critic review (authority path), after the greenfield proof.
