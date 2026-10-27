# Held patch notes: W7-D56-ADMIT-ATTESTED-RECORD-C2-C1 (D56 slice 4 and 5, finished)

Candidate 269dbec86a71256e394b205a16c6a8c765ceb017. Patch: `w7-d56-admit-attested-record-c2.patch` (git diff --binary of the scratch clone against the candidate; COMPLETE change, supersedes `w7-d56-admit-attested-record.patch`; apply it alone at the candidate). Files: `plugins/pipeline-core/scripts/check-critic-skip-coverage.mjs` (+22/-5 net with fixtures), `plugins/pipeline-core/scripts/check-critic-skip-coverage.test.mjs`. Targeted delivery: GREEN. Independent Critic review, Full Verify and PO acceptance stay parent-owned batch gates, pending.

## Cause of the earlier red A1..A5
Fixture defect only, not a production defect. The real `validateDispatchRecord` rejects a terminal v4 record with an empty `log` ("terminal dispatch record requires at least one log entry"). The hand-built fixtures had `log` absent or `[]`. Confirmed with a probe that fed the same attested and authored-commit shapes to the validator: both throw without a log entry and validate with `log: [{ phase, toolUseCount }]`.

## Exact changed lines (this slice, test file only, on top of the Cut A production edits)
- New constant `TERMINAL_LOG = [{ phase: "done", toolUseCount: 3 }]` after `ancestryOk`.
- `log: TERMINAL_LOG` added to `deliveredV4` (A1, A2, A3) and to the read-only (A4) and stopped-without-commit (A5) fixtures.
- No assertion changed or weakened. A4/A5 assert `applicableRecordCount` 1, no "invalid v4 dispatch record" finding and the finding `does not deliver an authored commit` (the kind mismatch).

## Production changes (check-critic-skip-coverage.mjs, from the Cut A patch, re-verified: no further edit needed)
- `terminalAuthoredDelivery` admits v4 kind `orchestrator-attested` besides `authored-commit`; helper `admittedKindOf`.
- Exact-match branch refuses a v4 record whose kind is neither at the exact candidate.
- Result gains `admittedRecordKind` and `assurance` (`orchestrator-attested` or null).
- Zero-target hint keeps its pinned prefix and names `scripts/dispatch-record-write.mjs` and `writeOrchestratorAttestedDispatchRecord`.

## RED / GREEN
- RED: recorded in the previous attempt (CSC-A1..A7 failed against unchanged production code). In this continuation I did not re-run RED against an unchanged clone; the A1..A5 failures I did observe were the fixture defect above. Stated plainly.
- GREEN (patched clone, whole file): `ℹ tests 47 / pass 47 / fail 0`; CSC-A1..A7 all pass.
- Baseline (clone2, unchanged candidate, whole file): `tests 40 / pass 40 / fail 0`.
- Failing-name sets: baseline empty, patched empty; difference is only the 7 new cases. No pre-existing failure. (Both runs print three git-discovery `fatal:` lines on stderr from the test's own probes; exit code 0 in both.)
- Apply check (`git apply --check` in clone2 at the candidate): exit 0.

## Not done / for slice 4b
Binding is untouched (createLocalDispatchEvidenceBinding, boundCriticReviewFinding, critic-packet-preflight.mjs, lib/critic-generic-batch.mjs). Slice 4b binds two return fields from `evaluateReviewAdmission`: `admittedRecordKind` and `assurance`; `assurance` becomes one more closed binding key bound into `snapshotId`.

## Proposed commit message
feat(critic): admit the orchestrator-attested record kind and label it weaker

## Operator flow
Apply the diff (`git apply`), `git add -u` limited to the two paths, commit with `--no-verify` (held-patch route), stamp, install.

## Protected-path classification observed
Neither file is on the TP-1..TP-13 list of `templates/prompts/agent-obligations.md` section 2.

## Cleanup
Both scratch clones deleted after this note was written (driver cleanup).
