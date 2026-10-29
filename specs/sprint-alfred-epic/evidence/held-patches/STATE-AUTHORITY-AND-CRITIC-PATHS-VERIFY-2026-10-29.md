# State authority diagnostics and memo, and the Critic route path rule: verification and PO apply blocks (2026-10-29)

Eighteen patches (patch 18, `w7-onboarding-continuity-obc264-authoring-p1`, Block 2h, test only and independent; patch 17, `w7-brownfield-pin-header-n2`, Block 2g, comment only and independent; patch 16, `w7-d60-feature-request-other-candidate-pin-n1`, Block 2f, and patch 15, `w7-finalizer-baseline-red-assurance-m1`, Block 2e, are test only and independent), applied in this order, in five commits plus that one (patch 14, `w7-pf95-supersede-replay-moves-leftover-origins-k1`, is its own topic and its own commit; patch 4, `w7-state-authority-trace-memo-e3`, patch 9, `w7-critic-path-charset-f4`, patch 10, `w7-critic-range-bindings-operator-text-d2`, patch 11, `w7-pf95-admit-refusal-detail-c24`, and patches 12 and 13, `w7-pf94-round2-walk-h1` and `-h2`, were added after the first version of this note; patch 11 is its own topic and its own commit, patches 12 and 13 are one commit because 12 alone carries a red case). This is a set of HELD PATCHES: nothing in it is applied, stamped, installed, reviewed or accepted until the PO has done so. It supersedes the apply
blocks of `STATE-AUTHORITY-DIAGNOSTICS-VERIFY-2026-10-28.md` (which covered only the first two patches). All fourteen apply on HEAD of the working branch in this order; the first patch of each commit must
never be applied alone (the second corrects it).

| # | Patch | Content |
|---|---|---|
| 1 | `w7-state-authority-diagnostics-e1b` | refusal line names an untyped cause and the elapsed time; opt-in `AUTHORITY-TRACE` line; counters in the git custody read and both Windows native modules |
| 2 | `w7-state-authority-diagnostics-e1c` | corrects 1: code alone in the parenthesis, cause as a clause after it; cases run in the repair suite |
| 3 | `w7-state-authority-memo-e2` | process-local memo for the six read-only operations of the Windows owned-authority backend, stats `authorityMemoHits/Misses/Size`, import-only test seam, cases SAS09 to SAS17, count pin |
| 4 | `w7-state-authority-trace-memo-e3` | the `AUTHORITY-TRACE` line carries an `authorityMemo` object (hits, misses, size) built by the exported pure `buildAuthorityTrace`; cases SAS18 and SAS19; count pin 276 to 288 |
| 5 | `w7-critic-path-charset-f1` | lineage core, review-economy (two patterns), course admission and diagnostic evidence accept every legitimate file name character |
| 6 | `w7-critic-path-charset-f1-c2` | corrects the economy case helper (stale compiled-request digest) |
| 7 | `w7-critic-path-charset-f2` | the path patterns of four JSON schemas (lineage, review attempt, course decision, release scope) |
| 8 | `w7-critic-path-charset-f3` | walk case `CPP18`: a real candidate packet with eight special file names through the route |
| 9 | `w7-critic-path-charset-f4` | case `PF97 LINEAGE (special file names)`: the real registration route of a consumed course round (preflight, admission, finalize, `addCriticReviewLineage`) with the same eight names; fixture option `extraCandidateFiles`; VCR01 pin 232 to 238 |
| 10 | `w7-critic-range-bindings-operator-text-d2` | text only: the hints of the diagnostic evidence route, the registration route and the push remedy, and the skill operator note, name the derive step, the preflight flag and the request key `review.correctionInputBindings`; cases `D2 text (1)` to `(4)` |
| 11 | `w7-pf95-admit-refusal-detail-c24` | PF-95: a verb-first lead sentence in front of both `CGB-CONFLICT` details of an old batch, so the CLI detail (cut at 200 characters) shows `inspect-course-takeover` and `supersede-course-takeover`; case `PF95 admit refusal (1)`; the finalizer suite is 88 tests with only its known baseline failure |
| 12 | `w7-pf94-round2-walk-h1` | PRODUCTION FIX found by walking round 2 of a Critic course on the real route: the round 2 admit on the course path was refused `CGB-PARENT` because the parent receipt digest was compared with a different digest function than the course projection records; one line in `critic-generic-batch.mjs`; carries the case `PF94 ROUND2 (a)` which is RED until patch 13 |
| 13 | `w7-pf94-round2-walk-h2` | PRODUCTION FIX: the lineage of round 2 (`--add-review-lineage`) passed no delta request to the course compile and was refused `CCA-DELTA-REQUIRED`; the verb now names the registered delta request of the round candidate (or refuses with that code and writes nothing); cases `PF94 ROUND2 (a)` green and `(b)`; VCR01 pin 238 to 259 |
| 14 | `w7-pf95-supersede-replay-moves-leftover-origins-k1` | PRODUCTION FIX: replaying the same `supersede-course-takeover` request of a takeover audited before the origins fix now also moves every origins entry still owned by the old batch (the audit is not rewritten), so the next admit no longer ends in `CGB-CONFLICT` at the delivery target; case `PF95 REPLAY (a)` in the finalizer suite, no pin change |
| 15 | `w7-finalizer-baseline-red-assurance-m1` | test only: the finalizer baseline red case expected the private dispatch evidence binding from before PF-93 (no `assurance`, old `snapshotId`); two lines; finalizer 87 of 87 on HEAD |
| 16 | `w7-d60-feature-request-other-candidate-pin-n1` | test only: pins that the feature-request admit of another candidate over a held packet is refused `CDP-EVIDENCE-BINDING`, leaves the held packet untouched and lets the original request complete (D60); finalizer 88 tests on HEAD, only the known red fails |
| 17 | `w7-brownfield-pin-header-n2` | comment only: the header of the brownfield entry pin states the D162 migration refusal for every path and that the established-with-ratchet state is follow-up after 0.7.0 (D142); the pin file stays 16 of 16 |
| 18 | `w7-onboarding-continuity-obc264-authoring-p1` | test only: `OBC264` authors the design before binding for the feature and epic profiles (the unauthored scaffold is refused on purpose since `5e939278b`); `onboarding-continuity.test.mjs` 323 of 324 on HEAD, 324 of 324 patched |

