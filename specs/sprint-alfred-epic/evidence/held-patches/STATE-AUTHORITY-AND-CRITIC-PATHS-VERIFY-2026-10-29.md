# State authority diagnostics and memo, and the Critic route path rule: verification and PO apply blocks (2026-10-29)

Fifteen patches (patch 15, `w7-finalizer-baseline-red-assurance-m1`, is test only and independent: Block 2e), applied in this order, in five commits plus that one (patch 14, `w7-pf95-supersede-replay-moves-leftover-origins-k1`, is its own topic and its own commit; patch 4, `w7-state-authority-trace-memo-e3`, patch 9, `w7-critic-path-charset-f4`, patch 10, `w7-critic-range-bindings-operator-text-d2`, patch 11, `w7-pf95-admit-refusal-detail-c24`, and patches 12 and 13, `w7-pf94-round2-walk-h1` and `-h2`, were added after the first version of this note; patch 11 is its own topic and its own commit, patches 12 and 13 are one commit because 12 alone carries a red case). This is a set of HELD PATCHES: nothing in it is applied, stamped, installed, reviewed or accepted until the PO has done so. It supersedes the apply
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

Block 3, tell the Elephant: it stamps, you refresh the installed plugin copy and install, the Elephant reads the preflight back. The consumer then runs the failing round-2 registration again; a refusal that
names a different place is reported with its exact code and message.

## For the Windows consumer after the install

Run the previously slow command once with `PIPELINE_AUTHORITY_TRACE=1` (PowerShell: `$env:PIPELINE_AUTHORITY_TRACE='1'`, the command, `Remove-Item Env:PIPELINE_AUTHORITY_TRACE`) and send the one `AUTHORITY-TRACE`
line plus the refusal line, if any. For a comparison run the same command with `PIPELINE_AUTHORITY_NO_MEMO=1` (the memo off).
