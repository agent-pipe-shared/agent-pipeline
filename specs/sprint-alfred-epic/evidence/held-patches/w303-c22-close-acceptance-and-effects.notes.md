# w303 — The close asks for the human acceptance, records what it really touched, closes the handover and keeps every Critic report in its bundle (candidate 22)

Delta on the candidate 22 chain (clone base 6fa9369d0). Closest accepted criterion: AC-108 (PRD and Spec unchanged). Built by a Goldfish in a clone that carries the chain; delivered as a held patch. Targeted delivery green: code, tests, skill text and regenerated runbooks for all four findings; batch Critic, Full Verify and PO acceptance stay pending.

## Why

PO decisions 2026-11-09 on four findings of the Claude and Codex greenfield reports on the one-shot close (`scripts/finish-feature.mjs`, `scripts/close-coordinator.mjs`): CGR-06 (human acceptance), CGR-05 (effects), CGF-12 and CGF-29 (handover projection), CGR-12 small variant (Critic reports in the audit bundle).

## What it changes (all under plugins/pipeline-core/)

1. CGR-06 acceptance (`scripts/finish-feature.mjs`, new `lib/close-acceptance-record.mjs`)
   - New flags `--human-acceptance "<literal answer>"` and `--open-checks "<check; check>"` (API: `humanAcceptance`, `openChecks`). The first call stops once with the typed stop `ONESHOT-ACCEPTANCE-REQUIRED` (stage `acceptance`); its `reason` is the one generated sentence to ask in the chat: whether the human accepts the feature package at the candidate, that the performed close counts as the human acceptance of this feature package, and the checks still open (the named ones plus a standing one for any manual or real-device check the close does not run). Its `repair` is the rerun command with the answer flag.
   - Placement measured: inside the existing first-run branch (`resumeLifecycleId === null` or the requalify case), after the Critic-addenda stop (their commit moves HEAD) and BEFORE the leftover sweep and the Verify. At that point nothing has been written (a stop costs no Verify, no cleanup) and the irreversible State close is still ahead. A resumed close (past the prepared stages) never enters the branch, so it never asks twice and a close already running is not broken; an acceptance recorded for the same HEAD (committed or uncommitted) is kept and does not ask again, a changed HEAD asks again.
   - The record is written after the package moves (so the Verify ran on the tree the candidate names) as a managed section (`<!-- close-acceptance:begin/end -->`) of the feature's tracked `acceptance.md`: literal answer (JSON string), candidate commit, open checks, labelled "attribution record ... not a signature". It lands in the one close commit (the commit paths already cover `specs/<feature>`). No new signature.
   - Measured conflict, resolved without a signature: the Pipeline-generated `acceptance.md` pointer is registered `authority:false, immutable` and the package validator fails an immutable entry whose digest no longer binds the file. The write therefore rebinds that one entry with the package's own amendment record (`sha256`, `amendment {at, reason, previousSha256}`), the existing immutable-rebind mechanism; the package validates afterwards (proven). The pointer's own text stays; the record is appended. An `acceptance.md` the approval binds (`authority:true`) is NEVER edited: its record goes to `specs/<feature>/evidence/human-acceptance.md`.
   - The leftover sweep (CFC-2) treats the acceptance files as the close's own outputs; the answer is held before the sweep and written again after the package moves.
2. CGR-05 effects (`scripts/finish-feature.mjs`)
   - `tracked-close.json` hashes the calibrated handover (`project/pipeline.json` `handover`, default `docs/state.md`; hashed after its writer ran) and `telemetry/costs.md` when they exist. Measured: no project-defined file exists for backlog (a directory), history or retrospective, so those keep the marked empty digest. The coordinator's field set is unchanged.
