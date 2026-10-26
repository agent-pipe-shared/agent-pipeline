# D172 PF-79 recon: which Critic admission step demands a dispatch record

Read-only recon (W6-D172-PF79RECON-C1-20261027). Everything below was READ from source; nothing was executed, no suite was run, no consumer clone was used. Candidate eb4749a88. Paths are under `plugins/pipeline-core/` unless stated.

Important correction to the item's file list: the function that actually refuses is NOT in the four files the item names. It is `evaluateReviewAdmission` / `evaluateReviewAdmissionCore` and `createLocalDispatchEvidenceBinding` in `scripts/check-critic-skip-coverage.mjs`; the four named files only call them.

## Findings per question

### Q1. What fires when the project has NO dispatch record

Ordinary packet route (`scripts/critic-packet-preflight.mjs`):
- `prepareCandidatePacket` line 509-512 calls `evaluateReviewAdmission({root, taskId, baseCommit, candidateCommit})` (`check-critic-skip-coverage.mjs:791`, core at `:800`).
- The core scans `evidence/dispatch-record-*.json` at the repo root (`walkDispatchRecordsForReview`, `:466-492`; pattern `:26`). A missing `evidence/` directory yields the finding `evidence is missing or unreadable: ...` (`:471`).
- A record is the target only if `record.taskId === taskId && record.candidateCommit === candidateCommit` (`:867`), or the same taskId with a delivered record whose candidate is an ancestor of the review candidate (`:870-875`). Only schema v3/v4 count (`:846-851`); v2 "legacy" records are skipped (`:840-845`).
- With no record, `admittedCount` stays 0 and `:903` pushes `review admission requires exactly one matching target for <taskId>@<sha>; found 0`. Preflight turns it into `CPP-REVIEW-ADMISSION` (`critic-packet-preflight.mjs:512`).
- Behind that, `createLocalDispatchEvidenceBinding` (`check-critic-skip-coverage.mjs:317-349`) would throw plain `Error("local dispatch evidence requires one exact source record")` (`:324`) and the packet shape itself cannot exist without it: `normalizeCoordinatorOnly` accepts only `localDispatchEvidence` (needs `recordPath`, `recordSha256`, ...) or `signedQualityImportAnchor` or `historicalFreshReview` additive (`critic-packet-preflight.mjs:342-379`, fallthrough `fail("CPP-COORDINATOR-BINDING")` at `:378`).

Review-unit route (`lib/critic-generic-batch.mjs`):
- `registerBatch` -> `declarationSource` (`:257-269`) -> `sourceTarget` (`:244-256`). For a non-anchor declaration `sourceTarget` calls `createLocalDispatchEvidenceBinding` (`:247`) with `taskId`/`baseCommit`/`candidateCommit`; it reads the record. The review-unit declaration itself (`reviewUnitSource`, `:271-305`) is read from git and needs no record. Only `sourceTarget` introduces the record dependency; its only alternative is the signed-import anchor (`:250-255`, `CGB-TARGET`).
- The plain `Error`s from `createLocalDispatchEvidenceBinding` (`:322,324,329,331,334,338`) are not `GenericCriticBatchError`; `invoke` (`:608-618`) rewraps them as `CGB-PHYSICAL` with the real cause only in `error.cause`, not in the output.
- Later the packet side: `targetForPacket` (`:306-312`) fails `CGB-TARGET` unless the packet carries `localDispatchEvidence` or `signedQualityImportAnchor`.

Session admit (`scripts/session-critic-finalizer.mjs`, `admitSessionCriticReview` `:310`): `:483-489` calls `createLocalDispatchEvidenceBinding` (note: WITHOUT `baseCommit`, `:485-487`), swallows any throw into `SCF-LOCAL-DISPATCH-EVIDENCE` (`:488`) and requires canonical equality with `packet.coordinatorOnly.localDispatchEvidence` (`:489`). No message, code only.

Historical fresh-review route (`lib/historical-fresh-review-admission.mjs`): this route does NOT remove the record requirement for the target. `observe` (`:96-121`) only catalogues records; a record is "historical" (zero coverage, kept as debt) only if it is defective AND `record.taskId !== target.taskId` AND the same bytes sit in the tree at `baseCommit` (`:110-117`). The target still needs exactly one terminal authored-delivery record: `observeHistoricalFreshReviewTargetAuthority` in `check-critic-skip-coverage.mjs:931-933` returns `HFR-TARGET-NOT-AUTHORED-DELIVERY` otherwise. It also needs `HEAD === candidate` (`historical-fresh-review-admission.mjs:72`, `HFR-CANDIDATE`) and a valid PO gate plan authority (`:81-90`). A missing `evidence/` directory throws from `observe` (`:97-98`); untyped there, not traced further.

