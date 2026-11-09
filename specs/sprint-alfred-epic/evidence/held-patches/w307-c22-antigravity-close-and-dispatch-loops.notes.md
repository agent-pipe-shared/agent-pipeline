# w307 — Antigravity closes its own session and names untracked files before a branch workspace; LOOP-A1 measured, LOOP-A3 not buildable as briefed (candidate 22)

Delta on the candidate 22 chain (clone base 6fa9369d0). Closest accepted criterion: AC-108 (PRD and Spec unchanged). Built by a Goldfish in a clone that carries the chain; delivered as a held patch (two commits in the clone). Targeted delivery: LOOP-A2 (library half) and LOOP-A4 green; LOOP-A1 measured, no test added; LOOP-A3 blocked by a briefing-vs-repo contradiction; the stay-out half of LOOP-A2 is a change the Elephant must make (exact text below). Batch Critic, Full Verify and PO acceptance stay pending.

## Why

Four loops of the Antigravity greenfield run (build 20261108184323 to 20261109061805): the close stopped at `CLOSE-CLEANUP-OWN-SESSION-UNDERIVED` (A2), `FCA-PACKAGE` after hand-written slice addenda (A3), `Workspace: "branch"` with untracked files cost a PO turn (A4), and a signature command whose signature and consumer disagreed cost five PO turns (A1, fixed earlier).

## What it changes (all under plugins/pipeline-core/)

1. LOOP-A2, `lib/close-cleanup-receipt.mjs` (`buildCleanupReceipt`)
   - Measured: on Antigravity the own session is derived only from the record the pretool hook writes for a command naming `finish-feature.mjs` or `close-coordinator.mjs` (`lib/antigravity-close-session.mjs`, read by `lib/own-session-descriptor.mjs`); a missing, malformed or older-than-two-hours record gives `unavailable`. The existing operator route is the hand-written empty-input receipt labelled `operator-asserted` (skills/close-feature), to be used only when the producer's output shows the only remaining descriptor is the closing session's own.
   - Rule built: when the runner is `antigravity`, no own session was derived, and exactly ONE `antigravity-*` descriptor is in the listing and answers `unavailable` (all a still-running session can say of itself), that descriptor is the closing session. It is excluded and named, and the observation (hence the digest) carries `ownSessionDerivation: "inferred-single-antigravity-descriptor"` with a reason that says it was inferred, not observed. A non-Antigravity descriptor still counts as another session; a single descriptor that answers `live`, `not-live`, `reused` or `unobserved` is not inferred; another runner never infers.
   - With more than one `antigravity-*` descriptor nothing is guessed: the existing typed refusal stays, and the result now carries `ownSessionCandidates` (the descriptor ids) and `ownSessionHint` (names the descriptors, says to run `write-cleanup-receipt` directly as a shell command so the hook records the conversation, otherwise to check them with `session-cleanup.mjs status`, end or clear the others and write again).
   - The result also returns `ownSession`, the own-session record actually used, so a caller prints the derivation that was applied.
2. LOOP-A4, `scripts/antigravity-native-dispatch-prepare.mjs`
   - Measured: the guard's own pre-dispatch check (`uncommittedTrackedPaths` in `lib/agy-native-goldfish.mjs`, pinned by "untracked files do not block") deliberately ignores untracked files, so nothing named them. When a request carries `Workspace: "branch"` the prepared result now has `untrackedBeforeBranch: {count, files (first 5), step}` listing untracked, not-ignored files (`git ls-files --others --exclude-standard -z`, so a name with a space or non-ASCII byte stays whole on every platform; the request file the agent just wrote is not counted). The `step` says the branch worktree is cut from the committed HEAD, then: commit them, add scratch-only paths to `.gitignore`, or move them out, and prepare again. `status` stays `prepared`; nothing is refused, and a clean tree, an ignored file or a call without a branch workspace adds nothing.

## Tests (test-first: written first, RED on the original code, then GREEN)

- `scripts/close-coordinator.test.mjs`: 1 new case "C22 A2 cleanup receipt ..." (inferred single descriptor, labelled and digest-distinct from an observed one; several named and never guessed; foreign-runner descriptor still counts; only Antigravity infers; `live` and `not-live` not inferred). RED: `complete` expected, `uncertain` observed. GREEN: 55 tests, 55 pass (the full suite).
- New file `scripts/antigravity-native-dispatch-prepare.test.mjs`: 3 cases (names files and step with a space in one name; clean tree, ignored file and non-branch calls carry no notice; a long list is bounded to 5 and the CLI does not count its own request file). RED: 1 pass, 2 fail. GREEN: 3 of 3. It needs registration in `harness/verify-suites.json` (protected, TP-13) by the Elephant; it was a new file because the two registered Antigravity prepare suites pin their case count (25 and 11) and the case registry.
- Neighbouring suites (final code, one at a time): `lib/antigravity-native-dispatch-coordinator` 25/25, `hooks/antigravity-native-dispatch-pretool` 11/11, `scripts/close-path-e2e` 1/1.

