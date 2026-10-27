# Recon notes: D56, what Critic packet admission reads from a dispatch record, and an orchestrator-attested record kind

Read-only recon at candidate 698864f7885794f9c2cad668a5672af08d0116dd. No patch, no clone driver, no dispatch, writer or
admission was run. Budget stopped the run at about call 28 of 35, so several readers were located by grep but not read
in full; those are marked NOT READ below. Paths are under `plugins/pipeline-core/` unless stated.

## 1. The refusal

- Producer: `scripts/check-critic-skip-coverage.mjs`, `evaluateReviewAdmission` (line 791) delegating to
  `evaluateReviewAdmissionCore` (line 800). The finding text is built at lines 903-908:
  `review admission requires exactly one matching target for <taskId>@<candidateCommit>; found <N>` plus a hint.
- It carries NO code of its own: it is a plain string pushed to `findings` and returned as `readFindings`
  (`ok = findings.length === 0 && admittedCount === 1`, line 909). Which code `session-critic-finalizer admit` wraps it
  in was NOT READ (the finalizer only references `localDispatchEvidence` at line 514, `SCF-LOCAL-DISPATCH-EVIDENCE`).
- `admittedCount` is raised only by a record found by `walkDispatchRecordsForReview` (line 466, NOT READ; it scans
  `evidence/dispatch-record-*.json`) that is v3 or v4, validates, has disposition `required` with no addendum, and either
  (a) `taskId` and `candidateCommit` equal the request (line 867), or (b) same `taskId` and `terminalAuthoredDelivery(record)`
  (line 186) with the review candidate a Git descendant of the record candidate (`merge-base --is-ancestor`, line 195).
  `signedImportAnchor !== null` forces 1 (line 902): that is the signed quality-package route, a separate door.
- Other readers named in the briefing: `critic-packet-preflight.mjs` lines 336, 364-376, 515-519 build and bind
  `coordinatorOnly.localDispatchEvidence`; `lib/critic-generic-batch.mjs:310` reads it; `check-critic-skip-coverage.mjs`
  536-573 re-checks it (schema `pipeline.local-dispatch-evidence.v1`; keys include taskId, recordPath, recordSha256,
  sourceCandidateCommit, reviewCandidateCommit, snapshotId; recordPath must be `evidence/dispatch-record-<taskId>.json`;
  recordSha256 must equal the digest of the bytes; ancestry of source to review candidate). Those are the "local dispatch"
  facts. NOT READ: `historical-fresh-review-admission.mjs`, `critic-course-admission.mjs`.

## 2. Facts admission reads from a record (table)

| Fact | Where read | Git alone? | Attested substitute |
|---|---|---|---|
| File exists at `evidence/dispatch-record-<taskId>.json` | check-critic-skip-coverage 536-566; write target rule dispatch-record-write 229-231 | yes | the attested writer publishes to the same path |
| schema v3 or v4, closed key set, no private absolute path | `validateDispatchRecord` dispatch-record.mjs 140-259 | yes | new kind must pass the same validator |
| taskId, candidateCommit (full SHA) | admission 867-875 | yes (commit exists) | writer rechecks `rev-parse --verify` |
| commits list ends in candidateCommit (terminal authored) | dispatch-record.mjs 202, 158; admission `terminalAuthoredDelivery` 186-193 | yes | writer derives from Git |
| Trailer `Dispatch: <id> (goldfish)` | dispatch-authorship-verify (GIT-03) | yes (commit message) | writer rechecks the trailer text |
| Parent equals briefed base (`parent == candidateCommit` of the briefing) | not read by admission; PF-82 notes 4 | yes | writer rechecks |
| Changed paths covered by `report.changedFiles` (`declaredPaths`, `coveringPath`) | dispatch-authorship-verify 659-671 | yes (paths); declared list is the writer's input | writer takes paths from `git diff-tree`, so it cannot over- or under-declare |
| Scope: paths inside the briefed write scope | PF-82 notes 4 (`assess`) | needs the briefing allowedPaths | orchestrator supplies the generated briefing; its digest is recorded |
| model, effort, agentType, rulesetSha, dispatcher non-empty | validator 151-152; `missingBriefingFields` (authorship-verify 750) | no, these are claims | recorded as briefed (intent), flagged as not observed |
| model matches agentType (`compareRecordedModel`) | write 182, 221-228; authorship-verify 675-743 | no | attested kind must be exempt from the model-authority classification but labelled "intent only" |
| outcome terminal; outcomeClassification.kind `authored-commit` | validator 188-209; authorship-verify 563-571 | no | NEW kind name; must NOT reuse `authored-commit` |
| resultSha256 equals sha256(report.text) | validator 208-209 | partly: the hand-back text is the orchestrator's input | orchestrator records its digest of the text it received |
| log non-empty for a terminal v4 | validator 167; write 181 | no | one honest entry such as phase `orchestrator-attested` with the tool-use count unknown (0 is a lie; needs a decision) |
| Exactly one Critic disposition (criticSkip, criticRequired or criticEvidence) | validator 251-253; admission 861-899 | no | `criticRequired` pending, computed from the briefing's criticDecision |
| Host observation: `Native-Host-Observed: v1 (<runner>)` commit marker plus private receipt readback | authorship-verify 677-709; write 204-216 (`inspectNativeGoldfishHostObservation`) | NO, needs the host | cannot be substituted; this is the fact an attested record states it does not have |
| Critic addendum (`verifyCriticAddendum`) for required | authorship-verify 582-619 | no | unchanged; applies to the new kind as well |