### Q2. What the record is asked to prove, and what git can show

From `createLocalDispatchEvidenceBinding` (`:317-349`) and the core (`:852-883`):
- schema v3 or v4 and `validateDispatchRecord`/`validatePreviousDispatchRecord` pass (`:327-331`; validators in `lib/dispatch-record.mjs`, NOT read; model/effort/ruleset identity live there per `init-dispatch-record.mjs:4-8`).
- a Critic decision existed and is `required` (`criticDisposition(record) === "required"`, `:332`; for others `skipped`/`evidenced` count as coverage `:885-898`).
- terminal authored delivery: terminal non-"no-delivery" outcome, non-empty `commits`, last commit equals `candidateCommit`, `kind: authored-commit` (`terminalAuthoredDelivery`, `:186-193`).
- candidate binding: exact candidate or descendant of the record's candidate (`:867-875`, `verifyCandidateDescendsFromRecord :195`).
- content binding of the record (`recordSha256`, `:342-348`) and the packet's `snapshotId` (`critic-packet-preflight.mjs:371-373`).
- corpus cleanliness: every other record must validate and be covered or merely pending, else the admission fails (`:809, :852-899`).

| Fact | Git shows it without a record? |
|---|---|
| commit list of base..candidate, ancestry, tree, changed paths | yes (preflight already reads them, `:524-545, :557`) |
| commit authorship (author/committer identity, `Dispatch:` trailers) | yes (observed; `scripts/dispatch-authorship-verify.mjs` renders PASS/FAIL/UNVERIFIABLE) |
| base/candidate binding | yes |
| that NO dispatch existed | partially: absence of any record whose `commits` intersect the range, plus no Dispatch trailers in the range; provable mechanically at the candidate tree |
| model / effort / ruleset identity of the author | no, only a record can say it; for a human or undispatched agent it is simply unknown |
| that a Critic decision was made (required) | no; it is a dispatch-time decision. For a range with no dispatch the honest statement is "none existed" |
| dispatch outcome | no (nothing was dispatched) |

### Q3. Is there already a sanctioned shape for a range without dispatch history

| Candidate | What it proves | Fits? |
|---|---|---|
| `signedQualityImportAnchor` (`check-critic-skip-coverage.mjs:352-390`, `critic-packet-preflight.mjs:351-363`) | a PO-signed quality-package integration commit plus a stamp-only range (`validateStampOnlyRange`, `verifyQualityPackageIntegrationPostCommit`) | NO for Glossover: it covers a signed import of a stamp-only range, not human/undispatched feature code. It also still requires the ordinary corpus coverage (`:373-378`) |
| `localDispatchEvidence` without a record | nothing | NO: closed shape needs `recordPath/recordSha256/sourceCandidateCommit` (`critic-packet-preflight.mjs:366-375`) |
| `historicalFreshReview` (additive, `:343-350`) | pre-existing defective records are inventory debt | NO: target record still required (Q1) |
| `validateLegacyDispatchRecord` / v2 schema (`:840-845`, `historical-fresh-review-admission.mjs:108`) | old records are valid but excluded from admission and cannot be the admitted target | NO; writing one now would be a forged record |
| legacy-reconcile / abandoned-v3 indexes (`:427, :806-807`) | retire an EXISTING record path | NO: need a record path |
| criticSkip decision with reason (`lib/critic-skip-decision.mjs:108-128, :142`) | lives INSIDE a dispatch record | NO: presupposes the record |
| commit classes `stage-0 (elephant)`, `design (elephant)`, `administrative (elephant)` (`dispatch-authorship-verify.mjs:90-93, :345, :383-406`) | authorship verdict for a commit with no record, bounded path counts | Authorship tool only: no reference to `dispatch-authorship-verify` in `check-critic-skip-coverage.mjs`, `critic-packet-preflight.mjs`, `session-critic-finalizer.mjs`, `critic-generic-batch.mjs` or `candidate-implementation-coverage-report.mjs` (rg returned nothing). Not a Critic-admission input and not fit for a large feature range |
| `elephant-exception` (`dispatch-authorship-verify.mjs:367-373`) | declared exception; verdict is UNVERIFIABLE by design | NO as an admission basis |

