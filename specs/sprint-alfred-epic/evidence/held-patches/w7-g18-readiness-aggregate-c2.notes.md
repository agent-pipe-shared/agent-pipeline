# W7-G18 Slice A, second attempt: aggregate dispatch readiness (verified)

Candidate: 698864f7885794f9c2cad668a5672af08d0116dd. Patch: `w7-g18-readiness-aggregate-c2.patch` (git diff --binary of the clone against the candidate, written from Node; 5841 bytes, 2 files, 86 insertions). It carries the first attempt's committed patch unchanged; nothing was rewritten.

## Cause
No single readiness view lists every dispatch blocker with a recovery action (recon gap 1).

## Changed lines
- New `plugins/pipeline-core/lib/dispatch-readiness.mjs` (32 lines): `assessDispatchReadiness({probes})` returns `{schema:"pipeline.dispatch-readiness.v1", status, blockers:[{area,code,nextAction}]}`.
- `native-goldfish-host-state.test.mjs`: 54 lines, cases NGHS40 (DR1), NGHS41 (DR2), NGHS42 (DR3), NGHS43 (DR4) appended after NGHS39 via dynamic import.
- No existing case changed.

## RED (clean: module renamed aside in the clone, whole file)
Log: scratch/agent-out/w7vv/red.native-goldfish-host-state.test.mjs.log. tests 48, pass 44, fail 4. Failing: NGHS40, NGHS41, NGHS42, NGHS43 (ERR_MODULE_NOT_FOUND for dispatch-readiness.mjs). Nothing else new failed.

## GREEN (module restored, whole file, clone)
Log: green.native-goldfish-host-state.test.mjs.log. tests 48, pass 48, fail 0. NGHS40-43 each printed a pass line.

## Baseline vs patched failing-name sets
Baseline (clone2, unchanged candidate, log base.native-goldfish-host-state.test.mjs.log): tests 44, pass 44, fail 0. Failing-name set is empty. Patched clone: empty. Identical; no pre-existing failure.

## Contract re-verification (recon Slice A)
Checked against the module text: schema string and result shape hold; all failing probes are listed in input order (forEach and push); a probe without a non-empty nextAction (missing or whitespace) gives DR-NEXT-ACTION-MISSING (NGHS41); a throwing probe gives DR-PROBE-THREW and later probes still run, never an exception (NGHS42); status is ready only when blockers is empty (NGHS43). No gap found, so no extra case was added. The module also emits DR-PROBE-MALFORMED for a non-object probe result: an extra beyond the contract, not a contradiction. Recon lines re-checked: preflight `windowsAuthorityPlatform === "win32"` block at line 1740; `assessWindowsAuthorityReadiness` at windows-authority-readiness.mjs:50. Not re-read: critic-dispatch-preflight lines (the cited script path does not exist at repo-root scripts/).

## Apply check
`git apply --check` of the patch in clone2 at the candidate: exit 0.

## NOT done
- Not wired into preflight (needs `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`, outside scope). Insertion point: after the `windowsAuthorityPlatform === "win32"` block (starts line 1740; about 1736-1767), composing its causes as one probe next to the other readiness probes before status/nextAction are chosen (about 1765-1852).
- Slice B (critic admission repairs) untouched.
- Full Verify not run (parent-owned).

## Proposed commit message
`feat(readiness): aggregate every dispatch blocker with its recovery action`

## Operator flow
`git apply` the patch, `git add -u` with a path limit for the test file plus `git add --` the new lib file, commit with `--no-verify` per the host flow, stamp, install.

## Protected-path classification
Neither changed file matches TP-1..TP-13 (templates/prompts/agent-obligations.md section 2).

## Review
Targeted delivery: green. An independent Critic review stays a parent-owned batch gate; batch review and PO acceptance are pending.

## Cleanup
Both clones removed by driver cleanup (driver itself remains in untracked scratch).
