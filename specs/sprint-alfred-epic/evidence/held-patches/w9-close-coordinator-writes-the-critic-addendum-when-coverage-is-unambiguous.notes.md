# W9 slice 2 of D223: the close coordinator writes the Critic addendum when coverage is unambiguous

Held patch, stacked on slice 1 (the finalizer writes the lineage; candidate `4ab464fafb36`, the prepared clone's HEAD). Built in the prepared
clones only; the patch is a diff of the edited clone against that candidate. Nothing is committed, staged or recorded by the builder.

## The problem and what changed

`close-coordinator.mjs plan-transition --phase feature-close-prepared` refused `CLOSE-CRITIC-EVIDENCE-MISSING` and told the agent to write ONE
byte-bound `pipeline.critic-disposition-addendum.v1` per uncovered record by hand (`dispatch-record-write.mjs --critic-addendum <request.json>`).
For a feature with several slices the request is fully derivable when exactly one consumed receipt or one registered course covers the record.

Now `plan-transition` (and ONLY `plan-transition`; `apply-transition` re-runs the same check and stays a pure check) derives it:

1. For each uncovered record (sorted by task id) it reads every consumed packet of the private store
   (`<git-common-dir>/agent-pipeline/critic-packets/<32 hex>`, `readConsumedCandidateReceipt`), builds a DRAFT addendum naming that receipt
   (`reviewCandidateCommit` = the receipt's candidate commit, `criticPacketId`, `criticReceiptSha256` = sha256 of the receipt in the packet store's
   canonical JSON) and asks `criticAddendumBindingFinding` whether it binds. That is the function the `--critic-addendum` verb verifies with, so
   every existing rule applies unchanged: a passed consumed receipt of the record's own task id; a receipt of another task id whose reviewed
   range contains the record's commit; a registered course named by its LAST round whose rounds form one connected chain; and a failed receipt
   binds only through a recorded PO residual acceptance (the coordinator never creates, fakes or infers one).
2. THE RULE FOR "UNAMBIGUOUS": the number of consumed receipts for which that finding is `null` is exactly 1. Zero covers, two or more covers,
   an addendum file already present for the record (even an unbound one), a record that is not a readable dispatch record, an evidence path
   occupied by different bytes, a tampered chain, or any read that throws: nothing is written for that record and its refusal text is today's,
   byte for byte. (A record covered by round 1's own range AND by the last round's chain counts as two covers and is refused; this is the
   conservative reading of "two or more covers", named here because the briefing did not spell it out.)
3. For a record with exactly one cover it writes two files, evidence first: `evidence/critic-disposition-evidence-<taskId>.md` (deterministic text
   that names the record digest, the record commit, the packet, the review candidate and the receipt digest; a pointer, not a second verdict) and
   `evidence/dispatch-critic-addendum-<taskId>.json` through the exported `writeCriticDispositionAddendumObject`, the function the verb calls,
   with `verifyBinding: criticAddendumBindingFinding` (the binding is proven again with the real evidence file before the exclusive publication).
   The probe uses the record file itself as the draft's evidence reference (the binding finding never depends on the evidence path), so a probe
   writes nothing.
4. It NEVER stages and NEVER commits (PO decision D223). If anything was written, the plan refuses with the new typed code
   `CLOSE-CRITIC-ADDENDA-WRITTEN`; the refusal message names every written file, the exact commit instruction (`git add -f -- <paths>`, then
   `git commit`, suggested subject), and that the plan must be run again after that commit. The structured field `criticAddenda`
   (`pipeline.close-critic-addenda-written.v1`: `written[]`, `commitPaths`, `commitInstruction`, `planAgain`) carries the same facts for a
   machine reader. Records the course does not cover keep today's `CLOSE-CRITIC-EVIDENCE-MISSING` sentence, appended verbatim for exactly those ids.
5. A write failure removes every file this plan created (all-or-nothing across the records of one plan; a pre-existing file is never touched) and
   refuses with `CLOSE-CRITIC-ADDENDA-WRITE-FAILED`. A plan run again before the commit succeeds without rewriting or altering any file.

Why a new code instead of reusing `CLOSE-CRITIC-EVIDENCE-MISSING`: after the write the evidence is no longer missing, and an operator or
script that keys on the old code would be sent to write by hand what is already on disk. The ambiguous cases keep the old code and the old text.

## Production files changed (one)

- `plugins/pipeline-core/scripts/close-coordinator.mjs` (guard kernel list: the PO applies the patch under a Guard Maintenance Window).
  Adds imports of existing exports only, the `deriveCriticAddenda` block, `fail(code, message, { criticAddenda })`, the `deriveAddenda`
  option threaded `plan-transition` -> `transitionPlan` -> `assertCourseCriticEvidence`, the `criticAddenda` field in the error emit, and
  splits the existing refusal sentence into `missingMessage(ids)` (identical bytes for the full id list).

No new lib module (the kernel closure test is unaffected: it is red with the same 29 findings in the baseline). `dispatch-record-write.mjs`,
`critic-disposition-addendum.mjs` and `check-critic-skip-coverage.mjs` are NOT changed: every needed export already existed
(`writeCriticDispositionAddendumObject`, `criticAddendumBindingFinding`, `walkDispatchRecords`, `readConsumedCandidateReceipt`, `canonicalJson`).

## The chain run (extended pin, no new test file)

`plugins/pipeline-core/lib/pins/close-coordinator-refuses-a-required-critic-without-evidence.test.mjs` gained the `(k)` cases. The consumer
fixture is built through the real entry points: slice records through `dispatch-record-write --attested-request`; every Critic round through
`critic-correction-input-bindings derive` -> `critic-dispatch-preflight` -> admission -> the finalizer (which writes the lineage, slice 1), with
the lineage committed as the finalizer's own commit instruction names it; then the real `close-coordinator` `plan-start`, checkpoint, plan,
the agent's commit, plan and apply.

- `(k) D223 chain`: three item slices (own record each), a three-round Critic course (round 1 failed, round 2 minor findings with a recorded PO
  residual acceptance, round 3 passed). The first plan writes six files (three addenda, three evidence files), stages and commits nothing, and
  refuses once with the commit instruction; a plan run again before the commit changes nothing; the agent commits the named paths; the second
  plan succeeds and the apply returns `applied`.
- `(k) a course closed by a PO residual acceptance of its last round`: two slices on the course plus one record on no round
  (commit before the genesis): addenda for the two, none for the third, whose refusal text is today's, naming only it.
- negative (1) no receipt and no course: `CLOSE-CRITIC-EVIDENCE-MISSING`, tree byte-identical. negative (2) two passed receipts cover each
  record: refused, tree identical. negative (3) rounds failed with no residual acceptance: refused with the failed-receipt text, tree identical.
  negative (4) a registered lineage row with changed bytes: refused, tree identical.
- control: one passed consumed receipt covering both records (own task id and range) is written.
- apply never writes: a covered record that appears after planning refuses the apply and leaves no derived file.
- write failure: a dangling symbolic link on the second record's addendum path makes the second publication fail; the first record's two files
  are removed again and the plan refuses `CLOSE-CRITIC-ADDENDA-WRITE-FAILED` (skipped on win32, where an unprivileged symbolic link cannot be made).

Which step was red first: all writing cases failed at the first plan (`CLOSE-CRITIC-EVIDENCE-MISSING` instead of `CLOSE-CRITIC-ADDENDA-WRITTEN`)
against the unchanged code; the negatives and the apply case pass against the unchanged code by design (they pin that the refusal stays and
nothing is written). A first run of negative (2) failed in the fixture (`CGB-CONFLICT`: one Critic review unit is owned by one batch), fixed by
giving each packet its own review unit over the same range; a first run of the chain case failed on its own last line (a fixture artefact: the
Critic's per-round dispatch records are untracked), restated to compare the tree before and after the second plan.

Named seams (not hidden): the Critic model call (a fixed verdict handed to the finalizer, with the source-return origin of the existing
suites), the PO residual acceptance (`writeResidualAcceptanceRecord`, chat approval mode, as the neighbouring pins do), the Critic's own per-round
dispatch record. The walk ends at the APPLIED `feature-close-prepared` phase: the briefing names `closed-local`, but that needs the tracked
close, a frozen candidate, a green final Verify, an authorized and read-back publication and the cleanup evidence, none of which a fixture
can produce without a real Verify run and push; the existing walk pin stops at the same phase.

## Callers and pins (downstream sweep)

- `close-coordinator.mjs` refusal text: pinned by the `(h)` case and by `critic-round-cap-and-delta-scope-are-not-enforced.test.mjs` (AC3, AC3b,
  source regexes; unchanged text, green).
- `CLOSE-CRITIC-EVIDENCE-MISSING` named by `dispatch-record-write.mjs` (`criticCoverageAdvisory` `nextStep`, pinned in
  `dispatch-record-write.test.mjs` DRW advisory case): still true (the code is kept for every ambiguous case); the advisory could additionally
  mention that the close now writes the addendum when coverage is unambiguous. Unaffected, listed for the PO.
- `critic-course-consumer-chain-walk.test.mjs` writes its addenda through the verb before the plan; the plan then finds nothing to write
  (green, same results as the baseline).
- `review-admission-read.mjs`, `critic-course-admission.mjs` (a comment): the readers; unaffected.
- `plugins/pipeline-core/skills/close-feature/SKILL.md` (not edited here): needs a text change. It names the manual addendum step as the only
  route, and says every close step is "first a read-only plan"; the plan now may write the addenda and refuses with
  `CLOSE-CRITIC-ADDENDA-WRITTEN`. Suggested wording: after the paragraph that names the `--critic-addendum` verb, state that
  `plan-transition` writes the addenda itself when exactly one consumed receipt or one registered course covers a record, never commits, and
  that the agent commits the named files and plans again; the manual verb stays for ambiguous cases.
- The coordinator's candidate freeze (`CLOSE-CANDIDATE-DRIFT`, clean tree required) still rejects a close whose written files were not committed.

## Verification state (machine-written logs in the builder's scratch directory; clone = patch applied, baseline = candidate only)

| Suite | Baseline | Clone |
|---|---|---|
| close-coordinator-refuses-a-required-critic-without-evidence pin | 20/20 | 29/29 (20 + 9 new cases) |
| close-coordinator.test | 38/38 | 38/38 |
| dispatch-record-write.test | 40/40 | 40/40 |
| check-critic-skip-coverage.test | 61/61 | 61/61 |
| critic-course-consumer-chain-walk pin | 15/15 | 15/15 |
| critic-round-cap-and-delta-scope-are-not-enforced pin | not run | 12/12 |
| check-verify-case-completion.test | red (VCR01) | red (VCR01), same name; not edited (the stack's pinned counts are fixed once at assembly by the Coordinator; this slice moves no pin of its own suites) |
| guard-maintenance-window-kernel-closure.test | red, 29 findings | red, same 29 findings |

Test-first: against the unchanged code the chain, mixed, control, two-receipt and write-failure cases were red; negatives (1), (3), (4) and the
apply case pass there by design (they pin that the refusal stays and nothing is written).

Revert proof: with `close-coordinator.mjs` (the only production file) reverted to the candidate, the chain, mixed, control and write-failure
cases are red (4 failures; the files were restored byte-equal). Two single-line mutations in the clone, each restored: (1) the derive option
defaulting to true, so apply-transition would write, turns the apply case red (CLOSE-CRITIC-ADDENDA-WRITTEN instead of
CLOSE-CRITIC-EVIDENCE-MISSING); (2) removing the rollback turns the write-failure case red (the first record's addendum and evidence file stay
behind). After restoring, the patch is byte-size identical (59071 bytes) and the 11 cases matching the pattern pass.

## Stays unverified

Native host runs, a real signature, a real model call (the seams above), a real consumer repository with hundreds of consumed packets (the
derivation tries every consumed packet per uncovered record; a store with many packets costs git reads in proportion, which was not measured),
Windows-native runs (the symbolic-link case is skipped there), and `closed-local`.
