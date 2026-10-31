# D227 / N45: residual acceptance takes a major under the reason class (held patch notes, checkpoint)

Patch: `w9-residual-acceptance-takes-an-uncorrectable-major-with-a-reason-class.patch` (12 files, +540/-47, apply-check on the baseline exit 0).
Built only in the scratch clones at candidate b8ab4ca8f. Targeted delivery: green for the suites run; formal revert-proof run and per-file VCR01 count report NOT done (budget checkpoint).

## Chain, step by step
1. Read-only orientation (item, D227, authorizers, verbs, lifecycle, second gate in review-admission-read.mjs).
2. New cases written first, RED against unmodified production (log red1.*): authorization RA9 (first red; the check runner aborts at the first failure so RA10/RA11 ran only after the build), lifecycle D227 x4+1, approval-request pin, pipeline-state C11-f/g/h, po-human-approval x3, chain walk PATH C x3.
   Walk RED reason: `--reason-class` unknown flag ("requires --by and --critic-packet ..."); "major without class -> RESIDUAL-PROOF-SEVERITY" was already green (unchanged behaviour).
3. Build: authorizers (class rule + subject), lifecycle subject, second gate, loader, verbs, request/confirmation text.
4. GREEN: c1 run (all exit 0 except two test-observation mistakes of mine, fixed in c2): the chat summary reaches the attended line reader as its prompt, not stderr; C11-f/C11-i and the walk helper now capture the prompt. No assertion was weakened; the intent is unchanged.
   c2: pipeline-state.test.mjs exit 0 (C11-a..i complete), chain walk 24 pass / 0 fail.

## Production files changed (all protected kernel paths; PO applies under a Guard Maintenance Window)
- lib/critical-action-authorization-read.mjs: `RESIDUAL_REASON_CLASS`, `residualReasonClassRefusal(findings, class)`; both authorizers take optional `reasonClass`, effective class = caller's else the recorded one; early check (blocker -> SEVERITY, major without class -> SEVERITY, unknown/misplaced class -> CLASS), binding compares the caller's class with the record, post-record check, signed subject gets `reasonClass` only when the record carries one. Still no write API (GST33 pins green).
- lib/critic-verify-lifecycle.mjs: `residualAcceptanceSubject({receipt, findings, reasonClass})` adds the key only when given; re-exports `RESIDUAL_ACCEPTANCE_CLASS_BASIS`, `RESIDUAL_REASON_CLASS`, `residualReasonClassRefusal`.
- lib/review-admission-read.mjs (second gate): `RESIDUAL_ACCEPTANCE_CLASS_BASIS = "po-acceptance-of-residual-findings-with-reason-class"`; `residualAcceptanceFor` accepts minor, or major only with `acceptance.reasonClass`; passes `reasonClass` to the verifier; fragment gets `reasonClass` and the second basis ONLY for an accepted major (minor-only fragment keeps its exact four keys and basis).
- lib/critic-verify-readiness-read.mjs: loader carries `reasonClass` in `residualAcceptance` only when the record has it and forwards it to `authorizeFn`.
- scripts/pipeline-state.mjs: `approve-residual-acceptance` takes ONE optional `--reason-class`; refusals RESIDUAL-PROOF-SEVERITY (text now names the route) and RESIDUAL-PROOF-CLASS before any prompt; summary shows `reason class: ...` plus a MAJOR sentence only with a class; record carries `reasonClass` only then; subject passed to `verifyCriticalHumanProof` is the shared builder's.
- scripts/po-human-approval.mjs: `--reason-class` (key set, valid only with the residual kind and prepare/authorize-critical), subject via the shared builder, same refusals, confirmation lines (`reason class`, MAJOR sentence; the minor-only sentence is byte-identical).
- NOT changed: lib/critical-action-approval-request.mjs (the class rides in the subject digest), lib/critic-verify-readiness.mjs (re-exports only).

## Signed subject shape
- minor-only: `{criticReceiptSha256, findings:[{id,severity}...]}`, no class key. Digest for the fixed fixture is `ea782ff58b4c44c7d988c0a7611d49802de076f3bf277abe71e69b6b1151e7c1` in clone2 (baseline) and in the edited clone (probe `scratch/probe.mjs`, logs base0.* and c1probe.*), pinned in critical-action-approval-request.test.mjs and critic-verify-lifecycle.test.mjs.
- list with a major: same plus `reasonClass: "uncorrectable-past-authorship"`.

## Code resolution
Briefing says RESIDUAL-PROOF-CLASS for "missing" class and also keeps SEVERITY for a major without the class. Resolved: major without class -> SEVERITY; unknown value or class on a list without a major -> CLASS; blocker (with or without class) -> SEVERITY.

## Callers of changed exports (tests that pin them)
- `residualAcceptanceSubject`: pipeline-state.mjs, po-human-approval.mjs (pinned by C11, po-human-approval residual tests, lifecycle subject test).
- authorizers: critical-action-authorization.mjs wrappers (pass-through), loader `authorizeFn` (lifecycle tests), pipeline-state C11 chain.
- `residualAcceptanceFor` fragment: lifecycle receipt v3, verify-evidence-producer, check-critic-skip-coverage, dispatch-record-write (all green unchanged, minor-only basis string).

## Unaffected texts (by decision)
review-admission-read.mjs FAILED_RECEIPT_FINDING (~349) and the notice (~1473), close-coordinator.mjs:550, pins/critic-round-cap-and-delta-scope-are-not-enforced.test.mjs:174 stay unchanged.

## Docs that still describe the residual acceptance as minor-only (not edited here)
- docs/human-authorization-inventory.md line 46: replace "Accepting the minor findings left open ... and a blocker or major finding can never be accepted" with "Accepting the minor findings left open ... (a major finding only when the acceptance names the reason class uncorrectable-past-authorship, which is part of the signed subject); a blocker can never be accepted".
- plugins/pipeline-core/skills/close-feature/SKILL.md ~line 71 (approve-residual-acceptance paragraph): add "`--reason-class uncorrectable-past-authorship` accepts a major finding of past authorship that no commit can correct".

## Visible marker and a gap
The accepted severities and the class are visible in the bound receipt `residual` fragment and in the v3 lifecycle receipt (`basis`, `findings[].severity`, `reasonClass`); the walk asserts this. scripts/close-coordinator.mjs (outside the write scope) prints nothing about residual acceptance, so plan-transition output does not name the major/class; naming it there needs a change in close-coordinator.mjs.

## Evidence
c1 (edited clone), exit 0: critical-action-authorization (52/52), critic-verify-lifecycle, critical-action-approval-request, po-human-approval, dispatch-record-write, check-critic-skip-coverage, verify-evidence-producer, guard-gate-strength, guard-gate-strength-origin-attestation, critic-dispatch-preflight, check-verify-case-completion. c2: pipeline-state.test.mjs exit 0, chain walk 24/24. base1 (clone2): all 13 files exit 0, so there are no failing names to subtract.

## Not verified
native Windows, a real signature (the existing test seams were used: signed proof fixtures and the attended chat confirmation via isattyFn/readLineFn), a real consumer repository, formal `driver revert` run (red1 against unmodified production serves as the red evidence), per-file VCR01 count movement, Full Verify/Critic (parent-owned).
