# Held patch notes: w7-r2-pipeline-state-harness-fixtures

Slice W7-R2-PIPELINE-STATE-HARNESS-FIXTURES-20261031. Candidate: HEAD db1e4f2be (no held patch stacked). The patch
touches one file, `harness/scripts/pipeline-state.test.mjs` (92 insertions, 15 deletions); no production code changed.
Evidence: `pre-existing-reds-hide-new-cases` item, evidence 3 and Wanted 1.

## The state before

On the plain candidate the suite crashed at line 1252 (`legacy.planApproval` undefined) after
`submit-plan refused (PLAN-SUBMIT-SOURCE-DRIFT)`. Cause: `injectedPoGateAuthority` invented `planSha256`/`specSha256`
as sha256("fixture:<path>"), while `submit-plan` binds the physical authoring sources (`inspectSubmissionSources`) and
needs a readable git candidate. Every `submitAndApprove` failed, and the cases that build on an approval crashed or
asserted on the wrong state. With only that fixed the suite ran to the end with 17 further failures (514/531), which
fell into three further stale-fixture classes below. The final run is 531/531, exit 0.

## Changed helpers (all in `harness/scripts/pipeline-state.test.mjs`)

| Helper | Change | Why |
| --- | --- | --- |
| `seedLifecycleSources(dir, planPath)` | new | writes a real Spec (`# Test Spec`, passes the criterion-row scan) and a real PRD next to `planPath`, keeps an existing file as it is, returns the sha256 of the bytes on disk |
| `injectedPoGateAuthority(planPath, dir = null)` | optional `dir` | with `dir` the authority hashes come from the physical bytes; without `dir` the legacy path-derived hashes stay (bind-plan-spec cases PS08f.. and PS18 never read the sources) |
| `LIFECYCLE_GIT_CANDIDATE` | new | same `{ ok: true, commit, tree }` shape the maintained plugin suites inject through `gitCandidate` |
| `lifecycleDeps` | passes `dir` to the authority, adds `gitCandidate` | `submit-plan` needs both |
| `initializeLifecycleContinuity` | passes `dir` | the continuity authority must carry the same hashes as the submission |
| `readStateThroughCriticalStore(dir)` + import `withPrivateCriticalApprovals` | new | D206: the reconcile approval and proof consumption live in the private store under the git common directory; the RG cases read them through the shared overlay (mirrors `approvalReadThroughStore` in the maintained `plugins/pipeline-core/scripts/pipeline-state.test.mjs`) |
| `seedConfiguredCalibration(dir)`, `enterImplementation(dir, deps)`, `LIFECYCLE_VERIFY_COMMAND` | new | see "set-phase" below |

Inline fixture additions: PS12 gets a committed `pipeline.user.yaml` with `gates.human_approval: chat` and
`materializeArchitectureDesignFixture` (the PS14 shape); PS14 commits a configured `project/pipeline.json` before the
design materialization.

New case: PS06f (test-first for this slice, backlog evidence 3): the submitted Plan and Spec digests, and the approval
authority's plan digest, equal the sha256 of the files the fixture wrote. It is red on the candidate for the same
reason PS06a0..PS06d are (submit refused) and green after the change.

## Cases unblocked, by cause

1. Physical sources and git candidate (`seedLifecycleSources`, `gitCandidate`): PS06a0, PS06a0-1, PS06a, PS06c, PS06d
   and the new PS06f; PS08a/PS08b..e and the PS08a-1..-3 chain (the crash at line 1252 is gone); PS09; the AR03h
   lifecycle setup; the HL (human-legible briefing) block's `lifecycleDeps` use.
2. PS12 (real subprocess): `submit-plan` was refused `ARCHITECTURE-MAP-MISSING`. PS12 now materializes the same small
   design package PS14 does. The `human_approval: chat` yaml is a fixture addition, needed because
   `materializeArchitectureDesignFixture` throws in signature mode without a proof policy; the push gate keeps its
   signature default, so PS12c (approve-push without a proof is refused) keeps its meaning. Unblocks PS12b0, PS12b-1,
   PS12b, PS12d.
