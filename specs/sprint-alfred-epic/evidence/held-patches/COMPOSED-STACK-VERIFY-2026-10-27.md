# Composed held-patch stack, verification and apply blocks (2026-10-27)

One bundle holds every complete held patch of this round: `w7-final-bundle-2026-10-27.patch`
(53 files, +1768/-145, sha256 `8c2a26fc2514ac45cdfd01749caaf8657757ac2778b5d247bbac627fae31c6c8`).
It applies cleanly (`git apply --check`) on the HEAD it was cut from (the commit that adds this file
changes only evidence files). Implementation complete; Full Verify, the batch Critic, the native
Windows run and PO acceptance are NOT done, so no row is "done" and no row may be lifted before the
PO has applied and installed it.

## Contents (apply order inside the bundle)

d165-s4-submit-plan-precheck, d165-s8-state-suite-fixture, w7-fitness-doc-module,
w7-finalizer-stale-expectation-fix, w7-fitness-doc-module-class6, w7-g18-reviewer-admission-recovery,
w7-g23-export-bounds-identity, w7-d41-evidence-route-help, w7-pf82-hook-message-and-stop-visibility,
w7-d51-evidence-carry, w7-d41-catalogue-help-admission, w7-skill-evidence-route-c2,
w7-budget-ceiling-70-c4, w7-d47-gitattributes-onboarding-c3, w7-g9b-view-byte-pin,
w7-g18-readiness-aggregate-c2, w7-pf83-stop-failure-removed-c2, w7-pf88-guardrail-derivation-shared,
w7-pf88-diagnostic-evidence-auto-guardrails, w7-pf85-repair-hints-c2, then
w7-fixture-submit-plan-architecture-a, -b, -c, -d (fixtures that D165-S4 made necessary),
w7-elephant-context-guard-dispatch-c2, w7-d52-stale-snapshot-refusal-text, w7-d31-checkpoint-outcome.

NOT in the bundle (partial or not run, never apply): w7-pf86-scan-outside-registry-lock (c1, interim),
w7-pf86-registry-read-api (c2, NGHS46 red), w7-elephant-context-guard-dispatch (superseded by c2),
and the slices not yet dispatched (admission timeout and read cost, D31 schema half, signature slice A,
D56 validator). `w7-d31-checkpoint-outcome` is complete on its own side, but the return validator does
not accept the checkpoint outcome until the D31 schema slice lands; nothing emits it before then.

## Verification (isolated clones via scripts/run-parallel.mjs, stack vs clean HEAD)

- 31 test files the bundle touches: 26 green on the stack; the 5 red files fail on the clean HEAD with
  the same names: guard-dispatch (22 carrier-policy names), catalogue-admit D64 (1),
  parallel-work PARWORK-M6a/c/d/e/f (5), project-onboarding-v3 and scripts/pipeline-state (abort identically).
- 20 further files that exercise submit-plan: 10 green; the 10 red ones fail on the clean HEAD with
  identical names (onboarding-continuity OBC264, approve-announce, project-onboarding-e2e,
  plan-authority-staging-guard, measure-tofu, observer-conformance 7, push-init 9,
  configure-verify-names 3, consumer-approved-plan (g)); harness/scripts/pipeline-state aborts identically.
- Result: no regression against the baseline in any of the 51 files. The baseline reds themselves are
  pre-existing and still need their own fix before Full Verify can be green.

## Protected or custody parts for the batch Critic

w7-skill-evidence-route-c2 re-baselines a protected Critic policy preimage; the registry-adjacent
patches (pf83, pf85, d31) touch native-goldfish host state; guard-dispatch.mjs (elephant c2) is a hook.

## PO apply blocks (run from the repository root, in this order)

Block 1, apply and look:
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-final-bundle-2026-10-27.patch`
then `git status --short`.

Block 2, stage with a path limit and commit with the PO's own ceremony (the commit is the PO's;
hooks are bypassed only through the sanctioned route): `git add -A -- plugins/pipeline-core`.

Block 3, synchronize the installed plugin copy (agent cannot write it) and, on the PO's call, stamp and
install per `docs/push-release-flow.md` and `docs/operating-tools.md` (`scripts/stamp-candidate.mjs`).

After installation the matrix rows of the applied patches may be lifted to 75; then Full Verify,
batch Critic, native Windows run and PO acceptance follow.