Conclusion: no existing shape admits a range without dispatch history.

### Q4. Where the producer is documented

- `scripts/init-dispatch-record.mjs:1-12` header (briefing in, record printed, writes nothing).
- `templates/prompts/goldfish-task.md:511` (record contents) and `:515` ("Create the dispatch record FIRST ... init-dispatch-record.mjs --briefing"), plus the plugin copy `plugins/pipeline-core/templates/prompts/goldfish-task.md`.
- `skills/pipeline-start/references/workflow-dispatch.md:188,223` say the record exists/is written, `skills/close-block/SKILL.md:152` names the path pattern. Neither names `init-dispatch-record.mjs` (grep for it over `skills/` and `agents/` found nothing).
- NOT naming it: the critic-review skill and `pipeline-start` SKILL.md as far as a grep for `init-dispatch-record`/`dispatch-record-` over `skills/` shows; the refusal text itself (Q5). The producer only handles a GENERATED GOLDFISH BRIEFING, so it cannot serve a project with no dispatch (also a design point: it is for opening a dispatch, not a retrospective record).

### Q5. Refusal text

- Preflight: `Critic review admission is blocked: review admission requires exactly one matching target for <taskId>@<sha>; found 0` (`critic-packet-preflight.mjs:512`, `check-critic-skip-coverage.mjs:903`). It names task and candidate, not the expected path `evidence/dispatch-record-<taskId>.json`, and gives no next step or alternative.
- Session admit: only the code `SCF-LOCAL-DISPATCH-EVIDENCE` (`session-critic-finalizer.mjs:488-489`), the CLI output carries `code` only (`:749-753`).
- Generic batch: `CGB-PHYSICAL` / `CGB-TARGET`, cause hidden (`critic-generic-batch.mjs:614-616`).

### Q6. Where SCF-INTERNAL comes from (PF-80)

`runSessionCriticFinalizerCli` catch (`session-critic-finalizer.mjs:746-755`): the code is passed through only when `error instanceof SessionCriticFinalizerError || error?.name === "GenericCriticBatchError"`; every other thrown value becomes `SCF-INTERNAL` with no message. Untyped throws that can reach it from the admission path (read, not executed):
- `CriticPacketError` (CPP-*) from `lib`/`critic-packet-preflight.mjs` calls such as `inspectClaimedSessionAdmission`: wrapped to `SCF-PRELAUNCH-ADMISSION` at `:471-473` only for that one call; other packet functions are not wrapped in the part I read.
- the plain `Error`/`TypeError` of `createLocalDispatchEvidenceBinding` (`check-critic-skip-coverage.mjs:319,322,324,329,331,334,338`) are wrapped at `:488` for that call only.
- `HFR-*` errors from `lib/historical-fresh-review-admission.mjs` (`fail(...)` helper, class not read) and fs errors from `walkDispatchRecordsForReview` callers.
I did NOT determine which exact throw produced the consumer's SCF-INTERNAL; that needs a repro. Open item.

## Route x lookup table

| Route | Lookup (key, place) | Code on absent record | Facts proved by record | Git-observable? |
|---|---|---|---|---|
| ordinary packet | `evidence/dispatch-record-*.json`, `record.taskId==taskId && candidateCommit` (`check:867`) | `CPP-REVIEW-ADMISSION` (`found 0`) | schema/validity, required Critic decision, authored terminal delivery, candidate binding, content hash | range/authorship/binding yes; model/effort/Critic decision/outcome no |
| session admit | same via `createLocalDispatchEvidenceBinding` (`scf:485`) | `SCF-LOCAL-DISPATCH-EVIDENCE` | same plus equality with packet binding | same |
| review unit | same via `sourceTarget` (`cgb:247`) | `CGB-PHYSICAL` (cause hidden) / `CGB-TARGET` | same | same |
| historical fresh review | target record in inventory (`check:931-933`) | `HFR-TARGET-NOT-AUTHORED-DELIVERY` | same; defective OTHER records become debt | same |

## RECOMMENDATION (smallest honest design for Wanted 2)

