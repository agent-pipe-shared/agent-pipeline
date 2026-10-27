# D56 slice 4b: binding assurance (INTERIM, budget checkpoint reached)

Candidate f06276676853453211f74867f598c4d26a9b009b. Apply order: D56 slice 4/5 c2 (`w7-d56-admit-attested-record-c2.patch`), then this patch.
Stack base in the clones: the c2 patch applied and committed locally; clone2 is the unchanged baseline.

## State: tests only, NO production edit, NOTHING run

The companion `.patch` contains ONLY the test additions in `plugins/pipeline-core/scripts/critic-packet-preflight.test.mjs`
(44 insertions, 1 deletion). It was not run RED or GREEN (budget reached before the first run). It must not be applied alone as a delivery.

Added cases (ids CPPA-1..3, after the last existing case; the corpus pin `cases.length` 12 changed to 15, a deliberate count change for three new cases, no case weakened):

- CPPA-1: the minted binding of a host-observed record carries `assurance: null`.
- CPPA-2: a binding with tampered assurance fails `CPP-COORDINATOR-BINDING` (snapshotId mismatch, and a closed-value refusal for a recomputed snapshot with a value other than null / orchestrator-attested).
- CPPA-3: a binding without the `assurance` key (snapshotId recomputed over the old six keys) is refused as not closed; an attested binding is accepted and carried into the packet.

Expected RED before production edit: CPPA-1 (undefined), CPPA-3 (old shape accepted). CPPA-2 refuses both before and after (extra key fails the closed shape today), so it is a pin, not RED.

## Recon claims re-verified in the clone (lines of the c2-stacked candidate)

- `check-critic-skip-coverage.mjs`: `createLocalDispatchEvidenceBinding` 321-353 (binding object 344-351, `admission` at 340); `boundCriticReviewFinding` key list 543-544, binding rebuild 548-555, snapshot compare 570; the stacked patch returns `assurance` at 923.
- `critic-packet-preflight.mjs`: `normalizeCoordinatorOnly` 364-377 (key list 366, snapshot recomputation 371-373). Injection point `createLocalDispatchEvidenceBindingFn` 492/516.
- `lib/critic-generic-batch.mjs`: kind literal `authored-delivery` at 248 and 311 (line 311 also builds a target from `packet.coordinatorOnly.localDispatchEvidence`; the recon named only 248 and 310, so BOTH sites need the kind switch); line 484 compares `s.target.kind !== "authored-delivery"` (CGB-CORRECTION-OWNER), so the new kind must be admitted there or an attested batch cannot take corrections.

## NOT done (remaining production work, in ONE change)

1. `check-critic-skip-coverage.mjs`: add `assurance: admission.assurance ?? null` to the binding (before snapshotId); add `"assurance"` to the exactObject key list (543) and to the rebuilt `binding` (548-555).
2. `critic-packet-preflight.mjs` 366-373: key list plus `assurance === null || "orchestrator-attested"` check plus snapshot input.
3. `lib/critic-generic-batch.mjs` 248 and 311: kind `orchestrator-attested-delivery` when `b.assurance === "orchestrator-attested"`; 484 must accept both kinds.
4. Update by-hand binding builders with justification (closed-shape change): `localDispatchSnapshot` in `check-critic-skip-coverage.test.mjs` (add `assurance: null` before `...overrides`); add the attested and host-observed binding cases there and the target-kind cases in `critic-generic-batch.test.mjs` (heavy git fixture, not started).
5. Whole-file runs of the three test files plus `scripts/session-critic-finalizer.test.mjs` in clone and clone2, failing-name comparison: not run.
6. Finalizer 513/514: its inner `LDE-*` code is swallowed; forwarding it is a related improvement, named only. No change to `session-critic-finalizer.mjs` is needed for the binding.
7. Backward compatibility: none for packets in flight (binding minted fresh per review); stated, not built.

## Proposed commit message (for the complete slice)

`feat(critic): carry the record assurance in the local dispatch evidence binding`

## Operator flow (once complete)

apply the c2 patch, apply this patch, `git add -u` with a path limit to the six slice files, `--no-verify` commit, stamp, install. Protected-path classification observed: none of the six files matches TP-1..TP-13. An independent Critic review stays a parent-owned batch gate.

## Clones

The scratch clones and driver (`scratch/agent-out/w7qp/`) were left in place for a continuation; the cleanup mode was not run.
