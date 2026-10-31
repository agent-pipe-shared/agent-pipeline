# W7-R1b guard-push v2 / scratch-advisory / worktree-binding fixtures: held-patch notes

Slice W7-R1B-GUARD-PUSH-V2-SCRATCH-ADVISORY-WORKTREE-BINDING-FIXTURES-20261031. Patch base: the candidate in `cand.txt`
(HEAD 415304a0a plus the seventeen candidate-13 held patches, R1 included); the patch applies after them (`git apply --check`
in the baseline clone: exit 0). Status: complete, targeted delivery green. Follow-up of R1
(`w7-r1-guard-push-fixtures-exact-green-verify.notes.md`), which named these three suites as out-of-scope reds of the same class.

## Reading of the code (the publication review is not the only blocker for every case)

`guard-push.mjs` `checkIndependentPublicationReview` runs only when `pushedStateRequiresReview()` is true; that is true for any
pushed commit whose own state is absent or unapproved, above mini rigor, or carries a registered package
(`publication-review-requirement.mjs`). A bare fixture repository carries no state, so every allow case needs a candidate-bound
review it can never have. All reds were `verify-evidence-not-exact-green` (the first refusal of that rule). The fixtures are stale,
not the rule; `guard-push.mjs` and every hook are unchanged. The shared helper `commitApprovedMiniFixtureState` (R1) is reused
as is: `verify-selection-fixture.mjs` is NOT changed (no variant was needed; a worktree target works because the helper takes a dir).

## Per case

- PGV2-01 (guard-push-v2): TWO independent stale fixtures. (1) the review (waived via `allGreenBase({ approvedMini: true })`,
  which passes the option to `freshRepo`; it commits the mini state before head/tree are read). (2) hidden behind it, the same
  class as R1's PG13: v1 security evidence binds the push destination (`repositorySha256` = digest of the single push URL), so the
  baseline log shows 2 findings. `exactSecurityEvidence` takes an optional `repositorySha256`; `allGreenBase` adds an `origin`
  remote and passes its digest ONLY when `approvedMini` is set. PGV2-02..05 (and 07..09) keep the bare repository and the
  placeholder digest, so they still refuse for their own asserted reason (all PASS with their `stderrIncludes`).
- PGV2-06 (guard-push-v2, security gate off): `freshRepo("v2-gate-off", { approvedMini: true })`. It reaches empty stderr because
  security `off` skips both the v1 and v2 consult; no remote/digest is needed.
- PGSA01..04 (scratch-advisory): `signedPushRepo` now takes its head from `commitApprovedMiniFixtureState(dir)` after the threat-model
  commit. The later working-tree `writeState` (push-approval record) does not undo the committed state (review duty reads the COMMITTED
  state, push approval the working-tree state). All four are allow/advisory cases, none needs the review path.
- WTB002/WTB003 (worktree-target-binding): in WTB001 the target tip `b` is now `commitApprovedMiniFixtureState(target)` (the pushed
  commit is the target tip); primary stays bare because it is never the pushed source. They test evidence binding, which they now reach.
  WTB004 (primary evidence cannot satisfy target) and WTB005 (evidence bound to another OID) still expect 2 and PASS.
- No case in these suites needed the review path walked rather than waived. As in R1, no hook-level case walks
  required review -> exact-green Verify -> lifecycle-bound -> ALLOW (covered only in `critic-verify-lifecycle.test.mjs`); still an open item.
- Every assertion is kept; no case was added, weakened, skipped or deleted.

## Evidence (finished logs in scratch/agent-out/w7r1b, label.suite.log)

- Baseline (clone2, base1) = the unmodified candidate, the "without the change" proof: guard-push-v2 7/9 (PGV2-01, PGV2-06 exit 2),
  scratch-advisory 0/4 (PGSA01..04 exit 2), worktree-target-binding WTB002 and WTB003 fail (3 of 5 pass).
- Clone, final state: guard-push-v2 9/9 passed (c2, c3, exit 0); scratch-advisory 4/4 (c1, c3, exit 0); worktree-target-binding
  5 tests, 5 pass, 0 fail (c1, c3, exit 0).
  (The first c1 log of guard-push-v2, 8/9, is superseded: it exposed the second stale fixture in PGV2-01, fixed afterwards.)
- Stay green, identical clone (c1) vs baseline (base1): guard-push.test.mjs 272/272; guard-push-external-ledger 7/7;
  guard-push-decision-reference 6 passed 0 failed; check-verify-case-completion 32 tests, 32 pass, 0 fail (VCR01 included).
  None of the three target suites is a pinned row in check-verify-case-completion or its augmentations (rg), and no case was added, so
  no pinned count moved.
- Revert proof: `config.json` names only `verify-selection-fixture.mjs`, which this patch does not change, so `driver revert` would
  restore a byte-identical file and prove nothing; it was not run. The proof is the base1 red set above (identical test files at the candidate).
- Downstream sweep: `verify-selection-fixture.mjs` is unchanged (exports intact), so its importers are unaffected; `rg commitApprovedMiniFixtureState`
  shows only the R1 callers (guard-push, external-ledger, decision-reference) plus the three suites of this patch.
- Boundary diff `node scratch/agent-out/boundary-diff.mjs clone2 clone`: base and cand both 2106 source files, 103 violations, 63 accepted; no ONLY CAND line.
- Driver patch: 9901 bytes, 3 files (+36/-15): the three test files only; apply-check on the candidate exit 0.

## Deliberately not changed

- The stale header comment of `guard-push-v2.test.mjs` (the "KNOWN OPEN ITEM" about PG13): documentation, out of this slice's point.
- `guard-push.mjs`, `verify-selection-fixture.mjs`, the publication-review rule (a PO tile).
