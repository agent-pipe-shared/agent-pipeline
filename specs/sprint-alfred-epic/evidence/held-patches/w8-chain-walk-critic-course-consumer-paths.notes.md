# W8 chain walk of the consumer Critic-course paths: notes of the held patch

Slice `W8-CHAIN-WALK-CRITIC-COURSE-CONSUMER-PATHS-20261031` (built in the prepared clones on top of the combined candidate: CIB range fix
plus D213 finding-disposition role, N35 addendum and course chain, D215 inventory text). Targeted delivery only; batch Critic, full Verify,
native Windows runs and PO acceptance stay with the Coordinator.

## What the patch contains

| File | Kind | Change |
|---|---|---|
| `plugins/pipeline-core/lib/pins/critic-course-consumer-chain-walk.test.mjs` | NEW test (needs registration, see Open items) | The whole-chain walk: 8 cases, 3 paths, 5 negative variants |
| `plugins/pipeline-core/lib/critic-course-admission.mjs` | production | NEW export `resolveRetainedCriticCourseRecords`: the retained Critic course read through `retainedV2` (lineage rows of schema v1 AND v2) |
| `plugins/pipeline-core/scripts/check-critic-skip-coverage.mjs` | production | `defaultReadCourseHistory` (the N35 chain reader) now reads the course through `resolveRetainedCriticCourseRecords` instead of the v1-only `resolveRegisteredCriticCourseHistory` |
| `plugins/pipeline-core/scripts/close-coordinator.mjs` | production (text) | The `CLOSE-CRITIC-EVIDENCE-MISSING` repair names the addendum command "once for EACH uncovered record (one addendum file per record ...)" |

No protected kernel path was edited (no `hooks/guard-push.mjs`, no `scripts/pipeline-state.mjs`, no guard test).

## The chain, step by step (what each walk case drives)

Every case builds ONE temporary git repository shaped like a consumer's: `.gitignore` lists `/project/pipeline-state.json`,
`/.claude/pipeline-state.json`, `/scratch/` and the captured diagnostic logs; `project/pipeline.json` lists `criticFindingRecordPaths`
(`docs/findings.md`) next to the `handover` path (`docs/state.md`); the correction commits quote earlier findings in `docs/findings.md`.

1. Slices: one commit each with the `Dispatch: <id> (goldfish)` trailer, then the record through the REAL route
   `dispatch-record-write.mjs --attested-request` (spawned). Records are persisted in the integration commit.
2. Per Critic round, in order:
   1. correction commit (a source file, the finding-record file, the state file);
   2. diagnostic evidence registered in the feature manifest (`produceCriticDiagnostic`, as the preflight suite does);
   3. for rounds after the first: `register-feature-package` delta request (`addCriticDeltaRequest`, the exported function the CLI calls;
      the CLI itself needs the project State), `trustBoundaryChanged: true` for the effective FULL round;
   4. `critic-correction-input-bindings.mjs derive` (spawned) over the round's range: correction range for a diff round, course genesis
      base to candidate for the effective FULL round;
   5. `critic-dispatch-preflight.mjs` (spawned) with that file: `packet-ready`, reviewed base and `fallbackFull` read back;
   6. `admitSessionCriticReview` / `finalizeSessionCriticReview` on the SAME parsed argv (the finalizer re-runs the preflight);
   7. `addCriticReviewLineage` (the exported function `register-feature-package --add-review-lineage` calls): lineage row of schema v2.
   8. PO residual acceptance of exactly the round's minor findings where the path has one.
3. Per slice record: `dispatch-record-write.mjs --critic-addendum` (spawned), one addendum file per record, each naming the LAST round.
4. `close-coordinator.mjs plan-start`, `plan-transition checkpointed`, `plan-transition feature-close-prepared` (spawned), then the apply
   action of the plan.
5. Push: `criticBoundVerifyRemedy` (the base push-prepare/push-init name) and the real `hooks/guard-push.mjs` (spawned) on a push of the
   closed candidate.

Cases: A (2 rounds, effective FULL round 2, repository root commit as genesis base, one slice) + its negative; B (full round then diff
round with minor findings and a residual acceptance, two slices) + root-commit variant + tampered-chain negative; C (four rounds, two
slices, two accumulated acceptances, an effective FULL round 3, unlisted finding file) + "slice not on the chain" negative + the C
shape ending in an accepted failed round with the "acceptance bound to another round's receipt" negative.

## Which step was red first

The first red step was in path B and C, at step 3 (`dispatch-record-write --critic-addendum`), exactly KNOWN GAP 1:
`Critic addendum does not match ... (the commit is not after the reviewed range base); nor does the registered Critic course cover it
(the Critic packet is no round of a registered Critic course)`. Everything before it (bindings, preflight, admission, finalizer,
registration) was green on the first run of each path; path A (single full receipt) was green end to end on its first run, the close
included. Machine-written log of the red run: `scratch/agent-out/w8chain/walk3.critic-course-consumer-chain-walk.test.mjs.log`
(5 of 7 cases red, all at the addendum step or at the registered-course read).

