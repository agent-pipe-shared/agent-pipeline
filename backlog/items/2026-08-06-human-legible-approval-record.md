---
schema: pipeline.backlog-item.v1
id: pipeline.human-legible-approval-record
type: requirement
owner: pipeline
status: open
source: Product Owner requirement raised at the Phoenix plan-approval gate
created: 2026-08-06
---

# An approval must say what was approved, in words a human can check

## Description

The plan approval gate is the strongest human authority in the Pipeline, and it
is the one record that carries the least meaning. What is persisted is the
approving actor, two timestamps, and a set of digests. A reviewer opening that
record later learns who approved and when, but not what they approved. To
reconstruct the content they must resolve two hashes against files that may
have moved on.

The same weakness applies before the decision. What is presented at the gate is
a pair of paths and digests. Nothing states, in ordinary language, which scope
is being released, what changed since the last approval, what the approval
authorizes, and — equally important — what it does not.

This is the human half of `H-AC-11`, which requires a reviewer to be able to
reconstruct request, scope, stable reason code, evidence and outcome. The
binding pass recorded `H-AC-11` as having no covering test, and this item is the
concrete product requirement behind that gap.

## Triggering situation

Raised by the Product Owner while an approval was pending. The gate presented
two 64-character digests and a profile name; the approver had to trust the
agent's prose summary in chat, which is not part of any durable record and
cannot be audited afterwards.

## Affected artifact

The plan submission and approval records, the text presented at the approval
gate, and their focused tests.

## Proposal

Present a human-legible briefing at the gate: the scope being released, the
material differences from the previously approved binding, what the approval
authorizes, and what it explicitly does not authorize. Derive it from the bound
artifacts rather than from conversation, so it cannot drift from what is
actually being signed off.

Persist that same briefing with the approval, so the record answers "what was
approved" without resolving a digest, and so the reviewer sees exactly the text
the approver saw.

Resolve the tension with `H-AC-13` deliberately rather than by accident. That
criterion prohibits free-form rationale in portable ledger entries, so an
unbounded text field is not an acceptable design. Either the briefing is a
bounded, structured summary drawn from a closed vocabulary and therefore safe to
keep portable, or its prose lives in the restricted machine-local profile with
only a digest reference in the portable record. Choose one explicitly; both
satisfy the requirement, and silently adding free text satisfies neither.

Cover it with the test `H-AC-11` currently lacks: an approval whose persisted
briefing does not match the bound artifacts must fail, and a reviewer
reconstruction must expose the briefing alongside the digests.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
