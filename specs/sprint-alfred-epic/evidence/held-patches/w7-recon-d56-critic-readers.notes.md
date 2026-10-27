# Recon notes: D56 part 2, the Critic-side readers of a dispatch record and what an attested record kind needs there

Read-only recon at candidate 9b455b1c7381f9d8f418ec240c6b4d183ae5ba61, continuing `w7-recon-d56-attested-record.notes.md`.
No patch, no clone, no writer or admission was run; no test was added (the test file in the write scope is unchanged).
Paths are under `plugins/pipeline-core/`. Line numbers are those of the candidate.

## 0. Result in one paragraph

Every Critic-side reader of a local dispatch record funnels through ONE function: `evaluateReviewAdmissionCore`
(`scripts/check-critic-skip-coverage.mjs` 800-913). `createLocalDispatchEvidenceBinding` (317-349) calls
`evaluateReviewAdmission` (336), and the preflight (`critic-packet-preflight.mjs` 510, 516), the finalizer
(`session-critic-finalizer.mjs` 510) and `lib/critic-generic-batch.mjs` 247 all call it. So the change for a new record kind
is concentrated in `check-critic-skip-coverage.mjs`, plus the closed binding shape that three files repeat. The other two
named files (`historical-fresh-review-admission.mjs`, `critic-course-admission.mjs`) do not read the kind at all.

## 1. Per reader: which fields it checks, and what a new kind must carry

| Reader | Fields it checks | What the attested kind must carry |
|---|---|---|
| `evaluateReviewAdmissionCore` check-critic-skip-coverage 822-900 | schema v3 or v4 (846-851); `validateDispatchRecord`/`validatePreviousDispatchRecord` (853); `criticDisposition` (855); for `required` with no addendum: exact `taskId` AND `candidateCommit` equal the request (867), OR same `taskId` plus `terminalAuthoredDelivery` plus Git descendant (870-875). Count must be exactly 1 (903). | A valid v4 record whose validator accepts the kind, disposition `criticRequired`, same `taskId`/`candidateCommit`. Exact-match (867) needs nothing more. The descendant branch needs `terminalAuthoredDelivery` (186-193) widened: today v4 matches only `outcomeClassification.kind === "authored-commit"`. |
| `terminalAuthoredDelivery` 186-193 | terminal, not no-delivery, `commits` non-empty and last equals `candidateCommit`; v4 additionally kind `authored-commit`. | Widen with an explicit second clause for the new kind name (not a loosening of the first). |
| `createLocalDispatchEvidenceBinding` 317-349 | exactly one record for the taskId (323-324); schema v3/v4; validator passes; disposition `required`; admission ok and `targetRecordCandidateCommit` equals record candidate (337). Output: `{schema, taskId, recordPath, recordSha256, sourceCandidateCommit, reviewCandidateCommit, snapshotId}`. | Nothing kind-specific is read. The record bytes are bound by `recordSha256`, so kind and attestation are bound, but the binding itself does not SHOW them. |
| `critic-packet-preflight.mjs` `normalizeCoordinatorOnly` 364-377 | closed 7-key binding, schema constant, `recordPath` form, SHA/OID shapes, `snapshotId` recomputation over six keys. | If an `assurance` key is added to the binding it must be added at 366, 371-373 (snapshotId inputs), here and at the two sites below, in ONE commit, or the three disagree and every packet is refused. |
| `session-critic-finalizer.mjs` 508-514 | rebuilds the binding live and compares `canonicalJson` equality with the packet's (514); any throw and any mismatch both become `SCF-LOCAL-DISPATCH-EVIDENCE` (513, 514), the inner `LDE-*` code is swallowed. | Follows automatically if the builder changes. Recommend including the inner code as detail (PF-80 pattern, see section 5). |
| `lib/critic-generic-batch.mjs` 244-256, 310 | takes `taskId, recordPath, recordSha256, sourceCandidateCommit` from the binding into a `kind: "authored-delivery"` target. | The target `kind` is the Critic-visible label. An attested record should produce a distinct kind (for example `orchestrator-attested-delivery`), not `authored-delivery`. |
| `boundCriticReviewFinding` check-critic-skip-coverage 536-574 | `exactObject` over exactly the six binding keys plus `snapshotId` (539-540), rebinds taskId, path, sha, candidates, `snapshotId` over six keys (544-566), refuses if the record path appears in `references` (569). | Same key-set change as above if `assurance` is added. |
| `historical-fresh-review-admission.mjs` 96-119 | shape only: `validateDispatchRecord` v4 / v3 / v2 (106-108). Records that fail shape are listed as defects. Kind is never read. | The new kind must pass `validateDispatchRecord` or this inventory reports `record-v4-shape` for every attested record. No other change. |
| `critic-course-admission.mjs` | No dispatch-record reads (its `record` hits are Critic review lineage records). | None. Resolves NOT READ item A9 for course admission. |

