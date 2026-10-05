# critic-notes - dispatch critic-flaprev-eb0a4599 (final write, interim status)

Review object: 073a5a230, d3c41ca5e. Spec: scratch/dispatch/critic-flap2/spec-item.md. Ruleset (dispatch-stated, not independently loaded): 0.7.0+claude.20261005202045.7170ed20.
Status: PARTIAL - stopped at DISPATCH-BUDGET-CHECKPOINT (call 20 of 24). pass/fail withheld - partial review.

## Phase A candidates (material)
C1 spec-item.md:42-48 Proposal P1/P3 uncovered, P2 partial. C2 scratch/flap/result.json pre-fix only. C3 lib/project-onboarding-v3.flap.test.mjs unregistered. C4 project-onboarding-v3.mjs:1921 message change. C5 retry set incl. WT-SESSION-DESCRIPTOR. C6 worktree-lifecycle.mjs:668-677 existsSync conflation. C7 nlink window (refuted). C8 test-seam export :1788. C9 Commit-Act orchestrator. C10 worktree-lifecycle.mjs unlisted in spec. C11 cause fallback. C12 150 ms block. C13 descriptorStageHook seam. C14 QG-04 test-role separation (body not read) - candidate - not a finding. C15 skip semantics in onboarding-continuity.mjs / project-authority.mjs consumers (not read) - candidate - not a finding.

## Surviving findings (Phase B, so far)
F1 major (C3): project-onboarding-v3.flap.test.mjs (15 tests) is referenced by neither harness/scripts/verify.mjs nor harness/verify-suites.json; neither commit touches them (TP-3/TP-13 protected); verify.mjs:428, :822. Anchor QG-07, QG-08, QG-01. Consequence: the regression tests never run in Verify, or suite registration reports the gap and boundary Verify is red at the candidate (which one: not determined).
F2 major (C2): result.json samples i=18 and i=58 lack the (cause: ...) suffix added at project-onboarding-v3.mjs:1921, so the only measurement predates the fix; the claims 12 of 59 in-process plans and stress probe 44 before / 0 after have no artifact; test logs carry no SHA or timestamp. Anchor spec-item.md:56 (instrument first, then fix), QG-03. Consequence: cause attribution and flap-rate reduction rest on commit prose; a cause outside the transient set would keep the 2/60 flap.
F3 major (C1): Proposal P1 (preflight emits --intent session, or guard accepts a ready bootstrap readback) untouched - pipeline-start-preflight.mjs:1422 still passes intent bootstrap; P3 (parallel read-only calls see one consistent snapshot) has no test; P2 only partial (cause appended to free-text message, code unchanged, nothing recorded). Coverage gap, not a defect in the changed code; the item cannot be resolved on this review object.

## Deliberately not flagged
C4 no exact-string consumer (only :1921 and flap.test.mjs:86). C5 each attempt is a full fresh observation; exhaustion and non-transient codes reach the unchanged fail-closed catch; apply never retried (test-pinned). C6 residual only, no concrete trigger beyond delete-pending; the pre-change loader used existsSync too. C7 refuted: worktree-lifecycle.mjs:935 and :1815 unlink only; :1013 links a separately written temporary; :1168 unlinks activePath. C8, C11, C12, C13 no anchor, or deliberate and test-pinned. C9 trailers well-formed, GIT-03 clean. C10 spec has no implementation enumeration. Cat 5 additive tests only. Cat 6 boundaries pinned. Cat 9 no TODO mitigations. Cat 10 no new deps. Cat 11 English. Bytes read once removes the parse/digest double read.

## Trajectory
Unit-test claims consistent (15/15, 59/59; names and counts match the commit bodies). Effectiveness and measurement claims not verifiable (see F2). Authorship consistent with trailers; dispatch-record cross-check not verifiable (not supplied).

## Done / remaining / next step
Done: categories 1, 2, 4, 5, 6, 9, 10, 11; 3 partial (registration yes, consumer reachability no); 7 and 8 partial.
Not reached: guardrails/global.md, guardrails/security.md, roles/goldfish.md, CLAUDE.md (on disk), guardrails/quality-gates.md QG-04 and QG-08 bodies, plugins/pipeline-core/scripts/check-suite-registration.mjs, plugins/pipeline-core/lib/onboarding-continuity.mjs 2143 2947 2998 3027 3052, plugins/pipeline-core/lib/project-authority.mjs 1039, plugins/pipeline-core/lib/session-cleanup-recovery.mjs 1136 onward.
Next dispatch (scope and mechanics only): commits 073a5a230, d3c41ca5e; the paths under Not reached; about 12 tool uses after bootstrap.