Add one more closed `coordinatorOnly` shape, the sibling of `signedQualityImportAnchor`, e.g. `undispatchedRangeEvidence` (schema `pipeline.undispatched-range-evidence.v1`), with its own success code (analogous to `signed-quality-import-review-admitted`, `critic-packet-preflight.mjs:513`) and its own taskId prefix (analogous to `signed-import-<sha>`, `:359`). The packet binds only what is observable:
- base and candidate, ordered commit list of `base..candidate`, per-commit author/committer identity and any `Dispatch:` trailer, and the digest of that list;
- a machine-computed ABSENCE proof at the candidate tree: the digest of the `evidence/dispatch-record-*.json` catalogue, and a finding-free check that no record names any commit of the range in `commits`/`candidateCommit`, and none carries this taskId;
- the explicit statement `dispatchHistory: "none"`, plus authorship verdicts from `dispatch-authorship-verify` recorded as observed (UNVERIFIABLE is accepted and recorded, never upgraded).
Marking: a distinct `coordinatorOnly` key, distinct admission code and taskId prefix, and a mandatory line in the Critic reference set and the PO-facing admission result ("no dispatch history; model/effort/Critic decision unknown"), so a reader tells it from a dispatched range in packet.json, the admission output and the reviewed references.
Why dispatched work is not weakened: the shape is rejected whenever ANY record intersects the range (mechanical, not declared), so a dispatched range can only take the existing record path; `createLocalDispatchEvidenceBinding`, `evaluateReviewAdmissionCore` and `normalizeCoordinatorOnly`'s `localDispatchEvidence` branch stay byte-identical. The remaining corpus must still pass ordinary coverage, as the signed-import branch requires (`check:373-378`). No record is created, so nothing is forged.

Also (Wanted 3/4, small): make the refusal at `check:903`/`preflight:512` name `evidence/dispatch-record-<taskId>.json` and name both routes (producer `init-dispatch-record.mjs` for dispatched work, the new shape for no history); document the producer in the critic-review skill and `pipeline-start` references; type the plain Errors (`createLocalDispatchEvidenceBinding`) so `SCF-INTERNAL` (`scf:752`) and `CGB-PHYSICAL` (`cgb:614`) carry a reason (PF-80).

## Files and functions a later slice would touch (custody paths; held patch)

- `scripts/check-critic-skip-coverage.mjs`: new `evaluateUndispatchedRangeReviewAdmission` beside `:352`; message at `:903`; typed errors in `createLocalDispatchEvidenceBinding :317`.
- `scripts/critic-packet-preflight.mjs`: `normalizeCoordinatorOnly :342-379`, `validatePacketShape :334-338`, `prepareCandidatePacket :507-523`.
- `scripts/session-critic-finalizer.mjs`: `admitSessionCriticReview :475-490`, `signedImportAnchorFor`/`referencesFor` equivalents, catch `:746-755`.
- `lib/critic-generic-batch.mjs`: `sourceTarget :244-256`, `targetForPacket :306-312`, `invoke :608-618`.
- Docs: critic-review skill, pipeline-start references, `skills/close-block/SKILL.md:152`.
- Tests that pin these: `scripts/critic-packet-preflight.test.mjs` (the briefed file, I did not open or run it). I did not enumerate the sibling suites (`check-critic-skip-coverage`, `session-critic-finalizer`, `critic-generic-batch`); their names are unverified here and must be listed by the slice author. The item's chain test (no-record project: prepare, admit; same project with one record) needs a new case.

## Open questions for the PO

1. Who may declare "no dispatch history"? Mechanical absence proof alone, or also a PO signature/chat approval as for signed imports? (An agent claiming it is the abuse path.)
2. Is a range that mixes dispatched and undispatched commits to be refused (recommended: yes, one honest shape per range) or split by the author?
3. May the Critic gate for an undispatched range be required to see the authorship verdicts as UNVERIFIABLE, i.e. is "unknown model/effort" acceptable to the PO for a batch Critic?

## Not done / not verified

Nothing was executed. Not read: `lib/dispatch-record.mjs` validators, `lib/administrative-commit-policy.mjs`, `lib/critic-course-admission.mjs`, `inspectClaimedSessionAdmission`, `signedImportAnchorFor`/`referencesFor`, the critic-review SKILL.md and pipeline-start SKILL.md bodies (only grepped), `critic-skip-decision.mjs` beyond signatures, the existing tests. The exact origin of the consumer's SCF-INTERNAL is not established.
