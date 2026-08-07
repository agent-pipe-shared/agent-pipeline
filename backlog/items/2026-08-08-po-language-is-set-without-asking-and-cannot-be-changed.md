---
schema: pipeline.backlog-item.v1
id: pipeline.po-language-is-set-without-asking-and-cannot-be-changed
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "Greenfield onboarding handover from a parallel Claude session, 2026-08-08, finding 8 of 12."
---

# The PO's language is chosen for them at bootstrap and cannot be corrected from their own project

## Description

Bootstrap writes `humanFacing: "en"` into the profile receipt without asking. The
PO gate then requires the PRD to carry exactly `<!-- po-language: en -->`. Changing
that setting is only possible through `setup.mjs --publish-po-profile`, which must
run *"from the canonical primary checkout"* — a location a consumer project does
not have and cannot reach.

So a German-speaking PO is handed authority documents marked as English, is
required by the gate to keep marking them English, and has no route to correct it
from inside the project they own.

## Why this is more than an inconvenience

[ADR-0011](../../docs/adr/0011-language-policy.md) makes language a deliberate,
scoped decision — English-canonical for the Public Core, with a private overlay
free to configure its own operator-facing language. The mechanism implementing
that decision currently makes the operator-facing half unconfigurable for the
people it exists for. A policy that can only be exercised from a checkout the
operator does not have is not a policy they hold.

There is a second-order effect worth naming: the PO gate enforces the marker, so
a PO who writes their PRD in their own language *and marks it honestly* is
refused by the gate. The only passing option is to mark it inaccurately.

## Triggering situation

Greenfield onboarding with the Claude runner, 2026-08-07/08, against the local
`0.5.3+claude.20260807221336.14e7b97` build. Observed by the session that hit the
gate.

**Not independently reproduced in this repository**, which is itself the
canonical checkout and therefore cannot see this failure mode.

## Affected artifact

The profile-receipt writer that sets `humanFacing`, the PO gate's marker check,
and `setup.mjs`'s `--publish-po-profile` precondition.

## Proposal

Not designed here. The questions:

1. **Should the language be asked rather than assumed?** The kickoff already
   collects a goal and a profile from the PO. Language belongs in the same
   conversation, once, at the point where a human is present.
2. **Why is publication bound to the canonical checkout?** If that constraint
   protects something real, the consumer-side path needs a different mechanism
   rather than an unreachable one. If it is incidental, it should go.
3. **What is the correct default when nobody asked?** `en` is a defensible
   default for a repository whose canon is English. It is a poor default for the
   operator-facing surface of a project owned by someone who does not read it.
   These may need to be two settings rather than one.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