## 3. lib/dispatch-record.mjs

- Schemas: v4 `DISPATCH_RECORD_SCHEMA` (line 5), v3 previous, v2 legacy; `OUTCOME_CLASSIFICATION_SCHEMA` v1 (line 9).
- Kinds: `OUTCOME_CLASSIFICATIONS` (line 10) = authored-commit, read-only, stopped-without-commit, completed-undelivered.
- `validateRecord` (140-259): v4 allows top-level `outcomeClassification`, `observationIdentity`, `runner`; `outcomeClassification`
  is closed to `{schema, kind}` (line 189), so an attestation marker cannot ride along without a validator change.
- Where a new kind goes: add the name to line 10; add a branch beside lines 200-207 that (a) requires a non-empty commits
  list ending in candidateCommit like authored-commit, (b) requires an extra closed field (working name `attestation`, for
  example `{schema, assurance: "orchestrator-attested", briefingSha256, handbackSha256, commitSha, parent}`), and (c) refuses
  that field on every other kind (as line 199 does for `observationIdentity`). `isCommitAuthorshipOutcome` (line 70) must
  stay false for the new kind unless the reader labels it; `terminalAuthoredDelivery` (admission 186-193) matches only
  `authored-commit`, so by default the new kind would NOT count towards admission until that function is widened
  deliberately and visibly (custody file).
- Host-observed kinds stay untouched if the new branch is additive and `nativeGoldfishAuthored` (write 204-206) keeps
  matching `authored-commit` only.

## 4. scripts/dispatch-record-write.mjs

- Request shape: `{schema: "pipeline.dispatch-record-write-request.v1", target, record}` (lines 23, 150-152). Target must
  equal `evidence/dispatch-record-<taskId>.json` (229-231). Public JSON/object writers carry the model-authority denial;
  host routes are `writeHostObservedAgyDispatchRecord` (166) and `writeHostObservedNativeGoldfishDispatchRecord` (172).