3. set-phase (PS08a-4, PS09a/b, PS14c/f/h, AR03h-setup and AR03h): each of these four set-phase call sites was refused
   `CVCT-COMMAND` on the first run (`set-phase implementation refused calibration commit preflight`). The call carried
   `--verify-command`, which is now the guarded calibration transition: it needs a Git repository with the baseline
   calibration committed and a requested command equal to a committed configured one, otherwise it refuses
   `CVCT-*` (`inspectReplayableCalibrationVerifyLayout`). These cases test the phase transition, not that rewrite; the
   rewrite route is owned by `plugins/pipeline-core/scripts/pipeline-state-calibration-recovery.test.mjs`, which
   drives `--verify-command` (25 mentions, checked). The cases are restated to the shape of the maintained
   `check-state-phase-consistency.test.mjs`: a configured `project/pipeline.json` exists first and
   `set-phase --phase implementation` runs without `--verify-command`. In PS14 the configured calibration is committed
   (real repository, subprocess); in PS08a-4 and PS09 `seedConfiguredCalibration` writes it; AR03h already wrote its own
   `project/pipeline.json` (`verify: "echo ok"`) and the seed keeps an existing file. All assertions are unchanged.
   Unlike the other three, `--verify-command` is no longer exercised in this file; that is a narrowing of this suite
   only because the owner suite above covers it.
4. D206 reconcile approval (RGo x2, RGr, RGp, RGs-3): the approval and consumption are written to the private store, not
   the tracked state, so the cases read through `withPrivateCriticalApprovals`. Their assertions are unchanged; the
   byte-identity check after the refused replay (RGq) now compares the overlaid state, so it is no stronger or weaker
   than intended.

## Evidence (machine-written logs in the scratch directory of this slice)

- Baseline `base0.pipeline-state.test.mjs.log`: plain candidate, crash at line 1252, after PLAN-SUBMIT-SOURCE-DRIFT and
  PLAN-LIFECYCLE-CURRENT refusals. The baseline has no failing-name set (it never reaches the end).
- Intermediate `c1.pipeline-state.test.mjs.log`: only the physical-source/git-candidate fix: 514/531, 17 FAIL names
  (PS08a-4, PS09a/b, PS12b0/b-1/b/d, PS14c/f/h, AR03h-setup, AR03h, RGo x2, RGr, RGp, RGs-3), all classified above.
- Final `c2.pipeline-state.test.mjs.log`: `531/531 cases passed.`, exit 0.
- Other suites, baseline (`base1.*`) against clone (`c1.*`, same label reused for these three): decision-reference 11
  passed 0 failed both; external-push-ledger 5/5 both; check-verify-case-completion exit 1 in both with the same single
  failing name `VCR01` (pre-existing count drift, outside this slice; this suite's case count is not a pinned row, so no
  pinned count moved and `check-verify-case-completion.test.mjs` is unchanged).
- Revert proof: the baseline run `base0` is the file without the fixture change and shows the crash; the driver's
  `revert` mode reverts only production files (`pipeline-state.mjs`), which this slice never touches, so it would prove
  nothing here.
- Patch: `git apply --check` on the baseline clone exit 0; diff stat shows only `harness/scripts/pipeline-state.test.mjs`.

## Downstream sweep

`rg` for `injectedPoGateAuthority|lifecycleDeps|initializeLifecycleContinuity|seedLifecycleSources|LIFECYCLE_GIT_CANDIDATE`
in `harness/` and `plugins/pipeline-core`: besides this file only `pipeline-state-approve-announce.test.mjs` and
`check-state-phase-consistency.test.mjs`, which define their own same-named local helpers and import nothing from this
file; unaffected (not run). `readStateThroughCriticalStore`, `seedConfiguredCalibration` and `enterImplementation` are new
and used only here.

## Left alone

- Line 1758 (PS21) still calls `set-phase --verify-command` on an unapproved feature and ignores the result; it passes
  and is outside this slice.
- Production code: nothing looked wrong; every refusal met was the documented current contract.
- Pre-existing reds outside this slice (R1 guard-push family, unregistered suites, VCR01, onboarding-v3 chunk 0).

## Coordinator follow-up after the return (2026-10-31)

The first dry run of the full candidate-13 stack failed one case, the third clause of `RGr the governing state now
carries TWO consumption entries ...`. R2 alone on HEAD failed the same way, and a second run in the same clone passed.
The case is flaky, and no other patch is involved.

Cause: RGo and RGr both apply with `now() === PAC08_NOW`, so both private approval records carry the same `approvedAt`.
The private store names a record `<approvedAt ms>-<digest of the envelope>` and treats the name that sorts highest as
the latest. With equal instants, the digest of the randomly keyed proof decides, so "lastApproved is RGr's" held about
half of the time.

Fix (Elephant, in the clone): RGr applies one second after RGo (`now: PAC08_NOW + 1 s`, still before `PAC08_EXPIRES`).
The assertion is unchanged. Three consecutive runs (`c10`, `c11`, `c12`) each report `531/531 cases passed.` The
patch was regenerated: 18161 bytes, the same single file, apply-check exit 0.

The production ordering ties only when two approvals of the same kind land within the same millisecond, so it is
left as it is.
