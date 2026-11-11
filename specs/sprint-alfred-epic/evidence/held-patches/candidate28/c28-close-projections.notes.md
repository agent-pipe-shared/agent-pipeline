# C28 held patch: close projections (audit bundle, status vocabulary, live queue head)

Slice `C28-CLOSE-PROJECTIONS`. Closest criterion: AC-108 (the one-shot close). PRD and Spec unchanged. Built in the clone of the candidate 28 integration state,
saved as `c28-close-projections.patch`. Nothing was committed in the real checkout. **Status: targeted checks green; implementation complete except the items under "Remaining"; integrated review and PO acceptance pending.**

## What

### 3. Live queue head (done, green)
- **Why the head lags.** The heads the Pipeline creates when it opens a feature (`initial-planning` at onboarding, `kickoff-promotion`, `continuity-adoption`) are planning
  entries. No transition advances a head on plan approval: heads move only with a typed decision transaction or the Result bootstrap. So a head can legitimately lag once
  the feature is in implementation; the writer is not broken, the reader printed a stale entry as the next action.
- **Fix (reader, shared).** `lib/continuity-state.mjs` exports `queueHeadLag(continuity, phase)` and the closed set `PLANNING_ENTRY_PACKAGES` (the three package ids, found
  by search in non-test sources). A head lags when it names one of them, the phase is not `design` and no dispatch is live.
  `hooks/post-compact-reground.mjs` projects `queueHeadStatus` (`current` or the lag object), sets `nextAction` to null for a lagging head and replaces the
  `CONTINUATION ... nextAction=` line by `QUEUE-HEAD-LAGGING ... it is not the next action` (English and German).

### 2. Status vocabulary (done for the readers; the tracked record is NOT repaired)
- `lib/close-acceptance-record.mjs` exports `featureStatusVocabulary(...)`: package registered, implementation delivered, technically qualified, human-accepted, shown apart,
  plus `recordLag` when the package record says `completed` but the feature is not delivered. A design reopen (phase design) and a declined acceptance (bound Result retired)
  make delivered, qualified and human-accepted false together; an acceptance counts only for the candidate it names (HEAD comparison; an unreadable HEAD never matches).
- `pipeline-state.mjs inspect` prints it as `featureStatus` (HEAD is read only when an acceptance exists, so a project without one is never probed); the one-shot close prints
  it as `closeStatus.statuses` and as a `Status:` sentence in its closed-local message.
- **Not repaired:** `specs/<feature>/lifecycle.json` still says `completed` after a `reopen-design` that follows a completed package. Only the `reopen-design` writer in
  `pipeline-state.mjs` (plan-gates territory) could move that record; the exact change it needs: in the reopen transition, when the package manifest's state is `completed`
  or `verifying`, plan and apply `feature-package` back to `implementing` (the transition the one-shot already drives forward) in the same operation. Until then the record lags and
  `featureStatus.recordLag` says so.

### 1. Audit bundle projection (done and green, including the close wiring)
- **Close wiring:** `scripts/finish-feature.mjs` (one-shot) calls `projectCloseDispatches` after the Critic exports and before the audit request, inside a try/catch; with dispatches or gaps it writes
  `specs/<feature>/evidence/dispatch-projection.json` (so it travels in the one close commit), adds `dispatchProjectionPath` to the request's `evidence` and lists the file among the own outputs a rerun rolls back.
  Nothing to project, or an unreadable source (`deps.closeDispatchInputsFn` in tests), writes nothing and never stops the close.
- **What already existed (C27):** signed proofs and attributions, the final Verify and Security records and the push proof as create-only follow-up lists under `proofs/`
  (`audit-proof-collection.mjs`, `prepareAuditProofFollowUp`), the Critic round reports, the evidence index. The security result of the frozen candidate can only arrive through
  that follow-up (the scan runs after the one close commit); this slice adds no second commit.
