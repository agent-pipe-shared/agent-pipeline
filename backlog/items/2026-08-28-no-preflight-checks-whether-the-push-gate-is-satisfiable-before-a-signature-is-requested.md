---
schema: pipeline.backlog-item.v1
id: pipeline.no-push-preflight-before-requesting-a-signature
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — happy-path blocking: a burned or expired signature stops the path at its last step and costs a live PO interaction to retry"
source: "Claude/Windows greenfield run, 2026-08-28, sections 7 and 11 of its own analysis (docs/pipeline-haertungstest-und-analyse.md)."
---

# Nothing checks whether the push gate is satisfiable before a PO signature is requested, so signatures are spent and expire

## What happened

The Claude run obtained a PO signature **before** the verify contract was fixed.
The signature then expired unused while the deadlock was worked through. Its own
verdict: a sequencing error, but one the Pipeline could have prevented.

This repository has independently paid the same cost: a live PO passphrase entry
was burned when an override capability was armed against an already-closed
window, and the retry failed looking exactly like a first denial.

## The defect

A human signature is the most expensive resource in the whole system — it needs a
person, an external key, and a bounded time window. Nothing verifies that the
thing being signed for can actually succeed before that resource is spent.

## Direction

A read-only preflight, run before any signature is requested, answering one
question: **is this gate satisfiable right now?**

- Is the verify contract real, and does candidate-bound evidence exist?
- Is the trust anchor present?
- Is the threat model materialized?
- Is the ordering correct — is anything about to invalidate the preimage this
  signature will bind?
- Does the time window leave enough room to complete the ceremony?

If any answer is no, name which one and refuse to request the signature.

## Acceptance criteria

- A signature request preceded by an unsatisfiable gate is refused with the
  specific unmet precondition named.
- The preflight is read-only and cannot itself mutate the preimage it inspects.
- A test covers the expired-window case specifically.