## LOOP-A1 (measured; no test added)

Heuristic text survey over the test files (co-occurrence of the kind, a generated fixture key and the signing script; not an execution). A fixture-key sign route exists in a test for every kind that has an emitter: HGO signature digest, signed quality package, design approval, bootstrap acknowledgement, portable Agy authorship, portable Critic export, organization architecture config, model-family approval, adoption approval, guard maintenance window and the critical-action kinds. A full emit, sign with a fixture key, consume round trip exists for `acknowledge-caller-authored-critic` (`pipeline-state.test.mjs`, "C21C ..." and "C21B ..."; it was the failing loop) (read in full). `approve-push` has many fixture-key tests (`pipeline-state.test.mjs`, `pipeline-state-push-anchor.test.mjs`, `critical-action-authorization.test.mjs`); they were located by the survey, not read as round trips. Not added, because each remaining kind needs its own consumer fixture and none lacks a fixture-key route that a small case could reuse:
- Consume leg not shown by this survey for: `accept-residual-critic-findings` (only the refusals and the closed mirror were found), `feature-package-reconcile`, `release-preflight`, `interruption-promotion`, `governance-fork-disposition`, `deploy`, `publication`, design approval, signed quality package, bootstrap acknowledgement, model-family approval. Each needs the consumer verb's own fixture (a candidate, a feature package, an inventory).
- `pipeline.historical-fresh-review-request.v1`: no test mentions it at all; its describer is an injected provider (`historicalFreshReviewProvider` in `po-human-approval.mjs`) and needs an immutable inventory fixture.
- A parametrized round trip over `CRITICAL_ACTION_KINDS` is the shape the report proposes; the one existing loop over the kinds (`critical-human-proof-policy.test.mjs`) is a protected test and tests the waiver policy, not signing.

## LOOP-A3 (not built: the briefing names things this tree does not contain)

`antigravity-native-dispatch-consume.mjs` does not exist anywhere in the tree (only `antigravity-native-dispatch-prepare.mjs` and `lib/antigravity-native-dispatch-coordinator.mjs`), and neither `verifyTestInventory` nor a slice attestation carrying it appears under `plugins/` or `harness/` (case-insensitive search, also held patches, backlog and docs). `FCA-PACKAGE` in this tree is produced by `lib/feature-close-audit-preflight.mjs` line 44 from package validation (`validateFeaturePackage`), with a named cause. Nearest candidate for the "merged diff" seam: `scripts/agy-native-integrate.mjs` (the Elephant's take-over). Per the stop condition this is reported, not repaired. A new briefing should name the file and field that exist (or the build that adds them).

## Change the Elephant must make (a stay-out file: `scripts/close-coordinator.mjs`, `writeCleanupReceipt`, lines about 1016 to 1041)

1. After `const built = buildCleanupReceipt({...})`, print the record that was used: replace `runner: ownSession.runner, ownSessionDerivation: ownSession.derivation, ownSessionReason: ownSession.reason` with `runner: built.ownSession.runner, ownSessionDerivation: built.ownSession.derivation, ownSessionReason: built.ownSession.reason`, and in the `ownSessionCode !== null` text use `built.ownSessionHint ?? <existing text>` and add `...(built.ownSessionCandidates === undefined ? {} : { ownSessionCandidates: built.ownSessionCandidates })` to the returned object. Without it the stored observation is correct but the printed `ownSessionDerivation` still says `unavailable` for the inferred case and the several-descriptor hint is not shown.
2. `skills/close-feature/SKILL.md` (not edited, to avoid a byte pin): the paragraph "When the own session cannot be derived ..." should add that on Antigravity a single `antigravity-*` descriptor is taken as the closing session and labelled inferred.

## Deliberately not changed

- `close-coordinator.mjs`, `finish-feature.mjs` and the other files of the parallel dispatches; every guard hook; the Critic preimage files and list; the pinned "untracked files do not block" case (the notice never refuses); PRD and Spec.
- `references/antigravity-native-dispatch.md` (one sentence could name the new field; left to avoid a doc pin).
- The 25-case and 11-case registered Antigravity prepare suites.

## Not proven

- Why the greenfield close had no hook record is not measured (no run evidence in the tree): the rule only covers the case where the record is missing.
- That an untracked file is what the host refused `Workspace: "branch"` for is the pending-loops row's statement only; the measured host refusal documented in the reference is the language server not seeing a repository created after the session started. The notice informs and does not claim the cause.
- No live Antigravity close or dispatch ran. No Full Verify, no Critic review (batch gates).