## What the Critic path rule is now (PO decision 2026-10-28)

Everything a repository file name can legitimately carry is allowed. Refused stay: control characters (U+0000 to U+001F, U+007F to U+009F, so NUL and line breaks), the backslash, a leading slash, an empty
segment and the segments dot and dot-dot. Length limits are unchanged in each place. A colon, a trailing space or dot, a leading dash, brackets, parentheses, at sign, dollar, plus, equals, comma, tilde,
percent, hash and non-ASCII letters are accepted. Bidirectional override characters are not refused (they are legal in names); this is a named residual, decide if you want them refused.

## Test evidence (fresh clone, all patches applied in order, measured by the Elephant; the table was measured with eight patches on `42659f0e3`; after patch 9 on `c3f08c3ae` critic-course-admission is 66 of 66 and check-verify-case-completion 32 of 32, the other rows unchanged)

| File | tests | pass | fail |
|---|---|---|---|
| `plugins/pipeline-core/scripts/session-authority-repair.test.mjs` | 40 | 40 | 0 |
| `harness/scripts/pipeline-state-external-push-ledger.test.mjs` | 1 (5 checks) | 1 | 0 |
| `plugins/pipeline-core/scripts/critic-packet-preflight.test.mjs` | 18 | 18 | 0 |
| `plugins/pipeline-core/lib/review-economy.test.mjs` | 1 (own checks) | 1 | 0 |
| `plugins/pipeline-core/lib/critic-review-lineage.test.mjs` | 1 (own checks) | 1 | 0 |
| `plugins/pipeline-core/lib/critic-course-admission.test.mjs` | 65 | 65 | 0 |
| `plugins/pipeline-core/lib/critic-diagnostic-evidence.test.mjs` | 13 | 13 | 0 |
| `plugins/pipeline-core/lib/critic-generic-batch.test.mjs` | 35 | 35 | 0 |
| `plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs` | 63 | 63 | 0 |
| `harness/scripts/check-verify-case-completion.test.mjs` | 32 | 32 | 0 |
| `harness/scripts/check-product-capability-inventory.test.mjs` | 30 | 30 | 0 |

