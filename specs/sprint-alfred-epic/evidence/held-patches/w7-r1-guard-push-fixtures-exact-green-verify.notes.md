# W7-R1 guard-push fixtures: held-patch notes

Slice W7-R1-GUARD-PUSH-FIXTURES-EXACT-GREEN-VERIFY-20261031. Patch base: the clone candidate in `cand.txt`
(b65820ae3); the briefing candidate a71b985b9 is four evidence-only commits later, so the apply-check on a71b985b9 is
the Coordinator's. Status: complete; the targeted suites are green and the importer sweep matches the baseline.

## Premise correction (deviation from the briefed route)

The briefing expected the fixture to lack exact-green Verify evidence plus a private Critic/Verify lifecycle helper.
Reading the code shows the finding `verify-evidence-not-exact-green` is only the FIRST refusal of a different rule:

- `checkIndependentPublicationReview` (guard-push.mjs) runs only when `pushedStateRequiresReview()` is true.
  Since commit 272d0f668 that is true for any pushed commit whose own project state is absent, unapproved, above mini
  rigor or carries a registered package (`publication-review-requirement.mjs`). A bare fixture repository has no state,
  so every allow case in it requires a candidate-bound Critic review.
- Making the evidence exact-green alone would only move the refusal to `private-critic-binding-unavailable`, because
  `inspectCriticBoundVerify` then needs a real receipt under `agent-pipeline/critic-verify-lifecycle/` validated against
  the packet store. No test helper for that exists in any push suite (searched the four hook suites and the importers).
- The rule is the current contract and `publication-guard-candidate.test.mjs` already pins the waiver: an approved
  mini plan in the PUSHED commit is not a review case. The fixtures were therefore stale (they model a candidate that
  has no state), not the rule. `verifyEvidenceFixture` is deliberately unchanged.

Consequence to carry: no hook-level case now walks required-review -> exact-green -> lifecycle-bound -> ALLOW; that path is
covered only in `critic-verify-lifecycle.test.mjs`. Open item for the Coordinator.

## Changed fixtures

- `lib/verify-selection-fixture.mjs`: new export `commitApprovedMiniFixtureState(dir)` commits an approved mini plan
  (state, plan, spec) and returns the new HEAD. Comment explains that the review duty reads the COMMITTED state while the
  push-approval check reads the working-tree state, so a later `writeState` does not undo it.
- `hooks/guard-push.test.mjs`: `freshRepo`/`freshRepoIn`/`signedPushRepo` take opt-in `approvedMini` (default off, so every
  block case stays bare). Opted in: PG09, PG08b, PG10, PG12w, PG12x, PG12x2, PG12c, PG12c-main, PG12s1, PG12s2, PG12u2,
  PG12s16, PG13, PG17b (binding-target), PG17bb, PG17c, PG17q (strict-shapes), PG26a, PG30, D4a, D4b, D4c.
  Repos shared with block cases: binding-target (PG17a still refuses on `evidence/verify-latest.json missing`) and
  strict-shapes (PG17j..s refuse structurally, `not unambiguous`).
- PG10 RESTATED (original intent "no state file at all" cannot hold under the rule): now "passes without any push-approval
  record (pushed state is an approved low-rigor plan)".
- PG13 had a second, independent stale fixture hidden behind the first: security evidence binds the push destination
  (`repositorySha256` = digest of the single push URL). `exactSecurityEvidence` takes an optional `repositorySha256`; PG13
  adds a remote `origin` URL and passes its digest.
- `hooks/guard-push-external-ledger.test.mjs`: opt-in for PGXL01, PGXL02, PGXL04. `hooks/guard-push-decision-reference.test.mjs`:
  opt-in for GPDR01, GPDR02.

## Evidence

- Baseline (clone2, base0): the three suites exit 1; 23 guard-push names, PGXL01/02/04, GPDR01/02 fail, all with
  `verify-evidence-not-exact-green` (logs `base0.*.log`).
- Clone after the opt-ins (c1): external-ledger 7/7, decision-reference 6 passed 0 failed, guard-push 271/272 with only PG13
  failing on `push remote identity is unavailable or ambiguous`; PG13 was then fixed (second fixture above).
- Patch applies on cand.txt in clone2 (`git apply --check` exit 0).

## Results of the final state (run c2, clone; baseline base0/base1, clone2)

- guard-push.test.mjs: 272/272 cases passed (was 23 names red at baseline). PG17a and PG17j..s, which share repositories with
  allow cases, are PASS in the finished log with their own refusal assertions (`evidence missing`, `not unambiguous`). PG10 and PG13 PASS.
- guard-push-external-ledger.test.mjs: 7/7 passed. guard-push-decision-reference.test.mjs: 6 passed, 0 failed.
- clean-candidate-run 6/6, publication-executor-productive-flow 6 passed, push-init 39/39, push-prepare 88/88: green, no pinned count moved.
- Out-of-scope reds of the SAME stale-fixture class, in files outside the write scope, not touched: `guard-push-v2.test.mjs`
  (PGV2-01, PGV2-06; identical red set at baseline base1) and `guard-push-scratch-advisory.test.mjs` (PGSA01..04, 0/4, identical at baseline). They need the same opt-in in a follow-up slice that adds those files to the write scope.
- `worktree-target-binding.test.mjs`: 2 of 5 tests fail (WTB002, WTB003), identical at baseline; pre-existing, not touched.

## Open items

- No hook-level case walks required review -> exact-green Verify -> lifecycle-bound -> ALLOW; that path is covered only in
  `critic-verify-lifecycle.test.mjs`. Recorded here, not built in this slice (Coordinator decision).
- Follow-up slice for guard-push-v2 and guard-push-scratch-advisory (same opt-in).

## Baseline comparison of the importer sweep (c2 clone vs base1 baseline, finished logs)

- Identical failing sets, so unchanged by this patch: guard-push-v2 (PGV2-01, PGV2-06), guard-push-scratch-advisory (PGSA01..04),
  worktree-target-binding (WTB002, WTB003), check-verify-case-completion (VCR01 only, 31/32 pass, same as baseline; no pinned
  count moved by this change, no case added). The mismatch list inside VCR01 was not diffed byte for byte.
- Green and identical: publication-executor-productive-flow, clean-candidate-run, push-init, push-prepare, the guard-push
  read-only-git-grep pin, critic-verify-lifecycle (all exit 0 in both).

## Revert proof

`driver revert` on the three target suites with `verify-selection-fixture.mjs` restored to the candidate: all three exit 1 with
`SyntaxError: ... does not provide an export named 'commitApprovedMiniFixtureState'` (an import failure, not case-level FAIL
lines); the file was restored byte-equal afterwards. The case-level "without the change" proof is the base0 red set. The
config's second prod file, `critic-verify-readiness.mjs`, is untouched, so reverting it is a no-op.
