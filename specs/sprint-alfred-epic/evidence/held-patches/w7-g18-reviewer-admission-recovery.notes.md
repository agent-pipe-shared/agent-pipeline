# W7 G18 slice B: reviewer-admission recovery (held patch, GREEN)

Candidate d9d9e1ef01c06a5459278a49d3a7761ee5a1ebbd. Nothing committed; the host commits.

## Cause

`criticCourseRepair` (`plugins/pipeline-core/lib/critic-course-admission.mjs`, former lines 38-46) held a repair for exactly three codes (CCA-DETERMINISTIC-UNAVAILABLE, CCA-REVIEW-UNIT-REQUIRED, CCA-MANIFEST-READ) and returned null for every other code. The recon claim was re-verified against the clone and holds.

## Code set

The module emits well over 40 distinct `CCA-*` codes (the test enumerates them with a regex over the module source, so a new code is covered automatically): gitBytes-literal codes (CCA-EVIDENCE-READ, CCA-RANGE-*, CCA-SOURCE-*, CCA-MANIFEST-READ), `unavailable()` codes (CCA-ALIAS-MAPPING-UNAVAILABLE, CCA-ALIAS-GENESIS-UNAVAILABLE, CCA-ALIAS-V1-GENESIS-UNAVAILABLE, CCA-DETERMINISTIC-UNAVAILABLE) and the default CCA-RUNTIME-READBACK. Codes arriving from the accepted-delivery reader (`value.code`) are not enumerable.

## Change (patch: 2 files, +40/-1)

- Module: the three existing strings unchanged (pinned by sha256 in the new case). New concrete runner-neutral repairs for CCA-DETERMINISTIC-FAILED, CCA-DETERMINISTIC-SELECTION, CCA-DELTA-REQUIRED, CCA-REQUESTED-MODE. Every other `CCA-*` code returns a frozen `{route:"none", decidedBy, reason}`; decidedBy is PO for CCA-REVIEW-BUDGET-EXHAUSTED, the acceptance codes, genesis codes and the alias genesis-unavailable codes, else Coordinator. Non-string or non-CCA input still returns null.
- Test: 3 cases appended before `registerTestCaseCompletion`: G18B (a) code set sanity, (b) every code non-null with string or well-formed no-route, (c) three existing texts pinned by sha256 plus null for non-CCA input.

## RED / GREEN

- RED (clone, unchanged module, whole file): exit 1, single failing name CCA039 G18B (b), actual null. (a) and (c) pass on the baseline (pins).
- GREEN (clone, patched): `node plugins/pipeline-core/lib/critic-course-admission.test.mjs` exit 0, tests 40, pass 40, fail 0 (CCA038-CCA040 are the new cases).
- Baseline (clone2, unpatched, same file): exit 0, tests 37, pass 37, fail 0. Failing-name sets: both empty, so identical; no pre-existing failure.
- Apply check: `git apply --check` of the patch in clone2 at the candidate: exit 0.

## Caller analysis

Only caller: `plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs` line 376: `...(repair === null ? {} : { repair })`. It spreads the value unchanged, so a no-route object does not break it; the preflight `repair` field becomes string-or-object. Not verified: whether any downstream consumer or test pins `repair` as a string (the multi-path search was refused by the shell grammar); the preflight file is outside the slice and untouched. Follow-up (out of scope): `scripts/codex-native-critic-preflight.mjs` (no test beside it) still returns `unavailable` with no recovery field.

## Not done

The cleanup of the two scratch clones under `scratch/agent-out/w7z/` (untracked, ignored). Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.

## Proposed commit message

feat(critic): name a recovery or an explicit no-route for every reviewer-admission refusal

## Operator flow

Apply the diff, `git add -u -- plugins/pipeline-core/lib/critic-course-admission.mjs plugins/pipeline-core/lib/critic-course-admission.test.mjs`, commit with `--no-verify` as the bundled ceremony allows, stamp, install.

## Protected-path classification

Neither edited file matches TP-1..TP-13; the Edit tool wrote both clone files without refusal.
