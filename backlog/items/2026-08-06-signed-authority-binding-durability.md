---
schema: pipeline.backlog-item.v1
id: pipeline.signed-authority-binding-durability
type: defect
owner: pipeline
status: open
source: Phoenix §7 authority revision; observed directly during the revision sequence
created: 2026-08-06
---

# A signed authority revision must survive the next ordinary submission

## Description

The continuity authority revision path exists so that a changed PRD or Spec
binding can only be moved by an exact, candidate-bound, externally signed human
decision. It works: the proof is verified, the transition is atomic, the
revision is read back, and a receipt is appended.

The binding it establishes is then discarded by the very next ordinary plan
submission. The submission writer rebuilds `continuity.authority` unconditionally
from the Product Owner gate's own view of the PRD and its neighbouring Spec,
without comparing it against the binding currently recorded, and without
requiring any signature. A signed transition and an unsigned routine action
write the same field, and the unsigned one wins because it runs later.

The revision receipt survives, so the persisted record continues to assert a
transition that no longer holds. A reviewer reading the receipts sees an
authority that the state does not have.

This is the authority-collapse class that the human-governance authority
decision exists to prevent, and it is the mirror image of the ledger rule that
mutable state must never assert human authority: here mutable state silently
*discards* a valid human decision.

## Triggering situation

Directly observed while repairing the Phoenix Spec authority split. A signed
revision moved the bound Spec to a successor document and read back
successfully. The next submission — an ordinary, unsigned step in the same
design phase — restored the previous Spec binding and incremented the
continuity revision, leaving the signed receipt behind as the only trace.

No evidence was lost and no gate was bypassed, because the intended end state
happened to match what the submission rebound. The defect is that this outcome
was luck rather than contract.

## Affected artifact

The plan-submission transition, the continuity authority revision receipts, and
their focused tests.

## Proposal

Make the submission writer authority-aware. When the recorded continuity
authority differs from the gate's derived pair, the submission must either fail
closed with a typed code naming the conflicting binding, or carry an explicit
reference to the decision that supersedes it — never silently overwrite.

Treat an authority revision receipt as live evidence rather than history: a
receipt whose asserted binding no longer matches the state must be detectable,
so that a stale receipt cannot misrepresent what is bound.

Add regression coverage that a signed revision followed by an ordinary
submission either preserves the signed binding or fails with the typed
conflict, and that receipts and bindings can never disagree silently.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