`generate-architecture-overview.mjs --check`: "Architecture overview current". The walk case fails without patches 5 to 7 (patch 8 alone on HEAD: 18 tests, 16 pass, 2 fail).
`session-critic-finalizer.test.mjs` has one pre-existing red case (86 of 87), identical on the unpatched baseline; `harness/scripts/pipeline-state.test.mjs` stops at its case PS08a in the baseline. Measured later (2026-10-29, unpatched clone): the first red case is `PS06a0` (the rest cascades, PS08a dies on `legacy.planApproval` undefined), because `submit-plan` has compared the physical bytes of the plan and the Spec with the authority hashes since commit `5e939278b` (`inspectSubmissionSources`, `PLAN-SUBMIT-SOURCE-DRIFT`) while that fixture's injected authority carries synthetic `fixture:<path>` hashes and writes no such files. That file is not in `harness/verify-suites.json`; the registered counterpart `plugins/pipeline-core/scripts/pipeline-state.test.mjs` passes (1 of 1). The finalizer red is fixed by patch 15. Both were unrelated to patches 1 to 14. Full Verify is not run.

Patches 12 and 13 were measured separately on a fresh clone of `50b4f5a4c` with patches 5 to 9 applied: critic-course-admission 68 of 68, critic-generic-batch 35, critic-dispatch-preflight 63, check-verify-case-completion 32, architecture overview current, finalizer 86 of 87 (known baseline red). With the one-line fix of patch 12 reverted both ROUND2 cases fail at the course admit; the file was restored byte for byte. The explicit-route `consumedParent` digest comparison was read afterwards (code reading only, no run): it compares the supplied `parent.receiptSha256` with `packetDigest(receipt)` (`sha256(canonicalJson(receipt))`), which is the same computation that prints `receiptSha256` in the export result of the finalizer (`sha256(canonicalJson(receipt))`), so an operator who passes the printed value passes the comparison. The course path records `sha256Canonical(receipt)` instead (a different canonical form); that is the digest patch 12 aligns; it appears in the registered lineage, not in the export result. No defect on the explicit route.

Patch 14 was measured on a fresh clone of `5cf6f2baa` with patches 5 to 9 and 11 to 13 applied in order: finalizer 89 tests, 88 pass, 1 fail (the same known baseline red), critic-generic-batch 35 of 35, critic-course-admission 68 of 68, check-verify-case-completion 32 of 32, architecture overview current. With the one production hunk reverted the new case fails at `the leftover delivery entry is no longer live`; restored, it passes.

## Status of the three agent entries of the PF-94 row (`pipeline.glossover.pf94-critic-course-cannot-continue-past-a-consumed-non-course-batch`)

The matrix is not changed: held patches count only once applied and installed. What the held evidence says, for the Elephant who stamps:

- "Walk the path after the admitted delta end to end": walked on the real route in patches 12 and 13 (case `PF94 ROUND2 (a)`: round 2 course admit with its claim, finalize, the lineage of round 2, the next admission). Two production defects were found and fixed there (`CGB-PARENT` at the round 2 admit, `CCA-DELTA-REQUIRED` at the round 2 lineage). Entry can fall after patches 12 and 13 are applied and installed.
- "Pin the untested refusal `FPR-LINEAGE-COVERAGE-CLAIM`": examined in `w7-pf94-lineage-coverage-claim-pin-g1.notes.md`; the branch is defensive (the receipt range equals the packet range by construction, and the claim reader refuses first), so no case is written and none is wanted; a case would have to forge the claim binding as well, which pins a state no route produces. Entry can be closed as "defensive, documented", the PO may overrule.
- "Surface the detail of the delivery-target `CGB-CONFLICT` through the finalizer admit output; move the leftover origins file of an already superseded state by a sanctioned verb": the first half is patch 11 (verb-first lead sentence inside the 200-character cut), the second half is patch 14 (replaying the same supersede request now moves the leftover origins entry). Entry can fall after patches 11 and 14 are applied and installed; the consumer whose state was left by the earlier build then reruns the same supersede request once.

### Further agent entries examined on 2026-10-29 (measured or read, nothing applied)

