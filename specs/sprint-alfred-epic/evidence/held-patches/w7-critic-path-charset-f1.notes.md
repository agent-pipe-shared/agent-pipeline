# PF-97 slice F1 (code validators): state at second checkpoint

Candidate: b14b70e3cc671b06cbbe9af138b7c6aa2508a9b4. Status: CHECKPOINT, one new case still red. The patch (w7-critic-path-charset-f1.patch, 13448 bytes) applies cleanly at the candidate in clone2 (git apply --check exit 0).

## Cause

The Critic route path predicate accepted only A-Z a-z 0-9 dot underscore slash hyphen (lineage core PATH line 45; review-economy SAFE_PATH line 65 and CRITIC_SAFE_PATH line 253), so paths with parentheses, brackets, at sign, dollar, space, non-ASCII letters and similar were refused with CRL-V2-PACKET. The colon was refused in critic-course-admission (safe, line 365) and critic-diagnostic-evidence (line 15). Recon lines re-verified and matching.

## Changed lines (in the patch)

- critic-review-lineage-core.mjs: PATH is now a start-anchored negative lookahead for a forbidden class anywhere (negated empty class star, so line breaks are covered, then C0 controls, DEL, C1 controls, backslash), no leading slash, 1-512 length; safePath unchanged (512 byte check and segment check kept).
- review-economy.mjs: one shared local fragment used by SAFE_PATH (limit 240) and CRITIC_SAFE_PATH (limit 512), same rule. No import of the core (limits differ, kept local).
- critic-course-admission.mjs line 365 and critic-diagnostic-evidence.mjs line 15: colon removed from the refused set only.
- Tests: critic-review-lineage.test.mjs (import safePath, two new cases, pin 14 to 16), review-economy.test.mjs (RE70a-d), critic-diagnostic-evidence.test.mjs (one node:test case for diagnosticPath).

## RED and GREEN

RED against the unchanged code: lineage test exit 1 (new accept case failed on the parenthesis path); economy test exit 1 with RE70a and RE70c FAIL (RE70b and RE70d refusal cases passed pre-patch, as expected since the old rule refuses more).
GREEN after the change: critic-review-lineage.test.mjs exit 0, 16/16 checks passed (CRL15 and CRL16 new). critic-diagnostic-evidence.test.mjs run with node --test exit 0, the new PF97-F1 case passes. review-economy.test.mjs: 123/124 passed, exit 1; RE70a (validRepoPath accepts all legitimate names) now PASSES; RE70c FAILS and the cause is NOT established. RE70c was rewritten once (it now compiles a valid control record first); it still fails, so either the economy projection has another check on the record (not seen in the lines read) or the helper record is wrong. This is a test-side defect candidate, not shown to be a production defect. Next step: print which half of RE70c fails (control record versus paths).

## NOT done

- Course-admission colon case: safe is not exported; a test needs a full git fixture. Not added; VCR01 pin 232 for critic-course-admission is therefore unchanged and still correct.
- Baseline (clone2) versus patched failing-name sets for critic-course-admission, critic-generic-batch, packet-preflight, dispatch-preflight, session-critic-finalizer, check-verify-case-completion, check-product-capability-inventory suites and generate-architecture-overview --check were NOT run. Whole critic-review-lineage test in clone2 baseline not run.
- Preflight tests not searched for old-behaviour pins.
- Still refusing legitimate names after F1: the four JSON schema patterns (slice F2). critic-packet-preflight length limit 240 UTF-16 units versus 512 bytes stays as is.
- Clone cleanup not run.

## Proposed commit message

fix(critic): allow every legitimate file name character in a repository path on the Critic route

## Operator flow and classification

Apply the diff, git add -u with a path limit, commit with --no-verify, stamp, install. No protected test path (agent-obligations section 2) is touched. An independent Critic review stays a parent-owned batch gate. Do not apply while RE70c is red.
