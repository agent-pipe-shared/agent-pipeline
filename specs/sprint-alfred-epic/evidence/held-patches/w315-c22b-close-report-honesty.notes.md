# w315 — The close separates product and evidence commits, never states more assurance than its receipt, and its status comes from receipts (candidate 22b)

Delta on the candidate 22 chain (clone base 8627df377, one commit). Closest accepted criterion: AC-108 (PRD and Spec unchanged). Built by a Goldfish in a clone; delivered as a held patch. Targeted delivery green for CGR-13 and CGF-12 and for the README and message text of CGF-03 and LOOP-A3; the lineage and packet findings of CGF-03 are measured only (see not changed). Batch Critic, Full Verify and PO acceptance stay pending.

## Why

Four findings. CGR-13 (PO decision: commits stay as they are, the close result and the audit bundle count product and evidence commits apart), CGF-03 (no report producer on the close path may state more assurance than its receipt), CGF-12 (`docs/state.md` keeps active rows after a close; the status must come from receipts) and LOOP-A3 of the Antigravity report (hand-built addendum JSON per slice). Each was re-read against the code first; where an earlier fix already covered a part, it is named below and was not rebuilt.

## What it changes (all under plugins/pipeline-core/)

1. CGR-13 commit split
   - New `lib/close-commit-split.mjs`: `featureRangeCommitSplit` reads `git log` through an injectable runner and returns `pipeline.close-commit-split.v1` (`status: counted`, `product`, `evidence`, `total`, `base`, `rangeSource`) or a typed `status: unavailable` with a reason. Never throws into a close.
   - Classification by touched paths: a commit is an evidence commit when every path is an administration/documentation path of the shared set (`administrationDocumentationClassOf`, featureIds restricted to the feature), or under `specs/<feature>/evidence/`, `audit-bundles/`, `evidence/` or `backlog/evidence/`; otherwise a product commit. A commit touching no path counts as evidence. The three evidence prefixes are added on purpose: the shared function VETOES the tracked Critic export and the Critic addenda (they are carry-forward evidence there), and for this count they are evidence. An ADR stays product (the veto stays).
   - Range: from the first commit that touched `specs/<feature>/` (first-parent) to HEAD; the result names `rangeSource: first-commit-touching-feature-directory`. The close has no recorded base commit of its own and the Critic packet base only covers the last review round, so the feature's own directory is the one base every close can read.
   - `scripts/finish-feature.mjs`: the `closed-local` result gains `commits` and `closeStatus`, and its message names both. The count lives there because the `commit-required` result predates the close commit.
   - `lib/audit-bundle.mjs` + `lib/feature-close-audit-executor.mjs`: `buildAuditBundle` takes an optional `commitSplit` and prints a README section. It is a separate build input, not a plan field and not a manifest field: the manifest keys are unchanged (pinned by a case), `planSha256` and the receipt are unchanged, and `readmeSha256` is computed over the final README bytes, so `verifyAuditBundle` verifies as before. The executor computes the split at the candidate; a split that cannot be read prints "could not be counted", never a count.
2. CGF-03 wording (checked list below)
   - `lib/audit-bundle.mjs` README: one paragraph in "Assurance limits": the bundle states no independence of its own for any Critic round; a round's freshness is what its `receipt.json` records (`freshContext`, `historyInherited`, `independence`), and a `caller-authored-fallback` round is not an independent review.
3. CGF-12 status from receipts
   - The w303 closed-state block already states technical close, product acceptance and push as three facts through `update-public-handover`; product acceptance already reads the acceptance record. Left as built.
   - Measured gap: the technical-close line said "done" from fixed text, and the block is committed before the freeze, the final Verify and the cleanup. `lib/close-acceptance-record.mjs` `closedHandoverLines` now takes the feature's `closedFeatures` entry (one argument added at its single call site in `scripts/pipeline-state.mjs`) and reads when, by whom, the close lifecycle and the phase the State close recorded; an entry without them is named as unreadable. It claims nothing the close has not yet done.
   - `closed-local` result: `closeStatus` = `{ technicalClose: coordinator phase, productAcceptance: from the acceptance record (status, candidate, open checks, path), push: not-done-by-the-close }`, each with its source.
4. LOOP-A3 (measurement, one text change)
   - `verifyTestInventory` exists nowhere in the plugin tree (plain `rg -l` over `plugins/pipeline-core` is empty), so the report's name is wrong or stale; `antigravity-native-dispatch-consume.mjs` is likewise absent (already recorded in the follow-up item).
   - The addenda are NOT hand-built per slice any more: `deriveCriticAddenda` (D223 slice 2, `close-coordinator.mjs`) writes the byte-bound addendum and its evidence for every record that exactly one consumed receipt covers, and `finish-feature.mjs --one-shot` runs `critic-addenda` before Verify and hands over the one commit. Hand-written JSON remains only for a record with zero or several covering receipts, a failed receipt without a PO residual acceptance, or a failed read. Nothing buildable is left, so nothing was built.
   - Text: the refusal that names `dispatch-record-write.mjs --critic-addendum ... once for EACH uncovered record` now says the hand route is the exception and why the listed ids are left.