- `FPR-LINEAGE-COVERAGE-CLAIM`, a second look at a possible pin: the refusal compares `consumed.receipt.reviewRange` with the packet range. Before it, `readConsumedCourseClaimBinding` requires `receipt == sessionCriticReceiptForResult(result)` and `result.reviewRange == expected course range`, and `validateSessionCriticResult(result, packet)` binds the result range to `packet.diff`. A forged receipt range therefore fails the claim binding first (`CVL-COURSE-BINDING`), and a forged packet range fails the result validation first. No injection seam exists in `addCriticReviewLineage`. A case would need a state no route produces; the branch stays defensive and unpinned on purpose.
- `pipeline.brownfield-implementation-entry-demands-a-greenfield-design-block` ("established with ratchet", D66): the PO signed AC-9 as `approved-scoped` for `specs/sprint-alfred-epic/` (D142, 2026-10-22) and decided that building the four proposed stages is follow-up work, not 0.7.0. The pin file `lib/pins/brownfield-implementation-entry-demands-a-greenfield-design-block.test.mjs` says so in its header ("NOT covered ... built after 0.7.0"). Since D162 the net-new ratchet under a deferral is retired in favour of the migration refusal `ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED`, pinned in the same file (cases c, state 1, state 2) and in `architecture-entry-readiness.test.mjs` (`D162 S3`). So the entry is answered: covered by the signed AC-9 adoption and the D162 migration cases for 0.7.0; the explicit "established" state is not built by decision. The header lines 6 to 8 of the pin still say the net-new ratchet "IS covered"; the case bodies say D162 retired it; a comment-only fix is optional.
- `pipeline.hgo-stale-capability-shadows-current-authorization` ("first-run AC8 failure versus the isolated green retry"): `lib/pins/hgo-stale-capability-shadows-current-authorization.test.mjs` run twice on a clean clone of HEAD `3521474bd`: 8 of 8 pass both times, AC8 included. The shared fixtures (P1 serves AC8, AC6, AC1 in that order, defined in that order) show no order or timing dependence between runs. The first-run failure could not be reproduced; the entry stays open only as "not reproduced on two clean runs", it is not an open defect.

- `pipeline.approval-bound-design-package-lives-in-an-ignored-directory` ("one todo case in `rebind-approval.test.mjs` still fails on the fixture clone"): `plugins/pipeline-core/scripts/rebind-approval.test.mjs` on a clean clone of HEAD `3521474bd`: 10 tests, 9 pass, 0 fail, 1 todo. The todo is `inspect of an approval that cannot be verified on this checkout lists rebind-approval alongside reopen-design`, marked `todo` with a stated reason (the throwaway clone is not an onboarded project, onboarding inspect returns `partial`, the ready branch is never reached). It does not fail the run. CORRECTION (same day, after the slice `w7-rebind-approval-inspect-fixture-n3` stopped and the Elephant re-checked it): the first reading here, "fixture work, not a product defect", was wrong. The todo case asserts the ratified requirement R75_INSPECT (Ruling 58, Spec 22.5): onboarding `inspect` offers `rebind-approval` beside `reopen-design`. `lib/project-onboarding-v3.mjs` contains no occurrence of `rebind-approval` (`rg -c` finds none): `designToImplementationHandoverAction` builds only `reopen-design`, `materialize-architecture`, `architecture-design-required` and `set-phase`. The verb and its receipt exist and are pinned by the other nine cases, but the onboarding offer was never built, and the todo's stated reason (not an onboarded clone) hid that. So even a perfect onboarded fixture would leave the last assertion red. This is an open production gap with design latitude (which design result or authority state triggers the offer, where in `nextAction` it sits; the pin walks the whole tree and pins neither). Notes: `w7-rebind-approval-inspect-fixture-n3.notes.md`. Suggested split: a production slice with its own RED case in the harness of the brownfield pin section (d), then the onboarded-clone fixture. FOLLOW-UP CHECK (read only, same day): the production slice is NOT ready to be briefed, because the trigger is doubtful. (1) The device-local codes (`DWP-READINESS-HOST-RECEIPT-UNAVAILABLE`, `DWP2-DURABLE-COURSE` and the other three of `DEVICE_LOCAL_CODES`) are not in `ARCHITECTURE_DESIGN_REOPEN_CODES`, and `lib/architecture-design.mjs` does not mention them at all. (2) `design-readiness-host-evidence.mjs` documents that an approved plan does not need these private parts again (PO decision BL: the stored-approval reader never consults them) and that they are not tamper or drift codes. (3) `designToImplementationHandoverAction` offers `reopen-design` only for a verified drift code (AC-174) and answers every other invalid architecture result with `architecture-design-required` and "do not reopen design". So on an approved, onboarded clone the pre-condition of the todo case, "reopen-design is offered today for an approval this checkout cannot verify", probably never holds, and "rebind-approval beside reopen-design" (Ruling 58, 2026-10-08) was probably overtaken by BL and AC-174. This is not shown by a run (the onboarded fixture does not exist), so it is a PO question, not an implementation task: (a) retire R75_INSPECT and replace the todo case with a case that pins what inspect really answers on an approved clone with the private parts hidden, or (b) keep R75_INSPECT and name the state in which inspect should offer `rebind-approval` (then the offer belongs to the `!isArchitectureDesignReopenCode` branch, shown only when the architecture result carries a `deviceLocal` finding, which the architecture inspection does not produce today, so the wiring grows). Any slice must keep the AC-174 cases unweakened.

