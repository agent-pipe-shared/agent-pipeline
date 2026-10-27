# D56 slice 4b c2: binding assurance (INTERIM, budget checkpoint reached, one fix short of green)

Stack: c2 patch `w7-d56-admit-attested-record-c2.patch` first, then `w7-d56-binding-assurance-c2.patch`. The patch is `git diff --binary` against the local stack base commit in the clone; apply check in the unchanged baseline clone2: exit 0. It touches five of the six slice files (13179 bytes): `check-critic-skip-coverage.mjs`, its test, `critic-packet-preflight.mjs`, its test, `lib/critic-generic-batch.mjs`. `lib/critic-generic-batch.test.mjs` is NOT changed.

## Cause

The local dispatch evidence binding did not carry the record assurance, so an orchestrator-attested record was indistinguishable from a host-observed one in the packet and in the batch target kind.

## Production edits (all in the same change)

1. `check-critic-skip-coverage.mjs` `createLocalDispatchEvidenceBinding`: new key `assurance` ("orchestrator-attested" or null) from the admission result, before `snapshotId`.
2. Same file `boundCriticReviewFinding`: key list gains `assurance`, the rebuilt binding gains `assurance`, an explicit closed-value refusal, snapshotId recomputed over it.
3. `critic-packet-preflight.mjs` `normalizeCoordinatorOnly`: key list gains `assurance`, closed value check, snapshot recomputation includes it (tamper gives CPP-COORDINATOR-BINDING).
4. `lib/critic-generic-batch.mjs`: both `authored-delivery` target sites (about lines 248 and 311) yield `orchestrator-attested-delivery` for an attested binding; the correction-owner comparison (about line 484) accepts both kinds and still refuses any other.

Recon lines were re-verified against the clone; they matched (the second site at 311 and the comparison at 484 were confirmed).

## Tests

- Preflight test: CPPA-1..3 as in the interim note (ids CPP13..CPP15), corpus pin `cases.length` 12 to 15.
- `check-critic-skip-coverage.test.mjs`: `localDispatchSnapshot` helper gets `assurance: null` before `...overrides` (closed key set changed; justification: the binding shape gained a key, nothing weakened); added assertions: authored-commit record binding carries null, a closed attested-assurance binding is accepted, a binding with assurance "host-observed" is refused.
- RED (clone, unchanged production): CPP13, CPP14, CPP15 failed (plus CPP09, see below).
- Whole-file results, clone2 baseline versus patched clone (logs under scratch/agent-out/w7qp/*.log):
  - critic-packet-preflight.test.mjs: baseline 12/12 pass. Patched: one failure, CPP09 (a self-test of the case-completion records that pins 12 declared cases and counts `{pass:11,fail:1}` at test lines 308 to 315; with 15 cases it reports 15). CPP13..15 pass. This is the one remaining defect.
  - check-critic-skip-coverage.test.mjs: baseline 47/47, patched 47/47.
  - critic-generic-batch.test.mjs: CGB002 and CGB003 fail identically in both (SCF-ORIGINAL-SOURCE-UNAVAILABLE, pre-existing in the shared-clone environment); no difference.
  - scripts/session-critic-finalizer.test.mjs: the file does not exist at that path in either clone (MODULE_NOT_FOUND in both); not verifiable, path to be confirmed.

## NOT done

1. Fix CPP09: in `critic-packet-preflight.test.mjs` lines 308, 309, 314, 315 change 12 to 15 and line 313 counts to `{ pass: 14, fail: 1, skip: 0, todo: 0 }` (the three new cases pass; written justification: the corpus gained three cases, nothing weakened). Not applied, so the patch as delivered leaves CPP09 red. Then regenerate the patch (driver patch), re-run the whole file in clone and clone2, driver check.
2. Test in `critic-generic-batch.test.mjs` (attested binding gives `orchestrator-attested-delivery`, host-observed gives `authored-delivery`): not written (heavy git fixture).
3. A full attested-record end-to-end binding case in `check-critic-skip-coverage.test.mjs` (real attested record in git): only the hand-built-binding variant exists.
4. Finalizer: no change to `session-critic-finalizer.mjs`; its swallowed inner LDE code (about lines 513/514) is a related improvement, forwarding it is advisable but not required for this binding.
5. Backward compatibility for packets in flight is not provided and not needed: the binding is minted fresh per review.
6. Driver cleanup (both clones) not run.

## Proposed commit message

`feat(critic): carry the record assurance in the local dispatch evidence binding`

## Operator flow

Apply the c2 patch, apply this patch, `git add -u` limited to the slice paths, `--no-verify` commit, stamp, install. Protected-path classification: none of the touched files matches TP-1..TP-13. Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.
