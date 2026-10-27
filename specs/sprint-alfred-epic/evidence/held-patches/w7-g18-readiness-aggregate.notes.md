# W7-G18 Slice A: aggregate dispatch readiness (INTERIM, budget checkpoint reached)

State: patch written, NOT verified. Nothing was run to completion. No RED, GREEN, baseline or apply-check result exists.

## Cause
No single readiness view lists every dispatch blocker with a recovery action (recon gap 1).

## Changed lines (patch: w7-g18-readiness-aggregate.patch, 86 insertions, 2 files)
- New `plugins/pipeline-core/lib/dispatch-readiness.mjs` (32 lines): `assessDispatchReadiness({probes})`, probes are `{area, observe()}`; observe returns `{ok:true}` or `{code,nextAction}`. Result `{schema:"pipeline.dispatch-readiness.v1", status, blockers:[{area,code,nextAction}]}`. A throwing probe gives `DR-PROBE-THREW`; a failing probe without a non-empty nextAction gives `DR-NEXT-ACTION-MISSING`; a non-object result gives `DR-PROBE-MALFORMED`.
- `native-goldfish-host-state.test.mjs`: cases NGHS40 (DR1), NGHS41 (DR2), NGHS42 (DR3), NGHS43 (DR4) appended after NGHS39 (existing ids end at NGHS39, so ascending order holds). They use a dynamic `await import("./dispatch-readiness.mjs")` so the rest of the file still loads without the module.

## Run state (honest)
- RED run (whole test file in the clone, background) was started BEFORE the module was written and had not finished at the checkpoint. I then wrote the module while it ran, so that RED run is potentially contaminated (a dynamic import may have found the module). Treat RED as NOT established; redo it by moving the module aside.
- GREEN, clone2 baseline whole-file run, failing-name comparison, `driver check` (git apply --check in clone2): NOT run.

## Recon re-verification
Cited lines hold: `pipeline-start-preflight.mjs` import at line 39, injected `assessWindowsAuthorityReadinessFn` at 1129, win32 block at 1740-1743; `RUNNERS` at `native-goldfish-host-state.mjs:44`; `criticCourseRepair`/`REPAIRS` at `critic-course-admission.mjs:38-45`. No contradiction found. Not re-checked: `windows-authority-readiness.mjs:50-123`, `critic-dispatch-preflight.mjs:369-376`.

## Not done
- Not wired into preflight (needs `pipeline-start-preflight.mjs`, outside scope). Insertion point: after the `windowsAuthorityPlatform === "win32"` block (about lines 1736-1767), composing its causes as one probe next to the other readiness probes before status/nextAction are chosen (about 1765-1852).
- Slice B (critic admission repairs) untouched.

## Proposed commit message
`feat(readiness): aggregate every dispatch blocker with its recovery action`

## Operator flow
Apply the diff (`git apply`), `git add -u` with a path limit plus the new lib file, commit with `--no-verify` per host flow, stamp, install. Complete the missing runs first (RED with module moved aside, GREEN, whole file in clone and clone2, apply-check in clone2).

## Protected-path classification
Neither changed file matches a TP-1..TP-13 pattern in `templates/prompts/agent-obligations.md` section 2.

## Review
An independent Critic review stays a parent-owned batch gate.

## Cleanup
Clones `scratch/agent-out/w7y/clone` and `clone2` and the driver were left in place (scratch, untracked) for the continuation; driver `cleanup` mode removes the clones.
