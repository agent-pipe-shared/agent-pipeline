# Held patch: full-round lineage path cap and Critic export commits

Elephant-built held patch (PO direction 2026-10-30 "bitte das problem analysieren und auch kurz im elefant fixen", then "nehme das mit in 11a"). Candidate: be24eaad4. Applied by the PO with interim candidate 11a.

## Consumer finding (Glossover, 2026-10-30)

A Critic round passed, but the push to staging was not admitted:

1. `critic-bound-verify` answered `private-critic-binding-unavailable` because the Verify lifecycle could not carry the
   consumed Critic to the pushed candidate: `VEP-CVL-CARRY-CONTENT-CHANGED`. The only commit between the reviewed and the
   pushed candidate was the consumer's own tracked export of that review
   (`specs/<feature>/evidence/critic/<packetId>/{index.json,receipt.json,report.md}`, written by
   `session-critic-finalizer export`). That commit carries no manifest registration, so it counted as a correction (N23).
2. The D204 fallback full round could not be registered as lineage: `CRL-V2-PACKET`. Diagnosis
   (`scratch/diag-packet-code.mjs` against the consumer packet): every packet check passes except the changed-path list,
   357 paths against the 256 of `sortedUnique` in the lineage core; with a bound of 4096 the packet is admitted.

## Change

- `lib/review-economy.mjs`: `CRITIC_MAX_REVIEW_PATHS = 4096`; `criticSorted` takes a `maximum`; package, diff and
  coverage changed-path lists use it. Identifier lists keep 256.
- `lib/critic-review-lineage-core.mjs`: `MAX_REVIEW_PATHS` (re-exported from review-economy, which the core already
  imports) on packet `diffPaths`, package, coverage and record diff changed paths.
- `lib/critic-review-lineage.mjs`: the same bound on scope and impact-closure changed paths.
- `scripts/critic-review-lineage.schema.json`: `pathSet.maxItems` 256 → 4096 (pinned equal to the validators by a test).
- `lib/critic-course-admission.mjs`: new `criticExportOnlyCommit(root, commit, featureIds, readReceipt)`. True only when
  the commit has one parent, every change is an addition under `specs/<feature>/evidence/critic/<32-hex packetId>/` of a
  feature in `featureIds`, each export directory holds exactly `index.json`, `receipt.json` and `report.md`, the index
  has the finalizer's schema and packet id, its receipt and report digests match the bytes, the report is non-empty,
  the receipt bytes equal the canonical consumed receipt read from this repository's private packet store, and the
  index candidate, `reviewPass` and `findingCount` match that receipt.
  - `transport()` (lineage registration after a round) admits such commits for the original and alias feature ids.
  - `classifyRegisteredEvidenceOnlyCommits` admits them only with `admitCriticExports: true`; the course decision keeps
    the default, so round and correction counters are unchanged.
- `lib/critic-verify-lifecycle.mjs`: the carry-forward passes `admitCriticExports: true` (and its injected receipt
  reader, which production leaves unset).
- `lib/feature-package-registration.mjs`: the two transport repair texts name the export commit as admitted.

## Tests

- `critic-review-lineage.test.mjs`: a 357-path round compiles, validates and admits its packet; the schema bound equals
  `MAX_REVIEW_PATHS`; 4097 paths are still refused. Check count 19 → 20.
- `critic-verify-lifecycle.test.mjs` (N23): the export commit carries; the transport predicate admits it under any course
  feature id and refuses it under foreign ids; the production reader without a packet store refuses it; the course
  classification without the option still counts it as a correction. Refused as `CVL-CARRY-CONTENT-CHANGED`:
  reformatted receipt bytes, a foreign report digest, a foreign packet id, a verdict that differs from the receipt, an
  extra file, a source change in the same commit, and a later modification of an exported file.
- `critic-course-admission.test.mjs`, through the real route of a consumed course round (packet store, admit,
  finalize, `exportSessionCriticEvidence`, `addCriticReviewLineage`, real receipt reader): CCA077 registers the lineage
  after the round's own export commit and still refuses `FPR-LINEAGE-TRANSPORT` when a non-evidence commit follows;
  CCA078 admits, finalizes and registers a round over 300 changed paths. Appended at the end so existing CCA ids keep
  their numbers.

## Results

All runs through `scratch/agent-out/w7glos/driver.mjs` (clone = candidate plus the change, clone2 = plain candidate).

| Suite | Clone | Base |
|---|---|---|
| critic-review-lineage | 20/20 | 19/19 |
| critic-course-admission | 78/78 | 76/76 |
| critic-verify-lifecycle | 16/16 | 15/15 |
| review-economy | 134/134 checks | 134/134 checks |
| session-critic-finalizer | 91/91 | 91/91 |
| critic-diagnostic-evidence | 18/18 | 18/18 |
| critic-dispatch-preflight | 70/70 | 70/70 |
| check-critic-bound-verify | 6/6 | 6/6 |

`feature-package-registration` has no suite of its own; its lineage paths are covered by critic-course-admission.

Revert proof (production reverted, tests kept): the lineage case CRL20 fails with `CRL-COMPILE-SHAPE` on 357 paths,
the lifecycle case N23 fails with `CVL-CARRY-CONTENT-CHANGED`, CCA077 fails with `FPR-LINEAGE-TRANSPORT` /
`CCA-TRANSPORT-SOURCE-DRIFT` and CCA078 with `FPR-LINEAGE-COMPILE` / `CRL-V2-PACKET`, exactly the consumer's codes;
production restored byte-equal. The new case is appended as CRL20 so the existing check ids keep their numbers. The patch applies on the
candidate (`git apply --check` exit 0) and stacks cleanly after the baseline-reds patch and the D205 patch.

## Downstream sweep

- `classifyRegisteredEvidenceOnlyCommits`: production callers are the course decision (default, unchanged) and the
  Verify carry-forward (option set). `criticExportOnlyCommit`: transport and the classifier only.
- New exports `CRITIC_MAX_REVIEW_PATHS` and `MAX_REVIEW_PATHS`: no prior consumer.
- Other `changedPaths` lists in the plugin carry no 256 bound. `review-attempt.schema.json` (128) and `validPathList`
  (128) bound course-option scope deltas and review attempts, not lineage; unchanged, no consumer failure observed.
- Repair texts: `FPR-LINEAGE-TRANSPORT` and `FPR-DELTA-TRANSPORT` now name the export commit; the finalizer export result
  (`next`) still asks to register lineage before the next correction commit, which stays correct.
- Next user step after the patch, read against the consumer's commit order (read-only clone): round 3 (FAIL,
  candidate 3b5c93a) is followed by real corrections (dbcb803, f12f1e4), so its lineage cannot be registered any more
  by design (register before the next correction commit); it is retired with `inspect-course-takeover` /
  `supersede-course-takeover`. Round 4 (PASS, candidate f12f1e4) is followed only by two registrations and its export
  (ba97b09), which this patch admits, so its lineage registration and then the Verify carry-forward to HEAD are the
  route. A rehearsal on a copy failed at `CCA-GENESIS-BINDING` because the course key binds the repository path
  fingerprint; it cannot be rehearsed outside the consumer's own checkout, so the consumer confirms it.
- Codex and Antigravity: the change is in the shared lineage and lifecycle core; no runner-specific path.

## Not in this patch

- The `SCF-ORIGINAL-SOURCE-UNAVAILABLE` text naming `--allow-caller-authored-fallback` (small text fix, separate).
- N27 (delivery after the verified candidate) minus N23, which this patch covers.