- **Gap built:** `lib/durable-evidence.mjs` exports `projectCloseDispatches` (+ `closeDispatchProjectionBytes`, `readCloseDispatchInputs`): ONE file, each completed dispatch record
  (closed field list) and each briefing text with its digest. Redaction reuses the existing rules: absolute host paths are masked by the dispatch-record rule
  (`maskPrivateAbsolutePaths`, the same regexp as `denyPrivateAbsolutePaths`); credential-shaped text is left out by `evaluateCredentialHygiene`. A text that cannot be carried is a typed gap
  per dispatch (`BRIEFING-CREDENTIAL-SHAPE`, `-TEXT-UNAVAILABLE`, `-NOT-FOUND`, `-AMBIGUOUS`, `-TOO-LARGE`) with the digest of the original bytes. Both digests are kept when a text is
  masked (`sourceSha256`, `textSha256`). A dispatch whose briefing names another feature's item is not carried. More than 200 dispatches is a typed gap, not silence.
- `lib/audit-bundle.mjs`: evidence key `dispatchProjectionPath`, ONE item `dispatch-projection` (so no item limit is reachable), class `dispatch-projection`, README section, and an offline
  re-check (`AB-DISPATCH-PROJECTION`: every carried text hashes to its digest, no gap holds a text, no absolute path or private key). Old bundles carry no such item and verify as before.

## Remaining
1. Docs: one sentence each in the close-feature skill for the projection, `featureStatus` and `QUEUE-HEAD-LAGGING`. Not done: the skill text may be digested by a derived inventory (refresh-derived-files is the Coordinator's), so it was left for the integration step.
2. Suites not run here: `scripts/audit-bundle.test.mjs`, `lib/dispatch-record*.test.mjs` (the new export is additive), the audit-proof follow-up test, the full Verify.
3. The `reopen-design` writer change for `lifecycle.json` (see Status vocabulary).

## Proof

Test-first: RED before the production edit: `continuity-state.test.mjs` 1 test file fails (`queueHeadLag` missing); `post-compact-reground.test.mjs` 32 tests / 2 fail; `audit-bundle.test.mjs` fails to load
(missing export); `finish-feature.test.mjs` 57 tests / 1 fail (projection not written). The `pipeline-state-inspect.test.mjs` cases were not run red separately (their fixture reads `featureStatus`, absent before).
GREEN (one suite at a time, clone): `continuity-state.test.mjs` pass; `post-compact-reground.test.mjs` 32/32; `pipeline-state-inspect.test.mjs` 31/31 (3 new); `audit-bundle.test.mjs` 40/40 (2 new);
`finish-feature.test.mjs` 57/57 (both projection cases included); `close-path-e2e.test.mjs` 7/7; `lib/pins/durable-evidence-survives-a-fresh-clone.test.mjs` 6/6; `lib/interaction-continuity.test.mjs` 1/1;
kernel closure 1/1 (run after the `pipeline-state -> close-acceptance-record` edge and again after the `finish-feature -> durable-evidence` edge; no list change was needed). All exit 0.
Pinned case restated in place (QG-04): `finish-feature.test.mjs` closeStatus keys now include `statuses`.
Process note: the first two GREEN runs (reground, continuity-state) were issued in one message, i.e. concurrently; both passed and touch no shared state.

## Not changed
- `lib/onboarding-continuity.mjs` and `pipeline-state.mjs` transition code (onboarding and plan-gates slices): the head is labelled by the reader, not advanced by a writer.
- The `reopen-design` writer and `lifecycle.json` (see above); the Critic preimage files; protected tests; PRD and Spec.

## Not proven
- The private-identifier deny set of the neutral-leakage policy (built from the local machine by `neutral-range-plan.mjs`) is not applied to briefing text: not reachable from the close without importing that script.
- Native Windows (no new spawn; masks cover drive-letter and UNC forms by the shared regexp, tested with a drive path). Not run on Windows here.
- Briefings only exist in `scratch/` of the machine that ran the dispatch; on another machine a dispatch shows `BRIEFING-TEXT-UNAVAILABLE` with the attested digest.
