# w304 — The design signature names unreviewed corrections, and Critic and dispatch refusals hand over a ready action (candidate 22)

Delta on the candidate 22 chain (clone base 6fa9369d0). Closest accepted criterion: AC-108 (PRD and Spec unchanged). Built by a Goldfish in a clone that carries the chain; delivered as a held patch. Findings CGR-03, CGR-02, CGR-09, CGR-07 of the Claude greenfield report (PO decisions 2026-11-09).

## Why

The PO decided: the signing text states unreviewed corrections (no extra review round, no new gate); a stale Critic round is replaceable without running it to the end; a harmless marker spelling and a resumed child no longer force rework at finalization; a start refused at the registry lock says it consumed nothing. Runner and platform neutral.

## What it changes

All under plugins/pipeline-core/.

1. CGR-03 (`lib/design-approval-binding.mjs`, `scripts/po-human-approval.mjs`)
   - Measured: the design package already records the number. `binding.unreviewedSourceDelta` lists the source files that differ from the last reviewed round (set after a round-2 delta receipt; after a round-1 receipt drift is a chain refusal, so there the number is legitimately zero).
   - New pure export `describeUnreviewedCorrections(binding)`: one line "unreviewed corrections: N source file(s) was/were changed after the last readiness review (round R) and was/were not re-reviewed: <paths, removed files marked, cut after 8 with the remaining count>", or nothing when the binding records none. The design signing description spreads it before the "complete bounded design binding follows" line.
   - Why the binding's delta and not a count of commits: the binding is inside the signed intent, so what the human reads is bound to what is signed. A count derived from git history would be a number the signature does not cover.
2. CGR-07 (`lib/native-goldfish-host-state.mjs`, `scripts/dispatch-briefing.mjs`)
   - A start refused at the registry lock (the governed queue preparation and the pending-state publish) returns a repair that says: this start was not consumed, dispatch starts go one after another, send the same prompt again after the running start has settled; followed by the registry's own diagnosis (or the `session-authority-repair.mjs inspect` pointer). A lock whose owner is provably gone keeps the existing heal text. The guard hook prints `repair` verbatim, so no hook changed. No queue, no lock timing change.
   - `dispatch-briefing.mjs`: the live-owner branch of `DBG-RULESET-LOCK-HELD` says the same once.
3. CGR-02 (`lib/critic-generic-batch.mjs`, `lib/critic-course-admission.mjs`, `scripts/critic-dispatch-preflight.mjs`)
   - The refusal a newer candidate meets while an old batch holds the review unit (`CGB-CONFLICT` from the ownership check, and the takeover inspection's `CGB-TAKEOVER-OPEN`) now carries `releaseActions`: for each unconsumed packet of the old batch that release accepts (prepared or claimed), the request file name, the exact request body (schema `pipeline.session-critic-release-request.v1`, packetId, reason), the command (`session-critic-finalizer.mjs release --root <root> --request <file>`) and its cost ("that packet reviewed nothing the course keeps; its reservation is freed and the packet is parked, nothing is deleted"). The same text is appended to the repair string. The preflight forwards `releaseActions` in its refusal object. The inspection also lists `openPacketIds` (part of the digest-bound facts).
   - After the release the existing takeover verbs go on unchanged, so a stale round is replaced without running it to its end. Nothing is released by a read-only call.
4. CGR-09 (`lib/critic-source-return.mjs`, `scripts/session-critic-finalizer.mjs`, `scripts/critic-split-merge.mjs`)
   - Measured: (a) the marker spelling: a punctuation mark after `scope:<entry>` is already accepted (commit 6dba780c8); no further spelling is named by any evidence, so none is widened. (b) A Critic PASS with a briefing violation is the deliberate rule `verdictPassContradiction` (commit d390b184a); left as is. (c) The duplicate: a split child returns, is resumed and returns again, so two records exist for one entry and the origin gate refused `SCF-SPLIT-DUPLICATE-ENTRY` (the merge refused `CSM-CHILD-DUPLICATE`).
   - The record gets an optional key `childSha256` (digest of the stop event's `agent_id`; the Antigravity message path uses its child value). `settleSplitReturns` keeps only the latest return of a child that returned more than once for one entry; two different children, a child without a recorded identity, or equal timestamps stay duplicates and are refused as before. Used by the origin gate and by `critic-split-merge.mjs --packet`. The finalizer accepts the split record with or without the key; an earlier record is unchanged.

## Deliberately not changed

- The Critic preimage files (`agents/critic.md`, `skills/critic-review/SKILL.md`, `scripts/codex-critic-host.mjs`, the Critic schemas) and the preimage list: untouched, never re-pinned.
- Every guard hook (`hooks/guard-dispatch.mjs` included), lock timing, `finish-feature.mjs`, `close-coordinator.mjs`, `security-scan.mjs`, the harness configuration, PRD and Spec.
- The verdict schema; the marker rule and the pass-contradiction rule of CGR-09 (see above).
- No gate, no signature, no review round added.

## Pinned cases extended in place (QG-04, none weakened or removed)

- `native-goldfish-host-state.test.mjs` NGHS66 and `dispatch-briefing.test.mjs` (first K12 lock case): assertions on the new repair text added in place (case counts unchanged).
- `critic-generic-batch.test.mjs`: the CGR-02 checks run as two plain functions called from two existing cases, because the case-id list of that suite is pinned by the harness configuration (outside this patch's scope); the suite count stays 40.
- New cases in `design-approval-binding.test.mjs` (CGR-03a-d) and `session-critic-finalizer.test.mjs` (CGR-09), both registered suites; no new plugin test file, so no registration is needed.

## Not proven

- The statement in the real design signing description is pinned by a source-text case plus the pure function's cases; no full signing fixture with a round-2 receipt and a drift was run end to end.
- Not seen live: a Codex or Claude child that is really resumed and returns twice (the case drives the real stop hook twice with one `agent_id`); a real registry lock refusal on Windows (the case uses a real holder process on this host).
- Pre-existing reds in the chain base, not touched: `dispatch-briefing.test.mjs` D196 R1 (grant text range 1..40 against a pinned 1..30) and `critic-dispatch-preflight.test.mjs` CDPF089 (a copied advisory reader drifted from `dispatch-record-write.mjs`, owned by the close-chain work).
- No Full Verify, no Critic review (batch gates, not this item's).