Cause: `defaultReadCourseHistory` read the course through `resolveRegisteredCriticCourseHistory`, which keeps only
`pipeline.critic-review-lineage.v1` rows; the current registration route (`addCriticReviewLineage`, compile route
`compileRegisteredCriticReviewLineage`) writes `pipeline.critic-review-lineage.v2` rows. A course registered through the real route read
as "no course".

## Production changes, callers and pinning tests

- `resolveRetainedCriticCourseRecords` (new, `lib/critic-course-admission.mjs`): read-only; caller `defaultReadCourseHistory`
  (`scripts/check-critic-skip-coverage.mjs`); pinned by the walk (history length 4, every row schema v2, the v1-only reader still returns
  0 rows) and by the N35 cases (j) of `close-coordinator-refuses-a-required-critic-without-evidence.test.mjs`, whose fixture writes v1
  rows (the new reader accepts both schemas, so those cases are the compatibility pin).
- `resolveRegisteredCriticCourseHistory` is deliberately UNCHANGED: its other consumers (`deriveRegisteredCriticCourseSource`, the
  v1 runtime admission) keep their documented v1 scope; sweep found its only other references in `critic-course-admission.test.mjs`.
- `close-coordinator.mjs` text: the substring `dispatch-record-write.mjs --repo-root <repo-root> --critic-addendum <request.json>` is
  unchanged (pinned by case (h) and `push-init.test.mjs` / `critic-round-cap-and-delta-scope-are-not-enforced.test.mjs`); the walk pins
  the new "once for EACH uncovered record". A sweep for the old contiguous wording `<request.json> (the request file` found no consumer.

## Results (clone = candidate + this patch; baseline = candidate only)

| Suite | Baseline | Clone |
|---|---|---|
| walk `critic-course-consumer-chain-walk.test.mjs` | file absent | 8/8 pass (three runs, last on the final tree) |
| `scripts/critic-dispatch-preflight.test.mjs` | 78/78 | 78/78 |
| `scripts/session-critic-finalizer.test.mjs` | 91/91 | 91/91 |
| `lib/critic-course-admission.test.mjs` | 82/82 | 82/82 |
| `scripts/close-coordinator.test.mjs` | 38/38 | 38/38 |
| `scripts/dispatch-record-write.test.mjs` | 40/40 | 40/40 |
| `lib/critic-verify-lifecycle.test.mjs` | 17/17 | 17/17 |
| `hooks/guard-push.test.mjs` | 272/272 | 272/272 |
| `lib/pins/close-coordinator-refuses-a-required-critic-without-evidence.test.mjs` | 20/20 | 20/20 |
| `harness/scripts/check-verify-case-completion.test.mjs` | 32/32 | 32/32 |

Failing-name sets: empty on both sides for all nine suites (no pre-existing red appeared in these nine). The patch applies on the
candidate (`git apply --check` exit 0 in the baseline clone). Machine-written logs: `scratch/agent-out/w8chain/{base1,c1,c1b,c1c}.*.log`,
walk runs `walk1..walk10`, revert log `revert.*.log` (untracked scratch; counts are carried here).

## Open items for the Coordinator

