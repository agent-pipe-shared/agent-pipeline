# K91 sitting rehearsal notes (clone scratch/clones/k91, base 4f959049f)

Implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.
Nothing committed or changed in the main checkout (only scratch/k91-* and scratch/agent-out/k91-*). Raw data: `scratch/agent-out/k91-status.jsonl`, `k91-results.txt`, per-run logs `k91-<label>-*.log`.

## Patch inventory (held-patches folder) and ceremony
- C15: k79-c15-verify-caseids-and-k1r (harness/scripts/verify.mjs)
- C16 SUPERSEDED by C27: k79-c16-verify-suites-run-parallel (not applied; after C27a `git apply --check` fails forward, passes `--reverse` = content already present)
- C16b/C27: k79-c16b-inventory-surface-run-parallel (docs/product-capability-inventory.json)
- C27: k82-c16-verify-suites-cumulative (harness/verify-suites.json), k82-verify-case-completion-augmentation-rc05 (harness/config/verify-case-completion-augmentations.v1.json)
- C17: k55-guard-lifecycle-ready-test-posix-command-paths
- C18: k64-onboarding-continuity-staging-banner
- C19: d75-cancel-class/s4-protected-libs, unprotected-s4-tests-and-s5-scripts, s5-protected-guard-dispatch (plus s4/s5 notes)
- C20: k67-discard-feature-finish-orphan-release (pipeline-state.mjs)
- C21: k73-guard-apply-patch-fixtures
- C22: k76-antigravity-pretool-guard-fixtures-cumulative (k73-antigravity-pretool-guard-fixture SUPERSEDED: fails forward AND reverse on the final state, do not apply)
- C23: k75-classifier-protected-test-paths, then k75-classifier-unprotected-pins
- C24: k76-evaluate-shared-onboarding-observation
- C25: k81-adapter-purity-protected, then k81-adapter-purity-unprotected
- C26: k80-closed-release-member-step-protected, then -unprotected
- C28: k82-critic-preimage-repin
- UNLISTED: R7-3-F1-gate.patch (design-workflow-approval.mjs) belongs to no row C15-C28; it fails `git apply --check` forward and reverse on the clone, so it is stale. Not applied; PO/Elephant should decide whether it is dead.
- Not patches: C7 (untouched), `.notes.md` files.

## Apply order used (and operator order)
1 C15 -> 2 C27a (verify-suites + augmentation) -> 3 C27b (surface line, then `node scripts/rebaseline-inventory.mjs`, then inventory commit) -> 4 C17 -> 5 C18 -> 6 C26 step 1 -> 7 C26 step 2 -> 8 C19 s1 -> 9 C19 s3 -> 10 C19 s2 -> 11 C20 -> 12 C21 -> 13 C22 -> 14 C24 -> 15 C23 s1 -> 16 C23 s2 -> 17 C25 s1 -> 18 C25 s2 -> 19 C28 last (its digests go stale by any later change to the six Critic-contract files; re-measure right before applying).
Dependencies kept: C19 s1 before s2 (s2 imports the S4 libs); C26 and C25 protected before their unprotected step; C18 before C26 (both touch onboarding-continuity.mjs); C27's inventory surface line after the verify-suites commit and before the rebaseline. Slip in this run: C19 s3 was committed before s2 (a parallel call by mistake); both orders apply, s3 and s2 are independent of each other, operator order stays s1, s2, s3.

## Per patch status (clone commit; every commit is ONE commit per step, `rehearsal:` subject, two trailers)
- C15 204faacf3 applies clean
- C27a d9109596a: both clean; C27b surface line clean, rebaseline moved sourceBaseline to d9109596a (7fbfbeea8 holds inventory)
- C17 c4834871e clean; C18 4070baa95 clean; C26 s1 31606fac1 clean even after C18 (no conflict between C18 and C26), s2 083f22a72 clean
- C19 s1 5dd6b32bf clean; s3 2fa56885d clean; s2 e715f3fe9 CONFLICT (see below)
- C20 db719bc6f, C21 d72c22687, C22 cf8d3edbc, C24 657d06869, C23 s1 235eabf96 / s2 343f472df, C25 s1 b6a8d753d / s2 0b1ddbca7, C28 c22912b0a: all applies clean (no 3-way needed anywhere)
- No pre-commit/commit-msg refusal in the clone for protected paths (commits went through `git commit` run from a Node helper). A direct shell `git commit` with the `rehearsal:` subject is refused by the shell guard (GIT-01-UNKNOWN-TYPE); the real sitting messages use admitted types.

