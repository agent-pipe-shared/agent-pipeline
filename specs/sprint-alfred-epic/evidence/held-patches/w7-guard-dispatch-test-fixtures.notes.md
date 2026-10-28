# W7-GUARD-DISPATCH-TEST-FIXTURES-C1: guard-dispatch test fixtures (groups D and A)

Patch: `w7-guard-dispatch-test-fixtures.patch` (git diff --binary at candidate 771ab3cae, one file: `plugins/pipeline-core/hooks/guard-dispatch.test.mjs`, 25 insertions, 10 deletions). Apply check in clone2 at the candidate: exit 0.

## Baseline (clone, unchanged candidate)
22 reds (positional ids): GD12 GD13 GD14 GD22 GD23 GD27 GD33 GD34 GD36 GD38 GD39 GD41 GD42 GD43 GD58 GD59 GD60 GD61 GD62 GD63 GD64 GD65. Matches the recon.

## Changes (all test-only)
- Group D: `guardCopyWithHooks` gets a `scripts` symlink next to the `lib` symlink (guard resolves ../scripts/*.mjs relative to its own location). Targets GD59, GD61-GD65 (positional).
- Group A (QG-04 justification comments in the file, citing writeCapableCarrierAdmission and GD72/GD73, which pin Plan refused): GD2i Plan and general-purpose now BLOCK with DISPATCH-WRITE-CARRIER-REQUIRED (Explore direct stays ALLOW); GD2j Workflow batch of Explore now BLOCK (transport workflow, policy admits Explore only direct); GD5 fixture swapped to a direct Explore (keeps the "unrelated role is not this hook's business" property); GD15 Antigravity general-purpose BLOCK with the carrier code; GD15h Codex worker and GD15i omitted agent_type BLOCK with the carrier code.
- NEEDS POLICY OWNER: GD15h/GD15i (is refusing Codex worker / omitted type intended? read by the same policy, medium confidence). GD15 (Antigravity general-purpose) and GD2j are the same reading.

## Group C located, NOT fixed
DBG-GENERATED-BRIEFING-REQUIRED is returned at `lib/dispatch-briefing-build.mjs` line 227 (`generatedBriefingAdmission`), called with `requireGenerated: true` at `hooks/guard-dispatch.mjs` line 911 for every productive (Goldfish) dispatch, ahead of the incomplete-briefing and candidate-mismatch checks. GD22 (GD4), GD27 (GD9), GD58 and GD60 (positional) use hand-filled briefings, so they need generator-built briefings (package plus dispatch-briefing.mjs build), far beyond 20 lines: recorded, not changed.

## Group B untouched, still red
GD34 (GD15a), GD36 (GD15c), GD38 (GD15e), GD39 (GD15f), GD43 (GD15j): carrier check runs before packet-shape findings; ORDER versus fixture decision belongs to the guard owner.

## After-step failing sets
The patched full-file run (clone) and the unchanged clone2 baseline were started in the background but had not finished when the tool budget checkpoint arrived; their logs are scratch/agent-out/w7gf/patched.log and base2.log (untracked, may be absent after cleanup). Patched failing set is therefore NOT VERIFIED by this dispatch. Expected: GD22 GD27 GD34 GD36 GD38 GD39 GD43 GD58 GD60 (groups B, C and the C-dependent part of the D names) remain; the per-step D-only rerun was not done.

## Orchestrator addendum (2026-10-28, read from the logs after the hand-back)
Measured: baseline 75 tests, 53 pass, 22 fail; patched 75 tests, 59 pass, 16 fail. Fixed (6): positional GD12, GD13, GD23, GD33, GD41, GD42.
Still red (16): GD14 (the Workflow Explore batch check still gets exit 2 where the check's own helper expects 0, so the
changed expectation is incomplete: needs a second look at that check), GD22, GD27, GD58 to GD65 (all now fail on
DBG-GENERATED-BRIEFING-REQUIRED, so the group D scripts symlink works and exposes group C: 10 names need generator-built
briefings), GD34, GD36, GD38, GD39, GD43 (group B, guard-owner decision). The expected set in the paragraph above is therefore
optimistic: GD14 was expected fixed and is not. The patch is a strict improvement (6 more green, no new red) but NOT complete.

## Not done
Per-step reruns, patched-versus-baseline set comparison, clone cleanup, group B, group C, Critic review (parent-owned batch gate).

## Proposed commit message
test(guard-dispatch): align the carrier and guard copy fixtures with the write-carrier policy

## Operator flow
Apply the diff, `git add -u -- plugins/pipeline-core/hooks/guard-dispatch.test.mjs`, commit with --no-verify, stamp, install. The test file is not in TP-1..TP-13.
