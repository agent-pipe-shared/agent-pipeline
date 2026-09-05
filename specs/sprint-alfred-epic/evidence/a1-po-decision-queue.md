# A1 PO decisions

Original analysis candidate: `46f88880c36cc96b49aac89199527d83706948a0`.
The PO resolved both decisions in chat on 2026-09-05; this file records that
authority without widening either decision.

## 1. Record cardinality versus probe surfaces

The frozen specification requires one `pipeline.enforcement-conformance.v1`
record per `{runner, layer}`. A1-2 must nevertheless probe both
`runner-hook/orchestrator` and `runner-hook/subagent`. The current frozen
record has singular `probeSurface` and singular `observation`, so preserving
both raw outcomes in one record is not honest: one observation would overwrite
or ambiguously combine the other.

Decision: **option 1 accepted**. The alternatives below remain as the reviewed
trade-off record.

1. Correct the frozen schema before A1-2: retain one record per
   `{runner, layer}`, replace `probeSurface` with `probeSurfaces[]` and
   `observation` with per-surface `observations[]`, publish the PO-visible
   freeze revision and new digest, then implement A1-2 against that revision.
2. Stuff both observations into the existing singular fields (for example,
   a combined provenance string), accepting lossy/non-machine-addressable
   provenance.
3. Emit duplicate records for the same `{runner, layer}`, one per probe
   surface, changing the required record cardinality and creating ambiguous
   consumer joins.

Recommendation: option 1. Reject options 2 and 3 because they either lose
the distinction the probe exists to measure or violate the frozen identity.

Copyable PO decision line: `PO decision: revise pipeline.enforcement-conformance.v1 before A1-2 to preserve one {runner,layer} record with probeSurfaces[] and per-surface observations[], then publish the freeze revision and digest.`

## 2. Verify registration timing and temporary debt

The direct A1-1 suite is green and license-valid. Full Verify on candidate
`46f88880c36cc96b49aac89199527d83706948a0` is expected to remain red until
the new suite is admitted. The prior candidate-bound run was against
`0312e99b37dda0e42efadcc3988ebae1e8be021c` and showed only the license
failure and the new-suite registration failure; the license has since been
fixed. The final A1 test should be registered once A1-2 stabilizes, through
the PO TP-3 maintenance act, with the matching capability-inventory
`verify-phase:` surface in that same change. No TP-3 or inventory edit is
being performed here.

The authoritative `check-verify-suite-registration.mjs` currently carries
seven expiring baseline exclusions, each with the required reason, owner, and
expiry fields. The legacy standalone `check-suite-registration.mjs` still
reports four paths from that baseline set because it has a separate explicit
debt mechanism. These are pre-existing baseline debts, not suites created by
Alfred or by this queue; the A1 suite is an additional new registration debt.

Decision: **option 1 accepted**. Register the stabilized A1 suite and its
capability surface together in one later TP-3 maintenance act. The alternatives
below remain as the reviewed trade-off record.

1. Register A1 only after A1-2 stabilizes (recommended), in the single PO
   TP-3 act with the matching capability-inventory surface.
2. Temporarily add a dated A1 exclusion with an owner, reason, and expiry,
   if the PO explicitly wants a QG-06-bounded delay; this does not register
   or qualify the suite.
3. Batch A1 registration with the seven baseline exclusions in one PO TP-3
   maintenance window, retaining each exclusion's owner/expiry semantics.

Copyable PO decision line: `PO decision: register the A1 suite once A1-2 stabilizes, in one TP-3 maintenance act with its matching capability-inventory surface.`

Authorized next work: land the atomic plural-schema revision described in
`a1-schema-revision-blueprint.md`, then continue A1-2 against it. TP-3 remains
deferred until A1-2 is stable; this decision does not authorize an earlier
Verify or capability-inventory edit.