## Conflict (1 of 3 allowed): C19 s2 vs main HEAD, NOT between two held patches
`unprotected-s4-tests-and-s5-scripts.patch` fails on `plugins/pipeline-core/scripts/dispatch-briefing.mjs` line 58: HEAD gained `import { scopesOverlap } from "../lib/slice-queue.mjs";` (plus the `readDispatchRecordLiveness` import) since the patch was built, the patch adds `import { CANCEL_CLASS_HELP, CANCEL_CLASSES } from "../lib/slice-queue.mjs";` at the same spot. 3-way applies the other 7 files and leaves one conflict hunk. Resolution: ONE merged line `import { CANCEL_CLASS_HELP, CANCEL_CLASSES, scopesOverlap } from "../lib/slice-queue.mjs";` (readDispatchRecordLiveness line kept). Rebased combined diff for all 8 files, relative to the state after C19 s1: `scratch/agent-out/k91-d75-unprotected-rebased.diff` (staged diff of the resolved tree, 55933 bytes). Who applies: an agent session or the operator, AFTER s1 lands, instead of the original patch; no protected file in it. This is the only unprotected-file hand resolution of the bundle.

## Counted results (all in the clone, final state c22912b0a; each run alone, private TMPDIR)
- check-verify-suite-registration: exit 0, 1085 registered, 0 unregistered (expected 1085)
- check-product-capability-inventory: exit 0 PASS (after rebaseline)
- check-verify-case-completion: exit 2, 1 finding `VULNERABLE-UNREGISTERED pin-installed-design-trailer-example-is-rejected-by-git-guard-tests` (plugins/pipeline-core/lib/pins/installed-design-trailer-example-is-rejected-by-git-guard.test.mjs). The SAME finding (same exit 2) appears when run on the MAIN checkout at HEAD, so it is not caused by the bundle; the C27 claim "exits 0" is stale against current HEAD. A further verify-suites.json registration is needed (a protected edit, new ceremony item) or the pin file reclassified. Decision for the PO.
- architecture-boundary-check (`plugins/pipeline-core/scripts/architecture-boundary-check.mjs --root .`; no `harness/scripts` variant exists): exit 1, 2010 files, 31 violations = 13 over-line-bound + 18 unowned-path (the 18 are scripts/*.mjs outside the bundle, not measured against baseline). Over-line-bound, now vs accepted: verify.mjs 1206/1202; antigravity-pretool-guard.test 1528/1492; guard-dispatch.mjs 1043/1037; guard-dispatch.test 1055/1032; guard-lifecycle-ready.test 12433/12425; guard-maintenance-window 2087/2086; native-goldfish-host-state 1611/1604; native-goldfish-host-state.test 1077/1047; onboarding-continuity 12365/12295 (C26 notes say 12364: the C18 banner adds 1); protected-test-paths 1149/1108; slice-queue 1042/1007; pipeline-state 13833/13819; session-cleanup-binding.test 3226/3138. Baseline at HEAD for these not measured (check the same list before raising). Check says "split rather than raise"; raising is a PO call, `architecture/boundary-policy.json` is an unprotected file.
- session-cleanup-binding.test: 68/68 pass, 655 s (expected 68/68)
- onboarding-continuity.test: 306/306, 649 s (expected 306/306)
- interruption-receipts.test: 107/107
- guard-apply-patch.test: exit 0, 28 ok (no counter line in this file's output), 247 s (C21 expected 28/0)
- antigravity-pretool-guard.test: exit 1, 61 ok / 2 not ok, 438 s = expected; the two are the GS-1 cases (`Antigravity GS-1 is liftable ...`, `Antigravity signature guidance assigns only sign-intent ...`)
- lifecycle-denial-loop-guard.test: 5/5
- guard-lifecycle-ready.test: 392 tests / 389 pass / 0 fail / 3 skip, 456 s (expected)
- scripts/slice-queue.test: 19/19; guard-dispatch.test: 67/67 (no stated expectation; green)
- classifier pins: stash 88/88, hgo-patch-preflight 14/14 (expected); design-generator pin 13/13 (expected, banner red is gone with C18)
- Not run: consumer-safe-paths test (not briefed), check-verify-case-completion.test, verify-case-completion-augmentation test, session-cleanup-recovery/lost-binding/discard-feature (not briefed), any Windows run, Full Verify.

## What the human at the sitting must know
- No `dispatch-record-K*.json` exists in `specs/sprint-alfred-epic/evidence/` for any trailer the notes name (K55-TEST-FIXES, K63/K65, K67-K1D-E-DISCARD-CALL, K75-A2-..., K80-..., K81-..., K82-...). The `Dispatch: <ID> (goldfish)` trailer is not verifiable until the Elephant writes those records; C25/C26 notes say so explicitly. C19 s2 may use `Dispatch: administrative (elephant)`.
- Ratchet numbers above; C20 pipeline-state 13819 -> 13833 and C25 guard-maintenance-window 2086 -> 2087 are announced; the other eleven overruns (verify.mjs, guard-dispatch*, native-goldfish-host-state*, protected-test-paths, slice-queue, antigravity test, binding test, guard-lifecycle-ready.test) are PO decisions or splits, not announced by their rows.
- C25 s1 adds `critic-review-lineage-core.mjs`: the patch carries the NEVER_LIFTABLE_KERNEL_PATHS line and the threat-model entry (GMWKC01/03 split across s1 and s2).
- C27b: after committing verify-suites.json and applying the surface line run `node scripts/rebaseline-inventory.mjs`, then commit the inventory (protected).
- Commit messages and trailers are in the `.notes.md` files (k55, d75 s4/s5, k67, k75, k80, k81, k82 closing steps, k76-k8-followup, k73-k8-three-reds, k79 registration dropins); K64 message from the C18 row.
- C28 must come last and its six digests re-measured right before applying.

## Operator command list (protected commits only; run from the repository root, one per line; `<msg>` = message file from the named notes)
git apply --check specs/sprint-alfred-epic/evidence/held-patches/k79-c15-verify-caseids-and-k1r.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k79-c15-verify-caseids-and-k1r.patch
git add -- harness/scripts/verify.mjs
git commit -F <msg-c15> -- harness/scripts/verify.mjs
git apply specs/sprint-alfred-epic/evidence/held-patches/k82-c16-verify-suites-cumulative.patch
git apply specs/sprint-alfred-epic/evidence/held-patches/k82-verify-case-completion-augmentation-rc05.patch
git add -- harness/verify-suites.json harness/config/verify-case-completion-augmentations.v1.json
git commit -F <msg-c27> -- harness/verify-suites.json harness/config/verify-case-completion-augmentations.v1.json
git apply specs/sprint-alfred-epic/evidence/held-patches/k79-c16b-inventory-surface-run-parallel.patch
node scripts/rebaseline-inventory.mjs
git add -- docs/product-capability-inventory.json
git commit -F <msg-inventory> -- docs/product-capability-inventory.json
git apply specs/sprint-alfred-epic/evidence/held-patches/k55-guard-lifecycle-ready-test-posix-command-paths.patch
git commit -F <msg-c17> -- plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
git apply specs/sprint-alfred-epic/evidence/held-patches/k64-onboarding-continuity-staging-banner.patch
git commit -F <msg-c18> -- plugins/pipeline-core/lib/onboarding-continuity.mjs
git apply specs/sprint-alfred-epic/evidence/held-patches/k80-closed-release-member-step-protected.patch
git commit -F <msg-c26> -- plugins/pipeline-core/lib/onboarding-continuity.mjs plugins/pipeline-core/lib/session-authority-orphan-member-step.mjs
git apply specs/sprint-alfred-epic/evidence/held-patches/d75-cancel-class/s4-protected-libs.patch
git commit -F <msg-s4> -- plugins/pipeline-core/lib/native-goldfish-host-state.mjs plugins/pipeline-core/lib/slice-queue.mjs
git apply specs/sprint-alfred-epic/evidence/held-patches/d75-cancel-class/s5-protected-guard-dispatch.patch
git commit -F <msg-s5> -- plugins/pipeline-core/hooks/guard-dispatch.mjs plugins/pipeline-core/hooks/guard-dispatch.test.mjs
git apply specs/sprint-alfred-epic/evidence/held-patches/k67-discard-feature-finish-orphan-release.patch
git commit -F <msg-c20> -- plugins/pipeline-core/scripts/pipeline-state.mjs
git apply specs/sprint-alfred-epic/evidence/held-patches/k73-guard-apply-patch-fixtures.patch
git commit -F <msg-c21> -- plugins/pipeline-core/hooks/guard-apply-patch.test.mjs
git apply specs/sprint-alfred-epic/evidence/held-patches/k76-antigravity-pretool-guard-fixtures-cumulative.patch
git commit -F <msg-c22> -- plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs
git apply specs/sprint-alfred-epic/evidence/held-patches/k76-evaluate-shared-onboarding-observation.patch
git commit -F <msg-c24> -- plugins/pipeline-core/lib/guard/evaluate.mjs
git apply specs/sprint-alfred-epic/evidence/held-patches/k75-classifier-protected-test-paths.patch
git commit -F <msg-c23> -- plugins/pipeline-core/lib/protected-test-paths.mjs
git apply specs/sprint-alfred-epic/evidence/held-patches/k81-adapter-purity-protected.patch
git commit -F <msg-c25> -- plugins/pipeline-core/lib/critic-review-lineage-core.mjs plugins/pipeline-core/lib/critic-review-lineage.mjs plugins/pipeline-core/lib/guard-maintenance-window.mjs
git apply specs/sprint-alfred-epic/evidence/held-patches/k82-critic-preimage-repin.patch
git commit -F <msg-c28> -- plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json
(Unprotected steps, agent session after the protected step: d75 `scratch/agent-out/k91-d75-unprotected-rebased.diff` instead of the held unprotected patch, k80-...-unprotected, k75-...-unprotected-pins, k81-...-unprotected; every `git add -- <paths>` and `git commit -F` explicit by pathspec as above.)
