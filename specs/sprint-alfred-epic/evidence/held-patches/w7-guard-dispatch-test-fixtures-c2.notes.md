# W7-GUARD-DISPATCH-TEST-FIXTURES-C2-C1: GD14 fixed, group C stopped

Patch: `w7-guard-dispatch-test-fixtures-c2.patch` (git diff --binary of the clone against candidate 9ce0f797e, ONE file `plugins/pipeline-core/hooks/guard-dispatch.test.mjs`, +27/-11, INCLUDES the c1 patch). Apply check in clone2 at the candidate: exit 0. The committed c1 files are untouched.

## Measured (whole file, logs scratch/agent-out/w7gg/{base,red,green}.log, untracked)
- Baseline (clone2, candidate unchanged): 75 tests, 53 pass, 22 fail.
- RED (candidate + c1): 75 tests, 59 pass, 16 fail. Failing positional ids: GD14 GD22 GD27 GD34 GD36 GD38 GD39 GD43 GD58 GD59 GD60 GD61 GD62 GD63 GD64 GD65.
- GREEN (candidate + c1 + c2): 75 tests, 60 pass, 15 fail. Failing: GD22 GD27 GD34 GD36 GD38 GD39 GD43 GD58 GD59 GD60 GD61 GD62 GD63 GD64 GD65. Only GD14 changed (red to green); no new red.
- All 15 remaining reds also fail on the unchanged baseline (they are a subset of its 22).

## Change (test-only)
GD14 (label GD2j, Workflow batch of two Explore): the c1 patch renamed it to "block" but left the final argument `ALLOW`, contradicting its own name. Now `BLOCK` with `stderrIncludes: ["DISPATCH-WRITE-CARRIER-REQUIRED"]`; QG-04 comment in the file. Justification: a Workflow agent() Explore has transport `workflow`, and `writeCapableCarrierAdmission` (hooks/guard-dispatch.mjs line 242) admits Explore only over the direct transport; the direct-call Explore stays ALLOW in GD2i, which keeps the "Explore is read-only and admitted" property. Went green with the carrier code asserted.

## Group C: NOT fixed, stopped by design (no smallest honest test-only route)
Cause: `generatedBriefingAdmission(..., { requireGenerated: true })` (lib/dispatch-briefing-build.mjs line 213-227, called at hooks/guard-dispatch.mjs line 911) runs for every productive Goldfish dispatch before the incomplete-briefing check and before the native candidate check. A prompt either carries no generator marker (DBG-GENERATED-BRIEFING-REQUIRED) or carries one and then must hold a valid `itemDelivery` binding (DBG-GENERATED-BINDING-REQUIRED).
- GD22 (GD4, incomplete briefing expects DISPATCH-INCOMPLETE-BRIEFING) and GD27 (GD9, hand-filled real template is dispatchable): the property is unreachable through the guard; a genuinely generated briefing cannot be incomplete, and a hand-filled template is by design refused. Any fix is either a hand-forged marker (the marker is only `sha256(body)`, `GENERATOR_MARKER_PREFIX` plus digest, so it can be stamped from a test) which bypasses the very admission, or a different test at lib level. Not done: bypassing would weaken what the check proves. Guard-owner decision: where does the incomplete-briefing check belong relative to the generated-briefing gate?
- GD58 to GD65 (marked item-governed Claude dispatches expecting NGHS-*): need a real generated v3 briefing with `itemDelivery` (criterionLocator, sha256-bound spec excerpt) that also matches a slice queue row in the item fixture repo, so that `prepareGovernedItemQueue` and the native preparation reach NGHS-CANDIDATE-MISMATCH. That is a generator package plus a spec file with criteria in the fixture repo, plus rebuilding per HEAD: well over the 110-line cap, and the NOT item-governed variants (GD60, GD62, GD64 half) would change meaning under an itemDelivery binding. Smallest fix proposal for a follow-up: one helper `generatedMarkedPrompt(root)` that writes spec + package in the fixture repo and runs `scripts/dispatch-briefing.mjs build` via spawnSync, used by `markedGoldfishDispatch`; then re-measure which NGHS code each case reaches.
- Group B (GD34, GD36, GD38, GD39, GD43): untouched, awaiting the guard-owner decision.

## Not done
Group C and B; clone cleanup is performed last by the driver; Critic review is a parent-owned batch gate; Full Verify parent-owned.

## Proposed commit message
test(guard-dispatch): align the carrier and guard copy fixtures with the write-carrier policy and the Workflow batch expectation

(The briefing's proposed subject, "build the governed Goldfish fixtures through the briefing generator", would be inaccurate: no generator-built fixture is delivered.)

## Operator flow
Apply the diff, `git add -u -- plugins/pipeline-core/hooks/guard-dispatch.test.mjs`, commit with --no-verify, stamp, install. Observed: the test file matches none of TP-1..TP-13 (not protected). Do not apply c1 separately if c1 is already committed: this patch was made against the candidate (c1 not committed) and includes c1; if c1 is already in the tree, regenerate or apply only the GD14 hunk.