- `pipeline.disjoint-signed-hgo-actions-invalidate-one-another` ("two documented diagnostic gaps in the isolation suite are todo cases ... optional"): the entry text is stale. `lib/human-guard-override-disjoint-isolation.test.mjs` has no `todo` case any more; the two cases were registered as `todo` by ALF-K17 and pass since ALF-K22 (`an expired action reports HGO-EXPIRED even while unexpired siblings are armed`, `delivering one action audits no rejection against its undisturbed siblings`, each per tool), and ALF-K22 added two more (`a call matching no signed action ... audits nothing against any armed sibling`, `an expired sibling is neither audited nor reported for a call that is not its action`). Clean clone of HEAD `5b41e3095`: 38 tests, 38 pass, 0 fail. The entry can fall.
- `pipeline.host-crash-during-verify-leaves-a-descriptor-no-recovery-verb-can-clear` ("the red K1D session-cleanup-binding case is open in the same cluster"): that case is not red. `onboarding-continuity.test.mjs` on a clean clone of HEAD `623f59766`: 324 tests, 323 pass, 1 fail, and the one failure is `OBC264`, a different and stale test (patch 18 fixes it). The K1D clause of the entry is stale.
- Not touched, with the reason: the Reader course of `pipeline.bounded-reader-terminal-binding` (batch 13 of `plans/sitting-preparation-index-2026-10-23.md` runs the third full round "on the final state" after the sitting; the state is not frozen, because held patches that change Reader inputs (the operator text of patch 10 among them) are unapplied and docs change with every commit, so a round read now could not be bound by the terminal record; the owner acceptance and the policy-transition field also stay with the PO) and the retest of four concurrent Agent calls of `pipeline.glossover.pf86-registry-lock-is-busy-while-agents-run`. Attempted afterwards: two real slices on different items were built for one message, but the generator binds every slice to the same accepted criterion (`AC-160`), and a dispatch while the K1 slice still held its reservation was refused `item-delivery-owner-collision` (not a lock refusal). So a valid fan-out test cannot be built with the current generator; it needs slices that bind different criteria. The two slices were therefore sent one after the other (both admitted, each after the previous reservation was released with `slice-queue cancel --started --class integrated-elsewhere` because the Goldfish left a checkpoint or no host commit). One more observation: a Goldfish that ends with `outcome succeeded` still leaves its reservation open here (host commit `SDC-AUTHORITY-UNAVAILABLE` / `NGHR-FINAL-JSON` at its stop), so the Elephant releases it by hand after verifying and committing the evidence.

## Named gaps and gates (not done)

- Memo: no native Windows run was possible; the memo is exercised only with a fake spawn. Residual risk: a change that does not move the stat identity tuple within one command run is not seen. The memo
  counters are in `nativeAuthorityStats()` and, with patch 4, in the `AUTHORITY-TRACE` line (`authorityMemo`: hits, misses, size). The effect must be measured on native Windows with
  `PIPELINE_AUTHORITY_TRACE=1` before and after. The Goldfish saw `pipeline-state-external-push-ledger.test.mjs` fail (PSXL05) in its scratch clone on patched AND unpatched code; it passes 1 of 1 on the
  Elephant clone, so that was an environment effect of the scratch clone, not of the patch.
- Critic path rule: patch 9 drove the registration route of a consumed course round up to the registered lineage with eight special file names and found no further refusal (without patches 5 to 8 the same case
  fails at `addCriticReviewLineage` with status `refused`, the consumer failure). Printed hints that interpolate a path unquoted into a command were surveyed only in part (the register-feature-package,
  add-diagnostic-evidence and add-delta-request hints use placeholders); the other hint sites stay with the next slice. The JSON schemas are only read by tests (no runtime validator library applies them, checked by search).
- Full Verify, the batch Critic, the native Windows gates (D58 to D61), D31 native qualification, the real consumer retests and PO acceptance stay open.