1. The walk file must be REGISTERED in `harness/verify-suites.json` (protected, TP-13, outside this slice's write scope) or Verify never
   runs it. Suggested entry shape, by analogy with its sibling: name `pin-critic-course-consumer-chain-walk-tests`, file
   `plugins/pipeline-core/lib/pins/critic-course-consumer-chain-walk.test.mjs`. The VCR01 table (check-verify-case-completion) lists no pin
   of this kind by name, so no pinned count is owed there. The walk takes about 160 s serial (eight repositories, three of them four-round).
2. "BOTH acceptances read": the close gate reads the acceptance of the LAST round only (D217 design). Path C as briefed ends in a passing
   round 4, so no acceptance is consulted; the walk asserts both acceptances exist, bind distinct receipts and load per packet. If the PO
   wants every accepted round's acceptance to be checked by the close, that is a new rule, not a repair; not built here.
3. The push step stops at the published-Continuity baseline check (`runtime.sessionCleanup`) before the pushed-state review decision for a
   consumer-shaped candidate (State gitignored); that is the D214 slice.
4. The empty-tree genesis base (a course reviewed from before the first commit) is not covered by the chain check; named above.
5. `closed-local` needs the final Verify and cleanup phases; the walk reaches `feature-close-prepared` (planned and applied).

## Revert proof (combined)

The two code edits are one logical change (the chain reader), the text edit is pinned only by the path C "slice not on the chain"
negative, so the proof is COMBINED: `driver.mjs revert` puts all three production files back to the candidate and runs the walk.
Result: 6 of 8 cases red (`PATH B`, `PATH B at a repository root commit`, `PATH B negative: tampered chain`, `PATH C`, `PATH C negative`,
`PATH C ending in an accepted failed round`), path A and its negative stay green. First assertion of the red run:
`TASK-ONE: DISPATCH-RECORD-WRITE-FAILED: addendum-unbound: ... nor does the registered Critic course cover it (the Critic packet is no
round of a registered Critic course)`, i.e. the expected step 3 (addendum). Restored byte-equal (driver readback: true). A first
revert attempt failed at module import (a named import of the new export); the walk now imports the admission module as a namespace so
the reverted run reaches the addendum step instead of failing at link time.

## Downstream sweep (unaffected consumers, with reason)

- `resolveRegisteredCriticCourseHistory`: unchanged; only `critic-course-admission.test.mjs`, the library itself and the walk reference it.
- The addendum command text: `skills/close-feature/SKILL.md`, `scripts/dispatch-record-write.mjs` (advisory), `scripts/push-init.test.mjs`,
  `lib/pins/critic-round-cap-and-delta-scope-are-not-enforced.test.mjs`, `scripts/critic-dispatch-preflight.test.mjs` and
  `scripts/dispatch-record-write.test.mjs` name or match the command; the matched substring
  `dispatch-record-write.mjs --repo-root <repo-root> --critic-addendum <request.json>` is unchanged, so they are unaffected (the SKILL and the
  writer advisory carry no "once per record" wording; that sits only in the refusal text, listed here for the Coordinator).

## The other known gaps, as the walk found them

- KNOWN GAP 2 (connectedness of an effective FULL round): NOT a defect. A v2 row of a round admitted as RE-DELTA-FALLBACK-FULL carries
  `request.mode: "full"`, `request.admissionCode: "RE-DELTA-FALLBACK-FULL"` and `diff.base` = the course genesis base (the packet's base);
  the existing `courseChainFinding` rule (`full` => base equals the genesis base) agrees. Pinned by the path C assertion
  `[mode, admissionCode, diff.base]` of the fallback round and by the chain succeeding through it. Genesis base = repository root
  commit: green (path A and the path B root-commit variant). NOT driven: a genesis base that is the EMPTY TREE (a course reviewed from
  before the first commit): `gitIsAncestor` would run `merge-base --is-ancestor` on a tree object and throw, which the caller turns into
  "not covered". No consumer has reported it; named, not fixed.
- KNOWN GAP 3 (one addendum names one packet): the gate asks for one addendum PER RECORD (`readCriticDispositionAddenda` keys by
  `recordPath`), every one naming the last round; the writer is `dispatch-record-write.mjs --critic-addendum` run once per record. The
  walk does exactly that for two slices (both bind through the chain) and pins that a slice outside the chain is the only one named. The
  refusal text did not say "once per record"; it does now.
- The accumulated acceptances (path C): both exist, each bound to its own round receipt (distinct receipt digests; the store loader
  finds each by packet). The close gate reads the acceptance of the LAST round only (D217: earlier rounds may carry findings, the later
  rounds reviewed the corrections). When the last round passes (path C as briefed) no acceptance is consulted at all; when it fails with
  minor findings (the "ending in an accepted failed round" case) its own acceptance is the one read. This is the existing D217 design;
  the walk does not invent a reader for the earlier acceptances. Tension with the briefing wording ("BOTH acceptances read") named for the
  Coordinator.
- Finding quoted from a file the calibration does not list: the derivation keeps it a SOURCE path (it is in `sourcePaths`, not in the
  exclusions, which hold only the calibrated `docs/findings.md`); no tool code refuses it, that is by D213 design (a file never declares
  itself).

## The push step as it behaves today (recorded, not repaired; D214 is separate)

- `criticBoundVerifyRemedy` names `--base <last registered round candidate>` and the feature (reads the v2 rows through `retainedV2`).
- The real `guard-push.mjs` on a push of the closed candidate (project State gitignored, so the pushed commit carries none) answers
  exit 2: `published Pipeline Continuity has no unambiguous runtime.sessionCleanup baseline.` The same answer with no State file in the
  working tree either. The pushed-state review decision (`pushedStateRequiresReview` -> `checkIndependentPublicationReview`) is therefore
  NOT reached by a consumer-shaped push today; the earlier published-Continuity check refuses first.

## Seams and what stays unverified

- Model call: the Critic verdict is a fixed value handed to `finalizeSessionCriticReview` with the existing `readOriginalSourceReturnFn`
  source-return seam (`allowCallerAuthoredFallback` is not used). A real Critic run is not driven.
- PO residual acceptance: `writeResidualAcceptanceRecord` in chat approval mode (committed `pipeline.user.yaml`), as the close pins do;
  the real `pipeline-state.mjs approve-residual-acceptance` is the PO's attended step and is not driven.
- The Critic's own per-round dispatch record is written as the existing preflight fixtures write it (`parentRound`); the SLICE records
  (the ones the close gate checks) go through the real attested route.
- `register-feature-package --add-delta-request` and `--add-review-lineage` run as their exported functions: the CLI requires the project
  State of the registering feature.
- `close-coordinator` is walked to `feature-close-prepared` (planned AND applied). `tracked-close-finalized`, `candidate-frozen`,
  `final-verify-green`, `cleanup-complete` and `closed-local` need a final Verify and cleanup and are not driven.
- Native host runs, a real signature and the real consumer repository: not driven. Windows-native: not run.