## 2. Smallest set of production edits, in implementation order

Slices 1 to 3 are the previous notes' slices (validator, writer, authorship verdict). This recon changes slice 4 and adds slice 4b:

1. `lib/dispatch-record.mjs` + `lib/dispatch-record.test.mjs`. RED cases (fixture style `check("DRCnn ...", () => ...)` with `opening()`/`terminal()`/`trigger()`/`skip()` helpers, asserting `error.code`):
   - DRC-A1 an `orchestrator-attested` terminal v4 record with the closed `attestation` object and `commits` ending in `candidateCommit` validates;
   - DRC-A2 `attestation` on `authored-commit` is refused (code `record-outcome-classification`); and DRC-A3 the new kind without `attestation` is refused;
   - DRC-A4 the new kind with a non-orchestrator `assurance` or a missing digest is refused;
   - DRC-A5 the new kind must carry `criticRequired` (not `criticSkip`), refused otherwise (see section 4).
   `outcomeClassification` is closed to `{schema, kind}` at line 189, so the attestation is a new top-level closed key, not a classification field. Subject: `feat(evidence): add the orchestrator-attested dispatch record kind`.
2. `scripts/dispatch-record-write.mjs` + `scripts/dispatch-record-write.test.mjs` (fixture helper `record(overrides)` line 22, `fixture()` 23, tests via `check(name, run)`). RED: Git-verified commit accepted; wrong parent, missing/duplicate trailer, out-of-scope path, existing host-observed record for the taskId, all refused; a hand-written `authored-commit` still hits `record-host-observation` (209-211). Subject: `feat(evidence): write an orchestrator-attested record from a briefing and a hand-back`.
3. `scripts/dispatch-authorship-verify.mjs` + test (fixture style `writeRecord(taskId, record)` line 52, `commit({message, paths, ...})` 57, `trigger()`/`skip()` 68-69, tests `test("(x) ...")`). Line 563-571 gives `record-outcome-does-not-attest-authorship` to any v4 non-authored kind: add an earlier branch returning a distinct verdict for the new kind, severity weaker than PASS; lines 678-709 must NOT set `nativeHostObserved`. RED: verdict code is distinct and never `host-observed-local`. Subject: `feat(evidence): label the orchestrator-attested record as weaker authorship evidence`.
4. CUSTODY (held patch plus batch Critic): `scripts/check-critic-skip-coverage.mjs`.
   - Widen `terminalAuthoredDelivery` (186-193) by an explicit clause.
   - Make the exact-match branch (867) kind-aware (see section 4, defect D-1).
   - Add `assurance` to the return object (910) so callers can carry it.
   RED in `scripts/check-critic-skip-coverage.test.mjs`: attested record admits exactly once; `authored-commit` v4 behaves as before; a v4 `read-only` or `stopped-without-commit` record with `criticRequired` is NOT admitted at the exact candidate (pins D-1). Subject: `feat(critic): admit the orchestrator-attested record kind and label it`.
4b. CUSTODY, same held patch: the three-file binding change (`critic-packet-preflight.mjs` 366-373, `check-critic-skip-coverage.mjs` 539-566 and 340-348, `lib/critic-generic-batch.mjs` 248). RED: `assurance` is bound into `snapshotId`; tampering with it fails `CPP-COORDINATOR-BINDING`; the finalizer comparison (514) fails on drift. Subject: `feat(critic): carry the record assurance in the local dispatch evidence binding`.
5. Refusal text (check-critic-skip-coverage 905), after edit 2 exists. The existing test pins the prefix `...found 0` (check-critic-skip-coverage.test.mjs 346), so extending the hint is safe.

Protected or custody marking: none of the files above is on the TP-1..TP-13 test-path list. Edits 4 and 4b are custody files (Critic admission, packet binding); deliver as a held patch with a batch Critic, not as direct commits. Edit 1 to 3 are ordinary plugin source.

## 3. Candidate approach for the closed binding

Smaller alternative to editing the binding in three places: leave the binding unchanged and expose the label only in the Critic-visible `kind` of the generic batch target (`critic-generic-batch.mjs` 248) and the PO packet text. The record bytes are already bound by `recordSha256`. This avoids touching `snapshotId`. Cost: the label is derived by re-reading the record, not carried in the binding. Recommendation: carry `assurance` in the binding (option 4b). It is one more closed key and it makes drift fail closed; deriving it again from the record is exactly what lets the two sides disagree.

## 4. Would any reader silently accept an attested record as host-observed? (defects to pin)