## PO apply blocks (from the repository root)

Block 1 (state authority):
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-state-authority-diagnostics-e1b.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-state-authority-diagnostics-e1c.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-state-authority-memo-e2.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-state-authority-trace-memo-e3.patch`
`git add -A -- plugins/pipeline-core harness/scripts`
`git commit --no-verify -F scratch/commit-msg-po-apply-state-all.txt`

Block 2 (Critic path rule):
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-path-charset-f1.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-path-charset-f1-c2.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-path-charset-f2.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-path-charset-f3.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-path-charset-f4.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-critic-range-bindings-operator-text-d2.patch`
`git add -A -- plugins/pipeline-core harness/scripts`
`git commit --no-verify -F scratch/commit-msg-po-apply-critic-paths.txt`

Block 2b (PF-95 admit refusal detail, own commit):
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-pf95-admit-refusal-detail-c24.patch`
`git add -A -- plugins/pipeline-core`
`git commit --no-verify -F scratch/commit-msg-po-apply-pf95-detail.txt`

Block 2c (round 2 of a Critic course, own commit, both patches together):
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-pf94-round2-walk-h1.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-pf94-round2-walk-h2.patch`
`git add -A -- plugins/pipeline-core harness/scripts`
`git commit --no-verify -F scratch/commit-msg-po-apply-pf94-round2.txt`

Block 2d (replay of an old takeover, own commit, after 2c):
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-pf95-supersede-replay-moves-leftover-origins-k1.patch`
`git add -A -- plugins/pipeline-core`
`git commit --no-verify -F scratch/commit-msg-po-apply-pf95-replay.txt`

Block 2e (independent, test only, any time; it removes the finalizer baseline red, `w7-finalizer-baseline-red-assurance-m1`: the case `private task snapshot binds uppercase delivered-v3 bytes ...` expected the binding from before PF-93; patched 87 of 87 on HEAD):
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-finalizer-baseline-red-assurance-m1.patch`
`git add -A -- plugins/pipeline-core`
`git commit --no-verify -F scratch/commit-msg-po-apply-finalizer-assurance.txt`

Block 2f (independent, test only, `w7-d60-feature-request-other-candidate-pin-n1`: the feature-request admit of another candidate is refused `CDP-EVIDENCE-BINDING`, the held packet stays untouched and the original request still completes; the D60 agent entry "both unpinned in the v2 bundle" was partly stale, the other half is pinned by `D60 c4 (a)` and `D60 path release`):
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-d60-feature-request-other-candidate-pin-n1.patch`
`git add -A -- plugins/pipeline-core`
`git commit --no-verify -F scratch/commit-msg-po-apply-d60-pin.txt`

Block 2g (independent, comment only, `w7-brownfield-pin-header-n2`: the header of the brownfield entry pin no longer says the net-new ratchet is covered; it states the D162 migration refusal for every path and that the established-with-ratchet state is follow-up work after 0.7.0, D142; pin file 16 of 16 before and after, checked by the Elephant on a fresh clone):
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-brownfield-pin-header-n2.patch`
`git add -A -- plugins/pipeline-core`
`git commit --no-verify -F scratch/commit-msg-po-apply-pin-header.txt`

Block 2h (independent, test only, `w7-onboarding-continuity-obc264-authoring-p1`: the case `OBC264` planned a bind on an unauthored scaffold for the feature and epic profiles, which `5e939278b` refuses on purpose; it was the one red case of the file, 323 of 324 on HEAD; patched 324 of 324, `check-verify-case-completion` 32 of 32 before and after):
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-onboarding-continuity-obc264-authoring-p1.patch`
`git add -A -- plugins/pipeline-core`
`git commit --no-verify -F scratch/commit-msg-po-apply-obc264.txt`

Block 3, tell the Elephant: it stamps, you refresh the installed plugin copy and install, the Elephant reads the preflight back. The consumer then runs the failing round-2 registration again; a refusal that
names a different place is reported with its exact code and message.

## For the Windows consumer after the install

Run the previously slow command once with `PIPELINE_AUTHORITY_TRACE=1` (PowerShell: `$env:PIPELINE_AUTHORITY_TRACE='1'`, the command, `Remove-Item Env:PIPELINE_AUTHORITY_TRACE`) and send the one `AUTHORITY-TRACE`
line plus the refusal line, if any. For a comparison run the same command with `PIPELINE_AUTHORITY_NO_MEMO=1` (the memo off).