## Tests (test-first)

- `scripts/finish-feature.test.mjs`: 4 new C22B cases (commit split by path kind incl. ADR, Critic export, bundle, mixed commit; unavailable range never blocks; `closeStatus` triple read from the acceptance record; handover technical-close line read from the entry). RED before the edit: 4 failed, 39 passed. GREEN after: 43 of 43.
- `lib/audit-bundle.test.mjs`: 2 new cases (README split section with the manifest keys unchanged and offline verify; the receipt-pointing assurance paragraph). RED: 2 failed, 35 passed. GREEN: 37 of 37. One fixture correction after the edit: the hand-built split in the first case lacked `status: "counted"`, which the real producer always sets (a fixture mirroring the real input, not a weaker assertion).
- `lib/pins/close-coordinator-refuses-a-required-critic-without-evidence.test.mjs` case (k): one added assertion (the exception wording). RED: 1 failed, 31 passed. GREEN: 32 of 32.
- Neighbours (final code, one at a time): `scripts/close-coordinator.test.mjs` 55/55, `scripts/close-path-e2e.test.mjs` 2/2, `lib/feature-close-audit-executor.test.mjs` 6/6, `lib/feature-close-audit-receipt.test.mjs` 1/1, `lib/feature-close-audit-preflight.test.mjs` 7/7, `scripts/pipeline-state-rebind-mutable.test.mjs` 9/9, `lib/public-handover-duty.test.mjs` 11/11.
- New SOURCE file `lib/close-commit-split.mjs` has no own test file: its cases live in `finish-feature.test.mjs` (registered) and `audit-bundle.test.mjs`. It needs an architecture-map assignment (the boundary check reports an unassigned source file).

## CGF-03 report producers checked

Changed: the audit bundle README (above).

Already within its receipt, left alone: `close-coordinator.mjs` `assertCriticIndependenceForClose` (names the caller-authored fallback and its acknowledgement), `pipeline-state.mjs` review-route line ("a single-review fallback, not an independent native review"), `lib/critic-route-assurance.mjs` (receipt vocabulary, never a stronger word), `lib/close-acceptance-record.mjs` (makes no review claim), `lib/close-quality-readback.mjs` `criticRow` ("present" plus a path, no independence word), `finish-feature.mjs` messages (no assurance word), `session-critic-finalizer.mjs` `buildResult` (`freshContext: !fallback`, `historyInherited: fallback` from the receipt's own origin gate). `session-critic-finalizer.mjs` lines 531-532 (`freshContext: true`) are the PACKET's session binding, the requirement a dispatch is made under; the packet validators (`critic-packet-preflight-read.mjs`, `critic-export-policy.mjs`) demand exactly that, and the receipt is what carries the outcome. The real Codex CLI session prints the conditional form because the CLI takes no receipt flag: left as briefed.

## Would need a binding change (reported, NOT changed)

- `lib/critic-review-lineage.mjs` lines 353 and 441 write `lane.independent: true` unconditionally and `lib/critic-review-lineage-core.mjs` line 315 rejects any other value, so a lineage record of a `caller-authored-fallback` round still says `independent: true`. The record is `recordSha256`-bound and registered into the feature package; changing the value or the validator is a binding change and a migration of existing records. Whether a fallback round can reach the lineage writer at all was not traced to the end. A PO or design decision.

## Deliberately not changed

- The audit bundle manifest, `planAuditBundle`, the plan shape, `planSha256`, the audit receipt, any receipt or feature package byte.
- The commit-required result (it predates the close commit), push-prepare and the other files named off limits, every guard hook, the Critic preimage files.
- `closedHandoverLines` still says nothing new about push beyond "not done by the close": the close never pushes and no push receipt exists at that point to read.
- No new test file; no registration needed.

## Not proven

- No live close ran; the cases use a real temporary git repository for the commit split and stubbed coordinator verbs for the close path.
- The range base (first commit touching the feature directory) is a rule of this change, not a recorded fact of the close. A feature whose directory was first created inside a large product commit counts that commit as product.
- Two neighbour suites (`feature-close-audit-preflight`, `pipeline-state-rebind-mutable`) were started in one tool block by mistake (each with its own private temp directory); both are green and neither result depends on the other.
- No Full Verify, no Critic review; the inventory and the architecture map were not touched.