3. CGF-12 / CGF-29 handover (`scripts/pipeline-state.mjs`, `lib/close-acceptance-record.mjs`, `scripts/finish-feature.mjs`)
   - Measured how the tracked handover is written today: for a Git project the lifecycle transitions write only a private projection; the tracked file is written solely by `pipeline-state.mjs update-public-handover` (+ `syncPublicCurrentState`). No second writer was added. The one-shot now calls that verb after the State close and before the tracked effects are digested (when the handover file exists; a failure is reported as `handover.status`, never blocking), and adds the handover path to the one close commit.
   - `syncPublicCurrentState`: with no active feature and a closed one it writes a generated block (own markers) into "## Current state": the closed-local sentence with the verified candidate from the feature's package, and three separate facts: Technical close, Product acceptance (from the acceptance record, or "not recorded"), Push ("not done by the close, separate human-gated step"). The stale "Feature X is active in <phase>" sentence of that feature is dropped; a new active feature removes the block; CRLF is kept.
4. CGR-12 Critic reports (`lib/audit-bundle.mjs`, `scripts/finish-feature.mjs`)
   - The one-shot lists every Critic round of the feature in the audit request (`evidence.criticReports`: tracked exports `specs/<f>/evidence/critic/<packet>/report.md`, packets named in registered `critic-lineage-*.json` files, and the packet the close is bound to). The bundle carries each readable report as an artifact and names every other round as a typed gap (`REPORT-NOT-EXPORTED`, `UNREADABLE`) in a new README section "Critic round reports". With only reports named, no approval-evidence gap is invented; an `evidence` request without `criticReports` behaves as before.

## Tests (test-first: written first, RED on the original code, then GREEN)

- `scripts/finish-feature.test.mjs`: 8 new cases (acceptance stop writes nothing; record content; same candidate does not ask again, changed candidate asks again; resumed close never asks; pointer rebind validates and an authority entry is not edited; effects digests; closed handover; Critic reports in the request). RED: the suite did not load (missing module). GREEN: 38 tests, 38 pass.
- `lib/audit-bundle.test.mjs`: 1 new case (reports carried, gaps named, offline verify, tamper detected, bad input refused). RED: 34 pass, 1 fail. GREEN: 35 pass.
- Restated in place (QG-04, with a comment, nothing weakened): the one-shot fixture now carries the human's recorded answer in every input unless a case sets `acceptance: false`.

## Deliberately not changed

- The close order (tracked outputs commit before the candidate freeze), the coordinator and its field set, the Critic preimage files and list, every guard hook, PRD and Spec.
- The handover is written before the freeze, so it names the VERIFIED candidate of the package and says the close commit carrying the text becomes the frozen candidate; it cannot name its own commit.
- The raw export of the full Critic round is out of scope (small variant only).

## Skill and runbooks (done in the second part)

- `skills/close-feature/SKILL.md`: two paragraphs (the acceptance question with its flags, one stop, no signature, the immutable-pointer amendment and the authority exception; what the close touches: handover, telemetry, Critic reports).
- `lib/close-chain-guide.mjs`: the producer text of `feature-close-prepared` and `tracked-close-finalized`; `runbooks/close-path.v1.json` and `runbooks/index.v1.json` regenerated by `generate-runbook.mjs --root <plugin root>` (no hand edit; `generate-runbook.test.mjs` pins the bytes and is green). `lib/runbook-paths.mjs` has no one-shot text, so it is unchanged.

## Neighbouring suites (final code, each green, one at a time)

`close-path-e2e` 1/1, `close-coordinator` 54/54, `close-coordinator-audit-lifecycle` 19/19, `generate-runbook` 25/25, `feature-close-audit-preflight` 7/7, `public-handover-duty` 11/11, `g29-public-handover-admission` 2/2, `scripts/audit-bundle` 3/3, `lib/close-chain-guide` 9/9, pins `close-feature-names-reconcile-order-and-close-evidence` 5/5 and `critic-round-cap-and-delta-scope-are-not-enforced` 12/12, `harness/scripts/generate-elephant-role-prohibitions` 13/13. Not run: `register-feature-package-readback.test.mjs` (names the runbook path; the runbook is pinned by `generate-runbook.test.mjs`).

## Not proven

- No live close ran (a real chain through the coordinator with a real Critic packet): only the fixture-based one-shot suite and the bundle suite.
- That the pre-commit hook admits the handover path in the writer commit capability was not exercised.
- No Full Verify, no Critic review (batch gates, not this item's).