- D-1 (real, today): the exact-match branch at check-critic-skip-coverage 867 is kind-blind. Any valid v4 record with `criticRequired` and the requested taskId and candidateCommit is admitted, including `read-only` and `stopped-without-commit` kinds if their validator rules allow `criticRequired` (the validator only forces this for `completed-undelivered`, line 198). Pin: a RED case for a non-authoring v4 kind at the exact candidate. Once the new kind exists, this branch would admit it with no label at all.
- D-2 (real, today): v3 records. The writer still accepts a v3 record (`validateDispatchRecord` routes v3, dispatch-record.mjs 272-277; `nativeGoldfishAuthored` at write 204-206 is v4 only), and `terminalAuthoredDelivery` accepts a delivered v3 with no kind check (190). A hand-written v3 delivered record therefore already admits a Critic review with neither host observation nor a label. The only guard is the model-binding check (write 222-227). This is the existing unlabelled, weaker route that the attested kind is meant to replace with a visible one; pin it with a RED case and decide whether new v3 writes are closed (open decision A9 below).
- D-3: the Critic cannot see the record: `boundCriticReviewFinding` 569 requires the record path NOT to be in `references`, and the binding is `coordinatorOnly`. Unless the packet text or the batch target kind states it, neither the Critic nor the PO sees the assurance. The packet text renderer was NOT READ; it is where the visible line has to go.
- No reader sets a "host-observed" flag from an admission result: host observation is read only in `dispatch-authorship-verify.mjs` 677-709 via the `Native-Host-Observed` commit marker plus private receipt. An attested commit has no marker, so a mislabelled `authored-commit` would return `native-host-marker-required` (678-682), not PASS. That part is safe.

How the PO and the Critic tell the two apart: record `outcomeClassification.kind` (new name), top-level `attestation.assurance`, absence of the `Native-Host-Observed` marker on the commit, the authorship verdict code, and (after 4b) the `assurance` key in the binding plus the batch target `kind`.

## 5. PF-80 display of the sanctioned route

PF-80 (D173, `scripts/session-critic-finalizer.test.mjs` 761-785) names the cause of an internal CLI refusal as `SCF-INTERNAL` with `detail` = `<inner code>: <message>`, no absolute path. It covers only untyped throws reaching the CLI catch. The two local-dispatch refusals (513, 514) are typed `SCF-LOCAL-DISPATCH-EVIDENCE` and carry no inner `LDE-*` code, so a Coordinator sees one code for five causes (`LDE-SOURCE-UNREADABLE`, `LDE-SOURCE-RECORD-MISSING`, `LDE-SCHEMA`, `LDE-RECORD-INVALID`, `LDE-CANDIDATE-BINDING`). The preflight path is better: it includes the findings text (`CPP-REVIEW-ADMISSION`, line 512), which is where the refusal hint (905) and the future route name are displayed. Sanctioned route display therefore goes in 905 only; also forwarding the `LDE-*` code in 513 is a small related improvement (custody file).

## 6. Open decisions restated, with a recommendation

- A7 (log entry wording and unknowable worker facts: tool-use count, real model and effort). Recommendation: one log entry `{phase: "orchestrator-attested", toolUseCount: 0, note: "tool-use count and worker model not observed"}`; a count of 0 is the validator's lowest value, and the note says it is not an observation. Record `model`/`effort` as briefed and refuse to let them satisfy `compareRecordedModel` as host-observed. If PO prefers no fake 0, the validator needs an explicit "not observed" marker (one more closed key); more code, less misreadable. I recommend the marker only if the PO wants numbers to be unusable by any reader; otherwise the note suffices.
- A8 (does admission and the signed push accept attested evidence). Recommendation: admission yes (PF-82 answer 2026-10-27), weight shown as weaker; push: NO automatic acceptance. The push gate keeps requiring its existing proof, and the attested kind is not a host-observed substitute there; revisit only on an explicit PO decision. No reader found in this recon feeds the push gate.
- A9 (new). Close new v3 writes and v3-delivered admission at the exact-match path. Recommendation: pin D-2 now by a RED case but do not change behaviour in the first slice; decide closing with the PO because committed v3 history must stay readable (`dispatch-record-write.mjs` 180).

## 7. Not done, and confidence

- Not done: the scratch driver, clones, baseline and patched test runs, and any RED/GREEN counts. The briefing's targeted checks (new cases RED/GREEN, whole-file baseline versus patched, apply check) do not apply because this slice is notes only; nothing was run, so nothing is claimed green.
- NOT READ: the packet text renderer (where a visible line goes), `lib/native-goldfish-host-observation.mjs` in detail, `scripts/dispatch-record-write.test.mjs` and `scripts/dispatch-authorship-verify.test.mjs` beyond their case lists and helpers.
- Confidence: high for section 1 and D-1/D-2 (read in the code at the lines cited); medium for slice order and the binding-key choice (section 3); low for the packet-visible text, which is unread.
- Refinement of the earlier notes: the earlier statement that a new kind "would NOT count towards admission" holds only for the descendant branch; the exact-candidate branch (867) already admits any valid kind (D-1).