- Refusal for the Elephant hand-write: write 209-211 (`record-host-observation`, "authored Claude/Codex v4 must use the
  native host-observed writer"). The CLI route cannot supply the private receipt (PF-82 notes 4).
- Native pending state is read only by `inspectNativeGoldfishHostObservation` (lib/native-goldfish-host-observation.mjs,
  NOT READ in detail). A background dispatch leaves no such state, which is cause (a).
- Smallest honest writer: a new export (working name `writeOrchestratorAttestedDispatchRecord`) plus a CLI mode that takes
  a generated briefing file and the hand-back text. It rechecks in Git: commit exists, message has exactly one
  `Dispatch: <taskId> (goldfish)` trailer, `parent == briefing candidateCommit`, `git diff-tree` paths inside allowedPaths.
  It records: briefing sha256, hand-back text sha256 as received, the commit, the changed paths from Git, the orchestrator as
  `dispatcher`. It states it cannot know: that the worker really authored the commit, the worker's real model and effort,
  tool-use count, that the hand-back is the worker's real text. It must refuse when a host-observed record for the same taskId
  exists, and must publish with the existing exclusive-inode path (`publishExclusiveBytes`) so it cannot overwrite.

## 5. Readers that must label the attested kind

- `scripts/dispatch-authorship-verify.mjs`: line 563 rejects any v4 non-authored kind with `record-outcome-does-not-attest-authorship`.
  The new kind lands there by default with verdict fail, which is safe but wrong for the wanted route. Needs a branch that
  returns a distinct verdict code (for example `orchestrator-attested`, severity between host-observed and unverifiable) and never
  sets `nativeHostObserved` (line 683) or `acceptedModelCheck` host-observed (708). The commit carries no
  `Native-Host-Observed` marker, so lines 678-682 would return `native-host-marker-required` for a mislabelled `authored-commit`.
- `scripts/check-critic-skip-coverage.mjs` `terminalAuthoredDelivery`/admission: widen deliberately; add
  `assurance` to the admission result so `session-critic-finalizer` and `critic-packet-preflight` carry it into
  `coordinatorOnly.localDispatchEvidence` (a new key makes the `exactObject` check at 539 fail unless updated: custody change).
- Critic and PO can tell the kinds apart by: record `outcomeClassification.kind` (new name), an `attestation.assurance` field,
  the absence of the `Native-Host-Observed` commit marker, and a visible line in the packet text. Packet text change NOT READ.

## 6. Refusal text

The text at check-critic-skip-coverage.mjs:905 already explains the missing record: it says the host writes it at the end of a
foreground dispatch, that it cannot be hand-authored, that a background dispatch leaves none, and that a no-history range
"has no admitted route yet and needs a PO decision". It does NOT name a sanctioned route because none exists today. After the
attested writer exists it should say: "a background dispatch has no host-observed record; for a commit the orchestrator
verified, write an orchestrator-attested record with `<script and mode>` from the generated briefing and the hand-back text;
this is weaker evidence and is shown as such". PF-80 error display was not read.

## 7. Existing tests (RED anchors)

- `lib/dispatch-record.test.mjs`: single-file `check(name, run)` list with ids DRC01.., fixture helpers `opening()`, `terminal()`,
  `trigger()`, `skip()` (lines 9-18), asserting `error.code`. Cases 5 (v4 kinds, lines 76-100+) pin that `authored-commit`
  cannot use reserved outcomes and that non-authoring kinds carry no commits.
- Admission: `scripts/check-critic-skip-coverage.test.mjs:346` pins the refusal text prefix `...found 0`.
- Authorship: `scripts/dispatch-authorship-verify.test.mjs` and `scripts/dispatch-record-write.test.mjs` (names only, NOT READ).

## 8. Gap list

| # | Gap | Tag |
|---|---|---|
| A1 | No record kind for an orchestrator-attested Goldfish commit | code-fixable-here (shape), po-decision recorded 2026-10-27 (wanted, own kind) |
| A2 | `outcomeClassification` is closed to `{schema, kind}`; no field for assurance and digests | code-fixable-here |
| A3 | No writer route for it; CLI hand-write refused at write 209-211 | code-fixable-here |
| A4 | `terminalAuthoredDelivery` and the `localDispatchEvidence` binding know only `authored-commit` | code-fixable-here, custody files, held patch |
| A5 | `dispatch-authorship-verify` fails the new kind by default | code-fixable-here |
| A6 | Refusal text names no route | code-fixable-here after A3 |
| A7 | Tool-use count and real model/effort of a background worker | native-host-only (unknowable); log entry wording is a po-decision |
| A8 | Whether Critic admission and the signed push accept attested evidence, and push-gate weighting | po-decision (PF-82 notes section 8 item 1, answered yes for admission only; push not stated) |
| A9 | Historical and course admission paths (`historical-fresh-review-admission`, `critic-course-admission`) | NOT READ |

## 9. Minimal slices in implementation order

1. `lib/dispatch-record.mjs` + `lib/dispatch-record.test.mjs`. RED: attested record with matching fields validates; `attestation`
   on any other kind refused; `authored-commit` forged with an attestation refused; missing digest or wrong assurance refused.
   `fix`-free, subject: `feat(evidence): add the orchestrator-attested dispatch record kind`.
2. `scripts/dispatch-record-write.mjs` + test. RED: writer accepts a Git-verified commit; wrong parent, missing or duplicate
   trailer, out-of-scope path, existing host-observed record, hand-written `authored-commit` still refused. Subject:
   `feat(evidence): write an orchestrator-attested record from a briefing and a hand-back`.
3. `scripts/dispatch-authorship-verify.mjs` + test. RED: attested verdict is distinct, never host-observed. Subject:
   `feat(evidence): label the orchestrator-attested record as weaker authorship evidence`.
4. Custody: `scripts/check-critic-skip-coverage.mjs`, `scripts/critic-packet-preflight.mjs`, `scripts/session-critic-finalizer.mjs`,
   `lib/critic-generic-batch.mjs`. RED: admission counts the new kind exactly once, carries `assurance` into the packet,
   a dispatched `authored-commit` is judged as before. Refusal text names the route. Held patch with batch Critic.
5. Docs: pipeline-start references and the dispatch skill document the one command sequence (item Wanted 3a).

## 10. Confidence

Medium for sections 1 to 4 (read in the code). Low for the Critic-side wiring in sections 5 and 9 slice 4 and for
A9: those files were located by grep and only partly read. Slice 1 and 2 are well bounded; slice 4 needs a fresh read of
`walkDispatchRecordsForReview`, `critic-packet-preflight.mjs` 330-380 and 510-520, and the finalizer around line 514 first.
