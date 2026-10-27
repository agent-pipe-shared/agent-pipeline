# Held patch notes: W7-D56-ADMIT-ATTESTED-RECORD-C1 (INTERIM, blocked on budget)

Candidate fee1ebd06584a9740100a326caddd03604119ec6. Patch: `w7-d56-admit-attested-record.patch` (git diff --binary of the scratch clone against the candidate; two files: `check-critic-skip-coverage.mjs`, `check-critic-skip-coverage.test.mjs`). Targeted delivery: BLOCKED. Batch Critic review and PO acceptance stay parent-owned and pending.

## State
- RED (unchanged production code, clone): CSC-A1..A7 all failed (log `red.check-critic-skip-coverage.test.mjs.log` in the scratch driver dir; the whole-file tail was not counted).
- GREEN (patched clone): CSC-A6 and CSC-A7 pass. CSC-A1..A5 STILL FAIL. The visible assertion diff in the last log is an `assert.doesNotMatch(... /invalid v4 dispatch record/u)` hit whose actual text is the admission refusal, so at least one of my hand-built v4 fixtures (`deliveredV4`, the read-only and stopped records in A4/A5) is rejected by the real `validateDispatchRecord`, most likely the durable report text rule (`validateDurableDispatchReportText`, dispatch-record.mjs line 181) or the log field. Not yet diagnosed: the failure messages of A1..A3 were not read individually. Fix the fixtures (copy the shape of the existing stopped record at test lines 264-289, which passes the validator) and rerun; do not weaken the assertions.
- Clone2 baseline whole-file run and the failing-name set comparison were NOT run. `driver.mjs check` (git apply --check in clone2) was NOT run. Cleanup of both scratch clones was NOT run (scratch/agent-out/w7qn/ remains, untracked).

## Production changes in the patch (check-critic-skip-coverage.mjs)
- `terminalAuthoredDelivery`: explicit second clause admitting v4 kind `orchestrator-attested` (the authored-commit clause is unchanged in meaning); new helper `admittedKindOf`.
- `evaluateReviewAdmissionCore` exact-match branch: a new `else if` before it refuses a v4 record whose kind is neither `authored-commit` nor `orchestrator-attested` at the exact candidate (pins D-1) with the finding "a v4 <kind> record does not deliver an authored commit and cannot admit a review at its candidate". v3 behaviour is unchanged (D-2 only documented by CSC-A7). Not tied to terminal delivery, so in-progress v4 `authored-commit` fixtures still admit.
- Return object: new `admittedRecordKind` (v4 kind of the admitted record, else null) and `assurance` (`orchestrator-attested` for that kind, else null); no existing field changed.
- Edit 5: the zero-target hint keeps the pinned prefix and the phrases host / foreground / cannot be authored / PO decision, and now names `scripts/dispatch-record-write.mjs` and `writeOrchestratorAttestedDispatchRecord`.

## Test changes (test file)
New cases CSC-A1..A7 appended, with imports of `ORCHESTRATOR_ATTESTATION_SCHEMA` and `ORCHESTRATOR_ATTESTED_ASSURANCE`. After RED, A4/A5 were tightened (applicableRecordCount 1, no "invalid v4 dispatch record" finding, the explicit refusal finding) so a validator rejection cannot pass them falsely; this strengthens them. No existing case was changed.

## Not done / for slice 4b
Binding change is out of scope (createLocalDispatchEvidenceBinding, boundCriticReviewFinding, critic-packet-preflight, critic-generic-batch untouched). Slice 4b should read `admittedRecordKind` and `assurance` from this result and carry `assurance` as one more closed binding key bound into `snapshotId`.

## Operator flow (after the fixtures are fixed and the patch regenerated)
apply the diff, `git add -u` with a path limit to the two files, commit with `--no-verify` (held-patch route), stamp, install. Proposed message: "feat(critic): admit the orchestrator-attested record kind and label it weaker". Neither file is on the TP-1..TP-13 list (observed from the obligations table). An independent Critic review stays a parent-owned batch gate.

CONTINUATION CARD -- done: production edits (a)-(d) written, A6/A7 green, patch and these notes written; remaining: fix A1..A5 fixtures, rerun GREEN, run clone2 baseline and compare failing-name sets, apply-check, regenerate patch, cleanup clones; next step: read the A1 failure message in the green log, align `deliveredV4` with the validator.
